# The open panel with the built-in modules of "Now" at work: a mock player
# with cover art, a timer, a stopwatch, a running and a finished download.
shell_wait_for 'visor !== null && visor.api !== null'
now_rows() { printf "visor.content.registry.get('%s').rows" "$1"; }

# Media: the mock player of the tests, on the bus of the sandbox.
magick -size 96x96 -define gradient:angle=135 gradient:'#ff6a3d-#a23cff' "$HOME/cover.png"
gjs -m "$repo/tests/mpris-mock.js" visormock Headphones >/dev/null 2>&1 &
shell_wait_for "visor.content.registry.get('media').module.players.has('org.mpris.MediaPlayer2.visormock')"
mock() {
    gdbus call --session --dest org.mpris.MediaPlayer2.visormock --object-path /org/mpris/MediaPlayer2 \
        --method "io.github.taulit.Visor.MprisMock.$1" "${@:2}" >/dev/null
}
mock SetTrack 'Midnight City' "['M83']" "file://$HOME/cover.png" 243000000
mock SetPosition 102000000 false
mock SetStatus Playing

# Timers: as they are saved, so the times are the same in every screenshot.
shell_eval "visor.getSettings().set_string('timers', JSON.stringify([
    { id: 'pizza', kind: 'countdown', label: 'Pizza', durationMs: 1500000, totalMs: 1500000, endsAt: Date.now() + 1122900 },
    { id: 'research', kind: 'stopwatch', label: 'tender research', durationMs: 0, totalMs: 0, startedAt: Date.now() - 196100 },
]))" >/dev/null

# Downloads: the sandbox has no download directory until it is told about one.
mkdir -p "$HOME/Downloads" "$HOME/.config"
printf 'XDG_DOWNLOAD_DIR="$HOME/Downloads"\n' >"$HOME/.config/user-dirs.dirs"
shell_eval 'GLib.reload_user_special_dirs_cache()' >/dev/null
for id in timers downloads; do
    shell_eval "visor.content.registry.setEnabled('$id', false)" >/dev/null
    shell_eval "visor.content.registry.setEnabled('$id', true)" >/dev/null
done
truncate -s 1400000000 "$HOME/Downloads/fedora-44.iso.part"
head -c 2300000 /dev/zero >"$HOME/Downloads/invoice-2026-11.pdf.part"
shell_wait_for "$(now_rows downloads).length === 2"
mv "$HOME/Downloads/invoice-2026-11.pdf.part" "$HOME/Downloads/invoice-2026-11.pdf"

shell_eval 'visor.notch.open()' >/dev/null
shell_wait_for "$(now_rows media).length === 1 && $(now_rows media)[0].progress !== undefined"
shell_wait_for "$(now_rows timers).length === 2"
shell_wait_for "$(now_rows downloads).some(r => r.status === 'done') && $(now_rows downloads).every(r => r.meta)"
