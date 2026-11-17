#!/usr/bin/env bash
# Pairing with T3 Code through the settings window, against the mock server of
# tests/t3-mock/: a pairing link typed into the window and Connect store the
# token in the keyring (of the sandbox, see scripts/nested.sh) and nowhere
# else, the module in the shell connects without a restart and shows the
# sessions, Disconnect removes it, a token the server refuses is asked for
# once and not again, and a bare code pairs anew. Then once more in a sandbox
# without a keyring: the window says so and keeps the code, the module logs
# one line. The window is driven with the pointer and the keyboard, as
# tests/shell/prefs.sh does.
#
# Usage: tests/shell/prefs-t3.sh
# The log ends up in .shell-test/prefs-t3.log, the output of the window in .shell-test/prefs-t3.window.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# Nothing of these may ever be written anywhere.
secrets='first-code-123|second-code-456|wrong-code-789|mock-token|refused-token-abc'

if [[ "${1:-}" != --inside ]]; then
    mkdir -p "$repo/.shell-test"
    window="$repo/.shell-test/prefs-t3.window"
    status=0
    "$repo/scripts/nested.sh" --log "$repo/.shell-test/prefs-t3.log" -- \
        "$repo/tests/shell/prefs-t3.sh" --inside >"$window" 2>&1 || status=$?
    "$repo/scripts/nested.sh" --no-keyring --log "$repo/.shell-test/prefs-t3-no-keyring.log" -- \
        "$repo/tests/shell/prefs-t3.sh" --inside no-keyring >>"$window" 2>&1 || status=$?
    grep -v '^dbus-daemon\|^$' "$window" || true
    noise="$(grep -E '^\(org\.gnome\.Shell\.Extensions:|JS ERROR|Visor' "$window" |
        grep -v '^ok\|^FAIL\|atspi\|visible-page' || true)"
    if [[ -n "$noise" ]]; then
        echo "FAIL  the window process logged:"
        head -n 10 <<<"$noise"
        exit 1
    fi
    echo "ok    the window process logged no error"
    if grep -v '^ok\|^FAIL' "$window" | grep -qE "$secrets"; then
        echo "FAIL  a pairing code or the token is in the output of the window"
        exit 1
    fi
    echo "ok    no pairing code and no token in the output of the window"
    exit "$status"
fi

source "$repo/scripts/lib/shell.sh"
source "$repo/scripts/lib/prefs.sh"
source "$repo/scripts/lib/keyring.sh"
failures=0
log_start="$(wc -l <"$HOME/shell.log")"
# check NAME JS: passes when JS evaluates to true.
check() {
    local got
    got="$(shell_eval "$2" 2>&1)" || true
    if [[ "$got" == true ]]; then echo "ok    $1"; else echo "FAIL  $1: $got"; failures=$((failures + 1)); fi
}
uuid='visor@taulit.github.io'
export GSETTINGS_SCHEMA_DIR="$HOME/.local/share/gnome-shell/extensions/$uuid/schemas"
gs() { gsettings set org.gnome.shell.extensions.visor "$@"; }
expect_setting() {
    local got
    got="$(gsettings get org.gnome.shell.extensions.visor "$2")"
    if [[ "$got" == "$3" ]]; then echo "ok    $1"; else echo "FAIL  $1: expected $3, got $got"; failures=$((failures + 1)); fi
}
# wait_check NAME JS [seconds]: like check, but gives JS time to become true.
wait_check() {
    if shell_wait_for "$2" "${3:-8}" 2>/dev/null; then
        echo "ok    $1"
    else
        echo "FAIL  $1: $(shell_eval "$2" 2>&1 || true)"
        failures=$((failures + 1))
    fi
}

port="$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')"
node "$repo/tests/t3-mock/server.js" --port "$port" --home "$HOME/.t3" --pairing first-code-123 >>"$HOME/t3-mock.log" 2>&1 &
mock_pid=$!
trap 'kill "$mock_pid" 2>/dev/null || true' EXIT
# mock_state PYTHON: an expression over the state `s` of the mock, printed as true or false.
mock_state() { curl -s "http://127.0.0.1:$port/__mock/state" | python3 -c "import json,sys; s=json.load(sys.stdin); print(str($1).lower())"; }
# wait_mock PYTHON [seconds]: gives the expression time to become true.
wait_mock() {
    local i
    for ((i = 0; i < ${2:-5} * 5; i++)); do
        [[ "$(mock_state "$1")" == true ]] && return 0
        sleep 0.2
    done
    return 0
}
expect_mock() {
    local got
    got="$(mock_state "$2")"
    if [[ "$got" == true ]]; then echo "ok    $1"; else echo "FAIL  $1: $(curl -s "http://127.0.0.1:$port/__mock/state")"; failures=$((failures + 1)); fi
}

# expect_keyring NAME ORIGIN TOKEN: what the keyring of the sandbox holds for ORIGIN.
expect_keyring() {
    local got tries
    # The window stores and clears asynchronously: wait for it, up to 10 s.
    for tries in $(seq 50); do
        got="$(keyring_lookup "$2")"
        [[ "$got" == "$3" ]] && break
        sleep 0.2
    done
    if [[ "$got" == "$3" ]]; then echo "ok    $1"; else echo "FAIL  $1: the keyring has ${got:+another token}${got:-nothing}"; failures=$((failures + 1)); fi
}
# The settings as dconf has them, as text and as the file on disk.
expect_no_secret_in_dconf() {
    if dconf dump / | grep -qE "$secrets" || grep -qaE "$secrets" "$XDG_CONFIG_HOME/dconf/user"; then
        echo "FAIL  $1"; failures=$((failures + 1))
    else
        echo "ok    $1"
    fi
}
# expect_shows NAME TEXT: the window shows exactly that text somewhere.
expect_shows() {
    if prefs_shows "$2"; then echo "ok    $1"; else echo "FAIL  $1: the window does not show '$2'"; failures=$((failures + 1)); fi
}
origin="http://127.0.0.1:$port"
serial() { gsettings get org.gnome.shell.extensions.visor t3-token-serial; }
# pair_by_hand TOKEN: what pairing leaves behind, without the window.
pair_by_hand() {
    gs t3-token-origin "$origin"
    keyring_store "$origin" "$1"
    gs t3-token-serial "$(($(serial) + 1))"
}

t3="visor.content.registry.get('t3')"
shell_wait_for "Main.extensionManager.lookup('$uuid')?.state === 1"
shell_wait_for "visor.api !== null && $t3 != null" 15
check 'not paired: no rows, no connection' "$t3.rows.length === 0 && !$t3.module.client.connected"

if [[ "${2:-}" == no-keyring ]]; then
    # --- no Secret Service on the bus ------------------------------------------------
    owner="$(gdbus call --session --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus --method org.freedesktop.DBus.NameHasOwner org.freedesktop.secrets)"
    if [[ "$owner" == '(false,)' ]]; then echo 'ok    this sandbox has no keyring'; else echo "FAIL  this sandbox has a keyring: $owner"; failures=$((failures + 1)); fi
    prefs_a11y
    prefs_open
    prefs_page modules
    prefs_click_on 'Pairing link or code' 'password text'
    prefs_type "$origin/pair#token=first-code-123"
    prefs_click_on Connect button
    sleep 1
    expect_shows 'without a keyring the row says so' 'The keyring is not available'
    expect_mock 'and the pairing code was not used up' "s['exchanges'] == 0 and s['pairings'] == []"
    expect_setting 'nothing is paired' t3-token-origin "''"
    check 'the window is still there' "global.get_window_actors().some(a => a.meta_window.title === 'Visor')"
    prefs_close

    # Paired before the keyring went away: the module has no token.
    gs t3-token-serial 1
    gs t3-token-origin "$origin"
    sleep 2
    check 'the module shows nothing and waits for nothing' \
        "$t3.rows.length === 0 && !$t3.module.client.connected && !$t3.module.client.connecting && $t3.module.client.retrySource === 0 && $t3.module.client.lookup === null"
    shell_eval "visor.content.registry.setEnabled('t3', false)" >/dev/null
    shell_eval "visor.content.registry.setEnabled('t3', true)" >/dev/null
    sleep 1
    lines="$(tail -n "+$((log_start + 1))" "$HOME/shell.log" | grep -c 'The keyring is not available' || true)"
    if [[ "$lines" == 1 ]]; then echo 'ok    one line in the log says so, also after the module was turned off and on'; else echo "FAIL  $lines lines in the log about the keyring"; failures=$((failures + 1)); fi
    expect_mock 'the server was not asked for anything' "s['ticketRequests'] == 0"
    check 'Visor is still enabled' "Main.extensionManager.lookup('$uuid').state === 1"
    noise="$(tail -n "+$((log_start + 1))" "$HOME/shell.log" | grep -E 'JS ERROR|WARNING|CRITICAL|visor' | grep -v 'Tried to ping window' || true)"
    if [[ -z "$noise" ]]; then echo 'ok    the shell logged nothing else'; else echo 'FAIL  the shell logged:'; head -n 20 <<<"$noise"; failures=$((failures + 1)); fi
    ((failures == 0)) && echo PASS
    exit "$((failures > 0))"
fi

prefs_a11y
prefs_open
prefs_page modules
# Without other extensions the group "T3 Code" is in view: its first row is at
# 633 px, the button on its right at 530 px. Once paired the explanation is
# gone and the row with Disconnect is at 594 px.
row_y=633
paired_y=594

# --- a link the server does not know ---------------------------------------------
prefs_click 200 "$row_y"
prefs_type "http://127.0.0.1:$port/pair#token=wrong-code-789"
prefs_enter
wait_mock "s['exchanges'] == 1"
expect_mock 'the server refuses a wrong pairing link' "s['exchanges'] == 1 and s['pairings'] == [] and s['ticketRequests'] == 0"
expect_keyring 'and no token is stored' "$origin" ''
expect_setting 'nothing is paired' t3-token-origin "''"
expect_shows 'the row says that the link is wrong' 'The link is wrong or has expired'

# --- pairing -------------------------------------------------------------------
prefs_click 200 "$row_y"
prefs_type "http://127.0.0.1:$port/pair#token=first-code-123"
prefs_click 530 "$row_y"
expect_keyring 'Connect with the pairing link stores the token in the keyring' "$origin" mock-token
expect_no_secret_in_dconf 'and not in dconf'
expect_setting 'the settings count the change' t3-token-serial 1
expect_shows 'the window says Connected' 'Connected'
expect_setting 'the address of the local server is not stored' t3-server-url "''"
expect_setting 'but the origin the token is for' t3-token-origin "'http://127.0.0.1:$port'"
expect_mock 'the server saw one exchange, labelled Visor, for both scopes' \
    "len(s['pairings']) == 1 and s['pairings'][0]['label'].startswith('Visor (') and s['pairings'][0]['scope'] == 'orchestration:read orchestration:operate'"
wait_check 'the module connects without a restart and shows the sessions' \
    "$t3.module.client.connected && $t3.rows.length === 4"

# --- disconnect ----------------------------------------------------------------
prefs_click 514 "$paired_y"
expect_keyring 'Disconnect removes the token from the keyring' "$origin" ''
expect_setting 'and forgets its origin' t3-token-origin "''"
wait_check 'the rows are gone and the socket is closed' "$t3.rows.length === 0 && !$t3.module.client.connected"
sleep 0.5
expect_mock 'the server sees no client' "s['clients'] == 0"

# --- a token the server refuses ------------------------------------------------
before="$(curl -s "http://127.0.0.1:$port/__mock/state" | python3 -c 'import json,sys; print(json.load(sys.stdin)["ticketRequests"])')"
pair_by_hand refused-token-abc
sleep 5
expect_mock 'a refused token is tried once in five seconds' "s['ticketRequests'] == $before + 1"
check 'the module waits for another token' \
    "$t3.module.client.rejected && $t3.module.client.retrySource === 0 && !$t3.module.client.connecting && $t3.rows.length === 0"
refused="$(tail -n "+$((log_start + 1))" "$HOME/shell.log" | grep -c 'refused the access token' || true)"
if [[ "$refused" == 1 ]]; then echo 'ok    one line in the log says so'; else echo "FAIL  $refused lines in the log about the refused token"; failures=$((failures + 1)); fi

# --- pairing again, with the code alone ------------------------------------------
curl -s -X POST "http://127.0.0.1:$port/__mock/pairing?code=second-code-456" >/dev/null
prefs_click 514 "$paired_y"
expect_keyring 'Disconnect forgets the refused token' "$origin" ''
prefs_click 200 "$row_y"
prefs_type '  second-code-456 '
prefs_enter
sleep 1
expect_keyring 'a bare code and Enter pair with the server of this machine' "$origin" mock-token
wait_check 'the module connects again' "$t3.module.client.connected && $t3.rows.length === 4"

# --- the address -----------------------------------------------------------------
gs t3-server-url "http://127.0.0.1:1"
wait_check 'another address: the module leaves the server' "!$t3.module.client.connected && $t3.rows.length === 0"
gs t3-server-url "http://127.0.0.1:$port/"
wait_check 'the address of the mock: connected again' "$t3.module.client.connected && $t3.rows.length === 4"


# --- a token goes to its own server only -------------------------------------------
before="$(curl -s "http://127.0.0.1:$port/__mock/state" | python3 -c 'import json,sys; print(json.load(sys.stdin)["ticketRequests"])')"
gs t3-token-origin "http://127.0.0.1:1"
wait_check 'a token issued by another server: the module leaves' "!$t3.module.client.connected && $t3.rows.length === 0"
sleep 2.5
expect_mock 'and does not offer it to this one' "s['ticketRequests'] == $before"
gs t3-token-origin "http://127.0.0.1:$port"
wait_check 'the origin of the token again: connected' "$t3.module.client.connected && $t3.rows.length === 4"

prefs_close
expect_no_secret_in_dconf 'no pairing code and no token in dconf'
if grep -qE "$secrets" "$HOME/keyring.log" "$HOME/a11y-registry.log" 2>/dev/null; then
    echo 'FAIL  a pairing code or the token is in the log of the keyring'; failures=$((failures + 1))
fi
if tail -n "+$((log_start + 1))" "$HOME/shell.log" | grep -qE "$secrets"; then
    echo 'FAIL  a pairing code or the token is in the log of the shell'; failures=$((failures + 1))
else
    echo 'ok    no pairing code and no token in the log of the shell'
fi
noise="$(tail -n "+$((log_start + 1))" "$HOME/shell.log" | grep -E 'JS ERROR|WARNING|CRITICAL|visor' | grep -v 'Tried to ping window' || true)"
if [[ -z "$noise" ]]; then echo 'ok    the shell logged nothing else'; else echo 'FAIL  the shell logged:'; head -n 20 <<<"$noise"; failures=$((failures + 1)); fi
((failures == 0)) && echo PASS
exit "$((failures > 0))"
