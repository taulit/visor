#!/usr/bin/env bash
# Regenerate po/visor.pot from the built JS and merge it into every po/*.po.
set -euo pipefail
cd "$(dirname "$0")/.."

bash scripts/build.sh

mapfile -t sources < <(find build -name '*.js' | sort)
xgettext --from-code=UTF-8 --language=JavaScript \
  -k_ -kN_ -kngettext:1,2 -kpgettext:1c,2 \
  --package-name=visor --msgid-bugs-address=https://github.com/taulit/visor/issues --add-comments \
  -o po/visor.pot "${sources[@]}"

shopt -s nullglob
for po in po/*.po; do
  msgmerge --update --backup=none "$po" po/visor.pot
done
exit 0
