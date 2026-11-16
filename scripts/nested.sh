#!/usr/bin/env bash
# Runs a command against a sandboxed headless GNOME Shell with Visor loaded.
#
# The sandbox has its own HOME, XDG directories, runtime directory and D-Bus
# session, so nothing here can reach the settings or the shell of the session
# you are logged in to.
#
# Usage: scripts/nested.sh [options] -- command [args...]
#   --size WxH          virtual monitor size (default 1920x1080)
#   --scheme dark|light colour scheme (default dark)
#   --accent NAME       accent colour: blue, teal, green, yellow, orange, red,
#                       pink, purple, slate (default blue)
#   --animations        keep animations on (default: off, for stable screenshots)
#   --no-visor          do not load Visor, only the test helper
#   --log FILE          copy the shell log to FILE when done
#
# Inside the command, scripts/lib/shell.sh offers shell_eval and shell_shot.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
size=1920x1080 scheme=dark accent=blue animations=false with_visor=true log=

while [[ $# -gt 0 ]]; do
    case "$1" in
        --size) size="$2"; shift 2 ;;
        --scheme) scheme="$2"; shift 2 ;;
        --accent) accent="$2"; shift 2 ;;
        --animations) animations=true; shift ;;
        --no-visor) with_visor=false; shift ;;
        --log) log="$2"; shift 2 ;;
        --) shift; break ;;
        *) echo "nested.sh: unknown option $1" >&2; exit 2 ;;
    esac
done
[[ $# -gt 0 ]] || { echo "nested.sh: missing command after --" >&2; exit 2; }

# Wayland socket paths are limited to 108 bytes, so the sandbox needs a short path.
sandbox="$(mktemp -d "${XDG_RUNTIME_DIR:-/tmp}/visor-shell.XXXXXX")"
cleanup() {
    # Services activated on the sandbox bus (portals, Evolution, the screencast
    # service) outlive it for a while and keep writing. Stop everything that
    # carries the sandbox environment, release the document portal's FUSE
    # mount, then remove the directory.
    local environ
    for environ in $(grep -lsa "VISOR_SANDBOX=$sandbox" /proc/[0-9]*/environ 2>/dev/null); do
        kill "$(basename "$(dirname "$environ")")" 2>/dev/null || true
    done
    for _ in 1 2 3 4 5 6; do
        fusermount3 -u -z "$sandbox/run/doc" 2>/dev/null || true
        rm -rf "$sandbox" 2>/dev/null || true
        [[ -e "$sandbox" ]] || break
        sleep 0.3
    done
}
trap cleanup EXIT
mkdir -p "$sandbox/home" "$sandbox/run"
chmod 700 "$sandbox/run"

extensions="$sandbox/home/.local/share/gnome-shell/extensions"
mkdir -p "$extensions"
cp -r "$repo/tests/shell-helper" "$extensions/visor-test-helper@taulit.github.io"
enabled="['visor-test-helper@taulit.github.io']"
if $with_visor; then
    [[ -f "$repo/build/metadata.json" ]] || { echo "nested.sh: run 'pnpm build' first" >&2; exit 1; }
    cp -r "$repo/build" "$extensions/visor@taulit.github.io"
    enabled="['visor-test-helper@taulit.github.io', 'visor@taulit.github.io']"
fi

status=0
env -i \
    PATH="$PATH" LANG="${LANG:-en_US.UTF-8}" LC_ALL="${VISOR_TEST_LOCALE:-en_US.UTF-8}" TZ="${TZ:-Europe/Berlin}" \
    HOME="$sandbox/home" XDG_RUNTIME_DIR="$sandbox/run" \
    XDG_CONFIG_HOME="$sandbox/home/.config" XDG_DATA_HOME="$sandbox/home/.local/share" \
    XDG_CACHE_HOME="$sandbox/home/.cache" XDG_STATE_HOME="$sandbox/home/.local/state" \
    XDG_SESSION_TYPE=wayland XDG_CURRENT_DESKTOP=GNOME \
    GIO_USE_VOLUME_MONITOR=unix GVFS_DISABLE_FUSE=1 \
    VISOR_REPO="$repo" VISOR_SANDBOX="$sandbox" \
    VISOR_SIZE="$size" VISOR_SCHEME="$scheme" VISOR_ACCENT="$accent" \
    VISOR_ANIMATIONS="$animations" VISOR_ENABLED="$enabled" \
    dbus-run-session -- bash "$repo/scripts/lib/nested-session.sh" "$@" || status=$?

if [[ -n "$log" ]]; then
    mkdir -p "$(dirname "$log")"
    cp "$sandbox/home/shell.log" "$log" 2>/dev/null || true
fi
exit "$status"
