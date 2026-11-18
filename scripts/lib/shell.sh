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

# signals_grew BEFORE AFTER CYCLES: compares two results of visorSignalCounts()
# (see tests/shell-helper) around CYCLES rounds of enabling and disabling and
# prints every "object:signal" that gained a handler in at least every fifth
# round. The shell connects and drops a handler of its own now and then (the
# overview, objects that are collected), so one or two more or fewer say
# nothing; what Visor leaves behind comes back in every round.
signals_grew() {
    python3 -c 'import json, sys
before, after, least = json.loads(sys.argv[1]), json.loads(sys.argv[2]), max(2, int(sys.argv[3]) // 5)
for key in sorted(after):
    if after[key] - before.get(key, 0) >= least:
        print(f"{key}: {before.get(key, 0)} -> {after[key]}")' "$1" "$2" "$3"
}
# signals_total COUNTS: the number of handlers in a result of visorSignalCounts().
signals_total() { python3 -c 'import json, sys; print(sum(json.loads(sys.argv[1]).values()))' "$1"; }

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

# shell_shot_window TITLE FILE: writes a PNG of the area of the window with that title.
shell_shot_window() {
    local file
    file="$(realpath -m "$2")"
    mkdir -p "$(dirname "$file")"
    shell_eval "(async () => {
        const meta = global.get_window_actors().map(a => a.meta_window).find(w => w.title === '$1');
        const stream = Gio.File.new_for_path('$file').replace(null, false, Gio.FileCreateFlags.NONE, null);
        const { x, y, width, height } = meta.get_frame_rect();
        await new Promise((resolve, reject) => new Shell.Screenshot().screenshot_area(x, y, width, height, stream, (s, r) => {
            try { s.screenshot_area_finish(r); resolve(); } catch (e) { reject(e); }
        }));
        stream.close(null);
        return true;
    })()" >/dev/null
    [[ -s "$file" ]] || { printf 'shell_shot_window: no file written: %s\n' "$file" >&2; return 1; }
}
