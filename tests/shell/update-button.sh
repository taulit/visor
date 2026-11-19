#!/usr/bin/env bash
# The update button in the dock of the panel, against a server on this machine
# in place of GitHub: hidden while there is nothing new and while looking is
# off, asked at most once per six hours, shown with a tooltip when a release
# is newer, one click installs it, and then it offers to log out. A ZIP that
# is not the release turns it into "try again" and leaves Visor as it was.
# Log Out is never pressed.
#
# Usage: tests/shell/update-button.sh
# The log ends up in .shell-test/update-button.log.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ "${1:-}" != --inside ]]; then
    mkdir -p "$repo/.shell-test/shots"
    exec "$repo/scripts/nested.sh" --log "$repo/.shell-test/update-button.log" -- \
        "$repo/tests/shell/update-button.sh" --inside
fi

source "$repo/scripts/lib/shell.sh"

fail=0
check() {
    local got
    got="$(shell_eval "$2" 2>&1)" || true
    if [[ "$got" == true ]]; then echo "ok    $1"; else echo "FAIL  $1: $got"; fail=1; fi
}
wait_check() {
    shell_wait_for "($2) === true" 15 2>/dev/null || true
    check "$1" "$2"
}
run() { shell_eval "$1" >/dev/null; }
expect_true() { if eval "$2"; then echo "ok    $1"; else echo "FAIL  $1"; fail=1; fi; }

uuid='visor@taulit.github.io'
installed="$HOME/.local/share/gnome-shell/extensions/$uuid"
version() { python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version-name"])' "$installed/metadata.json"; }
leftovers() { find "$(dirname "$installed")" -maxdepth 1 -name ".$uuid.*" | wc -l; }
asked() { grep -c 'GET /latest' "$served/requests.log" || true; }

served="$(mktemp -d)"
port=$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')
python3 "$repo/tests/shell/make-release.py" "$installed" "$served" "$port" "$uuid"
# Up to date: an answer with the version that is installed.
python3 - "$served" "$(version)" <<'PY'
import json, sys
answer = json.load(open(f"{sys.argv[1]}/latest.json"))
answer["tag_name"] = "v" + sys.argv[2]
json.dump(answer, open(f"{sys.argv[1]}/latest-same.json", "w"))
PY
(cd "$served" && python3 -m http.server "$port" --bind 127.0.0.1 >"$served/requests.log" 2>&1) &
server=$!
trap 'kill $server 2>/dev/null; rm -rf "$served"' EXIT
for _ in $(seq 1 50); do curl -s "http://127.0.0.1:$port/good.zip" -o /dev/null && break; sleep 0.1; done
before="$(version)"

B="(visor.notch && (function find(a) { if (a.has_style_class_name?.('visor-update-button')) return a; for (const c of a.get_children()) { const f = find(c); if (f) return f; } return null; })(visor.notch.root))"
U='visor.updater'
open_panel() { run 'visor.notch.open()'; sleep 0.5; }
close_panel() { run 'visor.notch.close()'; sleep 0.3; }
set_url() { dconf write /org/gnome/shell/extensions/visor/update-url "'http://127.0.0.1:$port/$1'"; }

# --- off ---------------------------------------------------------------------------
set_url latest.json
open_panel
check 'looking off: no button' "$B === null || !$B.visible"
expect_true 'and nothing was asked' '[[ "$(asked)" == 0 ]]'
close_panel

# --- up to date -------------------------------------------------------------------------
dconf write /org/gnome/shell/extensions/visor/update-check true
set_url latest-same.json
open_panel
sleep 1
expect_true 'looking on: opening the panel asks once' '[[ "$(asked)" == 1 ]]'
check 'up to date: no button' "!$B.visible"
close_panel
open_panel
sleep 1
expect_true 'opening it again within six hours asks nothing' '[[ "$(asked)" == 1 ]]'
close_panel

# --- a newer release ---------------------------------------------------------------------------
set_url latest-bad.json
run "$U.checkedAt = 0"
open_panel
wait_check 'a newer release: the button shows, right before the dock' \
    "$B.visible && $B.has_style_class_name('available') && $B.get_next_sibling()?.has_style_class_name('visor-dock')"
check 'it says what it does' "$B.accessible_name === 'Update to Visor 9.9.9' || $B.accessible_name"
check 'with a tooltip below it when the pointer rests on it' \
    "(async () => { $B.sync_hover(); $B.hover = true; await new Promise(r => setTimeout(r, 700)); const tip = Main.layoutManager.uiGroup.get_children().find(a => a.has_style_class_name?.('visor-tooltip')); const ok = tip?.text === 'Update to Visor 9.9.9' && tip.y >= $B.get_transformed_position()[1] + $B.height; $B.hover = false; return ok || tip?.text; })()"
check 'the tooltip goes with the pointer' \
    "!Main.layoutManager.uiGroup.get_children().some(a => a.has_style_class_name?.('visor-tooltip'))"
shell_shot "$repo/.shell-test/shots/update-button-available.png" >/dev/null || true

run "$B.emit('clicked', 1)"
wait_check 'a ZIP that is not the release: the button offers to try again' "$B.has_style_class_name('failed')"
expect_true 'and Visor stays as it was, with nothing left over' "[[ \"\$(version)\" == '$before' && ! -e '$installed/UPDATED' && \"\$(leftovers)\" == 0 ]]"

# The right ZIP: the release that is offered now.
run "$U.state = { kind: 'available', release: { ...$U.state.release, zipUrl: 'http://127.0.0.1:$port/good.zip' } }"
run "$B.emit('clicked', 1)"
wait_check 'one click installs it' "$U.state.kind === 'done'"
expect_true 'the files of the release are in place, with nothing left over' "[[ \"\$(version)\" == '9.9.9' && -e '$installed/UPDATED' && \"\$(leftovers)\" == 0 ]]"
check 'then the button offers to log out' \
    "$B.visible && $B.has_style_class_name('done') && $B.child.icon_name === 'system-log-out-symbolic' && $B.accessible_name === 'Updated to 9.9.9. Click to log out and use it.'"
close_panel
open_panel
check 'and keeps saying so, without asking again' "$U.state.kind === 'done' && $B.visible"
close_panel

exit $fail
