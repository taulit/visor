#!/usr/bin/env bash
# The settings window opens through the shell, shows its three pages, follows
# changes of the settings made while it is open and closes. The window runs in
# its own process, so what that process prints is checked as well. The window
# is the one thing the shell cannot look into; what it does with the settings
# (order, disabled modules, foreign modules) is covered by the unit tests.
#
# Usage: tests/shell/prefs.sh
# The log ends up in .shell-test/prefs.log, the output of the window in .shell-test/prefs.window.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fixtures="$repo/tests/shell/fixtures"

if [[ "${1:-}" != --inside ]]; then
    # The window process inherits the output of the sandbox's bus daemon.
    mkdir -p "$repo/.shell-test"
    window="$repo/.shell-test/prefs.window"
    status=0
    "$repo/scripts/nested.sh" --log "$repo/.shell-test/prefs.log" \
        --extension "$fixtures/notes-visor@example.org" --extension "$fixtures/old-visor@example.org" -- \
        "$repo/tests/shell/prefs.sh" --inside >"$window" 2>&1 || status=$?
    grep -v '^dbus-daemon\|^$' "$window" || true
    # What the process of the window says; the sandbox has no accessibility bus and Adw has a type quirk.
    noise="$(grep -E '^\(org\.gnome\.Shell\.Extensions:|JS ERROR|Visor' "$window" |
        grep -v '^ok\|^FAIL\|atspi\|visible-page' || true)"
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
window_titles="global.get_window_actors().map(a => a.meta_window.title)"

shell_wait_for "Main.extensionManager.lookup('$uuid')?.state === 1"
check 'the window is not open yet' "$window_titles.includes('Visor')" false
prefs_open
check 'the window opens with the title Visor' "$window_titles.includes('Visor')" true

# The shell lists the fixtures the way the window reads them.
check 'the shell knows both module extensions' \
    "Main.extensionManager.getUuids().filter(u => u.endsWith('-visor@example.org')).sort()" \
    '["notes-visor@example.org","old-visor@example.org"]'

for page in about general modules; do prefs_page "$page"; done
check 'the window stays open when pages change' "$window_titles.includes('Visor')" true

# The Modules page writes the order of the modules. Rows are 55 px apart, the first
# one is at 137 px; the menu button is at 555 px, the drag handle at 76 px.
gs() { gsettings set org.gnome.shell.extensions.visor "$@"; }
export GSETTINGS_SCHEMA_DIR="$HOME/.local/share/gnome-shell/extensions/$uuid/schemas"
setting() { gsettings get org.gnome.shell.extensions.visor "$1"; }
expect_setting() {
    local got
    got="$(setting "$2")"
    if [[ "$got" == "$3" ]]; then echo "ok    $1  ($got)"; else echo "FAIL  $1: expected $3, got $got"; failures=$((failures + 1)); fi
}
prefs_click 555 137
prefs_click 552 221
expect_setting 'Move down in the menu of the first row moves it down' module-order \
    "['timers', 'media', 'downloads', 't3', 'upcoming', 'notifications']"
prefs_drag 76 137 76 247
expect_setting 'dragging the first row onto the third moves it there' module-order \
    "['media', 'downloads', 'timers', 't3', 'upcoming', 'notifications']"
prefs_click 520 247
expect_setting 'the switch of the third module turns it off' disabled-modules "['timers']"
prefs_click 520 247
expect_setting 'and on again' disabled-modules '@as []'

# Change what the window shows while it is open. Visor in the shell follows the
# same settings, so the shell is checked as well.
for width in compact wide normal; do gs width "$width"; done
gs hover-preview false
gs peek-delay 900
gs flash-on-events false
gs flash-on-waiting-agents false
gs currency-rates false
gs open-shortcut "['<Super>j']"
gs open-shortcut "[]"
gs disabled-modules "['media', 'notes']"
gs module-order "['timers', 'notes', 'media']"
gs module-order "['downloads', 'media']"
gs disabled-modules "[]"
gs module-order "[]"
for key in hover-preview flash-on-events flash-on-waiting-agents currency-rates; do gs "$key" true; done
gs peek-delay 380
sleep 1
check 'the window survives the changes' "$window_titles.includes('Visor')" true
check 'Visor survives the changes' "Main.extensionManager.lookup('$uuid').state" 1

prefs_close
check 'the window is closed' "$window_titles.includes('Visor')" false
# Mutter warns about its own ping when a window is closed from the shell; that is not ours.
noise="$(tail -n "+$((log_start + 1))" "$HOME/shell.log" | grep -E 'JS ERROR|WARNING|CRITICAL|visor' | grep -v 'Tried to ping window' || true)"
if [[ -z "$noise" ]]; then echo 'ok    the shell logged nothing'; else echo 'FAIL  the shell logged:'; head -n 20 <<<"$noise"; failures=$((failures + 1)); fi
((failures == 0))
