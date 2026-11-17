#!/usr/bin/env bash
# The settings window opens through the shell, shows its three pages, follows
# changes of the settings made while it is open and closes. The window runs in
# its own process, so what that process prints is checked as well. It is
# driven with a virtual pointer and keyboard and read over the accessibility
# bus (scripts/lib/prefs.sh): the dialog that captures the shortcut, the menu
# of a row by keyboard, modules of other extensions with and without
# `visor.id`, the button to their settings, the server address of T3 Code.
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
        --extension "$fixtures/notes-visor@example.org" --extension "$fixtures/old-visor@example.org" \
        --extension "$fixtures/clock-visor@example.org" -- \
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
source "$repo/scripts/lib/keyring.sh"
uuid='visor@taulit.github.io'
window_titles="global.get_window_actors().map(a => a.meta_window.title)"

shell_wait_for "Main.extensionManager.lookup('$uuid')?.state === 1"
check 'the window is not open yet' "$window_titles.includes('Visor')" false
prefs_a11y
prefs_open
check 'the window opens with the title Visor' "$window_titles.includes('Visor')" true

# The shell lists the fixtures the way the window reads them.
check 'the shell knows the module extensions' \
    "Main.extensionManager.getUuids().filter(u => u.endsWith('-visor@example.org')).sort()" \
    '["clock-visor@example.org","notes-visor@example.org","old-visor@example.org"]'

for page in about general modules; do prefs_page "$page"; done
check 'the window stays open when pages change' "$window_titles.includes('Visor')" true

gs() { gsettings set org.gnome.shell.extensions.visor "$@"; }
export GSETTINGS_SCHEMA_DIR="$HOME/.local/share/gnome-shell/extensions/$uuid/schemas"
setting() { gsettings get org.gnome.shell.extensions.visor "$1"; }
expect_setting() {
    local got
    got="$(setting "$2")"
    if [[ "$got" == "$3" ]]; then echo "ok    $1  ($got)"; else echo "FAIL  $1: expected $3, got $got"; failures=$((failures + 1)); fi
}
# expect_shows NAME TEXT / expect_hides NAME TEXT: the window shows exactly that text, or does not.
expect_shows() {
    if prefs_shows "$2"; then echo "ok    $1"; else echo "FAIL  $1: the window does not show '$2'"; failures=$((failures + 1)); fi
}
expect_hides() {
    if prefs_shows "$2"; then echo "FAIL  $1: the window shows '$2'"; failures=$((failures + 1)); else echo "ok    $1"; fi
}
# expect_focus NAME WIDGET: the keyboard focus is on that widget ("role | name").
expect_focus() {
    local got
    got="$(prefs_focus | head -n 1)"
    if [[ "$got" == "$2" ]]; then echo "ok    $1  ($got)"; else echo "FAIL  $1: expected $2, got $got"; failures=$((failures + 1)); fi
}
dialog_text='Press the keys you want to use. Esc cancels, Backspace removes the shortcut.'

# --- General: the dialog that captures the additional shortcut -----------------------
prefs_page general
prefs_click_on 'Additional shortcut' 'list item'
expect_shows 'the row of the shortcut opens the dialog' "$dialog_text"
prefs_key j
expect_setting 'a plain letter is refused' open-shortcut '@as []'
expect_shows 'and the dialog stays' "$dialog_text"
prefs_key Shift_L j
expect_setting 'so is a letter with Shift alone' open-shortcut '@as []'
prefs_key Escape
expect_hides 'Esc closes the dialog' "$dialog_text"
expect_setting 'without a change' open-shortcut '@as []'
prefs_click_on 'Additional shortcut' 'list item'
prefs_key Control_L Alt_L j
expect_setting 'a combination with Ctrl and Alt is stored' open-shortcut "['<Control><Alt>j']"
expect_hides 'the dialog closes' "$dialog_text"
expect_shows 'and the row shows it' 'Ctrl + Alt + J'
prefs_click_on 'Additional shortcut' 'list item'
prefs_key Escape
expect_setting 'Esc keeps the stored shortcut' open-shortcut "['<Control><Alt>j']"
check 'Visor is closed' 'visor.notch.state' '"idle"'
prefs_key Control_L Alt_L j
shell_wait_for 'visor.notch.state === "open"' 5 || true
check 'the stored shortcut opens Visor' 'visor.notch.state' '"open"'
shell_eval 'visor.notch.close()' >/dev/null
shell_wait_for 'visor.notch.state === "idle"' 5 || true
prefs_click_on 'Additional shortcut' 'list item'
prefs_key BackSpace
expect_setting 'Backspace in the dialog removes the shortcut' open-shortcut '@as []'
expect_hides 'and closes it' "$dialog_text"
expect_shows 'the row says None' 'None'

# --- Modules: the menu of a row with the keyboard -------------------------------------
# From the tab of the page, Tab goes to the switch of the first row and on to its menu.
prefs_page modules
prefs_key Tab
prefs_key Tab
expect_focus 'Tab reaches the menu of the first row' 'toggle button | Change the order'
prefs_key Return
prefs_key Return
expect_setting 'Enter opens it and Enter on Move down moves the row' module-order \
    "['timers', 'media', 'downloads', 't3', 'upcoming', 'notifications', 'world-clock']"
expect_focus 'the focus is on the row that moved' 'list item | Media'
prefs_key Tab
prefs_key Tab
prefs_key Return
prefs_key Return
expect_setting 'and Move up, the first entry of its menu now, moves it back' module-order \
    "['media', 'timers', 'downloads', 't3', 'upcoming', 'notifications', 'world-clock']"
expect_focus 'the focus follows again' 'list item | Media'
gs module-order '[]'
sleep 0.5

# --- Modules: pointer --------------------------------------------------------------
# Rows are 55 px apart, the first one is at 137 px; the menu button is at
# 555 px, the drag handle at 76 px.
prefs_click 555 137
prefs_click 552 221
expect_setting 'Move down in the menu of the first row moves it down' module-order \
    "['timers', 'media', 'downloads', 't3', 'upcoming', 'notifications', 'world-clock']"
prefs_drag 76 137 76 247
expect_setting 'dragging the first row onto the third moves it there' module-order \
    "['media', 'downloads', 'timers', 't3', 'upcoming', 'notifications', 'world-clock']"
prefs_click 520 247
expect_setting 'the switch of the third module turns it off' disabled-modules "['timers']"
prefs_click 520 247
expect_setting 'and on again' disabled-modules '@as []'

# --- Modules of other extensions ----------------------------------------------------
# World Clock names its module id in metadata.json ("visor": {"id": "world-clock"}), Notes does not.
texts="$(prefs_texts)"
if grep -qxF 'switch | World Clock' <<<"$texts"; then echo 'ok    a module that names its id has a switch'; else echo 'FAIL  World Clock has no switch'; failures=$((failures + 1)); fi
if grep -qxF 'label | Notes' <<<"$texts" && ! grep -qxF 'switch | Notes' <<<"$texts"; then
    echo 'ok    a module that does not is listed without one'
else
    echo 'FAIL  Notes is not listed or has a switch'; failures=$((failures + 1))
fi
prefs_click_on 'World Clock' switch
expect_setting 'its switch turns the module off by its id' disabled-modules "['world-clock']"
prefs_click_on 'World Clock' switch
expect_setting 'and on again' disabled-modules '@as []'
# Its menu is right of the switch; Move up is the only entry of the last row that can be used.
read -r _ clock_y <<<"$(prefs_where 'World Clock' switch)"
prefs_click 555 "$clock_y"
prefs_key Return
expect_setting 'Move up in its menu moves it among the built-in modules' module-order \
    "['media', 'downloads', 'timers', 'world-clock', 'upcoming', 'notifications', 't3']"
sleep 0.5
rows="$(prefs_texts | awk '!seen[$0]++' | grep -x 'list item | \(Timers\|World Clock\|T3 Code\)' | tr '\n' ';')"
if [[ "$rows" == 'list item | Timers;list item | World Clock;list item | T3 Code;' ]]; then
    echo 'ok    and the rows of Now show it before T3 Code'
else
    echo "FAIL  the rows of Now are $rows"; failures=$((failures + 1))
fi

# --- T3 Code: the server address ----------------------------------------------------
# No server is asked here: the addresses are refused or have nothing behind them.
prefs_click 20 400
prefs_scroll 600
prefs_click_on 'Server address' 'list item'
prefs_click_on 'Address, empty for this machine' text
prefs_type 'ftp://files'
prefs_enter
expect_shows 'an address that is none is refused with a text' 'This is not a server address'
expect_setting 'and not stored' t3-server-url "''"
prefs_key Control_L a
prefs_type 'http://example.org:3773'
prefs_enter
expect_shows 'http to another machine is refused with a text' 'Use https for a server on another machine'
expect_setting 'and not stored' t3-server-url "''"
# Paired with one origin, then another address is entered.
keyring_store 'http://127.0.0.1:9' 'address-test-token'
gs t3-token-origin 'http://127.0.0.1:9'
sleep 0.5
expect_shows 'paired by hand: the window says Connected' 'Connected'
prefs_key Control_L a
prefs_type 'http://127.0.0.1:1'
prefs_enter
sleep 1
expect_setting 'an address of another origin is stored' t3-server-url "'http://127.0.0.1:1'"
expect_setting 'and forgets the pairing' t3-token-origin "''"
if [[ -z "$(keyring_lookup 'http://127.0.0.1:9')" ]]; then echo 'ok    and its token in the keyring'; else echo 'FAIL  the token of the old origin is still in the keyring'; failures=$((failures + 1)); fi
expect_hides 'the window no longer says Connected' 'Connected'
gs t3-server-url ''

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

# --- the settings of a module of another extension --------------------------------------
# The shell shows the settings of one extension at a time, so the window of Visor makes way.
prefs_open
prefs_page modules
prefs_click_on 'Settings of the module'
shell_wait_for "$window_titles.includes('Notes')" 10 || true
check 'the gear of Notes opens the settings of that extension' "$window_titles.includes('Notes')" true
expect_shows 'with what its prefs.js builds' 'Settings of Notes'
check 'in place of the window of Visor' "$window_titles.includes('Visor')" false
shell_eval "global.get_window_actors().map(a => a.meta_window).find(w => w.title === 'Notes')?.delete(global.get_current_time())" >/dev/null
shell_wait_for "!$window_titles.includes('Notes')" 5 || true
# Mutter warns about its own ping when a window is closed from the shell; that is not ours.
noise="$(tail -n "+$((log_start + 1))" "$HOME/shell.log" | grep -E 'JS ERROR|WARNING|CRITICAL|visor' | grep -v 'Tried to ping window' || true)"
if [[ -z "$noise" ]]; then echo 'ok    the shell logged nothing'; else echo 'FAIL  the shell logged:'; head -n 20 <<<"$noise"; failures=$((failures + 1)); fi
((failures == 0))
