#!/usr/bin/env bash
# Runs inside the sandbox of scripts/nested.sh (see record.sh): prepares the
# desktop and the modules, then records one clip per scene.
# Usage: inside.sh OUTDIR T3DIR scene...
#   T3DIR: a built checkout of taulit/visor-t3 (the T3 Code module), or "-".
set -euo pipefail
raw="$1"
t3_repo="$2"
shift 2
repo="$VISOR_REPO"
source "$repo/scripts/lib/shell.sh"
source "$repo/scripts/scenarios/content-lib.sh"
source "$repo/scripts/lib/keyring.sh"

run() { shell_eval "$1" >/dev/null; }
pause() { sleep "$1"; }

# --- Display: scale 2 ---------------------------------------------------------
serial="$(gdbus call --session --dest org.gnome.Mutter.DisplayConfig --object-path /org/gnome/Mutter/DisplayConfig \
    --method org.gnome.Mutter.DisplayConfig.GetCurrentState | sed -E 's/^\(uint32 ([0-9]+),.*/\1/')"
mode="$(gdbus call --session --dest org.gnome.Mutter.DisplayConfig --object-path /org/gnome/Mutter/DisplayConfig \
    --method org.gnome.Mutter.DisplayConfig.GetCurrentState | grep -oE "'[0-9]+x[0-9]+@[0-9.]+'" | head -n1)"
gdbus call --session --dest org.gnome.Mutter.DisplayConfig --object-path /org/gnome/Mutter/DisplayConfig \
    --method org.gnome.Mutter.DisplayConfig.ApplyMonitorsConfig "$serial" 1 \
    "[(0, 0, 2.0, uint32 0, true, [('Meta-0', $mode, @a{sv} {})])]" "@a{sv} {}" >/dev/null
sleep 1

# --- Desktop ------------------------------------------------------------------
wallpaper=/usr/share/backgrounds/gnome/blobs-d.svg
if [[ -f "$wallpaper" ]]; then
    gsettings set org.gnome.desktop.background picture-uri-dark "file://$wallpaper"
    gsettings set org.gnome.desktop.background picture-uri "file://$wallpaper"
    gsettings set org.gnome.desktop.background picture-options zoom
fi
# A fixed, friendly time for the clock in the top bar is not possible without
# faking the system time, so the clock shows the real one.

# The indicator of the recording itself is not part of the picture.
run '(() => { const qs = Main.panel.statusArea.quickSettings; for (const a of qs._indicators.get_children()) if (a.constructor.name === "RemoteAccessApplet") { a.hide(); a.connect("notify::visible", x => x.visible && x.hide()); } for (const k of ["screenRecording", "screenSharing"]) { const i = Main.panel.statusArea[k]; if (i) { i.container.hide(); i.container.connect("notify::visible", c => c.visible && c.hide()); } } return true; })()'

# Keys, as a person types them.
run "(() => {
    const keyboard = global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    const wait = ms => new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => (r(true), false)));
    const key = sym => {
        keyboard.notify_keyval(GLib.get_monotonic_time(), sym, Clutter.KeyState.PRESSED);
        keyboard.notify_keyval(GLib.get_monotonic_time(), sym, Clutter.KeyState.RELEASED);
    };
    globalThis.R = {
        wait,
        key,
        async type(text, ms = 105) {
            for (const ch of text) {
                key(Clutter.unicode_to_keysym(ch.codePointAt(0)));
                await wait(ms + Math.round((Math.random() - 0.5) * 40));
            }
            return true;
        },
        find: cls => $(content_find "' + cls + '"),
    };
    return true;
})()"

# --- Modules --------------------------------------------------------------------
shell_wait_for 'visor !== null && visor.api !== null'
rows() { printf "visor.content.registry.get('%s').rows" "$1"; }

# Search: no providers of the apps of this machine, rates from a prepared cache.
run 'new Gio.Settings({schema_id: "org.gnome.desktop.search-providers"}).set_boolean("disable-external", true)'
mkdir -p "$XDG_CACHE_HOME/visor"
printf '{"fetched":%s000,"date":"2026-11-13","rates":{"EUR":1,"USD":1.0812,"GBP":0.8377,"CHF":0.9368,"JPY":166.73}}' \
    "$(date +%s)" >"$XDG_CACHE_HOME/visor/rates.json"

# Media: the mock player of the tests.
magick -size 192x192 -define gradient:angle=135 gradient:'#ff6a3d-#a23cff' "$HOME/cover.png"
gjs -m "$repo/tests/mpris-mock.js" visormock Headphones >/dev/null 2>&1 &
shell_wait_for "visor.content.registry.get('media').module.players.has('org.mpris.MediaPlayer2.visormock')"
mpris() {
    gdbus call --session --dest org.mpris.MediaPlayer2.visormock --object-path /org/mpris/MediaPlayer2 \
        --method "io.github.taulit.Visor.MprisMock.$1" "${@:2}" >/dev/null
}
mpris SetTrack 'Midnight City' "['M83']" "file://$HOME/cover.png" 243000000
mpris SetPosition 62000000 false
mpris SetStatus Playing

# Timers: a countdown and a stopwatch.
run "visor.getSettings().set_string('timers', JSON.stringify([
    { id: 'tea', kind: 'countdown', label: 'Tea', durationMs: 240000, totalMs: 240000, endsAt: Date.now() + 171000 },
    { id: 'focus', kind: 'stopwatch', label: 'Deep work', durationMs: 0, totalMs: 0, startedAt: Date.now() - 1496000 },
]))"

# Downloads.
mkdir -p "$HOME/Downloads" "$HOME/.config"
printf 'XDG_DOWNLOAD_DIR="$HOME/Downloads"\n' >"$HOME/.config/user-dirs.dirs"
run 'GLib.reload_user_special_dirs_cache()'
for id in timers downloads; do
    run "visor.content.registry.setEnabled('$id', false)"
    run "visor.content.registry.setEnabled('$id', true)"
done
truncate -s 1400000000 "$HOME/Downloads/fedora-44.iso.part"
shell_wait_for "$(rows downloads).length === 1"

# Calendar: two events of today.
gjs -m "$repo/tests/shell/calendar-events.js" '[
    {"uid":"standup","summary":"Team standup","start":4,"minutes":15,"location":"https://meet.google.com/abc-defg-hij"},
    {"uid":"lunch","summary":"Lunch with Sam","start":150,"minutes":60}]' >/dev/null 2>&1 || true

# T3 Code: the module of taulit/visor-t3 with its mock server, one working
# and one finished session.
if [[ "$t3_repo" != - ]]; then
    t3_uuid='visor-t3@taulit.github.io'
    t3_port="$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')"
    node "$t3_repo/tests/mock/server.js" --port "$t3_port" --home "$HOME/.t3" --fixture default >"$HOME/t3-mock.log" 2>&1 &
    t3() { curl -s -X POST "http://127.0.0.1:$t3_port/__mock/$1" "${@:2}" >/dev/null; }
    shell_wait_for "Main.extensionManager.lookup('$t3_uuid')?.state === 1 && visor.content.registry.get('t3') != null" 15
    # What pairing in the settings window of the module leaves behind.
    origin="http://127.0.0.1:$t3_port"
    printf 'mock-token' | secret-tool store --label="Visor: T3 Code ($origin)" xdg:schema io.github.taulit.Visor.T3 origin "$origin"
    schema_dir="$HOME/.local/share/gnome-shell/extensions/$t3_uuid/schemas"
    GSETTINGS_SCHEMA_DIR="$schema_dir" gsettings set org.gnome.shell.extensions.visor-t3 token-origin "$origin"
    serial="$(GSETTINGS_SCHEMA_DIR="$schema_dir" gsettings get org.gnome.shell.extensions.visor-t3 token-serial | grep -oE '[0-9]+$')"
    GSETTINGS_SCHEMA_DIR="$schema_dir" gsettings set org.gnome.shell.extensions.visor-t3 token-serial "$((serial + 1))"
    shell_wait_for "$(rows t3).length > 0" 10
    for id in thread-wait-child thread-wait thread-error; do t3 "remove?thread=$id"; done
    shell_wait_for "$(rows t3).length === 2 && !$(rows t3).some(r => r.id === 't3:thread-wait')" 10
fi

shell_wait_for "$(rows media).length === 1 && $(rows timers).length === 2"
run 'visor.notch.close()'
sleep 2

# --- Recording ------------------------------------------------------------------
pipewire >"$HOME/pipewire.log" 2>&1 &
sleep 1
wireplumber >"$HOME/wireplumber.log" 2>&1 &
sleep 2
cast() {
    shell_eval "new Promise((res, rej) => Gio.DBus.session.call('org.gnome.Shell.Screencast', '/org/gnome/Shell/Screencast',
        'org.gnome.Shell.Screencast', '$1', $2, null, Gio.DBusCallFlags.NONE, -1, null,
        (c, r) => { try { res(c.call_finish(r).recursiveUnpack()); } catch (e) { rej(String(e)); } }))"
}
# Each clip gets <scene>.json next to it: the time of each step in seconds
# from the first frame, which the edit (src/markers.ts) cuts by.
now_ms() { date +%s%3N; }
# The animations of the shell and of Visor run this many times slower while
# recording, so the opening reads calmly in the video (1 = real speed).
SLOWDOWN="${SLOWDOWN:-1.6}"
run "(St.Settings.get().slow_down_factor = $SLOWDOWN, true)"

rec_start() {
    cast Screencast "new GLib.Variant('(sa{sv})', ['$raw/$1.mp4', {'framerate': new GLib.Variant('u', 30), 'draw-cursor': new GLib.Variant('b', false)}])" >/dev/null
    t0="$(now_ms)"
    markers="$raw/$1.json"
    printf '{' >"$markers"
    sleep 0.6
}
mark() { printf '"%s": %s, ' "$1" "$(python3 -c "print(round(($(now_ms) - $t0) / 1000, 3))")" >>"$markers"; }
rec_stop() {
    sleep 0.4
    mark end
    printf '"_": 0}\n' >>"$markers"
    cast StopScreencast null >/dev/null
    sleep 1.5
    # The service appends .mp4 itself.
    [[ -f "$raw/$1.mp4.mp4" ]] && mv "$raw/$1.mp4.mp4" "$raw/$1.mp4"
    echo "recorded $1" >&2
}

scene_intro() {
    rec_start intro
    pause 2.5                                   # the clock at rest
    mark peek
    run 'visor.notch.dispatch({type: "enter"})' # the pointer comes onto the clock: chips peek out
    shell_wait_for 'visor.notch.state === "peek"'
    pause 2.8
    mark open
    run 'visor.notch.open()'
    shell_wait_for 'visor.notch.state === "open"'
    pause 5.5
    mark close
    run 'visor.notch.close()'
    pause 2.5
    rec_stop intro
}

scene_search() {
    rec_start search
    pause 1.2
    mark open
    run 'visor.notch.open()'
    shell_wait_for 'visor.notch.state === "open"'
    pause 1.5
    local i=0
    for query in '100 usd in eur' 'timer 25m Pizza'; do
        mark "q${i}_type"
        run "R.type('$query')"
        mark "q${i}_typed"
        pause 3.2
        mark "q${i}_done"
        if [[ "$query" == timer* ]]; then
            run 'R.key(Clutter.KEY_Return)'
            pause 2.2
        else
            run 'R.key(Clutter.KEY_Escape)'
            pause 1.2
        fi
        i=$((i + 1))
    done
    mark reopen
    run 'visor.notch.open()'
    shell_wait_for 'visor.notch.state === "open"'
    pause 4
    mark close
    run 'visor.notch.close()'
    pause 2
    rec_stop search
}

scene_t3() {
    run 'visor.notch.close()'
    sleep 1
    rec_start t3
    pause 2
    # The agent asks to run a command: the notch flashes and the chip waits.
    mark ask
    t3 "wait?thread=thread-run&request=request-run&prompt=pnpm%20test%20--%20websocket"
    pause 4.5
    mark open
    run 'visor.notch.open()'
    shell_wait_for 'visor.notch.state === "open"'
    pause 2.5
    # Unfold the row: the full command, with Deny and Allow below it.
    mark unfold
    run "R.find('visor-row-chevron').find(a => a.mapped).emit('clicked', 1)"
    shell_wait_for "R.find('visor-t3-buttons').some(a => a.mapped && a.get_children().length === 2)"
    pause 3.5
    mark allow
    run "R.find('visor-t3-buttons').find(a => a.mapped && a.get_children().length === 2).get_last_child().emit('clicked', 1)"
    pause 3.5
    mark close
    run 'visor.notch.close()'
    pause 2.5
    rec_stop t3
}

for scene in "$@"; do "scene_$scene"; done
