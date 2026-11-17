#!/usr/bin/env bash
# Drives the built-in modules of "Now" (media, timers, downloads) in the
# sandboxed headless shell: a mock MPRIS player on the sandbox bus, timers
# started through their commands, files in the sandbox download directory.
#
# Usage: tests/shell/modules-now.sh
# The log ends up in .shell-test/modules-now.log.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ "${1:-}" != --inside ]]; then
    exec "$repo/scripts/nested.sh" --log "$repo/.shell-test/modules-now.log" -- \
        "$repo/tests/shell/modules-now.sh" --inside
fi

source "$repo/scripts/lib/shell.sh"

fail=0
# check NAME JS: passes when JS evaluates to true.
check() {
    local got
    got="$(shell_eval "$2" 2>&1)" || true
    if [[ "$got" == true ]]; then
        echo "ok    $1"
    else
        echo "FAIL  $1: $got"
        fail=1
    fi
}
# wait_check NAME JS [seconds]: like check, but gives JS time to become true.
wait_check() {
    if shell_wait_for "$2" "${3:-5}" 2>/dev/null; then
        echo "ok    $1"
    else
        echo "FAIL  $1: $(shell_eval "$2" 2>&1 || true)"
        fail=1
    fi
}
run() { shell_eval "$1" >/dev/null; }

uuid='visor@taulit.github.io'
state="Main.extensionManager.lookup('$uuid').state"
shell_wait_for 'visor !== null && visor.api !== null'
# Stand-in for cover art.
magick -size 96x96 -define gradient:angle=135 gradient:'#ff6a3d-#a23cff' "$HOME/cover.png"
log_before="$(wc -l <"$HOME/shell.log")"

# Helpers that live in the shell for the rest of the test. They go through
# `visor` every time: disabling the extension replaces everything below it.
run "(() => {
    const entry = id => visor.content.registry.get(id);
    globalThis.N = {
        wait: ms => new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => (r(true), false))),
        mod: id => entry(id).module,
        rows: id => entry(id).rows,
        row: (id, title) => entry(id).rows.find(r => r.title === title),
        chip: id => entry(id).chip,
        action: (row, label) => [...(row.controls ?? []), ...(row.actions ?? []), row.primary].find(a => a && a.label === label),
        timerSource: () => Main.messageTray.getSources().find(s => s.title === 'Timer'),
        seconds: value => value.split(':').reduce((sum, part) => sum * 60 + Number(part), 0),
    };
    return true;
})()"

# --- media ------------------------------------------------------------------

# mock SUFFIX METHOD [args]: drives a mock player, see tests/mpris-mock.js.
mock() {
    gdbus call --session --dest "org.mpris.MediaPlayer2.$1" --object-path /org/mpris/MediaPlayer2 \
        --method "io.github.taulit.Visor.MprisMock.$2" "${@:3}"
}
start_mock() {
    gjs -m "$repo/tests/mpris-mock.js" "$@" &
    shell_wait_for "N.mod('media').players.has('org.mpris.MediaPlayer2.$1')"
}
one='org.mpris.MediaPlayer2.visormock'
media_row="N.rows('media')[0]"

check 'media: no player, no row, no timeout' "N.rows('media').length === 0 && N.mod('media').pollSource === 0 && N.mod('media').pauseSource === 0"
start_mock visormock
check 'media: a stopped player has no row' "N.rows('media').length === 0 && N.chip('media') === null"
mock visormock SetTrack 'Midnight City' "['M83']" '' 0 >/dev/null
mock visormock SetStatus Playing >/dev/null
wait_check 'media: a row appears when the player plays' "N.rows('media').length === 1 && $media_row.id === '$one'"
check 'media: title, artist and player' "$media_row.title === 'Midnight City' && $media_row.subtitle === 'M83 · Visor Mock'"
check 'media: controls' "$media_row.controls.map(a => a.label).join() === 'Previous,Pause,Next' && $media_row.controls[1].style === 'filled'"
check 'media: no art, a music symbol' "$media_row.icon === 'audio-x-generic-symbolic' && $media_row.iconStyle === 'cover'"
check 'media: the chip' "N.chip('media').text === 'Midnight City' && N.chip('media').priority === 30 && N.chip('media').icon === 'media-playback-start-symbolic'"
check 'media: no timeout with the panel closed' "N.mod('media').pollSource === 0 && N.mod('media').pauseSource === 0"

mock visormock SetTrack 'A very long title that does not fit into a chip' "['Kraftwerk', 'Moroder']" '' 0 >/dev/null
wait_check 'media: the row follows the metadata' "$media_row.title.startsWith('A very long') && $media_row.subtitle === 'Kraftwerk, Moroder · Visor Mock'"
check 'media: the chip is cut to 24 characters' "N.chip('media').text === 'A very long title that …'"

run "(N.action($media_row, 'Next').run(), N.action($media_row, 'Previous').run(), N.action($media_row, 'Pause').run(), true)"
wait_check 'media: the controls call the player' "$media_row.controls[1].label === 'Play'"
check 'media: the calls arrived' "$(mock visormock Calls | grep -c "\['Next', 'Previous', 'PlayPause'\]" || true) === 1"
check 'media: a paused player keeps its row but has no chip' "N.rows('media').length === 1 && N.chip('media') === null"
check 'media: one timeout while a paused player is shown' "N.mod('media').pauseSource !== 0 && N.mod('media').pollSource === 0"
run "N.action($media_row, 'Play').run()"
wait_check 'media: play again' "$media_row.controls[1].label === 'Pause' && N.mod('media').pauseSource === 0"
mock visormock SetCan false false >/dev/null
wait_check 'media: no buttons for what the player cannot do' "$media_row.controls.map(a => a.label).join() === 'Pause'"
mock visormock SetCan true true >/dev/null

# Progress: only with a position and a length, read while the panel is open.
mock visormock SetPosition 60000000 false >/dev/null
run 'visor.notch.open()'
shell_wait_for 'visor.notch.state === "open"'
check 'media: one timeout while the panel is open and something plays' "N.mod('media').pollSource !== 0"
run 'N.wait(1500)'
check 'media: no progress without a length' "$media_row.progress === undefined"
mock visormock SetTrack 'Midnight City' "['M83']" "file://$HOME/cover.png" 240000000 >/dev/null
mock visormock SetPosition 60000000 false >/dev/null
wait_check 'media: progress with position and length' "$media_row.progress === 0.25"
mock visormock SetPosition 120000000 false >/dev/null
wait_check 'media: the position is read every second' "$media_row.progress === 0.5" 4
mock visormock SetPosition 180000000 true >/dev/null
wait_check 'media: Seeked sets the position at once' "$media_row.progress === 0.75" 1
check 'media: local art is shown as it is' "$media_row.icon instanceof Gio.FileIcon && $media_row.icon.get_file().get_path() === GLib.get_home_dir() + '/cover.png'"
run 'visor.notch.close()'
shell_wait_for 'visor.notch.state !== "open"'
check 'media: no timeout after the panel closed' "N.mod('media').pollSource === 0"
mock visormock SetPosition 30000000 false >/dev/null
run 'N.wait(1500)'
check 'media: the position is not read with the panel closed' "$media_row.progress === 0.75"

# Art from the web is loaded once into the cache.
www="$HOME/www"
mkdir -p "$www"
cp "$HOME/cover.png" "$www/art.png"
port="$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')"
python3 -m http.server --bind 127.0.0.1 --directory "$www" "$port" >"$HOME/www.log" 2>&1 &
www_pid=$!
for _ in $(seq 1 50); do curl -s -o /dev/null "http://127.0.0.1:$port/art.png" && break; sleep 0.1; done
: >"$HOME/www.log"
mock visormock SetTrack 'Web' "['M83']" "http://127.0.0.1:$port/art.png" 0 >/dev/null
wait_check 'media: art from the web lands in the cache' "$media_row.icon instanceof Gio.FileIcon && $media_row.icon.get_file().get_path().startsWith(GLib.get_user_cache_dir() + '/visor/cover-') && $media_row.icon.get_file().query_exists(null)"
mock visormock SetTrack 'Other' "['M83']" '' 0 >/dev/null
mock visormock SetTrack 'Web again' "['M83']" "http://127.0.0.1:$port/art.png" 0 >/dev/null
wait_check 'media: the same art again' "$media_row.title === 'Web again' && $media_row.icon instanceof Gio.FileIcon"
check 'media: it was downloaded once' "$(grep -c 'GET /art.png' "$HOME/www.log" || true) === 1"
kill "$www_pid" 2>/dev/null || true

run 'visor.notch.open()'
shell_wait_for 'visor.notch.state === "open"'
run "$media_row.activate()"
wait_check 'media: a click raises the player and closes the panel' "visor.notch.state !== 'open'"
check 'media: Raise arrived' "$(mock visormock Calls | grep -c "'Raise'" || true) === 1"

# Several players: playing first, the most recently active first, at most two rows.
start_mock visormock2 'Second Mock'
mock visormock2 SetTrack 'Second' "['B']" '' 0 >/dev/null
mock visormock2 SetStatus Playing >/dev/null
wait_check 'media: the player that started last comes first' "N.rows('media').map(r => r.title).join() === 'Second,Web again'"
mock visormock2 SetStatus Paused >/dev/null
wait_check 'media: a playing player comes before a paused one' "N.rows('media').map(r => r.title).join() === 'Web again,Second'"
start_mock visormock3 'Third Mock'
mock visormock3 SetTrack 'Third' "['C']" '' 0 >/dev/null
mock visormock3 SetStatus Playing >/dev/null
wait_check 'media: at most two rows' "N.rows('media').map(r => r.title).join() === 'Third,Web again'"
mock visormock3 Quit >/dev/null
wait_check 'media: the row goes when the player leaves the bus' "N.rows('media').map(r => r.title).join() === 'Web again,Second' && N.mod('media').players.size === 2"
mock visormock2 SetStatus Stopped >/dev/null
wait_check 'media: the row goes when the player stops' "N.rows('media').map(r => r.title).join() === 'Web again'"
mock visormock2 Quit >/dev/null
mock visormock SetStatus Stopped >/dev/null
wait_check 'media: nothing plays, nothing shown, no timeout' "N.rows('media').length === 0 && N.chip('media') === null && N.mod('media').pollSource === 0 && N.mod('media').pauseSource === 0"

# --- timers -----------------------------------------------------------------

check 'timers: the module is registered' "N.mod('timers').slot === 'now' && N.rows('timers').length === 0"
check 'timers: nothing runs, no timeout' "N.mod('timers').source === 0"
check 'timers: resolve names what Enter does' "(() => {
    const [r, ...rest] = N.mod('timers').commands[0].resolve('3s Test');
    return rest.length === 0 && r.title === 'Start timer · 0:03' && r.subtitle === 'Test' && N.rows('timers').length === 0;
})()"
check 'timers: incomplete arguments resolve to nothing' "N.mod('timers').commands[0].resolve('').length === 0 && N.mod('timers').commands[0].resolve('soon').length === 0"
check 'timers: an alarm resolves to its time' "N.mod('timers').commands[0].resolve('18:30 Call')[0].title === 'Alarm at 18:30'"
check 'timers: the commands have their keywords' "N.mod('timers').commands[0].keyword.includes('timer') && N.mod('timers').commands[1].keyword.includes('stoppuhr')"

run 'visor.notch.open()'
shell_wait_for 'visor.notch.state === "open"'
run "N.mod('timers').commands[0].resolve('3s Test')[0].activate()"
check 'timers: activate creates a row' "(() => {
    const row = N.row('timers', 'Test');
    return row.subtitle.startsWith('Timer · until ') && row.value === '0:03' && typeof row.progress === 'number'
        && row.actions.map(a => a.label).join() === '+1 min,Pause,Stop';
})()"
check 'timers: one timeout while it runs' "N.mod('timers').source !== 0"
check 'timers: the chip names the end' "N.chip('timers').priority === 40 && N.chip('timers').text.startsWith('Test · ')"
run 'N.wait(1900)'
check 'timers: the value counts down while the panel is open' "['0:02', '0:01'].includes(N.row('timers', 'Test').value)"
wait_check 'timers: the row says Done at the end' "N.row('timers', 'Test').subtitle === 'Timer · Done'" 6
check 'timers: the done row offers Restart' "N.row('timers', 'Test').primary.label === 'Restart' && !N.row('timers', 'Test').value"
check 'timers: a notification with Restart in an own source' "(() => {
    const source = N.timerSource();
    const [n] = source.notifications;
    return source.notifications.length === 1 && n.title === 'Test done' && n.urgency === 2 && n.actions.map(a => a.label).join() === 'Restart';
})()"
check 'timers: the done chip' "N.chip('timers').text === 'Test done' && N.chip('timers').tone === 'accent' && N.chip('timers').priority === 90"
run "N.row('timers', 'Test').primary.run()"
check 'timers: Restart starts over and takes the notification back' "N.row('timers', 'Test').value === '0:03' && N.timerSource() === undefined"

run "N.action(N.row('timers', 'Test'), 'Pause').run()"
check 'timers: Pause' "N.row('timers', 'Test').subtitle === 'Timer · Paused' && N.action(N.row('timers', 'Test'), 'Resume') !== undefined"
check 'timers: a paused timer needs no timeout' "N.mod('timers').source === 0"
paused="$(shell_eval "N.row('timers', 'Test').value")"
run 'N.wait(1200)'
check 'timers: a paused timer stands still' "N.row('timers', 'Test').value === $paused"
run "N.action(N.row('timers', 'Test'), '+1 min').run()"
check 'timers: +1 min' "N.seconds(N.row('timers', 'Test').value) === N.seconds($paused) + 60"
run "N.action(N.row('timers', 'Test'), 'Resume').run()"
# The first tick of a seconds timeout comes after one to two seconds.
run 'N.wait(2200)'
check 'timers: Resume' "N.seconds(N.row('timers', 'Test').value) < N.seconds($paused) + 60 && N.mod('timers').source !== 0"
run "N.action(N.row('timers', 'Test'), 'Stop').run()"
check 'timers: Stop removes the row' "N.rows('timers').length === 0 && N.chip('timers') === null && N.mod('timers').source === 0"

run "N.mod('timers').commands[1].resolve('Research')[0].activate()"
check 'timers: a stopwatch' "(() => {
    const row = N.row('timers', 'Research');
    return row.subtitle === 'Stopwatch' && row.value === '0:00' && row.progress === undefined
        && row.actions.map(a => a.label).join() === 'Pause,Stop';
})()"
run 'N.wait(2200)'
check 'timers: the stopwatch counts up' "N.seconds(N.row('timers', 'Research').value) >= 1"
run 'visor.notch.close()'
shell_wait_for 'visor.notch.state !== "open"'
check 'timers: no tick for a stopwatch while the panel is closed' "N.mod('timers').source === 0"
run "N.mod('timers').commands[0].resolve('10m Tea')[0].activate()"
check 'timers: with the panel closed only the end is awaited' "N.mod('timers').source !== 0 && N.row('timers', 'Tea').value === '10:00'"

# Persistence: the timers come back after disable and enable.
mock visormock SetStatus Playing >/dev/null
shell_wait_for "N.rows('media').length === 1"
run "globalThis.old = { media: N.mod('media'), timers: N.mod('timers') }"
run "Main.extensionManager.disableExtension('$uuid')"
shell_wait_for "$state !== 1"
check 'media: disable leaves nothing behind' "old.media.subscription === 0 && old.media.players.size === 0 && old.media.pollSource === 0 && old.media.pauseSource === 0 && old.media.cancellable === null"
check 'timers: disable leaves nothing behind' "old.timers.source === 0 && old.timers.sleepId === 0 && old.timers.tray === null"
check 'timers: saved in the settings' "JSON.parse(visor.getSettings().get_string('timers')).map(t => t.label).join() === 'Research,Tea'"
run "N.wait(1100)"
run "Main.extensionManager.enableExtension('$uuid')"
shell_wait_for "$state === 1"
wait_check 'media: the player is found again after enable' "N.rows('media').length === 1 && N.rows('media')[0].title === 'Web again'"
mock visormock Quit >/dev/null
check 'timers: back after disable and enable' "(() => {
    const tea = N.seconds(N.row('timers', 'Tea').value);
    return N.rows('timers').length === 2 && tea < 600 && tea > 590 && N.seconds(N.row('timers', 'Research').value) >= 3;
})()"

# Ended while Visor was off: a moment ago rings once, long ago is dropped.
run "Main.extensionManager.disableExtension('$uuid')"
shell_wait_for "$state !== 1"
run "visor.getSettings().set_string('timers', JSON.stringify([
    { id: 'recent', kind: 'countdown', label: 'Recent', durationMs: 60000, totalMs: 60000, endsAt: Date.now() - 5000 },
    { id: 'old', kind: 'countdown', label: 'Old', durationMs: 60000, totalMs: 60000, endsAt: Date.now() - 600000 },
]))"
run "Main.extensionManager.enableExtension('$uuid')"
shell_wait_for "$state === 1"
check 'timers: one that ended a moment ago rings once on enable' "N.rows('timers').length === 1 && N.row('timers', 'Recent').subtitle === 'Timer · Done' && N.timerSource().notifications.length === 1"
run "Main.extensionManager.disableExtension('$uuid')"
shell_wait_for "$state !== 1"
check 'timers: disable takes the notification source along' "N.timerSource() === undefined"
run "Main.extensionManager.enableExtension('$uuid')"
shell_wait_for "$state === 1"
check 'timers: a done timer does not ring again' "N.row('timers', 'Recent').subtitle === 'Timer · Done' && N.timerSource() === undefined"
run "N.row('timers', 'Recent').primary.run()"
run "N.action(N.row('timers', 'Recent'), 'Stop').run()"
check 'timers: nothing left, nothing saved, no timeout' "N.rows('timers').length === 0 && visor.getSettings().get_string('timers') === '[]' && N.mod('timers').source === 0"

# --- downloads --------------------------------------------------------------

dl="$HOME/Downloads"
dl_row() { printf "N.row('downloads', '%s')" "$1"; }
check 'downloads: no download directory, no monitor' "N.mod('downloads').monitor === null && N.rows('downloads').length === 0 && N.mod('downloads').source === 0"

# The sandbox has no download directory; give it one and start the module anew.
mkdir -p "$dl" "$HOME/.config"
printf 'XDG_DOWNLOAD_DIR="$HOME/Downloads"\n' >"$HOME/.config/user-dirs.dirs"
head -c 1000 /dev/zero >"$dl/running.zip.part"
head -c 1000 /dev/zero >"$dl/abandoned.bin.part"
touch -d '2 hours ago' "$dl/abandoned.bin.part"
run 'GLib.reload_user_special_dirs_cache()'
run "visor.content.registry.setEnabled('downloads', false)"
run "visor.content.registry.setEnabled('downloads', true)"
check 'downloads: the directory is watched' "N.mod('downloads').monitor !== null"
wait_check 'downloads: a download that was running already is found' "N.rows('downloads').length === 1 && $(dl_row running.zip).meta === '1.0 kB'"

: >"$dl/x.iso.part"
wait_check 'downloads: a partial file makes a row with a spinner' "$(dl_row x.iso) !== undefined && $(dl_row x.iso).progress === 'indeterminate'"
check 'downloads: no invented bar, no actions' "$(dl_row x.iso).subtitle === undefined && $(dl_row x.iso).actions === undefined && $(dl_row x.iso).meta === '0 kB'"
check 'downloads: the chip names the newest download' "N.chip('downloads').text === 'x.iso' && N.chip('downloads').priority === 20 && N.chip('downloads').icon === 'folder-download-symbolic'"
head -c 2000000 /dev/zero >>"$dl/x.iso.part"
run 'N.wait(1500)'
check 'downloads: sizes are not read while the panel is closed' "$(dl_row x.iso).meta === '0 kB'"
run 'visor.notch.open()'
shell_wait_for 'visor.notch.state === "open"'
wait_check 'downloads: the size is read when the panel opens' "$(dl_row x.iso).meta === '2.0 MB'"
head -c 3000000 /dev/zero >>"$dl/x.iso.part"
wait_check 'downloads: the size follows the file while the panel is open' "$(dl_row x.iso).meta === '5.0 MB'"
mv "$dl/x.iso.part" "$dl/x.iso"
wait_check 'downloads: renamed to the final name, the row says Done' "$(dl_row x.iso).subtitle === 'Done' && $(dl_row x.iso).status === 'done'"
check 'downloads: the done row has its size and actions, no spinner' "(() => {
    const row = $(dl_row x.iso);
    return row.meta === '5.0 MB' && row.progress === undefined && row.actions.map(a => a.label).join() === 'Show in folder,Open' && typeof row.activate === 'function';
})()"
check 'downloads: one timeout while a done row is shown' "N.mod('downloads').source !== 0"

# "Show in folder" asks the file manager; a stand-in on the sandbox bus takes the call.
run "(() => {
    const xml = '<node><interface name=\"org.freedesktop.FileManager1\"><method name=\"ShowItems\"><arg type=\"as\" direction=\"in\"/><arg type=\"s\" direction=\"in\"/></method></interface></node>';
    const shown = (globalThis.shownItems = []);
    globalThis.fileManager = Gio.DBusExportedObject.wrapJSObject(xml, { ShowItems: uris => shown.push(...uris) });
    fileManager.export(Gio.DBus.session, '/org/freedesktop/FileManager1');
    globalThis.fileManagerName = Gio.bus_own_name_on_connection(Gio.DBus.session, 'org.freedesktop.FileManager1', Gio.BusNameOwnerFlags.NONE, null, null);
    return true;
})()"
run "N.action($(dl_row x.iso), 'Show in folder').run()"
wait_check 'downloads: Show in folder calls the file manager and closes the panel' "shownItems.join() === 'file://' + GLib.get_home_dir() + '/Downloads/x.iso' && visor.notch.state !== 'open'"
run "(Gio.bus_unown_name(fileManagerName), fileManager.unexport(), true)"

# Firefox keeps an empty file under the final name next to the partial one.
: >"$dl/y.bin"
head -c 5000 /dev/zero >"$dl/y.bin.part"
wait_check 'downloads: the placeholder of Firefox is no row of its own' "$(dl_row y.bin) !== undefined && N.rows('downloads').filter(r => r.title === 'y.bin').length === 1 && $(dl_row y.bin).meta === '5.0 kB'"
rm "$dl/y.bin.part"
wait_check 'downloads: cancelled in Firefox, the row goes' "$(dl_row y.bin) === undefined"
rm "$dl/y.bin"
: >"$dl/z.bin"
head -c 5000 /dev/zero >"$dl/z.bin.part"
shell_wait_for "$(dl_row z.bin) !== undefined && $(dl_row z.bin).meta === '5.0 kB'"
mv "$dl/z.bin.part" "$dl/z.bin"
wait_check 'downloads: finished in Firefox' "$(dl_row z.bin).subtitle === 'Done' && $(dl_row z.bin).meta === '5.0 kB'"

head -c 5000 /dev/zero >"$dl/c.zip.part"
shell_wait_for "$(dl_row c.zip) !== undefined"
rm "$dl/c.zip.part"
wait_check 'downloads: a partial file that vanishes is a cancelled download' "$(dl_row c.zip) === undefined"

head -c 5000 /dev/zero >"$dl/d.zip.part"
shell_wait_for "$(dl_row d.zip) !== undefined"
cp "$dl/d.zip.part" "$dl/d.zip"
rm "$dl/d.zip.part"
wait_check 'downloads: partial file gone and final file there is finished too' "$(dl_row d.zip).subtitle === 'Done'"

head -c 5000 /dev/zero >"$dl/Unconfirmed 123456.crdownload"
wait_check 'downloads: Chrome has no name yet' "$(dl_row 'Unconfirmed 123456.crdownload') !== undefined && N.chip('downloads').text === 'Unconfirmed 123456.crdo…'"
mv "$dl/Unconfirmed 123456.crdownload" "$dl/movie.mp4"
wait_check 'downloads: Chrome renames to the real name at the end' "$(dl_row movie.mp4).subtitle === 'Done' && $(dl_row 'Unconfirmed 123456.crdownload') === undefined"
check 'downloads: files left behind long ago are no downloads' "$(dl_row abandoned.bin) === undefined"
rm "$dl/running.zip.part"
wait_check 'downloads: no chip when nothing runs' "N.chip('downloads') === null && N.rows('downloads').every(r => r.status === 'done')"

run "globalThis.old.downloads = N.mod('downloads')"
run "Main.extensionManager.disableExtension('$uuid')"
shell_wait_for "$state !== 1"
check 'downloads: disable leaves no monitor and no timeout' "old.downloads.monitor === null && old.downloads.source === 0 && old.downloads.cancellable === null && old.downloads.downloads.size === 0"
head -c 5000 /dev/zero >"$dl/late.zip.part"
run 'N.wait(300)'
run "Main.extensionManager.enableExtension('$uuid')"
shell_wait_for "$state === 1"
wait_check 'downloads: after enable the running download is found again, done rows are not' "N.rows('downloads').map(r => r.title).join() === 'late.zip'"
rm "$dl/late.zip.part"
wait_check 'downloads: nothing left, no timeout' "N.rows('downloads').length === 0 && N.mod('downloads').source === 0"

# --- the end ----------------------------------------------------------------

noise="$(tail -n "+$((log_before + 1))" "$HOME/shell.log" | grep -E 'JS ERROR|WARNING|CRITICAL|has been already disposed' || true)"
if [[ -z "$noise" ]]; then
    echo "ok    no shell warnings"
else
    echo "FAIL  shell warnings:"
    head -n 20 <<<"$noise"
    fail=1
fi
((fail == 0)) && echo "PASS"
exit "$fail"
