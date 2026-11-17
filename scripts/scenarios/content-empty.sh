# No modules at all: the search row with the dock and nothing below it.
source "$repo/scripts/scenarios/content-lib.sh"
content_clear
shell_eval 'visor.notch.open()' >/dev/null
