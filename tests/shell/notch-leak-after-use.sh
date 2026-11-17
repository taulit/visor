#!/usr/bin/env bash
# Uses the notch (hint, peek, open, flash), then checks that disabling and
# enabling leaves no actor behind, and runs the enable/disable leak test in
# the same session.
#   scripts/nested.sh --animations -- tests/shell/notch-leak-after-use.sh [cycles]
set -euo pipefail
source "$VISOR_REPO/tests/shell/lib.sh"

uuid='visor@taulit.github.io'
count="$SHELL_ACTOR_COUNT"
reenable="(Main.extensionManager.disableExtension('$uuid'), Main.extensionManager.enableExtension('$uuid'))"

shell_eval "$reenable" >/dev/null
shell_eval 'visorTest.register()' >/dev/null
pause 200
fresh="$(shell_eval "$count")"

for _ in 1 2 3 4 5; do
    shell_eval 'visor.notch.dispatch({type: "enter"})' >/dev/null
    shell_wait_for 'visor.notch.state === "peek"'
    shell_eval 'visor.notch.dispatch({type: "activate"})' >/dev/null
    pause 150
    shell_eval 'visor.notch.contentChanged(), visor.notch.close(), visor.notch.flash(), visor.notch.toggle()' >/dev/null
    pause 100
    shell_eval 'visor.notch.toggle(), visor.notch.dispatch({type: "leave"})' >/dev/null
done
# Disable in the middle of an opening animation.
shell_eval 'visor.notch.open()' >/dev/null
pause 60
shell_eval "Main.extensionManager.disableExtension('$uuid')" >/dev/null
pause 300
check 'disabled mid-animation: modal and date menu handed back' '[Main.actionMode === Shell.ActionMode.NORMAL, Main.panel.statusArea.dateMenu.container.visible, Main.messageTray._bannerBlocked]' '[true,true,false]'
shell_eval "Main.extensionManager.enableExtension('$uuid')" >/dev/null
pause 300
check "actors after use and re-enable equal a fresh enable ($fresh)" "$count" "$fresh"
check_log 'no shell warnings while in use'

bash "$VISOR_REPO/scripts/leak-test.sh" --inside "${1:-10}" || failures=$((failures + 1))
finish
