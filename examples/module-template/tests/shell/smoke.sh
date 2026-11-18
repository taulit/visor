#!/usr/bin/env bash
# The module next to Visor in the sandboxed headless shell: it registers, its
# place shows on the panel, it survives Visor going and coming back, and
# disabling the extension removes the module. Add checks of what your module
# shows where the comment below says so.
#
# Usage: tests/shell/smoke.sh
# The log of the shell ends up in .shell-test/smoke.log.
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

if [[ "${1:-}" != --inside ]]; then
    nested --log "$repo/.shell-test/smoke.log" -- "$repo/tests/shell/smoke.sh" --inside
    exit
fi

inside
wait_check 'the module is registered by this extension' \
    "$entry != null && $entry.active && $entry.owner.uuid === '$uuid'"

run 'visor.notch.open()'
shell_wait_for 'visor.notch.state === "open"'
check 'the panel opens with the module in it' 'visor.notch.state === "open"'
# What your module shows goes here, for example a row of a "Now" module:
#   check 'the row is on the panel' "$(find visor-row-title).some(a => a.mapped && a.text === 'Hello from Visor')"
run 'visor.notch.close()'
shell_wait_for 'visor.notch.state !== "open"'

# Visor goes and comes back: the module registers again by itself.
run "Main.extensionManager.disableExtension('$visor_uuid')"
shell_wait_for "$(state "$visor_uuid") !== 1"
check 'Visor off: the extension of the module stays active' "$(state "$uuid") === 1"
run "Main.extensionManager.enableExtension('$visor_uuid')"
shell_wait_for "$(state "$visor_uuid") === 1"
wait_check 'Visor on again: the module is registered again' "$entry != null && $entry.active" 8

# The extension goes: nothing of the module is left in Visor.
run "Main.extensionManager.disableExtension('$uuid')"
shell_wait_for "$(state "$uuid") !== 1"
check 'the extension off: the module is gone' "$entry === null"
run "Main.extensionManager.enableExtension('$uuid')"
wait_check 'and on again: the module is back' "$entry != null && $entry.active"
finish
