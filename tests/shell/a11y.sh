#!/usr/bin/env bash
# Accessibility of the notch and the open panel, in the sandboxed headless
# shell with the demo content:
#   - every actor that reacts to the pointer or takes the keyboard focus has a
#     role and a name, in the main view, a module view, the list of modules,
#     the search results and the peek chips,
#   - what colour alone says (amber, the dot) is in the names as words,
#   - the keyboard path with real key events: Tab order, arrows, Enter, Space,
#     Escape, where the focus goes when the panel closes,
#   - no animation with animations off, the class for high contrast, no text
#     cut off at a text scaling factor of 1.5,
#   - a click on a chip opens the panel on what the chip is about.
#
# No screen reader runs here: the test reads what Visor hands to the
# accessibility layer, not what Orca says.
#
# Usage: tests/shell/a11y.sh      The log ends up in .shell-test/a11y.log.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ "${1:-}" != --inside ]]; then
    exec "$repo/scripts/nested.sh" --log "$repo/.shell-test/a11y.log" -- \
        "$repo/tests/shell/a11y.sh" --inside
fi

# Everything below writes into the sandbox only.
[[ -n "${VISOR_SANDBOX:-}" && "$HOME" == "$VISOR_SANDBOX"/* ]] || { echo "not in the sandbox" >&2; exit 2; }

source "$repo/scripts/lib/shell.sh"
source "$repo/scripts/scenarios/content-lib.sh"

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

log_start="$(wc -l <"$HOME/shell.log")"
content_register

# Helpers inside the shell. No backslash in here: gdbus reads escapes.
shell_eval '(() => {
    const Atk = imports.gi.Atk;
    const seat = global.stage.context.get_backend().get_default_seat();
    const keyboard = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    const pointer = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
    const now = () => GLib.get_monotonic_time();
    const wait = ms => new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => (r(true), false)));
    const sheet = () => visor.content.sheet;
    const A = globalThis.A = { wait, Atk };

    // --- real input ---
    A.key = async (keyval, shift = false) => {
        if (shift) keyboard.notify_keyval(now(), Clutter.KEY_Shift_L, Clutter.KeyState.PRESSED);
        keyboard.notify_keyval(now(), keyval, Clutter.KeyState.PRESSED);
        keyboard.notify_keyval(now(), keyval, Clutter.KeyState.RELEASED);
        if (shift) keyboard.notify_keyval(now(), Clutter.KEY_Shift_L, Clutter.KeyState.RELEASED);
        await wait(100);
    };
    A.click = async actor => {
        const [x, y] = actor.get_transformed_position();
        pointer.notify_absolute_motion(now(), x + actor.width / 2, y + actor.height / 2);
        await wait(80);
        pointer.notify_button(now(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.PRESSED);
        pointer.notify_button(now(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.RELEASED);
        await wait(150);
    };
    A.away = async () => { pointer.notify_absolute_motion(now(), 300, 700); await wait(80); };

    // --- what the accessibility layer gets ---
    A.name = a => a.accessible_name || a.label_actor?.text || (a instanceof St.Label ? a.text : "") || (a instanceof St.Button ? a.label : "") || "";
    A.role = a => a.accessible_role ?? Atk.Role.INVALID;
    A.has = (a, state) => a.get_accessible().ref_state_set().contains_state(state);
    A.describe = a => (a.style_class || a.constructor.name) + "[" + A.name(a) + "]";
    // Surfaces that only catch the pointer; what they do is offered by a named actor inside.
    const SURFACES = ["visor-notch", "visor-body", "visor-row"];
    const surface = a => SURFACES.some(name => a.has_style_class_name?.(name));
    // St gives every widget the role of a panel. That is right for a named group and for nothing else.
    const GROUPS = ["visor-section", "visor-sheet"];
    const roleOk = a => {
        const role = A.role(a);
        if (role === Atk.Role.INVALID) return false;
        return role !== Atk.Role.PANEL || GROUPS.some(name => a.has_style_class_name(name));
    };
    // Every actor below `roots` that reacts or takes the focus, without role or name.
    A.audit = roots => {
        const bad = []; let seen = 0;
        const walk = a => {
            // The bars of a scroll view belong to St. What is hidden is not handed on at all;
            // what is only transparent until the pointer comes (row actions) is.
            if (a instanceof St.ScrollBar || !a.visible) return;
            if (a instanceof Clutter.Text) {
                // The text of an entry has the focus; the entry carries the name.
                const entry = a.get_parent();
                if (a.reactive && !(entry instanceof St.Entry && A.name(entry) && A.role(entry) !== Atk.Role.INVALID)) bad.push("text of " + A.describe(entry));
            } else if (a instanceof St.Widget) {
                if (a instanceof St.ScrollView) {
                    // Scrolls, and that is all it does: the role says so, a name would only be noise.
                    if (A.role(a) !== Atk.Role.SCROLL_PANE) bad.push("scroll view " + A.describe(a));
                } else if (a instanceof St.Entry) {
                    // The role comes from St and from the text inside, as for the entries of the shell.
                    if (A.name(a) === "") bad.push("entry " + A.describe(a));
                } else if (a.can_focus || (a.reactive && !surface(a))) {
                    seen++;
                    if (!roleOk(a) || A.name(a) === "") bad.push(A.describe(a) + " role " + A.role(a));
                }
                // A row is a surface; its focusable part is the list item.
                if (a.has_style_class_name("visor-row")) {
                    const main = a.get_first_child()?.get_first_child();
                    if (!(main?.can_focus && A.role(main) === Atk.Role.LIST_ITEM && A.name(main))) bad.push("row without item " + A.describe(a));
                }
            } else if (a.reactive) {
                bad.push("plain actor " + a.constructor.name);
            }
            for (const child of a.get_children()) walk(child);
        };
        for (const root of roots) walk(root);
        return bad.length === 0 && seen > 0 || bad.join(" ; ") + " (" + seen + " checked)";
    };
    A.roots = () => [visor.notch.root, visor.notch.neck];
    A.find = cls => { const out = []; const walk = a => { if (a.has_style_class_name?.(cls)) out.push(a); for (const c of a.get_children()) walk(c); }; for (const r of A.roots()) walk(r); return out; };

    // --- focus ---
    A.focus = () => global.stage.get_key_focus();
    A.inEntry = () => A.focus() === sheet().entry.clutter_text;
    // Where in the main view the focus is: search, now, left (below now), ahead 0, …, dock.
    A.zone = () => {
        const f = A.focus(); const s = sheet();
        if (!f) return "none";
        if (s.entry.contains(f)) return "search";
        if (s.nowSection.actor.contains(f)) return "now";
        // Below "Now" while there are two columns: the notifications.
        if (s.left.contains(f)) return "left";
        const index = s.right.get_children().findIndex(c => c.contains(f));
        if (index >= 0) return "ahead" + index;
        if (s.dock.contains(f)) return "dock";
        return "elsewhere";
    };
    // Presses Tab until the focus is back in the entry; the stops on the way.
    A.tour = async (shift = false) => {
        const stops = [];
        for (let i = 0; i < 80; i++) {
            const before = A.focus();
            await A.key(Clutter.KEY_Tab, shift);
            // On a busy machine the key may still be on its way.
            if (A.focus() === before) await wait(500);
            if (A.inEntry()) return stops;
            stops.push({ zone: A.zone(), name: A.name(A.focus()), role: A.role(A.focus()) });
        }
        stops.push({ zone: "TRAPPED", name: "" });
        return stops;
    };
    A.row = title => A.find("visor-row-main").find(a => A.name(a).startsWith(title));
    A.open = async () => { visor.notch.open(); await wait(250); return visor.notch.state === "open"; };
    A.close = async () => { visor.notch.close(); await wait(250); return visor.notch.state === "idle"; };
    return true;
})()' >/dev/null

run 'new Gio.Settings({schema_id: "org.gnome.desktop.interface"}).set_boolean("enable-hot-corners", false)'
run 'A.away()'

echo "# roles and names"
check 'idle: the neck is a button named after the clock' \
    '(() => { const n = visor.notch.neck; return n.can_focus && A.role(n) === A.Atk.Role.PUSH_BUTTON && A.name(n).length >= 4 || A.describe(n); })()'
run 'A.open()'
check 'open panel, main view: every reactive or focusable actor has a role and a name' 'A.audit(A.roots())'
check 'the search entry is named' \
    '(() => { const e = visor.content.sheet.entry; return A.name(e) === "Search" && e.hint_text !== "" || A.describe(e); })()'
check 'section titles are headings, sections are named panels' \
    '(() => { const t = A.find("visor-section-title"), s = A.find("visor-section"); return t.length >= 3 && t.every(a => A.role(a) === A.Atk.Role.HEADING) && s.every(a => A.role(a) === A.Atk.Role.PANEL && A.name(a)) || t.length + " " + s.map(A.describe).join(); })()'
check 'a waiting row says so in words, a finished one too' \
    '(() => { const w = A.name(A.row("taulit")), d = A.name(A.row("gnome-island")); return w.endsWith(", waits for you") && d.endsWith(", done") && !A.name(A.row("Midnight City")).includes("waits") || w + " | " + d; })()'
check 'the name of a row is title, subtitle and the rest' \
    'A.name(A.row("Midnight City")) === "Midnight City, M83 · Headphones" || A.name(A.row("Midnight City"))'
check 'row actions are named buttons' \
    '(() => { const names = A.find("visor-icon-button").filter(a => !a.has_style_class_name("visor-row-chevron")).map(A.name); return ["Previous", "Pause", "Next", "Switch audio output"].every(n => names.includes(n)) || names.join(); })()'
check 'dock icons are named buttons, the badge is part of the name' \
    '(() => { const b = A.find("visor-dock-button"); return b.length >= 2 && b.every(a => A.role(a) === A.Atk.Role.PUSH_BUTTON && A.name(a)) && A.name(b.at(-1)) === "Modules" || b.map(A.describe).join(); })()'
check 'an expandable row says so; the button names what it does' \
    '(() => { const m = A.row("iphone-control"); const c = A.find("visor-row-chevron").find(a => A.name(a).includes("iphone-control")); return A.has(m, A.Atk.StateType.EXPANDABLE) && !A.has(m, A.Atk.StateType.EXPANDED) && c && A.name(c) === "Show details of iphone-control" || [A.has(m, A.Atk.StateType.EXPANDABLE), c && A.name(c)].join(); })()'

echo "# keyboard: Tab order"
check 'opening puts the focus into the search entry' 'A.inEntry()'
run 'A.tour().then(stops => { globalThis.tour = stops; return true; })'
check 'Tab comes back to the search entry: no trap' 'tour.at(-1).zone !== "TRAPPED" && tour.length >= 8 || tour.length'
check 'Tab order: search, Now, Notifications below it, Up Next, dock' \
    '(() => { const order = ["now", "left", "ahead0", "dock"]; const zones = tour.map(s => s.zone); const ranks = zones.map(z => order.indexOf(z)); const sorted = ranks.every((r, i) => r >= 0 && (i === 0 || r >= ranks[i - 1])); return sorted && order.every(z => zones.includes(z)) || zones.join(); })()'
check 'every stop of the tour has a role and a name' \
    'tour.every(s => s.name !== "" && s.role !== A.Atk.Role.INVALID && s.role !== A.Atk.Role.PANEL) || tour.filter(s => !s.name).map(s => s.zone).join()'
check 'the first stop is the first row, the last one the list of modules' \
    'tour[0].name.startsWith("Midnight City") && tour.at(-1).name === "Modules" || tour[0].name + " … " + tour.at(-1).name'
check 'Shift+Tab walks the same stops backwards' \
    'A.tour(true).then(back => back.map(s => s.name).reverse().join("|") === tour.map(s => s.name).join("|") || back.map(s => s.name).join("|"))'
check 'the focused row shows the focus ring' \
    '(async () => { await A.key(Clutter.KEY_Tab); const frame = A.focus().get_parent().get_parent(); const ring = frame.has_style_pseudo_class("focus") && frame.get_theme_node().get_box_shadow() !== null; await A.key(Clutter.KEY_Tab, true); return ring && A.inEntry() || frame.style_class; })()'

echo "# keyboard: arrows, Enter, Space"
check 'Down from the entry goes to the first row, Down again to the next, Up back' \
    '(async () => { await A.key(Clutter.KEY_Down); const first = A.name(A.focus()); await A.key(Clutter.KEY_Down); const second = A.name(A.focus()); await A.key(Clutter.KEY_Up); const again = A.name(A.focus()); return first.startsWith("Midnight City") && second !== first && second !== "" && again === first || [first, second, again].join(" | "); })()'
check 'Right goes to the buttons of the row' \
    '(async () => { const row = A.focus().get_parent(); await A.key(Clutter.KEY_Right); const f = A.focus(); return row.contains(f) && A.role(f) === A.Atk.Role.PUSH_BUTTON && A.name(f) !== "" || A.describe(f); })()'
check 'Space presses the focused button' \
    '(async () => { const name = A.name(A.focus()); const before = visorDemo.log.length; await A.key(Clutter.KEY_space); return visorDemo.log.length === before + 1 || name + " " + visorDemo.log.join(); })()'
check 'Enter on a row activates it' \
    '(async () => { A.row("Midnight City").grab_key_focus(); await A.key(Clutter.KEY_Return); return visorDemo.log.at(-1) === "media:activate" || visorDemo.log.join(); })()'
run 'A.open()'
check 'Space opens an expandable row, the state follows, and Tab reaches what it shows' \
    '(async () => { const m = A.row("iphone-control"); m.grab_key_focus(); await A.key(Clutter.KEY_space); const open = A.has(m, A.Atk.StateType.EXPANDED); const chevron = A.find("visor-row-chevron").find(a => A.name(a).includes("iphone-control")); const names = []; for (let i = 0; i < 4; i++) { await A.key(Clutter.KEY_Tab); names.push(A.name(A.focus())); } m.grab_key_focus(); await A.key(Clutter.KEY_space); return open && A.name(chevron) === "Show details of iphone-control" && names.includes("Reply") && !A.has(m, A.Atk.StateType.EXPANDED) || [open, A.name(chevron), names.join()].join(" | "); })()'

echo "# keyboard: views and Escape"
check 'Enter on a dock icon opens its view and moves the focus into it' \
    '(async () => { A.find("visor-dock-button").find(a => A.name(a).startsWith("Notes")).grab_key_focus(); await A.key(Clutter.KEY_Return); const s = visor.content.sheet; return s.view === "notes" && s.viewPage.contains(A.focus()) || s.view + " " + A.describe(A.focus()); })()'
check 'the view: every reactive or focusable actor has a role and a name, the title is a heading' \
    '(() => { const audit = A.audit(A.roots()); const t = visor.content.sheet.viewTitle; return audit === true && A.role(t) === A.Atk.Role.HEADING && t.text === "Notes" || audit; })()'
check 'Tab stays in the view and reaches the Back button' \
    '(async () => { const s = visor.content.sheet; const names = []; for (let i = 0; i < 12; i++) { await A.key(Clutter.KEY_Tab); if (!s.viewPage.contains(A.focus())) return "left the view: " + A.describe(A.focus()); names.push(A.name(A.focus())); } return names.includes("Back") && names.some(n => n.startsWith("Shopping list, Milk, bread, coffee")) || names.join(" | "); })()'
check 'Escape leaves the view, the panel stays open and the focus is in the entry' \
    '(async () => { await A.key(Clutter.KEY_Escape); return visor.content.sheet.view === null && visor.notch.state === "open" && A.inEntry() || [visor.content.sheet.view, visor.notch.state].join(); })()'
check 'the list of modules: roles and names; a switch is a check box named after its module, with its state' \
    '(async () => { A.find("visor-dock-button").at(-1).grab_key_focus(); await A.key(Clutter.KEY_Return); const audit = A.audit(A.roots()); const toggles = A.find("visor-toggle").filter(a => a.mapped); const ok = toggles.length >= 5 && toggles.every(t => A.role(t) === A.Atk.Role.CHECK_BOX && A.name(t) !== "" && A.has(t, A.Atk.StateType.CHECKED) === t.checked); await A.key(Clutter.KEY_Escape); return audit === true && ok || audit + " " + toggles.length; })()'

echo "# search results"
check 'results are list items; the selected one carries the state' \
    '(async () => { visor.content.sheet.entry.set_text("2+3"); await A.wait(300); const lines = A.find("visor-result").filter(a => a.mapped); const selected = lines.filter(a => A.has(a, A.Atk.StateType.SELECTED)); return lines.length >= 1 && lines.every(a => A.role(a) === A.Atk.Role.LIST_ITEM && A.name(a)) && selected.length === 1 && A.name(selected[0]) === "= 5" || lines.map(A.describe).join() + " selected " + selected.length; })()'
check 'Down moves the selection and the state with it' \
    '(async () => { visor.content.sheet.entry.set_text("se"); await A.wait(400); const lines = () => A.find("visor-result").filter(a => a.mapped && A.has(a, A.Atk.StateType.SELECTED)).map(A.name); const first = lines(); await A.key(Clutter.KEY_Down); const second = lines(); return first.length === 1 && second.length === 1 && (first[0] !== second[0] || A.find("visor-result").filter(a => a.mapped && !a.has_style_class_name("quiet")).length === 1) && A.inEntry() || first.join() + " → " + second.join(); })()'
check 'with results on screen: roles and names, and Tab stays in the entry' \
    '(async () => { const audit = A.audit(A.roots()); await A.key(Clutter.KEY_Tab); return audit === true && A.inEntry() || audit + " " + A.zone(); })()'
check 'Escape clears the search first, then closes the panel' \
    '(async () => { await A.key(Clutter.KEY_Escape); const cleared = visor.content.sheet.query === "" && visor.notch.state === "open"; await A.key(Clutter.KEY_Escape); await A.wait(250); return cleared && visor.notch.state === "idle" || [cleared, visor.notch.state].join(); })()'

echo "# focus on the way in and out"
check 'Enter on the focused neck opens, Escape closes, and the focus is on the neck again' \
    '(async () => { const neck = visor.notch.neck; neck.grab_key_focus(); await A.key(Clutter.KEY_Return); await A.wait(250); const open = visor.notch.state === "open" && A.inEntry(); await A.key(Clutter.KEY_Escape); await A.wait(300); return open && visor.notch.state === "idle" && A.focus() === neck || [open, visor.notch.state, A.focus() && A.describe(A.focus())].join(); })()'
check 'the focus returns to where it was before the panel opened' \
    '(async () => { const before = Main.panel.statusArea.quickSettings; before.grab_key_focus(); const had = A.focus() === before; await A.open(); const inside = A.inEntry(); await A.key(Clutter.KEY_Escape); await A.wait(300); return had && inside && A.focus() === before || [had, inside, A.focus() && A.describe(A.focus())].join(); })()'
run 'global.stage.set_key_focus(null)'

echo "# peek chips"
run 'visor.notch.dispatch({type: "enter"})'
shell_wait_for 'visor.notch.state === "peek"'
check 'chips are named buttons: module, text, and in words that one waits' \
    '(() => { const chips = A.find("visor-chip").filter(a => a.mapped); const names = chips.map(A.name); const waiting = chips.find(a => a.has_style_class_name("waiting")); return chips.length >= 3 && chips.every(a => A.role(a) === A.Atk.Role.PUSH_BUTTON && a.can_focus) && A.audit(A.roots()) === true && names.includes("Media, Midnight City") && waiting && A.name(waiting).endsWith(", waits for you") || names.join(" | "); })()'
check 'the dot of the neck is in its name as words' \
    '(() => { const name = A.name(visor.notch.neck); const attention = visor.notch.clock.attention; return attention === "waiting" && name.endsWith(", something waits for you") || attention + " " + name; })()'
check 'a click on a chip opens the panel and marks the section of its module' \
    '(async () => { const chip = A.find("visor-chip").find(a => a.mapped && A.name(a).startsWith("Up Next")); if (!chip) return "no calendar chip: " + A.find("visor-chip").map(A.name).join(); await A.click(chip); await A.wait(200); const s = visor.content.sheet; const section = s.sections.get("calendar").widget; const marked = A.find("visor-marked"); const ok = visor.notch.state === "open" && marked.length === 1 && marked[0] === section; await A.wait(1700); return ok && A.find("visor-marked").length === 0 && s.markTimeout === 0 || [visor.notch.state, marked.length, A.find("visor-marked").length].join(); })()'
run 'A.away()'
run 'A.close()'
check 'the chip of a "now" module marks its rows; closing takes the mark away' \
    '(async () => { visor.notch.dispatch({type: "enter"}); await A.wait(700); const chip = A.find("visor-chip").find(a => a.mapped && A.name(a).startsWith("Media")); if (!chip) return "no media chip"; await A.click(chip); await A.wait(200); const s = visor.content.sheet; const marked = A.find("visor-marked"); const ok = marked.length === 1 && marked[0] === s.nowGroups.get("media").box; await A.away(); await A.close(); return ok && A.find("visor-marked").length === 0 && s.markTimeout === 0 || marked.length; })()'
check 'the chip of a dock module opens its view' \
    '(async () => { visorDemo.ctx.notes.peek.set({ icon: "text-x-generic-symbolic", text: "Shopping list", priority: 99 }); visor.notch.dispatch({type: "leave"}); await A.wait(300); visor.notch.dispatch({type: "enter"}); await A.wait(700); const chip = A.find("visor-chip").find(a => a.mapped && A.name(a).startsWith("Notes")); if (!chip) return "no notes chip: " + visor.notch.state + A.find("visor-chip").map(A.name).join(); await A.click(chip); await A.wait(250); const s = visor.content.sheet; const got = [visor.notch.state, s.view, s.viewPage.contains(A.focus())].join(); visorDemo.ctx.notes.peek.set(null); await A.away(); await A.close(); return got === "open,notes,true" || got; })()'

echo "# reduced motion, high contrast, large text"
check 'animations are off in this sandbox' '!St.Settings.get().enable_animations'
check 'without animations the panel is open at its full size at once, nothing runs' \
    '(async () => { visor.notch.open(); const n = visor.notch; const at = [n.motion.running, n.body.height, n.current.reveal]; await A.wait(300); const ok = at[0] === false && at[1] === n.body.height && at[1] > 100 && at[2] === 1; visor.notch.close(); const closed = !n.motion.running && !n.body.visible; return ok && closed || at.join() + " " + n.body.height; })()'
check 'a flash shows the chips in place, without movement' \
    '(async () => { const n = visor.notch; n.flash(); const at = [n.state, n.motion.running, n.body.height]; await A.wait(100); const same = n.body.height === at[2]; n.dispatch({type: "close"}); await A.wait(100); return at[0] === "peek" && at[1] === false && same || at.join(); })()'
run 'new Gio.Settings({schema_id: "org.gnome.desktop.a11y.interface"}).set_boolean("high-contrast", true)'
run 'A.wait(300)'
check 'high contrast: the notch and the neck carry the class, borders are drawn' \
    '(async () => { await A.open(); const hc = visor.notch.root.has_style_class_name("visor-hc") && visor.notch.neck.has_style_class_name("visor-hc"); const row = A.find("visor-search")[0].get_theme_node(); const border = row.get_border_width(St.Side.BOTTOM) + row.get_border_width(St.Side.TOP); return hc && border >= 1 || [hc, border].join(); })()'
run 'new Gio.Settings({schema_id: "org.gnome.desktop.a11y.interface"}).set_boolean("high-contrast", false)'
run 'A.close()'
run 'new Gio.Settings({schema_id: "org.gnome.desktop.interface"}).set_double("text-scaling-factor", 1.5)'
run 'A.wait(500)'
check 'text scaling 1.5: no text is cut off, rows stay inside the panel' \
    '(async () => { await A.open(); await A.wait(300); const s = visor.content.sheet; const bad = []; const walk = a => { if (!a.mapped) return; if (a instanceof St.Label) { const [min] = a.get_preferred_height(a.width); if (a.height + 0.5 < min) bad.push(a.text + " " + a.height + "<" + min); } for (const c of a.get_children()) walk(c); }; walk(s.root); const [rx] = s.root.get_transformed_position(); for (const row of A.find("visor-row").filter(a => a.mapped)) { const [x] = row.get_transformed_position(); if (x < rx - 0.5 || x + row.width > rx + s.root.width + 0.5) bad.push("row outside: " + A.name(row.get_first_child().get_first_child())); } const [, natural] = s.layer.get_preferred_height(s.layer.width); const fits = natural <= s.layer.height + 0.5 || s.scroll.vadjustment.upper > s.scroll.vadjustment.page_size; return bad.length === 0 && fits || bad.slice(0, 6).join(" ; ") + " fits " + fits; })()'
check 'text scaling 1.5: the keyboard still reaches every stop' \
    'A.tour().then(stops => stops.at(-1).zone !== "TRAPPED" && stops.map(s => s.name).join("|") === tour.map(s => s.name).join("|") || stops.map(s => s.zone).join())'
run 'new Gio.Settings({schema_id: "org.gnome.desktop.interface"}).set_double("text-scaling-factor", 1.0)'
run 'A.close()'

noise="$(tail -n "+$((log_start + 1))" "$HOME/shell.log" | grep -E 'JS ERROR|WARNING|CRITICAL|has been already disposed' || true)"
if [[ -z "$noise" ]]; then
    echo "ok    the shell logged no warning or error"
else
    echo "FAIL  the shell logged:"
    head -n 20 <<<"$noise"
    fail=1
fi

if ((fail == 0)); then echo "PASS"; else echo "FAILED"; fi
exit "$fail"
