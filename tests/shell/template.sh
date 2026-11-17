#!/usr/bin/env bash
# The module template (examples/module-template) next to Visor in the sandboxed
# headless shell: the template is built in a copy outside the repository and
# loaded like a user would install it. Three builds run side by side, one per
# slot: the template as it is (Dock) and two copies whose extension.js imports
# the Now and Up Next example instead, under UUIDs of their own.
#
# Checks: the modules are registered and show up on the panel; the view of the
# Dock example opens and works; disabling Visor leaves no error and enabling it
# registers the modules again; disabling a module extension removes its module;
# a module extension enabled while Visor is off waits for Visor; and a second
# shell without Visor at all: the template loads and logs nothing.
#
# Usage: tests/shell/template.sh
# The logs end up in .shell-test/template.log and .shell-test/template-alone.log.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ "${1:-}" != --inside && "${1:-}" != --inside-alone ]]; then
    export PATH="$repo/node_modules/.bin:$PATH"
    work="$(mktemp -d)"
    trap 'rm -rf "$work"' EXIT
    # Build in a copy outside the repository, as template-check.sh does.
    mkdir "$work/template"
    (cd "$repo/examples/module-template" && tar -c --exclude=./node_modules --exclude=./build --exclude=./dist .) | tar -x -C "$work/template"
    ln -s "$repo/node_modules" "$work/template/node_modules"
    (cd "$work/template" && bash scripts/build.sh)
    # Variants for the other two slots: another UUID and another example.
    for slot in now ahead; do
        cp -r "$work/template/build" "$work/$slot"
        sed -i "s#dockExample#${slot}Example#g; s#examples/dock\\.js#examples/$slot.js#" "$work/$slot/extension.js"
        node -e "
            const fs = require('fs'), file = '$work/$slot/metadata.json', m = JSON.parse(fs.readFileSync(file));
            m.uuid = 'visor-example-$slot@taulit.github.io'; m.visor.slot = '$slot';
            fs.writeFileSync(file, JSON.stringify(m, null, 2));"
    done
    # A module built for another API version: Visor refuses it, the helper logs one line.
    cp -r "$work/ahead" "$work/future"
    sed -i "s#example-ahead#example-future#g" "$work/future/examples/ahead.js"
    node -e "
        const fs = require('fs'), file = '$work/future/metadata.json', m = JSON.parse(fs.readFileSync(file));
        m.uuid = 'visor-example-future@taulit.github.io'; m.visor.api = 2;
        fs.writeFileSync(file, JSON.stringify(m, null, 2));"
    mkdir -p "$repo/.shell-test"
    "$repo/scripts/nested.sh" --log "$repo/.shell-test/template.log" \
        --extension "$work/template/build" --extension "$work/now" --extension "$work/ahead" --extension "$work/future" -- \
        "$repo/tests/shell/template.sh" --inside
    # No Visor installed at all.
    "$repo/scripts/nested.sh" --no-visor --log "$repo/.shell-test/template-alone.log" \
        --extension "$work/template/build" -- \
        "$repo/tests/shell/template.sh" --inside-alone
    exit 0
fi

source "$repo/scripts/lib/shell.sh"

fail=0
check() {
    local got
    got="$(shell_eval "$2" 2>&1)" || true
    if [[ "$got" == true ]]; then
        echo "ok    $1"
    else
        echo "FAIL  $1: $got"
        fail=1
    fi
}
wait_check() {
    if shell_wait_for "$2" "${3:-5}" 2>/dev/null; then
        echo "ok    $1"
    else
        echo "FAIL  $1: $(shell_eval "$2" 2>&1 || true)"
        fail=1
    fi
}
run() { shell_eval "$1" >/dev/null; }
finish() {
    # What the shell logged since the test started (warnings of any kind), and in the
    # whole log, extension loading included, errors and everything that names the template.
    local noise
    noise="$({
        tail -n "+$((log_before + 1))" "$HOME/shell.log" | grep -E 'JS ERROR|WARNING|CRITICAL|has been already disposed' || true
        grep -E 'JS ERROR|CRITICAL|has been already disposed|visor-example|Failed to (load|enable)' "$HOME/shell.log" || true
    } | grep -v 'visor-example-future' || true)"
    if [[ -z "$noise" ]]; then
        echo "ok    no shell warnings"
    else
        echo "FAIL  shell warnings:"
        head -n 20 <<<"$noise"
        fail=1
    fi
    ((fail == 0)) && echo "PASS"
    exit "$fail"
}

visor='visor@taulit.github.io'
dock='visor-example@taulit.github.io'
now='visor-example-now@taulit.github.io'
ahead='visor-example-ahead@taulit.github.io'
future='visor-example-future@taulit.github.io'
refusals() { grep -c "$future: Visor refused the module 'example-future'.*API 2" "$HOME/shell.log" || true; }
state() { printf "Main.extensionManager.lookup('%s').state" "$1"; }
# Actors below the panel with a style class, as a JS expression.
find() { printf "(function find(a, out) { if (a.has_style_class_name && a.has_style_class_name('%s')) out.push(a); for (const c of a.get_children()) find(c, out); return out; })(visor.notch.root, [])" "$1"; }
registered() { printf "(() => { const e = visor.content.registry.get('%s'); return e !== null && e.active && e.owner.uuid === '%s'; })()" "$1" "$2"; }

log_before="$(wc -l <"$HOME/shell.log")"
if [[ "$1" == --inside-alone ]]; then
    wait_check 'the template is active without Visor' "$(state $dock) === 1" 10
    check 'Visor is not there' "Main.extensionManager.lookup('$visor') === undefined"
    run "Main.extensionManager.disableExtension('$dock')"
    wait_check 'it can be disabled' "$(state $dock) !== 1"
    run "Main.extensionManager.enableExtension('$dock')"
    wait_check 'and enabled again' "$(state $dock) === 1"
    finish
fi

shell_wait_for 'visor !== null && visor.api !== null'
wait_check 'the three extensions are active' "[$(state $dock), $(state $now), $(state $ahead)].every(s => s === 1)"
check 'Dock example is registered with its owner' "$(registered example-dock $dock) && visor.content.registry.get('example-dock').module.slot === 'dock'"
check 'Now example is registered with its owner' "$(registered example-now $now) && visor.content.registry.get('example-now').module.slot === 'now'"
check 'Up Next example is registered with its owner' "$(registered example-ahead $ahead) && visor.content.registry.get('example-ahead').module.slot === 'ahead'"
check 'API 2 module: refused, listed as incompatible, not registered, extension active' "visor.content.registry.get('example-future') === null && visor.content.registry.incompatible.map(m => m.id + m.api).join() === 'example-future2' && $(state $future) === 1"
check 'API 2 module: one line in the log' "$(refusals) === 1"
check 'the module gets the settings and gettext of its extension' "visor.content.registry.get('example-dock').module.name === 'Example'"
check 'Now example: one row' "visor.content.registry.get('example-now').rows.map(r => r.title).join() === 'Hello from Visor'"
check 'Dock example: no badge, no view built yet' "visor.content.registry.get('example-dock').badge === null && $(find visor-row-title).filter(a => a.text === 'Clicks').length === 0"

run 'visor.notch.open()'
shell_wait_for 'visor.notch.state === "open"'
check 'Now example: the row is on the panel' "$(find visor-row-title).some(a => a.mapped && a.text === 'Hello from Visor')"
check 'Up Next example: the section is on the panel' "$(find visor-section-title).some(a => a.mapped && a.text === 'Example')"
check 'Dock example: the icon is in the dock' "$(find visor-dock-button).some(b => b.accessible_name === 'Example')"
run "$(find visor-dock-button).find(b => b.accessible_name === 'Example').emit('clicked', 0)"
wait_check 'Dock example: its view opens' "$(find visor-row-title).some(a => a.mapped && a.text === 'Clicks')"
run "$(find visor-icon-button).find(b => b.mapped && b.accessible_name === 'Add').emit('clicked', 0)"
check 'Dock example: Add counts and sets the badge' "visor.content.registry.get('example-dock').badge === 1 && $(find visor-row-value).some(a => a.mapped && a.text === '1')"
run 'visor.notch.close()'
shell_wait_for 'visor.notch.state !== "open"'

# Visor goes, the module extensions stay quietly active.
run "globalThis.oldEntry = visor.content.registry.get('example-dock')"
run "Main.extensionManager.disableExtension('$visor')"
shell_wait_for "$(state $visor) !== 1"
check 'Visor off: the module was disabled by Visor' "oldEntry.active === false"
check 'Visor off: the template extensions stay active' "[$(state $dock), $(state $now), $(state $ahead)].every(s => s === 1)"
# One of them is switched off and on while Visor is away: it waits for Visor.
run "Main.extensionManager.disableExtension('$now')"
shell_wait_for "$(state $now) !== 1"
run "Main.extensionManager.enableExtension('$now')"
shell_wait_for "$(state $now) === 1"
run "Main.extensionManager.enableExtension('$visor')"
shell_wait_for "$(state $visor) === 1"
wait_check 'Visor on: Dock example is registered again' "$(registered example-dock $dock)" 8
wait_check 'Visor on: Up Next example is registered again' "$(registered example-ahead $ahead)" 8
wait_check 'Visor on: Now example, enabled while Visor was away, is registered' "$(registered example-now $now) && visor.content.registry.get('example-now').rows.length === 1" 8
check 'API 2 module: refused again by the new run of Visor, one more line' "$(refusals) === 2 && visor.content.registry.get('example-future') === null"
check 'Visor on: a new run, a new count' "visor.content.registry.get('example-dock').badge === null && visor.content.registry.get('example-dock') !== oldEntry"

# Disabling the extension of a module removes the module.
run "Main.extensionManager.disableExtension('$dock')"
shell_wait_for "$(state $dock) !== 1"
check 'Dock extension off: the module is gone' "visor.content.registry.get('example-dock') === null"
run 'visor.notch.open()'
shell_wait_for 'visor.notch.state === "open"'
check 'Dock extension off: the icon is gone' "$(find visor-dock-button).every(b => b.accessible_name !== 'Example')"
run 'visor.notch.close()'
shell_wait_for 'visor.notch.state !== "open"'
run "Main.extensionManager.disableExtension('$now')"
run "Main.extensionManager.disableExtension('$ahead')"
shell_wait_for "$(state $now) !== 1 && $(state $ahead) !== 1"
check 'all extensions off: no module of the template is left' "['example-dock', 'example-now', 'example-ahead'].every(id => visor.content.registry.get(id) === null) && visor.content.registry.get('media') !== null"
run "Main.extensionManager.enableExtension('$dock')"
wait_check 'Dock extension on again: the module is back' "$(registered example-dock $dock)"
# Visor is disabled while a module extension is still on, then that one goes: nothing to unregister from.
run "Main.extensionManager.disableExtension('$visor')"
shell_wait_for "$(state $visor) !== 1"
run "Main.extensionManager.disableExtension('$dock')"
shell_wait_for "$(state $dock) !== 1"
run "Main.extensionManager.enableExtension('$visor')"
shell_wait_for "$(state $visor) === 1"
check 'Visor on again: no module of the template, Visor works' "visor.content.registry.get('example-dock') === null && visor.api !== null"
finish
