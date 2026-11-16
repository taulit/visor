# No modules at all: the search row with the dock and nothing below it.
source "$repo/scripts/scenarios/content-lib.sh"
shell_wait_for 'visor !== null && visor.api !== null'
shell_eval 'visor.notch.open()' >/dev/null
