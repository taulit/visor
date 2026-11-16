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
