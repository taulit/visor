# The built-in list of modules, reached through the last icon of the dock.
source "$repo/scripts/scenarios/content-lib.sh"
content_register
shell_eval 'visor.notch.open()' >/dev/null
shell_eval "$(content_find visor-dock-button).at(-1).emit('clicked', 1)" >/dev/null
