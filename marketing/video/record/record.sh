#!/usr/bin/env bash
# Records the clips of the launch video in the sandboxed headless GNOME Shell
# of scripts/nested.sh (never in the session you are logged in to), with the
# screencast service of GNOME Shell over a PipeWire of the sandbox.
#
# Usage: marketing/video/record/record.sh [scene...]
#   scenes: intro search t3 (default: all)
# Output: marketing/video/public/clips/<scene>.mp4, 30 fps, constant frame rate,
# and <scene>.json with the time of each step (see inside.sh).
#
# Needs: a built extension (pnpm build), pipewire, wireplumber, ffmpeg, magick, node.
# The t3 scene needs the T3 Code module: a checkout of taulit/visor-t3 with
# `pnpm build` done, in VISOR_T3_REPO (default: ../visor-t3 next to this repository).
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../../.." && pwd)"
out="$here/../public/clips"
mkdir -p "$out" "$repo/.shell-test"

scenes=("$@")
[[ ${#scenes[@]} -gt 0 ]] || scenes=(intro search t3)

t3_repo="${VISOR_T3_REPO:-$repo/../visor-t3}"
t3_args=()
if [[ -f "$t3_repo/build/metadata.json" ]]; then
    t3_repo="$(cd "$t3_repo" && pwd)"
    t3_args=(--extension "$t3_repo/build")
else
    t3_repo=-
    if [[ " ${scenes[*]} " == *" t3 "* ]]; then
        echo "record.sh: no built visor-t3 (set VISOR_T3_REPO); leaving out the t3 scene" >&2
        scenes=("${scenes[@]/t3/}")
        read -r -a scenes <<<"${scenes[*]}"
    fi
fi

raw="$(mktemp -d)"
trap 'rm -rf "$raw"' EXIT

# 3200x1800 at scale 2: a 1600x900 desktop in sharp pixels, so the zooms of
# the edit stay crisp.
"$repo/scripts/nested.sh" --animations --size 3200x1800 "${t3_args[@]}" --log "$repo/.shell-test/marketing-record.log" -- \
    bash "$here/inside.sh" "$raw" "$t3_repo" "${scenes[@]}" 2>"$repo/.shell-test/marketing-record.stderr" ||
    echo "record.sh: the recording failed, see .shell-test/marketing-record.stderr" >&2

# The screencast has a variable frame rate (a frame only when something moves);
# Remotion wants a constant one.
for scene in "${scenes[@]}"; do
    src="$raw/$scene.mp4"
    [[ -s "$src" ]] || { echo "record.sh: no clip for $scene" >&2; exit 1; }
    ffmpeg -v error -y -i "$src" -vf "fps=30,format=yuv420p" -c:v libx264 -crf 14 -preset slow \
        -movflags +faststart "$out/$scene.mp4"
    cp "$raw/$scene.json" "$out/$scene.json"
    echo "$out/$scene.mp4"
done

# A still of the open panel for the Open Graph image (src/Og.tsx).
if [[ -s "$out/intro.mp4" ]]; then
    open_at="$(node -p "require('$out/intro.json').open + 3")"
    mkdir -p "$here/../public/frames"
    ffmpeg -v error -y -ss "$open_at" -i "$out/intro.mp4" -frames:v 1 "$here/../public/frames/open.png"
fi
