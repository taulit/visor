#!/usr/bin/env bash
# Runs inside the sandboxed D-Bus session started by scripts/nested.sh:
# prepares settings, starts the headless shell, runs the command, stops the shell.
set -euo pipefail
source "$VISOR_REPO/scripts/lib/shell.sh"

if [[ "$VISOR_SCHEME" == light ]]; then scheme=prefer-light; else scheme=prefer-dark; fi
gsettings set org.gnome.shell enabled-extensions "$VISOR_ENABLED"
gsettings set org.gnome.shell disable-user-extensions false
gsettings set org.gnome.shell welcome-dialog-last-shown-version '999'
gsettings set org.gnome.desktop.interface color-scheme "$scheme"
gsettings set org.gnome.desktop.interface accent-color "$VISOR_ACCENT"
gsettings set org.gnome.desktop.interface enable-animations "$VISOR_ANIMATIONS"
gsettings set org.gnome.desktop.interface clock-format '24h'
gsettings set org.gnome.desktop.background picture-options 'none'
gsettings set org.gnome.desktop.background primary-color '#241f31'
gsettings set org.gnome.desktop.background color-shading-type 'solid'
# Keep the sandbox away from real devices such as phones on USB.
gsettings set org.gnome.desktop.media-handling automount false
gsettings set org.gnome.desktop.media-handling automount-open false

shell_args=(--headless --wayland --no-x11 --virtual-monitor "$VISOR_SIZE")
[[ "$VISOR_ANIMATIONS" == true ]] && shell_args+=(--force-animations)
gnome-shell "${shell_args[@]}" >"$HOME/shell.log" 2>&1 &
shell_pid=$!
trap 'kill "$shell_pid" 2>/dev/null; wait "$shell_pid" 2>/dev/null || true' EXIT

ready=false
for _ in $(seq 1 150); do
    if [[ "$(shell_eval '!Main.layoutManager._startingUp' 2>/dev/null)" == true ]]; then
        ready=true
        break
    fi
    kill -0 "$shell_pid" 2>/dev/null || break
    sleep 0.2
done
if ! $ready; then
    echo "nested.sh: the shell did not start, log follows" >&2
    tail -n 40 "$HOME/shell.log" >&2
    exit 1
fi

# A fresh session starts in the overview; tests want the plain desktop.
shell_eval 'Main.overview.hide()' >/dev/null
shell_wait_for '!Main.overview.visible'

"$@"
