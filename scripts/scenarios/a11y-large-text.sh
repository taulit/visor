# The open panel with large text: a text scaling factor of 1.5.
source "$repo/scripts/scenarios/content-lib.sh"
gsettings set org.gnome.desktop.interface text-scaling-factor 1.5
content_register
sleep 0.5
shell_eval 'visor.notch.open()' >/dev/null
