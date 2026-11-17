#!/usr/bin/env bash
# Proves that examples/module-template is self-contained: copies it to a temporary
# directory OUTSIDE the repository, then lints, type-checks, builds and packs it
# there and checks the listing of the ZIP.
#
# The tools come from the root node_modules (a symlink), so no network is needed.
# With TEMPLATE_CHECK_INSTALL=1 the copy runs its own `pnpm install` instead, as a
# fresh clone of the template repository would (used in CI).
set -euo pipefail
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
case "$tmp" in "$repo"/*) echo "template-check: $tmp is inside the repository" >&2; exit 1 ;; esac

copy="$tmp/visor-module-template"
mkdir "$copy"
(cd "$repo/examples/module-template" && tar -c --exclude=./node_modules --exclude=./build --exclude=./dist .) | tar -x -C "$copy"

cd "$copy"
if [[ "${TEMPLATE_CHECK_INSTALL:-}" == 1 ]]; then
  pnpm install
else
  ln -s "$repo/node_modules" node_modules
  export PATH="$repo/node_modules/.bin:$PATH"
fi

pnpm run lint
pnpm run typecheck
pnpm run pack:zip

zip_file="$(ls dist/*.zip)"
listing="$(unzip -Z1 "$zip_file")"
echo "--- $(basename "$zip_file")"
unzip -l "$zip_file"

missing=0
for want in metadata.json extension.js prefs.js visor/connect.js; do
  grep -qx "$want" <<<"$listing" || { echo "template-check: $want is missing in the ZIP" >&2; missing=1; }
done
grep -qE '^schemas/[^/]+\.gschema\.xml$' <<<"$listing" || { echo "template-check: no schema XML in the ZIP" >&2; missing=1; }
grep -qE '^locale/.+\.mo$' <<<"$listing" || { echo "template-check: no locale file in the ZIP" >&2; missing=1; }
grep -qE '^(\.\./|/|node_modules/)' <<<"$listing" && { echo "template-check: unexpected path in the ZIP" >&2; missing=1; }
((missing == 0)) || exit 1
echo "template-check: ok"
