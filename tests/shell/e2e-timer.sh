#!/usr/bin/env bash
# End to end, with real key events and the built-in modules: typing
# "timer 3s Test" into the search field and pressing Enter starts a timer that
# shows up as a row in "Now"; when it ends, the Timer source has a
# notification and the row says "Done".
#
# Usage: tests/shell/e2e-timer.sh
# The log ends up in .shell-test/e2e-timer.log.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ "${1:-}" != --inside ]]; then
    exec "$repo/scripts/nested.sh" --log "$repo/.shell-test/e2e-timer.log" -- \
        "$repo/tests/shell/e2e-timer.sh" --inside
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
# wait_check NAME JS [seconds]: like check, but gives JS time to become true.
wait_check() {
    if shell_wait_for "$2" "${3:-5}" 2>/dev/null; then
        echo "ok    $1"
    else
        echo "FAIL  $1: $(shell_eval "$2" 2>&1 || true)"
        fail=1
    fi
}
run() { shell_eval "$1" >/dev/null; }

shell_wait_for 'visor !== null && visor.api !== null'
run 'Main.overview.hide()'
shell_wait_for '!Main.overview.visible'
log_before="$(wc -l <"$HOME/shell.log")"

run "(() => {
    const keyboard = global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    const press = symbol => {
        keyboard.notify_keyval(GLib.get_monotonic_time(), symbol, Clutter.KeyState.PRESSED);
        keyboard.notify_keyval(GLib.get_monotonic_time(), symbol, Clutter.KeyState.RELEASED);
    };
    const wait = ms => new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => (r(true), false)));
    const up = (actor, cls) => {
        while (actor && !actor.has_style_class_name(cls)) actor = actor.get_parent();
        return actor ?? null;
    };
    globalThis.E = {
        wait,
        find: cls => $(content_find "' + cls + '"),
        async type(text) {
            for (const char of text) {
                press(Clutter.unicode_to_keysym(char.codePointAt(0)));
                await wait(15);
            }
            await wait(300);
        },
        async enter() {
            press(Clutter.KEY_Return);
            await wait(200);
        },
        // The row with this title as it is on screen, and the title of its section.
        row: title => up(E.find('visor-row-title').find(a => a.mapped && a.text === title), 'visor-row'),
        section: row => E.find('visor-section-title').find(a => up(row, 'visor-section')?.contains(a))?.text ?? null,
        subtitle: row => E.find('visor-row-subtitle').find(a => row.contains(a))?.text ?? '',
        results: () => E.find('visor-result-title').filter(a => a.mapped).map(a => a.text),
        timerSource: () => Main.messageTray.getSources().find(s => s.title === 'Timer'),
    };
    return true;
})()"

run 'visor.notch.open()'
shell_wait_for 'visor.notch.state === "open"'
run 'visor.content.sheet.entry.grab_key_focus()'
check 'typing the command shows what Enter would do' \
    'E.type("timer 3s Test").then(() => visor.content.sheet.entry.get_text() === "timer 3s Test" && E.results().join() === "Start timer · 0:03" || [visor.content.sheet.entry.get_text(), E.results().join(" / ")].join(" # "))'
check 'no timer runs before Enter' 'E.row("Test") === null && E.timerSource() === undefined'
check 'Enter starts the timer and closes the panel' \
    'E.enter().then(() => visor.notch.state !== "open" && visor.content.registry.get("timers").rows.length === 1 || visor.notch.state)'
run 'visor.notch.open()'
shell_wait_for 'visor.notch.state === "open"'
check 'the timer is a row in "Now", counting down' \
    '(() => { const row = E.row("Test"); return row !== null && E.section(row)?.toLowerCase() === "now" && !E.subtitle(row).includes("Done") && E.timerSource() === undefined || [row !== null, row && E.section(row), row && E.subtitle(row)].join(); })()'
wait_check 'after the end the Timer source has a notification' \
    'E.timerSource() !== undefined && E.timerSource().notifications.length === 1 && /Test/.test(E.timerSource().notifications[0].title + E.timerSource().notifications[0].body)' 8
wait_check 'and the row says "Done"' '(() => { const row = E.row("Test"); return row !== null && E.subtitle(row).includes("Done"); })()' 3

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
