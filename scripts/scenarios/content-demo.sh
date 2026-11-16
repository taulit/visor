# The open panel with demo modules that rebuild the open state of the prototype:
# media, a waiting agent, timer and download on the left, "Up Next" and
# "Notifications" on the right, one dock module.
source "$repo/scripts/scenarios/content-lib.sh"
content_register
shell_eval 'visor.notch.open()' >/dev/null
