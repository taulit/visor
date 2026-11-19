#!/usr/bin/env bash
# Installing a module from the release of its GitHub repository: the settings
# window asks Visor in the shell over D-Bus, Visor downloads the ZIP, checks it,
# unpacks it, loads and enables the extension, without a new login. A local
# server stands in for GitHub; what is refused leaves nothing behind.
#
# Usage: tests/shell/install-github.sh
# The log ends up in .shell-test/install-github.log.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ "${1:-}" != --inside ]]; then
    exec "$repo/scripts/nested.sh" --log "$repo/.shell-test/install-github.log" -- \
        "$repo/tests/shell/install-github.sh" --inside
fi

source "$repo/scripts/lib/shell.sh"

fail=0
check() {
    local got
    got="$(shell_eval "$2" 2>&1)" || true
    if [[ "$got" == true ]]; then echo "ok    $1"; else echo "FAIL  $1: $got"; fail=1; fi
}
# install UUID REPO: what the settings window sends; prints the answer or the error.
install() {
    gdbus call --session --dest org.gnome.Shell --object-path /io/github/taulit/Visor/Installer \
        --method io.github.taulit.Visor.Installer.InstallFromGitHub "$1" "$2" 2>&1 || true
}
# expect NAME GOT PATTERN: passes when GOT matches the extended regular expression.
expect() {
    if [[ "$2" =~ $3 ]]; then echo "ok    $1"; else echo "FAIL  $1: $2"; fail=1; fi
}

good='visor-fixture@taulit.github.io'
extensions="$HOME/.local/share/gnome-shell/extensions"
served="$(mktemp -d)"
# A module of its own, and a ZIP that claims to be it but is another extension.
python3 - "$served" "$good" <<'PY'
import json, sys, zipfile
out, uuid = sys.argv[1], sys.argv[2]
js = ("import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';\n"
      "export default class extends Extension { enable() { globalThis.fixtureOn = true; } "
      "disable() { globalThis.fixtureOn = false; } }\n")
def pack(name, meta):
    with zipfile.ZipFile(f"{out}/{name}.zip", "w") as z:
        z.writestr("metadata.json", json.dumps(meta))
        z.writestr("extension.js", js)
base = {"name": "Fixture", "description": "Test", "shell-version": ["50", "51"], "visor": {"api": 1}}
pack(uuid, {**base, "uuid": uuid})
pack("impostor@taulit.github.io", {**base, "uuid": "someone-else@taulit.github.io"})
pack("plain@taulit.github.io", {k: v for k, v in {**base, "uuid": "plain@taulit.github.io"}.items() if k != "visor"})
PY
port=$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')
python3 -m http.server "$port" --bind 127.0.0.1 --directory "$served" >/dev/null 2>&1 &
server=$!
trap 'kill $server 2>/dev/null; rm -rf "$served"' EXIT
for _ in $(seq 1 50); do curl -s "http://127.0.0.1:$port/" >/dev/null && break; sleep 0.1; done

shell_eval "(() => { visor.installer.zipUrl = (repo, uuid) => 'http://127.0.0.1:$port/' + uuid + '.zip'; return true; })()" >/dev/null

expect 'an address that is not a GitHub repository is refused' \
    "$(install "$good" https://example.org/taulit/visor-fixture)" 'only the releases of GitHub repositories'
expect 'so is a UUID that could leave the folder' \
    "$(install '../evil@x' https://github.com/taulit/visor-fixture)" 'not the UUID'
expect 'a module that has no release is refused' \
    "$(install missing@taulit.github.io https://github.com/taulit/missing)" 'answered 404'
expect 'a ZIP with another extension in it is refused' \
    "$(install impostor@taulit.github.io https://github.com/taulit/impostor)" 'is someone-else@taulit.github.io, not impostor@'
expect 'so is an extension that is no module for Visor' \
    "$(install plain@taulit.github.io https://github.com/taulit/plain)" 'no module for Visor'
check 'what was refused left nothing behind' \
    "(() => { const [ok, out] = GLib.spawn_command_line_sync('ls -A $extensions'); return !new TextDecoder().decode(out).match(/impostor|plain|missing|someone|visor-install/); })()"

expect 'the module is installed' "$(install "$good" https://github.com/taulit/visor-fixture)" '^\(\)$'
check 'and runs at once, without a new login' \
    "Main.extensionManager.lookup('$good')?.state === 1 && globalThis.fixtureOn === true && global.settings.get_strv('enabled-extensions').includes('$good')"
check 'it is in the folder of extensions, with no staging folder left' \
    "(() => { const [ok, out] = GLib.spawn_command_line_sync('ls -A $extensions'); const names = new TextDecoder().decode(out).split(String.fromCharCode(10)).filter(Boolean); return names.includes('$good') && !names.some(n => n.includes('visor-install')) || names.join(); })()"
expect 'asking again says it is there already' \
    "$(install "$good" https://github.com/taulit/visor-fixture)" 'already installed'

shell_eval "Main.extensionManager.disableExtension('visor@taulit.github.io')" >/dev/null
shell_wait_for "Main.extensionManager.lookup('visor@taulit.github.io').state !== 1"
expect 'with Visor off nobody answers' "$(install other@taulit.github.io https://github.com/taulit/other)" 'No such interface|Unknown|not exist|UnknownMethod|No such object'
shell_eval "Main.extensionManager.enableExtension('visor@taulit.github.io')" >/dev/null

exit $fail
