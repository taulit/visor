#!/usr/bin/env bash
# Helpers for commands that run inside scripts/nested.sh.

# shell_eval JS: evaluates a JS expression in the shell and prints the result
# as JSON. In scope: Main, St, Clutter, Gio, GLib, Shell, Meta and `visor`
# (the running Visor extension object). Promises are awaited.
shell_eval() {
    local out
    out="$(gdbus call --session --dest io.github.taulit.Visor.Debug \
        --object-path /io/github/taulit/Visor/Debug \
        --method io.github.taulit.Visor.Debug.Eval "$1")" || return 1
    if [[ "$out" == "(true, "* ]]; then
        out="${out#(true, ?}"
        printf '%s\n' "${out%?)}"
    else
        printf 'shell_eval failed: %s\n' "$out" >&2
        return 1
    fi
}

# The number of actors on the stage, as a JS expression, for the leak tests.
# The quick settings menu is left out: it lists the Wi-Fi networks and other
# devices of the machine, which come and go while a test runs.
# shellcheck disable=SC2034  # used by the scripts that source this file
SHELL_ACTOR_COUNT='(function n(a) { if (a === Main.panel.statusArea.quickSettings?.menu.actor) return 0; let c = 1; for (const k of a.get_children()) c += n(k); return c; })(global.stage)'

# shell_wait_for JS [timeout_seconds]: waits until JS evaluates to true.
shell_wait_for() {
    local deadline=$((SECONDS + ${2:-10}))
    while ((SECONDS < deadline)); do
        [[ "$(shell_eval "$1" 2>/dev/null)" == true ]] && return 0
        sleep 0.1
    done
    printf 'shell_wait_for timed out: %s\n' "$1" >&2
    return 1
}

# shell_shot FILE: writes a PNG of the whole virtual monitor.
shell_shot() {
    local file
    file="$(realpath -m "$1")"
    mkdir -p "$(dirname "$file")"
    gdbus call --session --dest io.github.taulit.Visor.Debug \
        --object-path /io/github/taulit/Visor/Debug \
        --method io.github.taulit.Visor.Debug.Screenshot "$file" >/dev/null
    [[ -s "$file" ]] || { printf 'shell_shot: no file written: %s\n' "$file" >&2; return 1; }
}
