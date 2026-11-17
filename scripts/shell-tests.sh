#!/usr/bin/env bash
# Runs all shell tests and the 50-cycle leak test one after the other, each in
# its own sandboxed headless shell. Prints one line per test and fails when
# one of them fails. What a test printed is in .shell-test/<name>.out.
#
# Usage: scripts/shell-tests.sh [name...]   (default: all)
set -uo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo"

# name|command
tests=(
    "content-shell|tests/shell/content-shell.sh"
    "search|tests/shell/search.sh"
    "modules-now|tests/shell/modules-now.sh"
    "modules-ahead|tests/shell/modules-ahead.sh"
    "template|tests/shell/template.sh"
    "t3|tests/shell/t3.sh"
    "disable-restores|tests/shell/disable-restores.sh"
    "e2e-timer|tests/shell/e2e-timer.sh"
    "notch-behaviour|scripts/nested.sh -- tests/shell/notch-behaviour.sh"
    "notch-motion|scripts/nested.sh --animations -- tests/shell/notch-motion.sh"
    "notch-motion-no-animations|scripts/nested.sh -- tests/shell/notch-motion.sh"
    "notch-leak-after-use|scripts/nested.sh --animations -- tests/shell/notch-leak-after-use.sh"
    "content-leak|tests/shell/content-leak.sh 20"
    "leak-test|scripts/leak-test.sh 50"
    "leak-test-t3|scripts/leak-test.sh 50 --t3"
)

for wanted in "$@"; do
    printf '%s\n' "${tests[@]}" | grep -q "^$wanted|" || { echo "unknown test: $wanted" >&2; exit 2; }
done

# The sandbox loads build/, so it has to be what the source says now.
PATH="$repo/node_modules/.bin:$PATH" bash scripts/build.sh >/dev/null || { echo "FAIL  build"; exit 1; }
mkdir -p .shell-test

failed=0
for entry in "${tests[@]}"; do
    name="${entry%%|*}"
    if (($# > 0)) && [[ " $* " != *" $name "* ]]; then continue; fi
    out=".shell-test/$name.out"
    start=$SECONDS
    # shellcheck disable=SC2086  # the command is a list of words
    if bash -c "${entry#*|}" >"$out" 2>&1; then
        printf 'PASS  %-28s %3d s\n' "$name" "$((SECONDS - start))"
    else
        printf 'FAIL  %-28s %3d s  (%s)\n' "$name" "$((SECONDS - start))" "$out"
        grep -E '^FAIL' "$out" | head -n 10 | sed 's/^/      /'
        failed=$((failed + 1))
    fi
done

((failed == 0)) || echo "$failed failed"
exit "$((failed > 0))"
