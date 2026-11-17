#!/usr/bin/env bash
# The built-in modules "Up Next" and "Notifications" in the sandboxed headless
# shell, end to end: real notifications sent over the session bus of the
# sandbox, real events written through Evolution's data server of the sandbox,
# real pointer events. Nothing here reaches the session you are logged in to.
#
# Usage: tests/shell/modules-ahead.sh
# The log ends up in .shell-test/modules-ahead.log.
#
# The calendar part asks for an event "in 5 minutes" to be today, so it can
# fail when it runs in the last minutes before midnight.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ "${1:-}" != --inside ]]; then
    exec "$repo/scripts/nested.sh" --log "$repo/.shell-test/modules-ahead.log" -- \
        "$repo/tests/shell/modules-ahead.sh" --inside
fi

source "$repo/scripts/lib/shell.sh"
source "$repo/scripts/scenarios/content-lib.sh"

fail=0
# check NAME JS: passes when JS evaluates to true; anything else is printed.
# gdbus reads backslashes in JS as escapes of its own, so the JS has none.
check() {
    local got
    got="$(shell_eval "$2" 2>&1)" || true
    if [[ "$got" == true ]]; then
        echo "ok    $1"
    else
        echo "FAIL  $1: $got"
        fail=1
    fi
}
run() { shell_eval "$1" >/dev/null; }
# wait_check NAME JS: like check, but gives the shell up to ten seconds to get there.
wait_check() {
    shell_wait_for "($2) === true" 10 2>/dev/null || true
    check "$1" "$2"
}
# notify NAME JSON: sends a notification from a client that stays on the bus;
# what the shell tells that client ends up in $HOME/NAME.out.
notify() { gjs -m "$repo/tests/shell/notify.js" "$2" >"$HOME/$1.out" 2>&1 & }
# heard NAME TEXT: the client got that answer from the shell.
heard() {
    for _ in $(seq 1 50); do
        grep -qx "$2" "$HOME/$1.out" 2>/dev/null && return 0
        sleep 0.1
    done
    return 1
}
check_heard() {
    if heard "$2" "$3"; then echo "ok    $1"; else echo "FAIL  $1: $(tr '\n' ' ' <"$HOME/$2.out")"; fail=1; fi
}
events() { [[ "$(gjs -m "$repo/tests/shell/calendar-events.js" "$1" 2>/dev/null)" == done ]] || { echo "FAIL  writing events: $1"; fail=1; }; }

shell_wait_for 'visor !== null && visor.api !== null'
log_before="$(wc -l <"$HOME/shell.log")"

# Helpers that live in the shell for the rest of the test.
run "(() => {
    const seat = Clutter.get_default_backend().get_default_seat();
    const pointer = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
    const now = () => GLib.get_monotonic_time();
    const wait = ms => new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => (r(true), false)));
    const centre = actor => {
        const [x, y] = actor.get_transformed_position();
        const [w, h] = actor.get_transformed_size();
        return [x + w / 2, y + h / 2];
    };
    // The first motions of a new virtual pointer end at the top edge of the
    // monitor, so every move is repeated until the pointer is where it should be.
    const moveTo = async (x, y) => {
        for (let i = 0; i < 10; i++) {
            pointer.notify_absolute_motion(now(), x, y);
            await wait(60);
            const [px, py] = global.get_pointer();
            if (Math.abs(px - x) <= 1 && Math.abs(py - y) <= 1) return;
        }
        throw new Error('the pointer does not move to ' + x + ',' + y);
    };
    const press = async () => {
        pointer.notify_button(now(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.PRESSED);
        pointer.notify_button(now(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.RELEASED);
        await wait(150);
    };
    const tray = Main.messageTray;
    globalThis.T = {
        wait,
        content: visor.content,
        registry: visor.content.registry,
        find: (cls, root = visor.notch.root) => (function find(a, out) { if (a.has_style_class_name && a.has_style_class_name(cls)) out.push(a); for (const c of a.get_children()) find(c, out); return out; })(root, []),
        async move(actor) { await moveTo(...centre(actor)); await wait(200); },
        async click(actor) { await moveTo(...centre(actor)); await press(); },
        async away() { await moveTo(300, 800); await wait(350); },
        // What a click at the centre of an actor would hit.
        picked: actor => global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, ...centre(actor)),
        section: title => T.find('visor-section').find(s => T.find('visor-section-title', s)[0].text === title),
        titles: section => T.find('visor-row-title', T.section(section)).filter(a => a.mapped).map(a => a.text).join('|'),
        texts: (section, cls) => T.find(cls, T.section(section)).filter(a => a.mapped).map(a => a.text),
        row: title => {
            let actor = T.find('visor-row-title').find(a => a.text === title);
            while (actor && !actor.has_style_class_name('visor-row')) actor = actor.get_parent();
            return actor ?? null;
        },
        button: (label, root = visor.notch.root) => T.find('visor-button', root).find(b => b.mapped && b.label_actor?.text === label) ?? null,
        chips: () => visor.content.getPeek().get_children().map(c => c.label_actor.text).join('|'),
        chip: id => T.registry.get(id).chip,
        notifications: () => tray.getSources().flatMap(s => s.notifications),
        byTitle: title => T.notifications().find(n => n.title === title),
        dnd: new Gio.Settings({ schema_id: 'org.gnome.desktop.notifications' }),
        tray,
    };
})()"

# A new virtual pointer starts in the top left corner, which is the hot corner.
run 'new Gio.Settings({ schema_id: "org.gnome.desktop.interface" }).set_boolean("enable-hot-corners", false)'
run 'T.away().then(() => T.away())'
run 'Main.overview.hide()'
shell_wait_for '!Main.overview.visible'

note='T.notifications().length'
state='visor.notch.state'

echo "# scenario 1: a notification arrives while the panel is closed"
check 'at rest: idle, no chip, no dot, both sections not built yet' \
    "$state === 'idle' && !visor.content.hasPeek() && T.content.attention === null && visor.content.sheet.root === null"
notify mail '{"app":"Mail","title":"Quarterly report","body":"The numbers are in","desktop":"org.gnome.Settings","actions":["default","Open"]}'
shell_wait_for "$state === 'peek'" || true
run 'globalThis.flashStart = GLib.get_monotonic_time()'
check 'the notch flashes to peek with a chip "App: title" in the accent colour' \
    "(() => { const chip = visor.content.getPeek().get_child_at_index(0); return $state === 'peek' && chip.label_actor.text === T.tray.getSources()[0].title + ': Quarterly report' && chip.has_style_class_name('accent') || [$state, T.chips()].join(); })()"
check 'the dot next to the clock is on' \
    "T.content.attention === 'unread' && visor.notch.clock.dot.visible && visor.notch.clock.dot.has_style_class_name('unread')"
wait_check 'the banner of the shell shows too, below the body of the notch' \
    "(() => { const body = visor.notch.body; const [, by] = body.get_transformed_position(); const [, ny] = T.tray._bannerBin.get_transformed_position(); return T.tray.visible && T.tray._banner !== null && ny >= by + body.height && T.tray.translation_y === body.height || [T.tray.visible, ny, by, body.height, T.tray.translation_y].join(); })()"
check 'a click would hit the chip where the chip is and the banner where the banner is' \
    "(() => { const chip = visor.content.getPeek().get_child_at_index(0); const name = a => a?.style_class || a?.name || String(a); return visor.notch.root.contains(T.picked(chip)) && T.tray._bannerBin.contains(T.picked(T.tray._bannerBin)) || [name(T.picked(chip)), name(T.picked(T.tray._bannerBin))].join(); })()"
check 'the shell acknowledged it for its banner, Visor still counts it as unread' \
    "T.byTitle('Quarterly report').acknowledged === true && T.chip('notifications').text === '1'"
check 'two and a half seconds later it still flashes' \
    "T.wait(2500 - (GLib.get_monotonic_time() - flashStart) / 1000).then(() => $state === 'peek')"
check 'after three seconds the notch is idle, the dot stays, the banner is back in its stock place' \
    "T.wait(900).then(() => $state === 'idle' && T.content.attention === 'unread' && T.tray.translation_y === 0 && T.tray._bannerBin.get_transformed_position()[1] === Main.panel.height || [$state, T.content.attention, T.tray.translation_y].join())"
check 'hovering the neck shows the chip with the count' \
    "T.move(visor.notch.neck).then(() => T.wait(500)).then(() => $state === 'peek' && T.chips() === '1' || [$state, T.chips()].join())"
check 'a click on the chip opens the panel with the notification on top' \
    "T.click(visor.content.getPeek().get_child_at_index(0)).then(() => $state === 'open' && T.titles('Notifications') === 'Quarterly report' || [$state, T.titles('Notifications')].join())"
check 'the row shows the app icon, "App · body" and the time' \
    "(() => { const row = T.row('Quarterly report'); const icon = T.find('visor-row-icon', row)[0]; return icon.has_style_class_name('app') && icon.gicon !== null && T.texts('Notifications', 'visor-row-subtitle').join() === T.tray.getSources()[0].title + ' · The numbers are in' && T.texts('Notifications', 'visor-row-meta').join() === 'now' || [T.texts('Notifications', 'visor-row-subtitle'), T.texts('Notifications', 'visor-row-meta')].join(); })()"
check 'opening marks it as seen: no dot, no chip, the banner is gone' \
    "T.content.attention === null && T.chip('notifications') === null && !visor.notch.clock.dot.visible && !T.tray.visible"
run "(() => { globalThis.activated = 0; T.byTitle('Quarterly report').connect('activated', () => activated++); })()"
check 'a click on the row activates the notification and closes the panel' \
    "T.click(T.find('visor-row-title', T.row('Quarterly report'))[0]).then(() => activated === 1 && $state === 'idle' && Main.actionMode === Shell.ActionMode.NORMAL || [activated, $state].join())"
check_heard 'the app hears its default action on the bus' mail 'action default'
wait_check 'the notification left the tray' "$note === 0"

echo "# do not disturb"
run 'T.away()'
run 'visor.notch.open()'
check 'the switch is in the header of the section, off, with its name next to it' \
    "(() => { const s = T.section('Notifications'); const t = T.find('visor-toggle', s)[0]; return t.mapped && !t.checked && t.accessible_name === 'Do Not Disturb' && T.find('visor-section-toggle-label', s)[0].text === 'Do Not Disturb'; })()"
check 'the empty section says so' \
    "T.find('visor-empty', T.section('Notifications'))[0].mapped && T.find('visor-empty', T.section('Notifications'))[0].text === 'No new notifications'"
check 'a click on the switch turns the banners off' \
    "T.click(T.find('visor-toggle', T.section('Notifications'))[0]).then(() => T.dnd.get_boolean('show-banners') === false && T.find('visor-toggle', T.section('Notifications'))[0].checked)"
check 'the switch follows the setting, off and on' \
    "(async () => { const t = T.find('visor-toggle', T.section('Notifications'))[0]; T.dnd.set_boolean('show-banners', true); await T.wait(50); const off = !t.checked; T.dnd.set_boolean('show-banners', false); await T.wait(50); return off && t.checked; })()"
run 'visor.notch.close()'
notify quiet '{"app":"Chat","title":"Quiet one","body":"Nobody saw this","actions":["default","Open"]}'
wait_check 'with Do Not Disturb a notification does not flash, but counts: dot and chip' \
    "$note === 1 && $state === 'idle' && T.content.attention === 'unread' && T.chip('notifications').text === '1' && T.chip('notifications').priority === 10 && !T.byTitle('Quiet one').acknowledged && !T.tray.visible"
notify quiet2 '{"app":"Chat","title":"Quiet two","body":"Nor this","actions":["default","Open"]}'
wait_check 'the chip counts' "T.chip('notifications').text === '2'"
run 'visor.notch.open()'
check 'opening the panel acknowledges all of them' \
    "T.notifications().every(n => n.acknowledged) && T.content.attention === null && T.chip('notifications') === null && T.titles('Notifications') === 'Quiet two|Quiet one'"

echo "# clear all"
check 'the link shows when the pointer is on the section' \
    "(async () => { const links = T.find('visor-section-links', T.section('Notifications'))[0]; await T.away(); const before = links.opacity; await T.move(T.find('visor-section-title', T.section('Notifications'))[0]); return before === 0 && links.opacity === 255 && T.button('Clear all') !== null || [before, links.opacity].join(); })()"
check 'a click on it empties the tray and the list' \
    "T.click(T.button('Clear all')).then(() => T.wait(200)).then(() => $note === 0 && T.titles('Notifications') === '' && T.find('visor-empty', T.section('Notifications'))[0].mapped && T.button('Clear all') === null || [$note, T.titles('Notifications')].join())"
check_heard 'the app hears that its notification was dismissed' quiet 'closed 2'

echo "# show all and show less"
i=0
for app in Chat Mail Chat Mail Chat; do
    i=$((i + 1))
    notify "n$i" "{\"app\":\"$app\",\"title\":\"N$i\",\"body\":\"Body $i\",\"actions\":[\"default\",\"Open\"]}"
    shell_wait_for "$note === $i" || true
done
wait_check 'what arrives while the panel is open is listed at once, newest first, three of them' \
    "T.titles('Notifications') === 'N5|N4|N3'"
check 'and counts as seen' "T.notifications().every(n => n.acknowledged) && T.content.attention === null && T.chip('notifications') === null"
check '"Show all 5" expands the list; three of one app stay together' \
    "T.click(T.button('Show all 5')).then(() => T.titles('Notifications') === 'N5|N3|N1|N4|N2' && T.button('Show less') !== null && T.button('Show all 5') === null || T.titles('Notifications'))"
check '"Show less" goes back to three' \
    "T.click(T.button('Show less')).then(() => T.titles('Notifications') === 'N5|N4|N3' && T.button('Show all 5') !== null || T.titles('Notifications'))"

echo "# dismiss"
check 'on hover the time gives way to the dismiss button' \
    "(async () => { const row = T.row('N4'); const meta = T.find('visor-row-meta', row)[0]; const actions = T.find('visor-row-actions', row)[0]; const before = [meta.opacity, actions.opacity].join(); await T.move(T.find('visor-row-title', row)[0]); return before === '255,0' && meta.opacity === 0 && actions.opacity === 255 || [before, meta.opacity, actions.opacity].join(); })()"
check 'a click on it removes that notification only' \
    "T.click(T.find('visor-icon-button', T.find('visor-row-actions', T.row('N4'))[0])[0]).then(() => T.wait(200)).then(() => T.titles('Notifications') === 'N5|N3|N2' && T.button('Show all 4') !== null && $state === 'open' || T.titles('Notifications'))"
check_heard 'the app hears it' n4 'closed 2'

echo "# actions"
notify long '{"app":"Mail","title":"Invoice","body":"The invoice for November is attached. Please pay it within <b>14 days</b> &amp; keep the receipt for your records.","actions":["default","Open","reply","Reply","archive","Archive"]}'
wait_check 'a notification with actions is on top' "T.titles('Notifications').startsWith('Invoice|')"
check 'its row expands to the full body and one button per action' \
    "T.click(T.find('visor-row-chevron', T.row('Invoice'))[0]).then(() => { const more = T.find('visor-row-more', T.row('Invoice'))[0]; const body = T.find('visor-row-subtitle', more)[0]; return more.mapped && body.text === 'The invoice for November is attached. Please pay it within 14 days & keep the receipt for your records.' && body.height > T.find('visor-row-subtitle', T.row('N5'))[0].height && T.find('visor-button', more).map(b => b.label_actor.text).join() === 'Reply,Archive' || body.text; })"
check 'a click on an action runs it and closes the panel' \
    "T.click(T.button('Reply', T.row('Invoice'))).then(() => $state === 'idle' || $state)"
check_heard 'the app hears that action, not the default one' long 'action reply'
check 'the expanded list is collapsed again the next time' \
    "(async () => { visor.notch.open(); await T.wait(100); await T.click(T.button('Show all 4')); const all = T.titles('Notifications'); visor.notch.close(); visor.notch.open(); await T.wait(100); return all === 'N5|N3|N1|N2' && T.titles('Notifications') === 'N5|N3|N2' || [all, T.titles('Notifications')].join(' / '); })()"
run 'T.dnd.set_boolean("show-banners", true)'
check 'the switch went back with the setting' "!T.find('visor-toggle', T.section('Notifications'))[0].checked"
run 'visor.notch.close()'
run 'T.notifications().forEach(n => n.destroy())'
run 'T.away()'

echo "# banner and peek together"
notify low '{"app":"Backup","title":"Backup finished","body":"Nothing to see","urgency":0}'
wait_check 'a notification of low urgency does not flash and gets no banner, but counts' \
    "$note === 1 && $state === 'idle' && !T.tray.visible && T.chip('notifications').text === '1'"
notify banner '{"app":"Mail","title":"Click the banner","body":"Body","actions":["default","Open"]}'
shell_wait_for "$state === 'peek' && T.tray._banner !== null" || true
check 'banner and chip are both on screen, the banner below the body' \
    "(() => { const body = visor.notch.body; const chip = visor.content.getPeek().get_child_at_index(0); return chip.mapped && chip.label_actor.text === 'Mail: Click the banner' && T.tray._banner.mapped && T.tray._bannerBin.get_transformed_position()[1] >= body.get_transformed_position()[1] + body.height || T.chips(); })()"
check 'a click on the banner activates the notification' \
    "T.click(T.tray._bannerBin).then(() => T.byTitle('Click the banner') === undefined)"
check_heard 'the app hears the default action' banner 'action default'
check 'the chip is still there and a click on it opens the panel' \
    "(async () => { await T.move(visor.notch.neck); await T.wait(500); await T.click(visor.content.getPeek().get_child_at_index(0)); return $state === 'open' && T.titles('Notifications') === 'Backup finished' || [$state, T.chips()].join(); })()"
run 'T.notifications().forEach(n => n.destroy())'
run 'visor.notch.close()'
run 'T.away()'
check 'idle again: the banners are where the shell puts them' "$state === 'idle' && T.tray.translation_y === 0"

echo "# up next (events in the calendar of the sandbox, written through ECal)"
run "globalThis.U = { module: T.registry.get('upcoming').module, clock: date => String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0'), event: uid => U.module.source.getEvents(new Date(), new Date(Date.now() + 8 * 86400000)).find(e => e.id.split(String.fromCharCode(10))[1] === uid) }"
check 'no events: no chip, and the section says so' \
    "(async () => { visor.notch.open(); await T.wait(300); const empty = T.find('visor-empty', T.section('Up Next'))[0]; return T.chip('upcoming') === null && T.titles('Up Next') === '' && empty.mapped && empty.text === 'Nothing else today'; })()"
events '[{"uid":"review","summary":"Sprint Review","start":5,"minutes":60,"location":"https://meet.google.com/abc-defg-hij"},
         {"uid":"later","summary":"Retro","start":40,"minutes":30,"location":"https://meet.google.com/xyz-abcd-efg"},
         {"uid":"bday","summary":"Jukek’s birthday","allDay":1},
         {"uid":"tender","summary":"Tender submission","start":4320,"minutes":30}]'
wait_check 'events show up while the panel is open: three at most, in order' \
    "T.titles('Up Next') === 'Sprint Review|Retro|Jukek’s birthday'"
check 'the lead column says when: a time today, "Tomorrow" for the next day' \
    "(() => { const got = T.texts('Up Next', 'visor-row-lead').join('|'); const want = [U.clock(U.event('review').date), U.clock(U.event('later').date), 'Tomorrow'].join('|'); return got === want || got + ' / ' + want; })()"
check '"Tomorrow" fits its column and the titles line up' \
    "(() => { const leads = T.find('visor-row-lead', T.section('Up Next')); return leads.every(l => !l.clutter_text.get_layout().is_ellipsized() && l.width === leads[0].width && l.width >= 52) || leads.map(l => l.width).join(); })()"
wait_check 'the event inside the join window with a link gets "Join", the later one does not' \
    "T.button('Join', T.row('Sprint Review')) !== null && T.find('visor-button', T.section('Up Next')).length === 1"
check 'the second lines: time left and service, time left, all day' \
    "(() => { const got = T.texts('Up Next', 'visor-row-subtitle').join('|'); return /^in [45] min · Google Meet[|]in (39|40) min[|]all day$/.test(got) || got; })()"
check 'the event that starts within 15 minutes has a chip: time and title' \
    "T.chip('upcoming').text === U.clock(U.event('review').date) + ' Sprint Review' && T.chip('upcoming').priority === 60 && T.chip('upcoming').icon === 'x-office-calendar-symbolic'"
check '"Join" opens the link and closes the panel' \
    "(async () => { const original = Gio.AppInfo.launch_default_for_uri; let opened = null; Gio.AppInfo.launch_default_for_uri = uri => { opened = uri; return true; }; try { await T.click(T.button('Join', T.row('Sprint Review'))); } finally { Gio.AppInfo.launch_default_for_uri = original; } return opened === 'https://meet.google.com/abc-defg-hij' && $state === 'idle' || [opened, $state].join(); })()"
check 'a click on a row opens GNOME Calendar at that event and closes the panel' \
    "(async () => { const original = Gio.AppInfo.create_from_commandline; let command = null; Gio.AppInfo.create_from_commandline = line => { command = line; return { launch() { return true; } }; }; visor.notch.open(); await T.wait(200); try { await T.click(T.find('visor-row-title', T.row('Retro'))[0]); } finally { Gio.AppInfo.create_from_commandline = original; } return command === \"gnome-calendar --uuid 'system-calendar:later'\" && $state === 'idle' || [command, $state].join(); })()"
events '[{"uid":"later","remove":true}]'
run 'visor.notch.open()'
wait_check 'without the later one the list reaches the event in three days' \
    "T.titles('Up Next') === 'Sprint Review|Jukek’s birthday|Tender submission'"
check 'its lead is the short name of the weekday, its second line the time' \
    "(() => { const date = U.event('tender').date; const day = new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date); return T.texts('Up Next', 'visor-row-lead')[2] === day && T.texts('Up Next', 'visor-row-subtitle')[2] === U.clock(date) || T.texts('Up Next', 'visor-row-lead').join(); })()"
events '[{"uid":"run","summary":"Standup","start":-10,"minutes":30,"description":"Dial in: https://zoom.us/j/123456789"},
         {"uid":"plan","summary":"Planning","start":8,"minutes":30,"description":"Room 3, no link"}]'
wait_check 'a running event comes first' "T.titles('Up Next') === 'Standup|Sprint Review|Planning'"
check 'its lead is "Now", its second line says until when' \
    "(() => { const lead = T.texts('Up Next', 'visor-row-lead')[0]; const sub = T.texts('Up Next', 'visor-row-subtitle')[0]; return lead === 'Now' && sub.startsWith('until ' + U.clock(U.event('run').end)) || [lead, sub].join(); })()"
wait_check 'both events with a link have "Join", the one without has none' \
    "T.button('Join', T.row('Standup')) !== null && T.button('Join', T.row('Sprint Review')) !== null && T.find('visor-button', T.row('Planning')).length === 0 && T.texts('Up Next', 'visor-row-subtitle')[0].endsWith(' · Zoom')"
check 'the chip names the running event' "T.chip('upcoming').text === 'Now Standup'"
check 'nothing of Evolution stays in the shell after the lookups' \
    "U.module.links.session === null && U.module.links.running === 0 && U.module.links.cache.size >= 3"
check 'the clock format setting is honoured' \
    "(async () => { const s = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' }); s.set_string('clock-format', '12h'); await T.wait(100); const lead = T.texts('Up Next', 'visor-row-lead')[1]; s.set_string('clock-format', '24h'); await T.wait(100); return /^[0-9]{1,2}:[0-9][0-9].[AP]M$/.test(lead) && T.texts('Up Next', 'visor-row-lead')[1] === U.clock(U.event('review').date) || [lead, T.texts('Up Next', 'visor-row-lead').join('|'), U.clock(U.event('review').date)].join(' / '); })()"
check 'one timeout runs while the panel is open, for the next change of a row' "U.module.wake !== 0"
run 'visor.notch.close()'
events '[{"uid":"run","remove":true},{"uid":"review","remove":true},{"uid":"plan","remove":true},{"uid":"bday","remove":true},{"uid":"tender","remove":true}]'
wait_check 'all events gone: no chip' "T.chip('upcoming') === null"
check 'and the section is empty again' \
    "(async () => { visor.notch.open(); await T.wait(300); const empty = T.find('visor-empty', T.section('Up Next'))[0]; const ok = T.titles('Up Next') === '' && empty.mapped; visor.notch.close(); return ok; })()"

echo "# disabling a module"
check 'turning the modules off removes sections and chips and leaves the tray alone' \
    "(async () => { T.dnd.set_boolean('show-banners', false); visor.getSettings().set_strv('disabled-modules', ['upcoming', 'notifications']); await T.wait(100); const off = !T.registry.get('upcoming').active && !T.registry.get('notifications').active && T.registry.get('upcoming').module.source === null && !visor.content.hasPeek(); visor.getSettings().reset('disabled-modules'); await T.wait(100); T.dnd.reset('show-banners'); return off && T.registry.get('notifications').active && T.tray.translation_y === 0; })()"

noise="$(tail -n "+$((log_before + 1))" "$HOME/shell.log" | grep -E 'JS ERROR|WARNING|CRITICAL|has been already disposed' || true)"
if [[ -z "$noise" ]]; then
    echo "ok    no shell warnings"
else
    echo "FAIL  shell warnings:"
    head -n 20 <<<"$noise"
    fail=1
fi

((fail == 0)) && echo "PASS"
exit "$fail"
