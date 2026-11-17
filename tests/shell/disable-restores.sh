#!/usr/bin/env bash
# Disabling Visor gives the shell back as it was: the stock date menu is in
# the panel again, opens through the handler of the shell's shortcut, shows
# the calendar and the notification that is still in the tray, and closes; the
# banners are where the shell puts them; the date menu gets the events of its
# month from the calendar server again; nothing of Visor is left.
#
# Usage: tests/shell/disable-restores.sh
# The log ends up in .shell-test/disable-restores.log.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ "${1:-}" != --inside ]]; then
    exec "$repo/scripts/nested.sh" --log "$repo/.shell-test/disable-restores.log" -- \
        "$repo/tests/shell/disable-restores.sh" --inside
fi

source "$repo/scripts/lib/shell.sh"

fail=0
# check NAME JS: passes when JS evaluates to true; anything else is printed.
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
run() { shell_eval "$1" >/dev/null; }

uuid='visor@taulit.github.io'
enabled="Main.extensionManager.lookup('$uuid').state === 1"
menu='Main.panel.statusArea.dateMenu'
# Everything below the stage that carries a style class of Visor.
ours="(function find(a, out) { if ((a.style_class ?? '').includes('visor-')) out.push(a.style_class); for (const c of a.get_children()) find(c, out); return out; })(global.stage, [])"
# The texts of all labels below an actor.
labels="(function find(a, out) { if (a instanceof St.Label) out.push(a.text); for (const c of a.get_children()) find(c, out); return out; })"

shell_wait_for "$enabled && visor !== null"
log_before="$(wc -l <"$HOME/shell.log")"
run 'new Gio.Settings({ schema_id: "org.gnome.desktop.interface" }).set_boolean("enable-hot-corners", false)'

echo "# Visor in use: a notification in the tray, the panel was open, the notch flashes"
gjs -m "$repo/tests/shell/notify.js" '{"app":"Mail","title":"Still here","body":"After Visor is gone","actions":["default","Open"]}' >"$HOME/still.out" 2>&1 &
shell_wait_for 'Main.messageTray.getSources().length === 1'
run 'visor.notch.open()'
run 'visor.notch.close()'
gjs -m "$repo/tests/shell/notify.js" '{"app":"Mail","title":"Second","body":"Makes the notch flash","actions":["default","Open"]}' >"$HOME/second.out" 2>&1 &
shell_wait_for 'visor.notch.state === "peek"'
check 'before: no date menu, the shortcut handler is taken over, the banners are moved below the body' \
    "!$menu.container.visible && Object.hasOwn(Main.panel, 'toggleCalendar') && Main.messageTray.translation_y === visor.notch.body.height && Main.messageTray.translation_y > 0 && $ours.length > 0"

# The calendar server keeps one time range for all its clients, and Visor asks
# for seven days. Nine days ahead is in the grid of the date menu, but not in those.
far="$menu._eventSource.getEvents(new Date(), new Date(Date.now() + 10 * 86400000)).some(e => e.summary === 'Far away')"
[[ "$(gjs -m "$repo/tests/shell/calendar-events.js" '[{"uid":"far","summary":"Far away","start":12960,"minutes":30}]' 2>/dev/null)" == done ]] ||
    { echo "FAIL  writing the event"; fail=1; }

echo "# disable"
run "Main.extensionManager.disableExtension('$uuid')"
shell_wait_for "!($enabled)"
run 'new Promise(r => GLib.timeout_add(GLib.PRIORITY_LOW, 300, () => (r(true), false)))'
check 'the date menu is back in the centre of the panel, alone' \
    "$menu.container.visible && $menu.container.mapped && $menu.container.get_parent() === Main.panel._centerBox && Main.panel._centerBox.get_n_children() === 1"
shell_wait_for "$far" 5 2>/dev/null || true
check 'the date menu has the events of its month again, past the seven days of Visor' "$far"
check 'the shortcut handlers are the ones of the shell again' \
    "!Object.hasOwn(Main.panel, 'toggleCalendar') && !Object.hasOwn(Main.panel, 'closeCalendar') && Main.wm._allowedKeybindings['open-shortcut'] === Shell.ActionMode.NONE"
check 'the banners are in their stock place and not blocked' \
    "Main.messageTray.translation_y === 0 && Main.messageTray._bannerBlocked === false && Main.messageTray.get_transition('translation-y') === null && Main.messageTray._bannerBin.get_transformed_position()[1] === Main.panel.height"
check 'both notifications are still in the tray' \
    "Main.messageTray.getSources().flatMap(s => s.notifications).map(n => n.title).sort().join() === 'Second,Still here'"
check 'nothing of Visor is left on the stage or among the panel menus' \
    "$ours.length === 0 && Main.panel.menuManager._menus.every(m => m.sourceActor.get_stage() !== null) && visor.notch === null && visor.api === null || [$ours.join(), Main.panel.menuManager._menus.filter(m => m.sourceActor.get_stage() === null).length, visor.notch === null].join('/')"
check 'the handler of the shortcut opens the date menu' \
    "(Main.panel.toggleCalendar(), $menu.menu.isOpen && Main.actionMode === Shell.ActionMode.POPUP)"
check 'it shows the calendar' "$menu._calendar.mapped && $menu._date.mapped"
check 'and the notification that is still in the tray' \
    "(() => { const texts = $labels($menu._messageList, []); return $menu._messageList.mapped && texts.includes('Still here') || texts.join('|'); })()"
check 'the handler closes it again' \
    "(Main.panel.toggleCalendar(), !$menu.menu.isOpen && Main.actionMode === Shell.ActionMode.NORMAL)"
check 'closeCalendar is the one of the shell, too' \
    "($menu.menu.open(), Main.panel.closeCalendar(), !$menu.menu.isOpen)"

echo "# enable again"
run "Main.extensionManager.enableExtension('$uuid')"
shell_wait_for "$enabled"
check 'Visor takes over again and knows the notifications that are there' \
    "(() => { const tray = Main.messageTray; visor.notch.open(); const titles = $labels(visor.notch.root, []); visor.notch.close(); return !$menu.container.visible && Object.hasOwn(Main.panel, 'toggleCalendar') && titles.includes('Still here') && tray.translation_y === 0 || titles.join('|'); })()"
run "Main.extensionManager.disableExtension('$uuid')"
shell_wait_for "!($enabled)"
check 'and gives everything back a second time' \
    "$menu.container.visible && !Object.hasOwn(Main.panel, 'toggleCalendar') && Main.messageTray.translation_y === 0 && Main.messageTray._bannerBlocked === false && $ours.length === 0"

noise="$(tail -n "+$((log_before + 1))" "$HOME/shell.log" | grep -E 'JS ERROR|WARNING|CRITICAL|has been already disposed' || true)"
if [[ -z "$noise" ]]; then
    echo "ok    no shell warnings"
else
    echo "FAIL  shell warnings:"
    head -n 20 <<<"$noise"
    fail=1
fi

((fail == 0)) && echo "PASS"
exit "$fail"
