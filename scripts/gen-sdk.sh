#!/usr/bin/env bash
# Generate sdk/index.d.ts and sdk/index.js from src/api.ts, so the published
# types cannot drift from the API the code implements.
#
# Usage: scripts/gen-sdk.sh [--check]
#   --check   write nothing, fail when the files in sdk/ are out of date
set -euo pipefail
cd "$(dirname "$0")/.."

check=false
[[ "${1:-}" == --check ]] && check=true

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# tsc keeps the doc comments (removeComments is off) and drops nothing public.
cat >"$tmp/tsconfig.json" <<JSON
{
  "extends": "$PWD/tsconfig.json",
  "compilerOptions": { "declaration": true, "emitDeclarationOnly": true, "outDir": "$tmp/out", "rootDir": "$PWD/src", "noEmit": false },
  "include": ["$PWD/src/ambient.d.ts", "$PWD/src/api.ts"]
}
JSON
node_modules/.bin/tsc -p "$tmp/tsconfig.json"

{
  cat <<'HEADER'
// Types of the Visor module API, version 1.
// Generated from src/api.ts of https://github.com/taulit/visor by scripts/gen-sdk.sh. Do not edit.
HEADER
  cat "$tmp/out/api.d.ts"
} | node_modules/.bin/prettier --stdin-filepath sdk/index.d.ts >"$tmp/index.d.ts"

version="$(grep -E '^export const API_VERSION = [0-9]+;' src/api.ts)"
[[ -n "$version" ]] || { echo "gen-sdk: API_VERSION not found in src/api.ts" >&2; exit 1; }
{
  echo '// Generated from src/api.ts by scripts/gen-sdk.sh. Do not edit.'
  echo "$version"
} >"$tmp/index.js"

if $check; then
  status=0
  for file in index.d.ts index.js; do
    cmp -s "$tmp/$file" "sdk/$file" || { echo "gen-sdk: sdk/$file is stale, run 'pnpm sdk:gen'" >&2; status=1; }
  done
  exit "$status"
fi
cp "$tmp/index.d.ts" "$tmp/index.js" sdk/
echo "Wrote sdk/index.d.ts and sdk/index.js"
