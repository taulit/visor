# The open panel with the high contrast setting of the desktop on.
source "$repo/scripts/scenarios/content-lib.sh"
gsettings set org.gnome.desktop.a11y.interface high-contrast true
content_register
shell_wait_for "visor.notch.root.has_style_class_name('visor-hc')"
shell_eval 'visor.notch.open()' >/dev/null
