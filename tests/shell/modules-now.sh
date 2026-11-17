#!/usr/bin/env bash
# Drives the built-in modules of "Now" (media, timers, downloads) in the
# sandboxed headless shell: a mock MPRIS player on the sandbox bus, timers
# started through their commands, files in the sandbox download directory.
#
# Usage: tests/shell/modules-now.sh
# The log ends up in .shell-test/modules-now.log.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ "${1:-}" != --inside ]]; then
    exec "$repo/scripts/nested.sh" --log "$repo/.shell-test/modules-now.log" -- \
        "$repo/tests/shell/modules-now.sh" --inside
fi

source "$repo/scripts/lib/shell.sh"

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

uuid='visor@taulit.github.io'
state="Main.extensionManager.lookup('$uuid').state"
shell_wait_for 'visor !== null && visor.api !== null'
log_before="$(wc -l <"$HOME/shell.log")"

# Helpers that live in the shell for the rest of the test. They go through
# `visor` every time: disabling the extension replaces everything below it.
run "(() => {
    const entry = id => visor.content.registry.get(id);
    globalThis.N = {
        wait: ms => new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => (r(true), false))),
        mod: id => entry(id).module,
        rows: id => entry(id).rows,
        row: (id, title) => entry(id).rows.find(r => r.title === title),
        chip: id => entry(id).chip,
        action: (row, label) => [...(row.controls ?? []), ...(row.actions ?? []), row.primary].find(a => a && a.label === label),
        timerSource: () => Main.messageTray.getSources().find(s => s.title === 'Timer'),
        seconds: value => value.split(':').reduce((sum, part) => sum * 60 + Number(part), 0),
    };
    return true;
})()"

# --- timers -----------------------------------------------------------------

check 'timers: the module is registered' "N.mod('timers').slot === 'now' && N.rows('timers').length === 0"
check 'timers: nothing runs, no timeout' "N.mod('timers').source === 0"
check 'timers: resolve names what Enter does' "(() => {
    const [r, ...rest] = N.mod('timers').commands[0].resolve('3s Test');
    return rest.length === 0 && r.title === 'Start timer · 0:03' && r.subtitle === 'Test' && N.rows('timers').length === 0;
})()"
check 'timers: incomplete arguments resolve to nothing' "N.mod('timers').commands[0].resolve('').length === 0 && N.mod('timers').commands[0].resolve('soon').length === 0"
check 'timers: an alarm resolves to its time' "N.mod('timers').commands[0].resolve('18:30 Call')[0].title === 'Alarm at 18:30'"
check 'timers: the commands have their keywords' "N.mod('timers').commands[0].keyword.includes('timer') && N.mod('timers').commands[1].keyword.includes('stoppuhr')"

run 'visor.notch.open()'
shell_wait_for 'visor.notch.state === "open"'
run "N.mod('timers').commands[0].resolve('3s Test')[0].activate()"
check 'timers: activate creates a row' "(() => {
    const row = N.row('timers', 'Test');
    return row.subtitle.startsWith('Timer · until ') && row.value === '0:03' && typeof row.progress === 'number'
        && row.actions.map(a => a.label).join() === '+1 min,Pause,Stop';
})()"
check 'timers: one timeout while it runs' "N.mod('timers').source !== 0"
check 'timers: the chip names the end' "N.chip('timers').priority === 40 && N.chip('timers').text.startsWith('Test · ')"
run 'N.wait(1900)'
check 'timers: the value counts down while the panel is open' "['0:02', '0:01'].includes(N.row('timers', 'Test').value)"
wait_check 'timers: the row says Done at the end' "N.row('timers', 'Test').subtitle === 'Timer · Done'" 6
check 'timers: the done row offers Restart' "N.row('timers', 'Test').primary.label === 'Restart' && !N.row('timers', 'Test').value"
check 'timers: a notification with Restart in an own source' "(() => {
    const source = N.timerSource();
    const [n] = source.notifications;
    return source.notifications.length === 1 && n.title === 'Test done' && n.urgency === 2 && n.actions.map(a => a.label).join() === 'Restart';
})()"
check 'timers: the done chip' "N.chip('timers').text === 'Test done' && N.chip('timers').tone === 'accent' && N.chip('timers').priority === 90"
run "N.row('timers', 'Test').primary.run()"
check 'timers: Restart starts over and takes the notification back' "N.row('timers', 'Test').value === '0:03' && N.timerSource() === undefined"

run "N.action(N.row('timers', 'Test'), 'Pause').run()"
check 'timers: Pause' "N.row('timers', 'Test').subtitle === 'Timer · Paused' && N.action(N.row('timers', 'Test'), 'Resume') !== undefined"
check 'timers: a paused timer needs no timeout' "N.mod('timers').source === 0"
paused="$(shell_eval "N.row('timers', 'Test').value")"
run 'N.wait(1200)'
check 'timers: a paused timer stands still' "N.row('timers', 'Test').value === $paused"
run "N.action(N.row('timers', 'Test'), '+1 min').run()"
check 'timers: +1 min' "N.seconds(N.row('timers', 'Test').value) === N.seconds($paused) + 60"
run "N.action(N.row('timers', 'Test'), 'Resume').run()"
# The first tick of a seconds timeout comes after one to two seconds.
run 'N.wait(2200)'
check 'timers: Resume' "N.seconds(N.row('timers', 'Test').value) < N.seconds($paused) + 60 && N.mod('timers').source !== 0"
run "N.action(N.row('timers', 'Test'), 'Stop').run()"
check 'timers: Stop removes the row' "N.rows('timers').length === 0 && N.chip('timers') === null && N.mod('timers').source === 0"

run "N.mod('timers').commands[1].resolve('Research')[0].activate()"
check 'timers: a stopwatch' "(() => {
    const row = N.row('timers', 'Research');
    return row.subtitle === 'Stopwatch' && row.value === '0:00' && row.progress === undefined
        && row.actions.map(a => a.label).join() === 'Pause,Stop';
})()"
run 'N.wait(2200)'
check 'timers: the stopwatch counts up' "N.seconds(N.row('timers', 'Research').value) >= 1"
run 'visor.notch.close()'
shell_wait_for 'visor.notch.state !== "open"'
check 'timers: no tick for a stopwatch while the panel is closed' "N.mod('timers').source === 0"
run "N.mod('timers').commands[0].resolve('10m Tea')[0].activate()"
check 'timers: with the panel closed only the end is awaited' "N.mod('timers').source !== 0 && N.row('timers', 'Tea').value === '10:00'"

# Persistence: the timers come back after disable and enable.
run "Main.extensionManager.disableExtension('$uuid')"
shell_wait_for "$state !== 1"
check 'timers: saved in the settings' "JSON.parse(visor.getSettings().get_string('timers')).map(t => t.label).join() === 'Research,Tea'"
run "N.wait(1100)"
run "Main.extensionManager.enableExtension('$uuid')"
shell_wait_for "$state === 1"
check 'timers: back after disable and enable' "(() => {
    const tea = N.seconds(N.row('timers', 'Tea').value);
    return N.rows('timers').length === 2 && tea < 600 && tea > 590 && N.seconds(N.row('timers', 'Research').value) >= 3;
})()"

# Ended while Visor was off: a moment ago rings once, long ago is dropped.
run "Main.extensionManager.disableExtension('$uuid')"
shell_wait_for "$state !== 1"
run "visor.getSettings().set_string('timers', JSON.stringify([
    { id: 'recent', kind: 'countdown', label: 'Recent', durationMs: 60000, totalMs: 60000, endsAt: Date.now() - 5000 },
    { id: 'old', kind: 'countdown', label: 'Old', durationMs: 60000, totalMs: 60000, endsAt: Date.now() - 600000 },
]))"
run "Main.extensionManager.enableExtension('$uuid')"
shell_wait_for "$state === 1"
check 'timers: one that ended a moment ago rings once on enable' "N.rows('timers').length === 1 && N.row('timers', 'Recent').subtitle === 'Timer · Done' && N.timerSource().notifications.length === 1"
run "Main.extensionManager.disableExtension('$uuid')"
shell_wait_for "$state !== 1"
check 'timers: disable takes the notification source along' "N.timerSource() === undefined"
run "Main.extensionManager.enableExtension('$uuid')"
shell_wait_for "$state === 1"
check 'timers: a done timer does not ring again' "N.row('timers', 'Recent').subtitle === 'Timer · Done' && N.timerSource() === undefined"
run "N.row('timers', 'Recent').primary.run()"
run "N.action(N.row('timers', 'Recent'), 'Stop').run()"
check 'timers: nothing left, nothing saved, no timeout' "N.rows('timers').length === 0 && visor.getSettings().get_string('timers') === '[]' && N.mod('timers').source === 0"

# --- the end ----------------------------------------------------------------

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
