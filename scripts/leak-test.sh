#!/usr/bin/env bash
# Enables and disables Visor repeatedly in the sandboxed headless shell and
# fails if actors or signal handlers are left behind, the shell logs warnings, or the stock date
# menu does not come back.
#
# Usage: scripts/leak-test.sh [cycles]   (default 50)
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "${1:-}" != --inside ]]; then
    exec "$repo/scripts/nested.sh" --log "$repo/.shell-test/leak-test.log" -- \
        "$repo/scripts/leak-test.sh" --inside "${1:-50}"
fi

source "$repo/scripts/lib/shell.sh"
cycles="$2"
uuid='visor@taulit.github.io'
state="Main.extensionManager.lookup('$uuid').state"
# Every actor below the stage, so leaks outside uiGroup's direct children count too.
count="$SHELL_ACTOR_COUNT"

settle() { shell_eval 'new Promise(r => GLib.timeout_add(GLib.PRIORITY_LOW, 150, () => (r(true), false)))' >/dev/null; }

shell_wait_for "$state === 1"
settle
actors_before="$(shell_eval "$count")"
# Handlers on the objects of the shell Visor connects to, see tests/shell-helper.
signals_before="$(shell_eval 'visorSignalCounts()')"
children_before="$(shell_eval 'Main.layoutManager.uiGroup.get_n_children()')"
log_before="$(wc -l <"$HOME/shell.log")"

for ((i = 1; i <= cycles; i++)); do
    shell_eval "Main.extensionManager.disableExtension('$uuid')" >/dev/null
    shell_wait_for "$state !== 1"
    if ((i == 1)); then
        settle
        date_menu="$(shell_eval 'Main.panel.statusArea.dateMenu.container.visible && Main.panel.statusArea.dateMenu.container.get_parent() === Main.panel._centerBox')"
        actors_disabled="$(shell_eval "$count")"
        signals_disabled="$(shell_eval 'visorSignalCounts()')"
    fi
    shell_eval "Main.extensionManager.enableExtension('$uuid')" >/dev/null
    shell_wait_for "$state === 1"
done

settle
actors_after="$(shell_eval "$count")"
signals_after="$(shell_eval 'visorSignalCounts()')"
children_after="$(shell_eval 'Main.layoutManager.uiGroup.get_n_children()')"
shell_eval "Main.extensionManager.disableExtension('$uuid')" >/dev/null
shell_wait_for "$state !== 1"
settle
actors_end="$(shell_eval "$count")"
signals_end="$(shell_eval 'visorSignalCounts()')"
date_menu_end="$(shell_eval 'Main.panel.statusArea.dateMenu.container.visible')"
noise="$(tail -n "+$((log_before + 1))" "$HOME/shell.log" | grep -E 'JS ERROR|WARNING|CRITICAL|has been already disposed' || true)"

echo "cycles:                       $cycles"
echo "actors enabled before/after:  $actors_before / $actors_after"
echo "actors disabled first/last:   $actors_disabled / $actors_end"
echo "uiGroup children before/after: $children_before / $children_after"
echo "date menu restored:           $date_menu / $date_menu_end"
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
[[ "$children_before" == "$children_after" ]] || { echo "FAIL: uiGroup children changed"; fail=1; }
[[ "$date_menu" == true && "$date_menu_end" == true ]] || { echo "FAIL: date menu not restored"; fail=1; }
[[ -z "$noise" ]] || { echo "FAIL: shell warnings:"; echo "$noise" | head -n 20; fail=1; }
((fail == 0)) && echo "PASS"
exit "$fail"
