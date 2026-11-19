#!/usr/bin/env bash
# "Updates" on the About page of the settings window, against a server on this
# machine in place of GitHub: a newer release is offered, a ZIP that is not the
# release it claims is refused and leaves Visor as it was, the right one takes
# the place of the installed files in one step and the window offers to log
# out. Log Out is never pressed.
#
# Usage: tests/shell/prefs-update.sh
# The log ends up in .shell-test/prefs-update.log, the output of the window in
# .shell-test/prefs-update.window.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ "${1:-}" != --inside ]]; then
    window="$repo/.shell-test/prefs-update.window"
    status=0
    mkdir -p "$repo/.shell-test/shots"
    "$repo/scripts/nested.sh" --log "$repo/.shell-test/prefs-update.log" -- \
        "$repo/tests/shell/prefs-update.sh" --inside >"$window" 2>&1 || status=$?
    grep -E '^(ok|FAIL)' "$window" || true
    noise="$(grep -E '^\(org\.gnome\.Shell\.Extensions:|JS ERROR|Visor' "$window" |
        grep -v '^ok\|^FAIL\|atspi\|visible-page\|Tried to ping window\|the ZIP is version 1.0.0, not 9.9.9' || true)"
    if [[ -n "$noise" ]]; then
        echo "FAIL  the window process logged:"
        head -n 10 <<<"$noise"
        exit 1
    fi
    echo "ok    the window process logged no error"
    exit "$status"
fi

source "$repo/tests/shell/lib.sh"
source "$repo/scripts/lib/prefs.sh"
uuid='visor@taulit.github.io'
installed="$HOME/.local/share/gnome-shell/extensions/$uuid"
export GSETTINGS_SCHEMA_DIR="$installed/schemas"
gs() { gsettings set org.gnome.shell.extensions.visor "$@"; }
failures=0
expect_shows() {
    if prefs_shows "$2"; then echo "ok    $1"; else echo "FAIL  $1: the window does not show '$2'"; failures=$((failures + 1)); fi
}
wait_shows() {
    local i
    for ((i = 0; i < ${2:-10} * 2; i++)); do
        prefs_shows "$1" && return 0
        sleep 0.5
    done
    return 0
}
expect_true() {
    if eval "$2"; then echo "ok    $1"; else echo "FAIL  $1"; failures=$((failures + 1)); fi
}
version() { python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version-name"])' "$installed/metadata.json"; }
leftovers() { find "$(dirname "$installed")" -maxdepth 1 -name ".$uuid.*" | wc -l; }

served="$(mktemp -d)"
port=$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')
# Two releases 9.9.9: a good ZIP, and one whose metadata says another version.
python3 "$repo/tests/shell/make-release.py" "$installed" "$served" "$port" "$uuid"
python3 -m http.server "$port" --bind 127.0.0.1 --directory "$served" >/dev/null 2>&1 &
server=$!
trap 'kill $server 2>/dev/null; rm -rf "$served"' EXIT
for _ in $(seq 1 50); do curl -s "http://127.0.0.1:$port/latest.json" >/dev/null && break; sleep 0.1; done
before="$(version)"
prefs_a11y

# --- a ZIP that is not the release ------------------------------------------------
gs update-url "http://127.0.0.1:$port/latest-bad.json"
gs update-check true
prefs_open
prefs_page about
wait_shows 'Visor 9.9.9 is available'
expect_shows 'a newer release is offered' 'Visor 9.9.9 is available'
expect_shows 'with the version installed now' "You have version $before."
shell_shot_window "$PREFS_WINDOW" "$repo/.shell-test/shots/prefs-update-available.png" || true
prefs_click_on 'Update'
wait_shows 'The update did not work'
expect_shows 'a ZIP with another version in it is refused' 'The update did not work'
expect_true 'Visor stays as it was, with nothing left over' "[[ \"\$(version)\" == '$before' && ! -e '$installed/UPDATED' && \"\$(leftovers)\" == 0 ]]"
prefs_close

# --- the release ------------------------------------------------------------------------
gs update-url "http://127.0.0.1:$port/latest.json"
prefs_open
prefs_page about
wait_shows 'Visor 9.9.9 is available'
prefs_click_on 'Update'
wait_shows 'Updated to 9.9.9'
expect_shows 'the update is done' 'Updated to 9.9.9'
expect_shows 'and says what is left to do' 'Log out and back in to use the new version.'
expect_shows 'with a button for it' 'Log Out'
shell_shot_window "$PREFS_WINDOW" "$repo/.shell-test/shots/prefs-update-done.png" || true
expect_true 'the files of the release are in place, with nothing left over' "[[ \"\$(version)\" == '9.9.9' && -e '$installed/UPDATED' && -e '$installed/schemas/gschemas.compiled' && \"\$(leftovers)\" == 0 ]]"
prefs_close

# --- off -------------------------------------------------------------------------------------
gs update-check false
prefs_open
prefs_page about
sleep 1
expect_shows 'with looking off, nothing is asked and a button offers it' 'Look for updates'
prefs_close

exit "$failures"
