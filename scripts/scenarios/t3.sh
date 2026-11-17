# The open panel with the sessions of T3 Code, served by the mock of
# tests/t3-mock/: one waits for an approval and is expanded, one works, one
# is done.
shell_wait_for 'visor !== null && visor.api !== null'
source "$repo/scripts/scenarios/content-lib.sh"
t3_port="$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')"
node "$repo/tests/t3-mock/server.js" --port "$t3_port" --home "$HOME/.t3" --fixture shots >/dev/null 2>&1 &
shell_eval "visor.getSettings().set_string('t3-token-origin', 'http://127.0.0.1:$t3_port')" >/dev/null
shell_eval "visor.getSettings().set_string('t3-access-token', 'mock-token')" >/dev/null
t3_rows="visor.content.registry.get('t3').rows"
shell_wait_for "$t3_rows.length === 3 && $t3_rows[0].detail !== undefined" 10
# The flash of the waiting agent is over before the panel opens.
shell_eval 'visor.notch.open()' >/dev/null
shell_wait_for 'visor.notch.state === "open"'
shell_eval "$(content_find visor-row-chevron)[0].emit('clicked', 1)" >/dev/null
shell_wait_for "$(content_find visor-t3-message).some(a => a.mapped)"
