#!/usr/bin/env bash
# Takes a screenshot of a scenario in the sandboxed headless shell.
#
# Usage: scripts/shell-shot.sh <scenario> [--scheme dark|light] [--accent NAME] [--out FILE]
# Scenarios live in scripts/scenarios/<name>.sh; each one drives the shell into
# a state with shell_eval. The default output is docs/screenshots/<scenario>-<scheme>.png.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "${1:-}" == --inside ]]; then
    source "$repo/scripts/lib/shell.sh"
    scenario="$2" out="$3"
    source "$repo/scripts/scenarios/$scenario.sh"
    sleep "${SETTLE_SECONDS:-0.3}"
    shell_shot "$out"
    echo "$out"
    exit 0
fi

scenario="${1:?scenario name}"; shift
scheme=dark accent=blue out= extra=()
while [[ $# -gt 0 ]]; do
    case "$1" in
        --scheme) scheme="$2"; shift 2 ;;
        --accent) accent="$2"; shift 2 ;;
        --out) out="$2"; shift 2 ;;
        *) extra+=("$1"); shift ;;
    esac
done
[[ -f "$repo/scripts/scenarios/$scenario.sh" ]] || { echo "unknown scenario: $scenario" >&2; exit 2; }
if [[ -z "$out" ]]; then
    suffix="$scheme"
    [[ "$accent" != blue ]] && suffix="$scheme-$accent"
    out="$repo/docs/screenshots/$scenario-$suffix.png"
fi

exec "$repo/scripts/nested.sh" --scheme "$scheme" --accent "$accent" "${extra[@]}" \
    --log "$repo/.shell-test/$scenario.log" -- "$repo/scripts/shell-shot.sh" --inside "$scenario" "$out"
