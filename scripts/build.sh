#!/usr/bin/env bash
# Build a complete, installable extension directory in build/.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf build
tsc

cp metadata.json stylesheet.css build/
for css in stylesheet-dark.css stylesheet-light.css; do
  [ -f "$css" ] && cp "$css" build/
done

mkdir -p build/schemas
cp schemas/*.gschema.xml build/schemas/
glib-compile-schemas --strict build/schemas

shopt -s nullglob
for po in po/*.po; do
  lang=$(basename "$po" .po)
  mkdir -p "build/locale/$lang/LC_MESSAGES"
  msgfmt --check -o "build/locale/$lang/LC_MESSAGES/visor.mo" "$po"
done
exit 0
