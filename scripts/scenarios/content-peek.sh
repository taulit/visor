# The peek state: five modules have a chip, the four most important are shown,
# the waiting one first.
source "$repo/scripts/scenarios/content-lib.sh"
content_register
shell_eval "visor.notch.setState('peek')" >/dev/null
