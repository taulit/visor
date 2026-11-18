#!/usr/bin/env bash
# Copies what Visor takes from the module catalog (taulit/visor-modules): the
# search (src/lib/catalog-search.ts, shared with the website) and the snapshot
# of catalog.json that ships with the extension (data/catalog.json).
#
# Usage: scripts/catalog-sync.sh [--check] [CATALOG_DIR]
#   CATALOG_DIR  a checkout of taulit/visor-modules, default ../visor-modules
#   --check      write nothing, fail when the copies differ
set -euo pipefail
cd "$(dirname "$0")/.."

check=false
[[ "${1:-}" == --check ]] && { check=true; shift; }
src="${1:-../visor-modules}"
[[ -f "$src/src/catalog-search.ts" && -f "$src/catalog.json" ]] || {
  echo "catalog-sync: no checkout of taulit/visor-modules in $src" >&2
  exit 2
}

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
{
  echo '// Copy of src/catalog-search.ts of https://github.com/taulit/visor-modules.'
  echo '// Do not edit; update it with scripts/catalog-sync.sh.'
  cat "$src/src/catalog-search.ts"
} | node_modules/.bin/prettier --stdin-filepath src/lib/catalog-search.ts >"$tmp/catalog-search.ts"
cp "$src/catalog.json" "$tmp/catalog.json"

status=0
for pair in "catalog-search.ts:src/lib/catalog-search.ts" "catalog.json:data/catalog.json"; do
  from="$tmp/${pair%%:*}" to="${pair#*:}"
  if $check; then
    cmp -s "$from" "$to" || { echo "catalog-sync: $to is out of date" >&2; status=1; }
  else
    cp "$from" "$to"
  fi
done
$check || echo "Copied the search and the snapshot from $src"
exit "$status"
