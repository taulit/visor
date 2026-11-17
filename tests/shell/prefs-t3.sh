#!/usr/bin/env bash
# Pairing with T3 Code through the settings window, against the mock server of
# tests/t3-mock/: a pairing link typed into the window and Connect store the
# token, the module in the shell connects without a restart and shows the
# sessions, Disconnect empties it, a token the server refuses is asked for
# once and not again, and a bare code pairs anew. The window is driven with
# the pointer and the keyboard, as tests/shell/prefs.sh does.
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
expect_mock() {
    local got
    got="$(mock_state "$2")"
    if [[ "$got" == true ]]; then echo "ok    $1"; else echo "FAIL  $1: $(curl -s "http://127.0.0.1:$port/__mock/state")"; failures=$((failures + 1)); fi
}

t3="visor.content.registry.get('t3')"
shell_wait_for "Main.extensionManager.lookup('$uuid')?.state === 1"
shell_wait_for "visor.api !== null && $t3 != null" 15
check 'not paired: no rows, no connection' "$t3.rows.length === 0 && !$t3.module.client.connected"

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
sleep 1
expect_setting 'a wrong pairing link stores no token' t3-access-token "''"
expect_mock 'and the server was asked once, in vain' "s['exchanges'] == 1 and s['pairings'] == [] and s['ticketRequests'] == 0"

# --- pairing -------------------------------------------------------------------
prefs_click 200 "$row_y"
prefs_type "http://127.0.0.1:$port/pair#token=first-code-123"
prefs_click 530 "$row_y"
expect_setting 'Connect with the pairing link stores the token' t3-access-token "'mock-token'"
expect_setting 'the address of the local server is not stored' t3-server-url "''"
expect_mock 'the server saw one exchange, labelled Visor, for both scopes' \
    "len(s['pairings']) == 1 and s['pairings'][0]['label'].startswith('Visor (') and s['pairings'][0]['scope'] == 'orchestration:read orchestration:operate'"
wait_check 'the module connects without a restart and shows the sessions' \
    "$t3.module.client.connected && $t3.rows.length === 4"

# --- disconnect ----------------------------------------------------------------
prefs_click 514 "$paired_y"
expect_setting 'Disconnect clears the token' t3-access-token "''"
wait_check 'the rows are gone and the socket is closed' "$t3.rows.length === 0 && !$t3.module.client.connected"
sleep 0.5
expect_mock 'the server sees no client' "s['clients'] == 0"

# --- a token the server refuses ------------------------------------------------
before="$(curl -s "http://127.0.0.1:$port/__mock/state" | python3 -c 'import json,sys; print(json.load(sys.stdin)["ticketRequests"])')"
gs t3-access-token refused-token-abc
sleep 5
expect_mock 'a refused token is tried once in five seconds' "s['ticketRequests'] == $before + 1"
check 'the module waits for another token' \
    "$t3.module.client.rejected && $t3.module.client.retrySource === 0 && !$t3.module.client.connecting && $t3.rows.length === 0"
refused="$(tail -n "+$((log_start + 1))" "$HOME/shell.log" | grep -c 'refused the access token' || true)"
if [[ "$refused" == 1 ]]; then echo 'ok    one line in the log says so'; else echo "FAIL  $refused lines in the log about the refused token"; failures=$((failures + 1)); fi

# --- pairing again, with the code alone ------------------------------------------
curl -s -X POST "http://127.0.0.1:$port/__mock/pairing?code=second-code-456" >/dev/null
prefs_click 514 "$paired_y"
expect_setting 'Disconnect forgets the refused token' t3-access-token "''"
prefs_click 200 "$row_y"
prefs_type '  second-code-456 '
prefs_enter
sleep 1
expect_setting 'a bare code and Enter pair with the server of this machine' t3-access-token "'mock-token'"
wait_check 'the module connects again' "$t3.module.client.connected && $t3.rows.length === 4"

# --- the address -----------------------------------------------------------------
gs t3-server-url "http://127.0.0.1:1"
wait_check 'another address: the module leaves the server' "!$t3.module.client.connected && $t3.rows.length === 0"
gs t3-server-url "http://127.0.0.1:$port/"
wait_check 'the address of the mock: connected again' "$t3.module.client.connected && $t3.rows.length === 4"

prefs_close
if tail -n "+$((log_start + 1))" "$HOME/shell.log" | grep -qE "$secrets"; then
    echo 'FAIL  a pairing code or the token is in the log of the shell'; failures=$((failures + 1))
else
    echo 'ok    no pairing code and no token in the log of the shell'
fi
noise="$(tail -n "+$((log_start + 1))" "$HOME/shell.log" | grep -E 'JS ERROR|WARNING|CRITICAL|visor' | grep -v 'Tried to ping window' || true)"
if [[ -z "$noise" ]]; then echo 'ok    the shell logged nothing else'; else echo 'FAIL  the shell logged:'; head -n 20 <<<"$noise"; failures=$((failures + 1)); fi
((failures == 0)) && echo PASS
exit "$((failures > 0))"
