# The open panel with the class the notch sets for high contrast.
source "$repo/scripts/scenarios/content-lib.sh"
content_register
shell_eval "visor.notch.root.add_style_class_name('visor-hc')" >/dev/null
shell_eval 'visor.notch.open()' >/dev/null
