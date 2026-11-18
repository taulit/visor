#!/usr/bin/env bash
# "Discover" on the Modules page of the settings window. First with updates
# off: the catalog that ships with Visor is shown and no request is made. Then
# with a catalog served on this machine: its modules replace the snapshot,
# their pictures are fetched into the cache, an installed module says so, the
# search finds despite a typo and a card opens the
# page of its module. Then a server that answers with something that is no
# catalog: the cached one stays. Install is never pressed: that would ask the
# real extension store.
#
# Usage: tests/shell/prefs-discover.sh
# The log ends up in .shell-test/prefs-discover.log, the output of the window
# in .shell-test/prefs-discover.window, pictures in .shell-test/shots/.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fixtures="$repo/tests/shell/fixtures"

if [[ "${1:-}" != --inside ]]; then
    mkdir -p "$repo/.shell-test/shots"
    window="$repo/.shell-test/prefs-discover.window"
    status=0
    "$repo/scripts/nested.sh" --log "$repo/.shell-test/prefs-discover.log" \
        --extension "$fixtures/clock-visor@example.org" -- \
        "$repo/tests/shell/prefs-discover.sh" --inside >"$window" 2>&1 || status=$?
    grep -v '^dbus-daemon\|^$' "$window" || true
    noise="$(grep -E '^\(org\.gnome\.Shell\.Extensions:|JS ERROR|Visor' "$window" |
        grep -v '^ok\|^FAIL\|atspi\|visible-page\|Tried to ping window' || true)"
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
export GSETTINGS_SCHEMA_DIR="$HOME/.local/share/gnome-shell/extensions/$uuid/schemas"
gs() { gsettings set org.gnome.shell.extensions.visor "$@"; }
expect_shows() {
    if prefs_shows "$2"; then echo "ok    $1"; else echo "FAIL  $1: the window does not show '$2'"; failures=$((failures + 1)); fi
}
expect_hides() {
    if prefs_shows "$2"; then echo "FAIL  $1: the window shows '$2'"; failures=$((failures + 1)); else echo "ok    $1"; fi
}
# wait_shows TEXT [seconds]: gives the window time to show it.
wait_shows() {
    local i
    for ((i = 0; i < ${2:-8} * 2; i++)); do
        prefs_shows "$1" && return 0
        sleep 0.5
    done
    return 0
}
expect_true() {
    if eval "$2"; then echo "ok    $1"; else echo "FAIL  $1"; failures=$((failures + 1)); fi
}
shot() { shell_shot_window "$PREFS_WINDOW" "$repo/.shell-test/shots/prefs-discover-$1.png" || true; }

# --- a catalog on this machine ------------------------------------------------------
site="$HOME/site"
mkdir -p "$site/modules/clock-visor@example.org" "$site/modules/visor-weather@example.org"
magick -size 1600x1000 -define gradient:angle=135 gradient:'#1c71d8-#613583' "$site/modules/clock-visor@example.org/screenshot-1.png"
magick -size 1600x1000 -define gradient:angle=45 gradient:'#26a269-#1a5fb4' "$site/modules/visor-weather@example.org/screenshot-1.png"
cp "$site/modules/visor-weather@example.org/screenshot-1.png" "$site/modules/visor-weather@example.org/screenshot-2.png"
python3 - "$site/catalog.json" <<'PY'
import json, sys
def entry(uuid, name, slot, ego, **more):
    return {
        "uuid": uuid, "name": name, "slot": slot, "ego_id": ego, "api": 1, "license": "MIT",
        "summary": {"en": f"The summary of {name} in one sentence."},
        "description": {"en": f"What {name} does, in a few sentences. <b>Not markup</b> & more."},
        "author": {"name": "Example Author", "url": "https://example.org"},
        "repo": f"https://example.org/{name.lower().replace(' ', '-')}",
        "tags": ["system"], "icon": f"{uuid}/icon.svg",
        "screenshots": [f"{uuid}/screenshot-1.png"],
        "status": "listed", "verified": False, "added": "2026-11-18", **more,
    }
modules = [
    entry("clock-visor@example.org", "World Clock", "now", 4711),
    entry("visor-weather@example.org", "Weather", "ahead", 4712,
          shows={"en": "The weather of the next hours, as a section."},
          screenshots=["visor-weather@example.org/screenshot-1.png", "visor-weather@example.org/screenshot-2.png"]),
    entry("visor-future@example.org", "Future", "dock", 4713, api=2),
]
json.dump({"version": 1, "pictures": "modules/", "modules": modules}, open(sys.argv[1], "w"))
PY
port="$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')"
python3 -m http.server "$port" --bind 127.0.0.1 --directory "$site" >"$HOME/site.log" 2>&1 &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT
requests() { grep -c "GET $1" "$HOME/site.log" || true; }
cache="$HOME/.cache/visor/catalog"

shell_wait_for "Main.extensionManager.lookup('$uuid')?.state === 1"
prefs_a11y

# --- updates off: the snapshot, and no request ---------------------------------------
gs catalog-url "http://127.0.0.1:$port"
gs catalog-updates false
prefs_open
prefs_page modules
prefs_scroll 250
wait_shows 'T3 Code'
expect_shows 'updates off: the catalog that ships with Visor is shown' 'T3 Code'
expect_shows 'a module that is not in the store has no Install' 'Not in the store yet'
expect_hides 'and nothing of the served catalog' 'Weather'
shot snapshot
expect_true 'no request was made' '[[ "$(requests /)" == 0 ]]'
expect_true 'and nothing is in the cache' '[[ ! -e "$cache/catalog.json" ]]'
prefs_close

# --- updates on: the served catalog ---------------------------------------------------
gs catalog-updates true
prefs_open
prefs_page modules
prefs_scroll 250
wait_shows 'Weather'
expect_shows 'updates on: the served catalog replaces the snapshot' 'Weather'
expect_shows 'with its second module' 'World Clock'
expect_hides 'a module for another API is not offered' 'Future'
expect_hides 'the snapshot is no longer shown' 'T3 Code'
expect_shows 'an installed module says so' 'Installed'
expect_shows 'one that is in the store can be installed' 'Install'
sleep 1
expect_true 'the catalog was fetched once' '[[ "$(requests /catalog.json)" == 1 ]]'
expect_true 'and is in the cache' '[[ -s "$cache/catalog.json" ]]'
expect_true 'the cover pictures are in the cache' \
    '[[ -s "$cache/modules/clock-visor@example.org/screenshot-1.png" && -s "$cache/modules/visor-weather@example.org/screenshot-1.png" ]]'
expect_true 'the second picture of a module is not fetched for its card' \
    '[[ ! -e "$cache/modules/visor-weather@example.org/screenshot-2.png" ]]'
shot served

# --- search and filter ----------------------------------------------------------------
# The search field has no name on the accessibility bus; it is left of the filter.
read -r place_x place_y <<<"$(prefs_where 'All places' 'combo box')"
prefs_click "$((place_x - 250))" "$place_y"
prefs_type 'wether'
sleep 0.6
expect_shows 'the search finds despite a typo' 'Weather'
expect_hides 'and hides what does not fit' 'The summary of World Clock in one sentence.'
prefs_key Control_L a
prefs_type 'qqqq'
sleep 0.6
expect_shows 'nothing found: the window says so' 'No modules found'
prefs_key Control_L a
prefs_key BackSpace
sleep 0.6
expect_shows 'an empty search shows all again' 'The summary of World Clock in one sentence.'

# --- the page of a module -------------------------------------------------------------
prefs_scroll 250
prefs_click_on 'Weather' label
wait_shows 'What it shows'
expect_shows 'a click on a card opens the page of the module' 'What it shows'
expect_shows 'with its texts as plain text' 'What Weather does, in a few sentences. <b>Not markup</b> & more.'
expect_shows 'and where it comes from' 'https://example.org/weather'
sleep 1
expect_true 'its second picture is fetched now' '[[ -s "$cache/modules/visor-weather@example.org/screenshot-2.png" ]]'
shot detail
prefs_close

# --- a second look the same day asks nothing ------------------------------------------
before="$(requests /)"
prefs_open
prefs_page modules
wait_shows 'Weather'
expect_shows 'opened again: the catalog of the cache is shown' 'Weather'
sleep 1
expect_true 'and the server is not asked again' '[[ "$(requests /)" == "$before" ]]'
prefs_close

# --- a server that answers with no catalog --------------------------------------------
echo '<html>not a catalog</html>' >"$site/catalog.json"
touch -d '2 days ago' "$cache/catalog.json"
prefs_open
prefs_page modules
sleep 2
expect_true 'an old cache: the server is asked again' '[[ "$(requests /catalog.json)" == 2 ]]'
expect_shows 'what is no catalog is not taken: the cached one stays' 'Weather'
expect_true 'also in the cache' 'grep -q World "$cache/catalog.json"'
check 'the window is still there' "global.get_window_actors().some(a => a.meta_window.title === '$PREFS_WINDOW')" true
prefs_close

# Mutter warns about its own ping when a window is closed from the shell; that is not ours.
noise="$(tail -n "+$((log_start + 1))" "$HOME/shell.log" | grep -E 'JS ERROR|WARNING|CRITICAL|visor' | grep -v 'Tried to ping window' || true)"
if [[ -z "$noise" ]]; then echo 'ok    the shell logged nothing'; else echo 'FAIL  the shell logged:'; head -n 20 <<<"$noise"; failures=$((failures + 1)); fi
finish
