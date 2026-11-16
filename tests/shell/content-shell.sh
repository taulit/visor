#!/usr/bin/env bash
# Drives the content half (registry, kit, sheet, peek) in the sandboxed
# headless shell with real key and pointer events and checks what happens.
#
# Usage: tests/shell/content-shell.sh
# The log ends up in .shell-test/content-shell.log. It contains the errors of
# the demo modules that throw on purpose; anything else fails the test.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ "${1:-}" != --inside ]]; then
    exec "$repo/scripts/nested.sh" --log "$repo/.shell-test/content-shell.log" -- \
        "$repo/tests/shell/content-shell.sh" --inside
fi

source "$repo/scripts/lib/shell.sh"
source "$repo/scripts/scenarios/content-lib.sh"

fail=0
# check NAME JS: passes when JS evaluates to true.
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

content_register
log_before="$(wc -l <"$HOME/shell.log")"

# Helpers that live in the shell for the rest of the test.
run "(() => {
    const seat = Clutter.get_default_backend().get_default_seat();
    const keyboard = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
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
    const moveTo = async actor => {
        const [x, y] = centre(actor);
        for (let i = 0; i < 10; i++) {
            pointer.notify_absolute_motion(now(), x, y);
            await wait(60);
            const [px, py] = global.get_pointer();
            if (Math.abs(px - x) <= 1 && Math.abs(py - y) <= 1) return;
        }
        throw new Error('the pointer does not move to ' + x + ',' + y);
    };
    globalThis.T = {
        wait,
        content: visor.content,
        sheet: visor.content.sheet,
        find: cls => $(content_find "' + cls + '"),
        focus: () => global.stage.get_key_focus(),
        async key(...symbols) {
            for (const symbol of symbols) {
                keyboard.notify_keyval(now(), symbol, Clutter.KeyState.PRESSED);
                keyboard.notify_keyval(now(), symbol, Clutter.KeyState.RELEASED);
                await wait(60);
            }
        },
        async move(actor) {
            await moveTo(actor);
            await wait(200);
        },
        async click(actor) {
            await moveTo(actor);
            pointer.notify_button(now(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.PRESSED);
            pointer.notify_button(now(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.RELEASED);
            await wait(120);
        },
        titles: () => T.find('visor-row-title').filter(a => a.mapped).map(a => a.text),
        row: title => {
            let actor = T.find('visor-row-title').find(a => a.text === title);
            while (actor && !actor.has_style_class_name('visor-row')) actor = actor.get_parent();
            return actor ?? null;
        },
        within: (row, cls) => T.find(cls).filter(a => row.contains(a)),
        logged: what => visorDemo.log.filter(entry => entry === what).length,
    };
})()"

echo "# sizes"
check 'two columns follow the width setting' \
    'visor.content.sheetWidth() === 960 && (visor.getSettings().set_string("width", "compact"), visor.content.sheetWidth() === 800) && (visor.getSettings().set_string("width", "wide"), visor.content.sheetWidth() === 1120) && (visor.getSettings().reset("width"), true)'
check 'the peek row has four chips, the waiting one first' \
    '(() => { const peek = visor.content.getPeek(); const chips = peek.get_children(); return visor.content.hasPeek() && chips.length === 4 && chips[0].has_style_class_name("waiting") && chips[0].label_actor.text === "taulit is waiting" && chips.every(c => c.label_actor.text !== "3:16"); })()'
check 'attention: waiting beats unread' 'T.content.attention === "waiting"'

echo "# keyboard"
run 'visor.notch.open()'
run 'T.wait(200)'
check 'the search entry has the focus after opening' 'T.focus() === T.sheet.entry.clutter_text'
check 'Down moves into the first row' \
    'T.key(Clutter.KEY_Down).then(() => T.focus().has_style_class_name("visor-row-main") && T.row("Midnight City").contains(T.focus()))'
check 'the focused row shows the focus ring and its hidden actions' \
    'T.wait(250).then(() => T.row("Midnight City").has_style_pseudo_class("focus") && T.within(T.row("Midnight City"), "visor-row-actions")[0].opacity === 255)'
check 'Enter runs activate of the row' \
    'T.key(Clutter.KEY_Return).then(() => T.logged("media:activate") === 1)'
check 'Down goes to the next row, Enter runs its primary action' \
    'T.key(Clutter.KEY_Down, Clutter.KEY_Return).then(() => T.row("taulit").contains(T.focus()) && T.logged("agents:allow") === 1 && T.logged("agents:deny") === 0)'
check 'Enter expands a row that has neither activate nor primary' \
    'T.key(Clutter.KEY_Down, Clutter.KEY_Return).then(() => T.row("iphone-control").contains(T.focus()) && T.within(T.row("iphone-control"), "visor-row-more").length === 1 && T.within(T.row("iphone-control"), "visor-row-more")[0].visible)'
check 'Tab walks every interactive element' \
    '(async () => {
        T.sheet.entry.grab_key_focus();
        const seen = new Set();
        const kinds = new Set();
        for (let i = 0; i < 60; i++) {
            await T.key(Clutter.KEY_Tab);
            const focus = T.focus();
            if (seen.has(focus)) break;
            seen.add(focus);
            kinds.add((focus.style_class ?? "").split(" ")[0]);
        }
        const wanted = [...T.find("visor-row-main"), ...T.find("visor-button"), ...T.find("visor-icon-button"), ...T.find("visor-dock-button")].filter(a => a.mapped);
        const missed = wanted.filter(a => !seen.has(a));
        return missed.length === 0 && ["visor-row-main", "visor-button", "visor-icon-button", "visor-dock-button"].every(k => kinds.has(k)) || `missed ${missed.length} of ${wanted.length}: ${missed.map(a => a.style_class)}`;
    })()'

echo "# pointer"
check 'a click on a row runs activate' \
    'T.click(T.within(T.row("Midnight City"), "visor-row-title")[0]).then(() => T.logged("media:activate") === 2)'
check 'a click on a button in a row runs only the button' \
    'T.click(T.within(T.row("Midnight City"), "filled")[0]).then(() => T.logged("media:pause") === 1 && T.logged("media:activate") === 2)'
check 'hovering a row shows its actions and hides the meta text' \
    '(async () => { T.sheet.entry.grab_key_focus(); await T.wait(50); const row = T.row("Updates available"); const actions = T.within(row, "visor-row-actions")[0]; const meta = T.within(row, "visor-row-meta")[0]; const before = [actions.opacity, meta.opacity]; await T.move(row); const after = [actions.opacity, meta.opacity, row.hover]; return before.join() === "0,255" && after.join() === "255,0,true" || [before, after].join(" / "); })()'
check 'hovering a section shows its links' \
    'T.find("visor-section-links").find(a => a.get_n_children() > 0).opacity === 255'
check 'a click on a row without activate expands and collapses it' \
    'T.click(T.within(T.row("iphone-control"), "visor-row-title")[0]).then(() => !T.within(T.row("iphone-control"), "visor-row-more")[0].visible)'

echo "# rows"
check 'now.set with the same ids keeps the row actors and changes them in place' \
    '(() => { const before = T.row("tender research"); const value = T.within(before, "visor-row-value")[0]; visorDemo.ctx.timers.now.set(visorDemo.rows.timers("3:17")); visorDemo.ctx.timers.now.set(visorDemo.rows.timers("3:18")); return T.row("tender research") === before && T.within(before, "visor-row-value")[0] === value && value.text === "3:18"; })()'
check 'now.set keeps hover and focus of a row' \
    '(async () => { const row = T.row("tender research"); T.within(row, "visor-row-main")[0].grab_key_focus(); await T.move(row); visorDemo.ctx.timers.now.set(visorDemo.rows.timers("3:19")); return row.hover && row.has_style_pseudo_class("focus") && T.within(row, "visor-row-actions")[0].opacity === 255; })()'
check 'now.clear takes the row away, now.set brings a new one' \
    '(() => { const before = T.row("tender research"); visorDemo.ctx.timers.now.clear(); const gone = T.row("tender research") === null; visorDemo.ctx.timers.now.set(visorDemo.rows.timers("3:20")); return gone && T.row("tender research") !== before && T.titles().indexOf("tender research") === 4; })()'

check 'a change of the height reaches the notch' \
    '(async () => { let calls = 0; const original = visor.notch.contentChanged; visor.notch.contentChanged = function () { calls++; return original.call(this); }; const before = visor.notch.root.height; const more = ["one", "two", "three"].map(id => ({ id, icon: "alarm-symbolic", title: "Timer " + id })); visorDemo.ctx.timers.now.set([...visorDemo.rows.timers("3:20"), ...more]); await T.wait(200); const grown = visor.notch.root.height; visorDemo.ctx.timers.now.set(visorDemo.rows.timers("3:20")); await T.wait(200); visor.notch.contentChanged = original; return calls >= 2 && grown > before && visor.notch.root.height === before || [calls, before, grown, visor.notch.root.height].join(); })()'

echo "# escape"
check 'Escape clears the search first' \
    '(() => { T.sheet.entry.set_text("abc"); return visor.content.handleEscape() === true && T.sheet.entry.get_text() === ""; })()'
check 'the search text is reported 40 ms after a key' \
    '(async () => { const got = []; visor.content.search.setQueryHandler(q => got.push(q)); T.sheet.entry.grab_key_focus(); await T.key(Clutter.KEY_a, Clutter.KEY_b); await T.wait(80); const typed = got.join("|"); visor.content.handleEscape(); visor.content.search.setQueryHandler(null); return typed === "a|ab" && got.join("|") === "a|ab|" || got.join("|"); })()'
check 'a dock icon opens the view of its module' \
    'T.click(T.find("visor-dock-button")[0]).then(() => T.sheet.view === "notes" && T.find("visor-view-title")[0].text === "Notes" && T.titles().join() === "Shopping list,Visor ideas" && visor.content.sheetWidth() === 960)'
check 'Escape in a view clears a search text, then leaves the view, then is not used' \
    '(() => { T.sheet.entry.set_text("x"); const first = visor.content.handleEscape() && T.sheet.view === "notes"; const second = visor.content.handleEscape() && T.sheet.view === null; return first && second && visor.content.handleEscape() === false && T.focus() === T.sheet.entry.clutter_text; })()'
check 'ctx.open(view) opens the panel on that view; closing resets view and search' \
    '(async () => { visor.notch.close(); visorDemo.ctx.media.open("notes"); await T.wait(100); const opened = visor.notch.state === "open" && T.sheet.view === "notes"; T.sheet.entry.set_text("left over"); visor.notch.close(); return opened && T.sheet.view === null && T.sheet.entry.get_text() === ""; })()'

echo "# modules view"
run 'visor.notch.open()'
check 'the last dock icon opens the list of modules' \
    'T.click(T.find("visor-dock-button").at(-1)).then(() => T.sheet.view === ":modules" && T.titles().join() === "Media,T3 Code,Timers,Downloads,Up Next,Notifications,Notes")'
check 'the switch sits inside its track' \
    '(() => { const t = T.find("visor-toggle")[0]; const k = T.find("visor-toggle-knob")[0]; const [tx] = t.get_transformed_position(); const [kx] = k.get_transformed_position(); return t.width === 38 && t.height === 22 && k.width === 18 && Math.round(kx - tx) === 18 || [t.width, t.height, k.width, kx, k.translation_x, tx].join(); })()'
check 'switching a module off disables it and removes its rows at once' \
    '(async () => { await T.click(T.within(T.row("Timers"), "visor-toggle")[0]); await T.wait(100); const off = visor.getSettings().get_strv("disabled-modules").join() === "timers" && T.logged("timers:disable") === 1 && !T.content.registry.get("timers").active; visor.content.handleEscape(); return off && !T.titles().includes("tender research") && visor.content.getPeek().get_n_children() === 4 || T.titles().join(); })()'
check 'switching it on again brings the rows back in module order' \
    '(async () => { await T.click(T.find("visor-dock-button").at(-1)); await T.click(T.within(T.row("Timers"), "visor-toggle")[0]); await T.wait(100); visor.content.handleEscape(); return visor.getSettings().get_strv("disabled-modules").length === 0 && T.titles().indexOf("tender research") === 4 || T.titles().join(); })()'
check 'the order follows the setting module-order' \
    '(async () => { visor.getSettings().set_strv("module-order", ["downloads", "timers"]); await T.wait(100); const moved = T.titles().slice(0, 2).join() === "fedora-44.iso,tender research"; visor.getSettings().reset("module-order"); await T.wait(100); return moved && T.titles()[0] === "Midnight City" || T.titles().join(); })()'

echo "# peek"
check 'flash puts a chip first in the accent colour for three seconds' \
    '(async () => { const peek = visor.content.getPeek(); visorDemo.ctx.media.peek.flash({ icon: "media-playback-start-symbolic", text: "Now: Kids", priority: 1 }); const first = peek.get_child_at_index(0); const flashed = first.label_actor.text === "Now: Kids" && first.has_style_class_name("accent") && peek.get_n_children() === 4; await T.wait(3300); const after = peek.get_child_at_index(0); return flashed && after.has_style_class_name("waiting") && peek.get_children().some(c => c.label_actor.text === "Midnight City" && !c.has_style_class_name("accent")); })()'
check 'a click on a chip opens the panel' \
    '(async () => { visor.notch.dispatch({type: "enter"}); await T.wait(700); await T.click(visor.content.getPeek().get_child_at_index(1)); return visor.notch.state === "open"; })()'

echo "# modules that throw"
run 'globalThis.titlesBefore = T.titles()'
check 'modules that throw are refused or left out, the others stay' \
    "(() => {
        const boom = what => () => { throw new Error('demo ' + what); };
        const base = { name: 'Broken', icon: 'dialog-error-symbolic', disable() {} };
        visor.api.register({ ...base, id: 'bad-enable', slot: 'now', enable: boom('enable') });
        visor.api.register({ ...base, id: 'bad-section', slot: 'ahead', enable() {}, buildSection: boom('buildSection') });
        visor.api.register({ ...base, id: 'bad-view', slot: 'dock', enable() {}, buildView: boom('buildView') });
        visor.api.register({ ...base, id: 'bad-disable', slot: 'now', enable(ctx) { ctx.now.set([{ id: 'x', title: 'Throws later', icon: 'dialog-error-symbolic', activate: boom('activate') }]); }, disable: boom('disable') });
        visor.api.register({ ...base, id: 'bad-row', slot: 'now', enable(ctx) { ctx.now.set([{ id: 'a', title: 'Bad icon', icon: { not: 'an icon' } }, { id: 'b', title: 'Good row of a sloppy module', subtitle: 42, value: { not: 'text' }, controls: [{ label: 7, icon: 'x', run() {} }] }]); ctx.peek.set({ icon: 5, text: 'bad chip', priority: 99 }); } });
        const refused = [
            () => visor.api.register({ ...base, id: 'Bad Id', slot: 'now', enable() {} }),
            () => visor.api.register({ ...base, id: 'media', slot: 'now', enable() {} }),
            () => visor.api.register({ ...base, id: 'no-slot', slot: 'top', enable() {} }),
            () => visor.api.register({ ...base, id: 'no-name', name: undefined, slot: 'now', enable() {} }),
            () => visor.api.register({ ...base, id: 'old-api', slot: 'now', enable() {} }, { uuid: 'old@example.org', metadata: { visor: { api: 2 } }, getSettings() { throw new Error('none'); }, gettext: s => s }),
        ].map(fn => { try { fn(); return false; } catch (e) { return e.message; } });
        const registry = T.content.registry;
        return refused.every(Boolean) && /module API 2/.test(refused[4]) && T.content.incompatibleModules.map(m => m.id + m.api).join() === 'old-api2'
            && !registry.get('bad-enable').active && registry.get('bad-enable').failed
            && !registry.get('bad-section').active && registry.get('bad-disable').active
            && registry.get('old-api') === null || JSON.stringify(refused);
    })()"
check 'a view that throws leaves the module out, the panel stays where it was' \
    'T.click(T.find("visor-dock-button")[1]).then(() => T.sheet.view === null && !T.content.registry.get("bad-view").active && T.find("visor-dock-button").length === 2)'
check 'a callback that throws is caught' \
    'T.click(T.within(T.row("Throws later"), "visor-row-title")[0]).then(() => T.content.registry.get("bad-disable").active)'
check 'the rows of the other modules are all still there' \
    '(() => { const now = T.titles(); return titlesBefore.every(t => now.includes(t)) && now.length === titlesBefore.length + 2 && now.includes("Throws later") && now.includes("Good row of a sloppy module") && !now.includes("Bad icon") || now.join(); })()'
check 'a module from another extension gets its own translations and no settings' \
    "(() => { let seen; visor.api.register({ id: 'foreign', name: 'Foreign', icon: 'dialog-information-symbolic', slot: 'now', enable(ctx) { seen = [ctx.t('x'), ctx.settings, ctx.isOpen, typeof ctx.http.send_and_read_async]; }, disable() {} }, { uuid: 'new@example.org', metadata: { visor: { api: 1 } }, getSettings() { throw new Error('no schema'); }, gettext: s => s + '!' }); visor.api.unregister('foreign'); return seen.join() === 'x!,,true,function' || seen.join(); })()"

echo "# unregister"
check 'unregister removes rows, chip, section, dock icon and attention of a module' \
    '(() => {
        for (const id of ["bad-enable", "bad-section", "bad-view", "bad-disable", "bad-row"]) visor.api.unregister(id);
        visor.api.unregister("media"); visor.api.unregister("agents"); visor.api.unregister("calendar"); visor.api.unregister("notes"); visor.api.unregister("nothing");
        const peek = visor.content.getPeek().get_children().map(c => c.label_actor.text).join();
        return T.titles().join() === "tender research,fedora-44.iso,Updates available,web.whatsapp.com,Review requested"
            && peek === "4,3:16" && T.find("visor-dock-button").length === 1 && T.content.attention === "unread"
            && T.logged("media:disable") === 1 && T.content.registry.get("media") === null
            && T.find("visor-section-title").filter(a => a.mapped).map(a => a.text).join() === "Now,Notifications" || [T.titles().join(), peek, T.content.attention].join(" / ");
    })()'
check 'without rows in "Now" the panel has one column of 600' \
    '(() => { visor.api.unregister("timers"); visor.api.unregister("downloads"); return visor.content.sheetWidth() === 600 && !T.sheet.left.visible && T.sheet.right.visible && !T.sheet.right.has_style_class_name("divided"); })()'
check 'without modules nothing but the search row is left' \
    '(() => { visor.api.unregister("notifications"); return visor.content.sheetWidth() === 600 && !T.sheet.scroll.visible && !visor.content.hasPeek() && T.content.attention === null; })()'

echo "# disable"
count='(function n(a) { let c = 1; for (const k of a.get_children()) c += n(k); return c; })(global.stage)'
uuid='visor@taulit.github.io'
run 'delete globalThis.T'
run "Main.extensionManager.disableExtension('$uuid')"
shell_wait_for "Main.extensionManager.lookup('$uuid').state !== 1"
actors_off="$(shell_eval "$count")"
run "Main.extensionManager.enableExtension('$uuid')"
shell_wait_for "Main.extensionManager.lookup('$uuid').state === 1"
content_register
run 'visor.notch.open()'
run "$(content_find visor-dock-button).at(-1).emit('clicked', 1)"
run 'visor.notch.dispatch({type: "enter"})'
sleep 0.7
run "Main.extensionManager.disableExtension('$uuid')"
shell_wait_for "Main.extensionManager.lookup('$uuid').state !== 1"
check 'disabling the extension with everything built leaves no actor behind' "$count === $actors_off"
check 'disabling the extension disabled every module' \
    '["media", "agents", "timers", "downloads", "calendar", "notifications", "notes"].every(id => visorDemo.log.includes(id + ":disable"))'

noise="$(tail -n "+$((log_before + 1))" "$HOME/shell.log" | grep -E 'JS ERROR|WARNING|CRITICAL|has been already disposed' || true)"
expected="$(grep -cE "Visor: module '(bad-enable|bad-section|bad-view|bad-disable|bad-row)'" <<<"$noise" || true)"
other="$(grep -vE "Visor: module '(bad-enable|bad-section|bad-view|bad-disable|bad-row)'" <<<"$noise" || true)"
echo "errors logged for the throwing modules: $expected (one each, 5 expected)"
[[ "$expected" == 5 ]] || { echo "FAIL  each throwing module is logged exactly once"; fail=1; }
[[ -z "$other" ]] || { echo "FAIL  unexpected shell warnings:"; echo "$other" | head -n 20; fail=1; }

((fail == 0)) && echo "PASS"
exit "$fail"
