#!/usr/bin/env bash
# Build a complete, installable extension directory in build/.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf build
tsc

cp metadata.json build/
# The shell loads exactly one stylesheet per extension, so the parts are joined.
cat styles/*.css >build/stylesheet.css

# The emoji names, read when the search first asks for them.
mkdir -p build/data
cp data/emoji.json build/data/

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
