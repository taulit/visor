#!/usr/bin/env bash
# Takes the screenshots of all content scenarios into .shell-test/v1-content/
# and fails when the shell logged an error while one of them ran.
#
# Usage: tests/content-shots.sh [scenario...]   (default: all content-* scenarios)
set -euo pipefail
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="$repo/.shell-test/v1-content"

scenarios=("$@")
if [[ ${#scenarios[@]} -eq 0 ]]; then
    for file in "$repo"/scripts/scenarios/content-*.sh; do
        name="$(basename "$file" .sh)"
        [[ "$name" == content-lib ]] || scenarios+=("$name")
    done
fi

fail=0
for scenario in "${scenarios[@]}"; do
    for scheme in dark light; do
        if ! "$repo/scripts/shell-shot.sh" "$scenario" --scheme "$scheme" \
            --out "$out/$scenario-$scheme.png" >/dev/null 2>&1; then
            echo "FAIL: $scenario ($scheme) did not run"
            fail=1
        fi
        # What the shell says while it shuts down is not about the scenario.
        noise="$(sed '/Shutting down GNOME Shell/,$d' "$repo/.shell-test/$scenario.log" |
            grep -E 'JS ERROR|CRITICAL|Gjs-WARNING|St-WARNING|Clutter-WARNING|mutter-WARNING|visor' || true)"
        if [[ -n "$noise" ]]; then
            echo "FAIL: $scenario ($scheme) logged:"
            echo "$noise" | head -n 10
            fail=1
        fi
    done
done
ls "$out"/content-*.png
exit "$fail"
