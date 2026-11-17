#!/usr/bin/env bash
# Like scripts/leak-test.sh, but with content: before every disable the demo
# modules are registered and the peek row, the sheet and the list of modules
# are built and shown. Fails if actors or signal handlers are left behind or the
# shell logs warnings.
#
# Usage: tests/shell/content-leak.sh [cycles]   (default 20)
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ "${1:-}" != --inside ]]; then
    exec "$repo/scripts/nested.sh" --log "$repo/.shell-test/content-leak.log" -- \
        "$repo/tests/shell/content-leak.sh" --inside "${1:-20}"
fi

source "$repo/scripts/lib/shell.sh"
source "$repo/scripts/scenarios/content-lib.sh"
cycles="$2"
uuid='visor@taulit.github.io'
state="Main.extensionManager.lookup('$uuid').state"
count="$SHELL_ACTOR_COUNT"
flash="visorDemo.ctx.media.peek.flash({ icon: 'media-playback-start-symbolic', text: 'New', priority: 1 })"
settle() { shell_eval 'new Promise(r => GLib.timeout_add(GLib.PRIORITY_LOW, 150, () => (r(true), false)))' >/dev/null; }

shell_wait_for "$state === 1"
settle
actors_before="$(shell_eval "$count")"
# Handlers on the objects of the shell Visor connects to, see tests/shell-helper.
signals_before="$(shell_eval 'visorSignalCounts()')"
log_before="$(wc -l <"$HOME/shell.log")"

for ((i = 1; i <= cycles; i++)); do
    content_register
    shell_eval "$flash" >/dev/null
    shell_wait_for 'visor.notch.state === "peek"'
    shell_eval 'visor.notch.open()' >/dev/null
    shell_eval "$(content_find visor-dock-button).at(-1).emit('clicked', 1)" >/dev/null
    # Half of the cycles are disabled with the panel open, half with the peek row showing.
    if ((i % 2 == 0)); then
        shell_eval 'visor.notch.close()' >/dev/null
        shell_eval "$flash" >/dev/null
        shell_wait_for 'visor.notch.state === "peek"'
    fi
    shell_eval "Main.extensionManager.disableExtension('$uuid')" >/dev/null
    shell_wait_for "$state !== 1"
    if ((i == 1)); then
        settle
        actors_disabled="$(shell_eval "$count")"
        signals_disabled="$(shell_eval 'visorSignalCounts()')"
    fi
    modules_off="$(shell_eval "['media', 'agents', 'timers', 'downloads', 'calendar', 'notifications', 'notes'].every(id => visorDemo.log.includes(id + ':disable'))")"
    [[ "$modules_off" == true ]] || { echo "FAIL: cycle $i left modules enabled"; exit 1; }
    shell_eval "Main.extensionManager.enableExtension('$uuid')" >/dev/null
    shell_wait_for "$state === 1"
done

settle
actors_after="$(shell_eval "$count")"
signals_after="$(shell_eval 'visorSignalCounts()')"
shell_eval "Main.extensionManager.disableExtension('$uuid')" >/dev/null
shell_wait_for "$state !== 1"
settle
actors_end="$(shell_eval "$count")"
signals_end="$(shell_eval 'visorSignalCounts()')"
sources="$(shell_eval 'visorDemo.ctx.media.isOpen')"
noise="$(tail -n "+$((log_before + 1))" "$HOME/shell.log" | grep -E 'JS ERROR|WARNING|CRITICAL|has been already disposed' || true)"

echo "cycles:                       $cycles"
echo "actors enabled before/after:  $actors_before / $actors_after"
echo "actors disabled first/last:   $actors_disabled / $actors_end"
grew_enabled="$(signals_grew "$signals_before" "$signals_after" "$cycles")"
grew_disabled="$(signals_grew "$signals_disabled" "$signals_end" "$cycles")"
echo "handlers enabled before/after: $(signals_total "$signals_before") / $(signals_total "$signals_after")"
echo "handlers disabled first/last: $(signals_total "$signals_disabled") / $(signals_total "$signals_end")"
echo "shell warnings during test:   $(grep -c . <<<"$noise" || true)"

fail=0
[[ "$actors_before" == "$actors_after" ]] || { echo "FAIL: actor count grew while enabled"; fail=1; }
[[ "$actors_disabled" == "$actors_end" ]] || { echo "FAIL: actor count grew while disabled"; fail=1; }
[[ -z "$grew_enabled" ]] || { echo "FAIL: signal handlers left behind while enabled:"; echo "$grew_enabled"; fail=1; }
[[ -z "$grew_disabled" ]] || { echo "FAIL: signal handlers left behind while disabled:"; echo "$grew_disabled"; fail=1; }
[[ "$sources" == false ]] || { echo "FAIL: a dead module context still says the panel is open"; fail=1; }
[[ -z "$noise" ]] || { echo "FAIL: shell warnings:"; echo "$noise" | head -n 20; fail=1; }
((fail == 0)) && echo "PASS"
exit "$fail"
