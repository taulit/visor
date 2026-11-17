#!/usr/bin/env bash
# Enables and disables Visor repeatedly in the sandboxed headless shell and
# fails if actors are left behind, the shell logs warnings, or the stock date
# menu does not come back.
#
# Usage: scripts/leak-test.sh [cycles] [--t3]   (default 50)
# With --t3 the T3 Code mock of tests/t3-mock/ runs and the module is
# connected to it in every cycle.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "${1:-}" != --inside ]]; then
    exec "$repo/scripts/nested.sh" --log "$repo/.shell-test/leak-test.log" -- \
        "$repo/scripts/leak-test.sh" --inside "${1:-50}" "${2:-}"
fi

source "$repo/scripts/lib/shell.sh"
cycles="$2"
with_t3=false
[[ "${3:-}" == --t3 ]] && with_t3=true
uuid='visor@taulit.github.io'
state="Main.extensionManager.lookup('$uuid').state"
# Every actor below the stage, so leaks outside uiGroup's direct children count too.
count="$SHELL_ACTOR_COUNT"

settle() { shell_eval 'new Promise(r => GLib.timeout_add(GLib.PRIORITY_LOW, 150, () => (r(true), false)))' >/dev/null; }

shell_wait_for "$state === 1"
t3="visor.content.registry.get('t3')"
t3_connected() { ! $with_t3 || shell_wait_for "$t3.module.client.connected && $t3.rows.length > 0"; }
if $with_t3; then
    port="$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')"
    node "$repo/tests/t3-mock/server.js" --port "$port" --home "$HOME/.t3" >/dev/null 2>&1 &
    shell_eval "visor.getSettings().set_string('t3-access-token', 'mock-token')" >/dev/null
    t3_connected
fi
settle
actors_before="$(shell_eval "$count")"
children_before="$(shell_eval 'Main.layoutManager.uiGroup.get_n_children()')"
log_before="$(wc -l <"$HOME/shell.log")"

for ((i = 1; i <= cycles; i++)); do
    shell_eval "Main.extensionManager.disableExtension('$uuid')" >/dev/null
    shell_wait_for "$state !== 1"
    if ((i == 1)); then
        settle
        date_menu="$(shell_eval 'Main.panel.statusArea.dateMenu.container.visible && Main.panel.statusArea.dateMenu.container.get_parent() === Main.panel._centerBox')"
        actors_disabled="$(shell_eval "$count")"
    fi
    shell_eval "Main.extensionManager.enableExtension('$uuid')" >/dev/null
    shell_wait_for "$state === 1"
    t3_connected
done

settle
actors_after="$(shell_eval "$count")"
children_after="$(shell_eval 'Main.layoutManager.uiGroup.get_n_children()')"
shell_eval "Main.extensionManager.disableExtension('$uuid')" >/dev/null
shell_wait_for "$state !== 1"
settle
actors_end="$(shell_eval "$count")"
date_menu_end="$(shell_eval 'Main.panel.statusArea.dateMenu.container.visible')"
noise="$(tail -n "+$((log_before + 1))" "$HOME/shell.log" | grep -E 'JS ERROR|WARNING|CRITICAL|has been already disposed' || true)"

echo "cycles:                       $cycles"
! $with_t3 || echo "T3 Code mock connections:     $(curl -s "http://127.0.0.1:$port/__mock/state")"
echo "actors enabled before/after:  $actors_before / $actors_after"
echo "actors disabled first/last:   $actors_disabled / $actors_end"
echo "uiGroup children before/after: $children_before / $children_after"
echo "date menu restored:           $date_menu / $date_menu_end"
echo "shell warnings during test:   $(grep -c . <<<"$noise" || true)"

fail=0
[[ "$actors_before" == "$actors_after" ]] || { echo "FAIL: actor count grew while enabled"; fail=1; }
[[ "$actors_disabled" == "$actors_end" ]] || { echo "FAIL: actor count grew while disabled"; fail=1; }
[[ "$children_before" == "$children_after" ]] || { echo "FAIL: uiGroup children changed"; fail=1; }
[[ "$date_menu" == true && "$date_menu_end" == true ]] || { echo "FAIL: date menu not restored"; fail=1; }
[[ -z "$noise" ]] || { echo "FAIL: shell warnings:"; echo "$noise" | head -n 20; fail=1; }
((fail == 0)) && echo "PASS"
exit "$fail"
