#!/usr/bin/env bash
# Takes the screenshots a phase is judged by, in the dark and the light scheme,
# into docs/screenshots/, and fails when the shell logged an error while one
# of them was taken.
#
# Usage: scripts/shots.sh [name...]   (default: all of the list below)
# Any other scenario of scripts/scenarios/ can be named as well; its
# screenshots go to .shell-test/shots/.
set -uo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# name of the screenshot = scenario
shots=(
    "idle=idle"
    "hint=hint"
    "peek=content-peek"
    "open=content-demo"
    "now=modules-now"
    "open-one-column=content-one-column"
    "modules-view=content-modules-view"
    "empty=content-empty"
    "search=search-results"
    "search-convert=search-convert"
    "ahead=modules-ahead"
    "open-real=open-real"
    "t3=t3"
    "a11y-high-contrast=a11y-high-contrast"
    "a11y-large-text=a11y-large-text"
    "prefs-general=prefs-general"
    "prefs-modules=prefs-modules"
    "prefs-about=prefs-about"
)

# Extensions with modules of their own, installed in the sandbox of the settings window.
fixtures=(
    --extension "$repo/tests/shell/fixtures/notes-visor@example.org"
    --extension "$repo/tests/shell/fixtures/old-visor@example.org"
)

fail=0
# shot SCENARIO FILE [shell-shot options]
shot() {
    local scenario="$1" file="$2" noise
    shift 2
    if ! "$repo/scripts/shell-shot.sh" "$scenario" --out "$file" "$@" >/dev/null 2>&1; then
        echo "FAIL  $file: the scenario $scenario did not run"
        fail=1
        return
    fi
    # What the shell says while it shuts down is not about the scenario.
    noise="$(sed '/Shutting down GNOME Shell/,$d' "$repo/.shell-test/$scenario.log" |
        grep -E 'JS ERROR|CRITICAL|Gjs-WARNING|St-WARNING|Clutter-WARNING|mutter-WARNING|visor' || true)"
    if [[ -n "$noise" ]]; then
        echo "FAIL  $file: the shell logged"
        head -n 10 <<<"$noise"
        fail=1
        return
    fi
    echo "ok    ${file#"$repo"/}"
}

names=("$@")
if [[ ${#names[@]} -eq 0 ]]; then
    for entry in "${shots[@]}"; do names+=("${entry%%=*}"); done
fi

# The sandbox loads build/, so it has to be what the source says now.
PATH="$repo/node_modules/.bin:$PATH" bash "$repo/scripts/build.sh" >/dev/null || { echo "FAIL  build"; exit 1; }

for name in "${names[@]}"; do
    scenario="" dir="$repo/docs/screenshots"
    for entry in "${shots[@]}"; do
        [[ "${entry%%=*}" == "$name" ]] && scenario="${entry#*=}"
    done
    if [[ -z "$scenario" ]]; then
        scenario="$name" dir="$repo/.shell-test/shots"
        [[ -f "$repo/scripts/scenarios/$scenario.sh" ]] || { echo "FAIL  unknown name: $name"; fail=1; continue; }
    fi
    options=()
    [[ "$name" == prefs-* ]] && options=("${fixtures[@]}")
    schemes=(dark light)
    # The accessibility settings are shown once, in the dark scheme.
    [[ "$name" == a11y-* ]] && schemes=(dark)
    for scheme in "${schemes[@]}"; do
        shot "$scenario" "$dir/$name-$scheme.png" --scheme "$scheme" "${options[@]}"
    done
    # The settings window in German, to see that nothing is cut off or left in English.
    if [[ "$name" == prefs-general || "$name" == prefs-modules ]]; then
        if locale -a | grep -qix 'de_DE\.utf-\?8'; then
            VISOR_TEST_LOCALE=de_DE.UTF-8 shot "$scenario" "$dir/$name-de-dark.png" --scheme dark "${options[@]}"
        else
            echo "skip  $name-de-dark.png: this machine has no locale de_DE.UTF-8"
        fi
    fi
    # The accent colour comes from the system; one screenshot shows another one.
    [[ "$name" == open ]] && shot "$scenario" "$dir/open-dark-green.png" --scheme dark --accent green
done
exit "$fail"
