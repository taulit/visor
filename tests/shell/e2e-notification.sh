#!/usr/bin/env bash
# End to end, with real events and the built-in modules: the panel is closed,
# an app sends a notification over the session bus (tests/shell/notify.js),
# the notch shows its chip for three seconds, a click on the chip opens the
# panel with that notification on top of the list and its section marked, and
# a click on the row invokes the default action of the notification at the
# app and closes the panel.
#
# Usage: tests/shell/e2e-notification.sh
# The log ends up in .shell-test/e2e-notification.log.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ "${1:-}" != --inside ]]; then
    exec "$repo/scripts/nested.sh" --log "$repo/.shell-test/e2e-notification.log" -- \
        "$repo/tests/shell/e2e-notification.sh" --inside
fi

source "$repo/scripts/lib/shell.sh"

fail=0
# check NAME JS: passes when JS evaluates to true; anything else is printed.
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

shell_wait_for 'visor !== null && visor.api !== null'
log_before="$(wc -l <"$HOME/shell.log")"

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
    const find = (cls, root = visor.notch.root) => (function walk(a, out) { if (a.has_style_class_name && a.has_style_class_name(cls)) out.push(a); for (const c of a.get_children()) walk(c, out); return out; })(root, []);
    globalThis.N = {
        wait,
        find,
        async move(actor) { await moveTo(...centre(actor)); await wait(200); },
        async click(actor) {
            await moveTo(...centre(actor));
            pointer.notify_button(now(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.PRESSED);
            pointer.notify_button(now(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.RELEASED);
            await wait(150);
        },
        async away() { await moveTo(300, 800); await wait(350); },
        chips: () => visor.content.getPeek().get_children().map(c => c.label_actor.text).join('|'),
        section: () => find('visor-section').find(s => find('visor-section-title', s)[0].text === 'Notifications'),
        titles: () => find('visor-row-title', N.section()).filter(a => a.mapped).map(a => a.text).join('|'),
        row: title => {
            let actor = find('visor-row-title').find(a => a.mapped && a.text === title);
            while (actor && !actor.has_style_class_name('visor-row')) actor = actor.get_parent();
            return actor ?? null;
        },
        notifications: () => Main.messageTray.getSources().flatMap(s => s.notifications),
        dnd: new Gio.Settings({ schema_id: 'org.gnome.desktop.notifications' }),
        // When the notch entered and left the peek state, in ms on the monotonic clock.
        peekFrom: 0,
        peekTo: 0,
    };
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
        if (!globalThis.N) return false;
        const peek = visor?.notch?.state === 'peek';
        if (peek && !N.peekFrom) N.peekFrom = now() / 1000;
        if (!peek && N.peekFrom && !N.peekTo) N.peekTo = now() / 1000;
        return true;
    });
    return true;
})()"

# A new virtual pointer starts in the top left corner, which is the hot corner.
run 'new Gio.Settings({ schema_id: "org.gnome.desktop.interface" }).set_boolean("enable-hot-corners", false)'
run 'N.away().then(() => N.away())'
run 'Main.overview.hide()'
shell_wait_for '!Main.overview.visible'
state='visor.notch.state'

# An older notification that came in silently, so that "on top" says something.
run 'N.dnd.set_boolean("show-banners", false)'
notify older '{"app":"Backup","title":"Backup finished","body":"Yesterday","actions":["default","Open"]}'
shell_wait_for 'N.notifications().length === 1'
run 'N.dnd.set_boolean("show-banners", true)'
check 'the panel is closed and nothing flashes' "$state === 'idle' && N.peekFrom === 0"

notify mail '{"app":"Mail","title":"Quarterly report","body":"The numbers are in","desktop":"org.gnome.Settings","actions":["default","Open"]}'
shell_wait_for "$state === 'peek'" || true
check 'the notification arrives: the notch shows its chip, "App: title"' \
    "(() => { const chip = visor.content.getPeek().get_child_at_index(0); return $state === 'peek' && chip.mapped && chip.label_actor.text.endsWith(': Quarterly report') && chip.has_style_class_name('accent') || [$state, N.chips()].join(); })()"
shell_wait_for 'N.peekTo > 0' 6 || true
check 'the chip shows for three seconds, then the panel is closed again' \
    "(() => { const shown = N.peekTo - N.peekFrom; return $state === 'idle' && shown >= 2900 && shown <= 3600 || [$state, shown].join(); })()"

check 'the pointer on the neck brings the chip back' \
    "N.move(visor.notch.neck).then(() => N.wait(500)).then(() => $state === 'peek' && visor.content.getPeek().get_child_at_index(0).mapped || [$state, N.chips()].join())"
check 'a click on the chip opens the panel with that notification first in the list' \
    "N.click(visor.content.getPeek().get_child_at_index(0)).then(() => $state === 'open' && N.titles() === 'Quarterly report|Backup finished' || [$state, N.titles()].join())"
check 'and the section of the notifications is marked' \
    "(() => { const marked = N.find('visor-marked'); return marked.length === 1 && (marked[0] === N.section() || marked[0].contains(N.section()) || N.section().contains(marked[0])) && marked[0].contains(N.row('Quarterly report')) || marked.length; })()"
check 'a click on the row closes the panel' \
    "N.click(N.find('visor-row-title', N.row('Quarterly report'))[0]).then(() => $state === 'idle' && Main.actionMode === Shell.ActionMode.NORMAL || $state)"
if heard mail 'action default'; then
    echo "ok    the app hears the default action of its notification on the bus"
else
    echo "FAIL  the app hears the default action of its notification on the bus: $(tr '\n' ' ' <"$HOME/mail.out")"
    fail=1
fi
if grep -q '^action' "$HOME/older.out"; then echo "FAIL  the other notification was activated too"; fail=1; else echo "ok    the other notification was left alone"; fi
run 'delete globalThis.N'

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
