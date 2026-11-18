#!/usr/bin/env bash
# Runtime check of the behaviour of the notch, with a virtual pointer and
# keyboard where the shell lets them through.
#   scripts/nested.sh -- tests/shell/notch-behaviour.sh
set -euo pipefail
source "$VISOR_REPO/tests/shell/lib.sh"

n='visor.notch'
state="$n.state"
quiet="[$n.state, $n.body.visible, $n.motion.running, $n.timers.size]"
# The actor a click at a point would go to belongs to the notch.
ours='((x, y) => { const a = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y); return visor.notch.root.contains(a) || visor.notch.neck.contains(a); })'
read -r nx ny <<<"$(shell_eval 'visorTest.neck().join(" ")' | tr -d '"')"
panel="$(shell_eval 'Main.panel.height')"
echo "neck centre: $nx,$ny  panel height: $panel"

echo "--- panel integration"
check 'date menu hidden' 'Main.panel.statusArea.dateMenu.container.visible' false
check 'date menu is hidden again when the panel shows it' '(Main.panel.statusArea.dateMenu.container.show(), Main.panel.statusArea.dateMenu.container.visible)' false
check 'neck is first in the centre box' "Main.panel._centerBox.get_child_at_index(0) === $n.neck" true
check 'neck spans the panel height' "$n.neck.height === Main.panel.height" true
check 'neck is a focusable button with a name' "[$n.neck.can_focus, $n.neck.accessible_role === imports.gi.Atk.Role.PUSH_BUTTON, $n.neck.accessible_name === $n.clock.label.text, $n.clock.label.text.length > 3]" '[true,true,true,true]'
check 'same text as the stock clock' "$n.clock.label.text === Main.panel.statusArea.dateMenu._clockDisplay.text" true
check 'root sits right above the panel box' "Main.uiGroup.get_children().indexOf($n.root) === Main.uiGroup.get_children().indexOf(Main.layoutManager.panelBox) + 1" true
check 'root is centred on the neck, below the panel' "[$n.root.x, $n.root.y]" "[$nx,$panel]"
check 'root is on the primary monitor' "Main.layoutManager.findMonitorForActor($n.root) === Main.layoutManager.primaryMonitor" true
check 'idle: nothing of the body can be picked' "[$ours($nx, $panel + 2), $ours($nx, $panel + 30)]" '[false,false]'
check 'idle: quiet' "$quiet" '["idle",false,false,0]'

echo "--- hover (virtual pointer)"
shell_eval "visorTest.move(...visorTest.away)" >/dev/null
check 'pointer away: idle' "$state" '"idle"'
shell_eval "visorTest.move($nx, $ny)" >/dev/null
check 'pointer on the neck: hint' "$state" '"hint"'
check 'hint size: neck + 40 wide, 8 high' "[$n.body.width - $n.neck.width, $n.body.height]" '[40,8]'
check 'hint: peek timer runs' "[...$n.timers.keys()]" '["peek"]'
check 'hint: still no peek widget' 'visor.content.peek.actor' null
pause 80
check 'well before the peek delay: still hint' "$state" '"hint"'
pause 350
check 'after the peek delay (380 ms): peek' "$state" '"peek"'
check 'peek size: natural width + 28, 56 high' "[$n.body.width - 2 * Math.ceil(visor.content.peek.actor.width / 2) , $n.body.height]" '[28,56]'
check 'peek content is centred' "(p => [Math.abs(p.get_transformed_position()[0] + p.width / 2 - $nx) <= 1, Math.abs(p.get_transformed_position()[1] + p.height / 2 - ($panel + 28)) <= 1])(visor.content.peek.actor)" '[true,true]'
check 'peek: no timer left' "$n.timers.size" 0
check 'peek: body is picked inside, not outside its visible area' "[$ours($nx, $panel + 40), $ours($nx, $panel + 60), $ours($nx - $n.body.width / 2 - 20, $panel + 20), $ours($nx + $n.body.width / 2 + 3, $panel + 40)]" '[true,false,false,false]'
shell_eval "visorTest.move($nx, $panel + 40)" >/dev/null
check 'pointer moved from the neck onto the body: still peek, no timer' "[$n.state, $n.timers.size]" '["peek",0]'
shell_eval "visorTest.move(...visorTest.away)" >/dev/null
check 'pointer left: leave timer runs' "[$n.state, ...$n.timers.keys()]" '["peek","leave"]'
pause 100
shell_eval "visorTest.move($nx, $ny)" >/dev/null
check 're-entered within 250 ms: leave timer cancelled' "[$n.state, $n.timers.size]" '["peek",0]'
pause 400
check 'and it stays' "$state" '"peek"'
shell_eval "visorTest.move(...visorTest.away)" >/dev/null
pause 120
check '180 ms after leaving: still peek' "$state" '"peek"'
pause 200
check '380 ms after leaving: idle and quiet' "$quiet" '["idle",false,false,0]'

echo "--- hover preview off"
shell_eval 'visor.getSettings().set_boolean("hover-preview", false)' >/dev/null
shell_eval "visorTest.move($nx, $ny)" >/dev/null
pause 600
check 'stays a hint, no timer' "[$n.state, $n.timers.size]" '["hint",0]'
shell_eval 'visor.getSettings().set_boolean("hover-preview", true)' >/dev/null
shell_eval "visorTest.move(...visorTest.away)" >/dev/null
pause 350
check 'idle again' "$state" '"idle"'

echo "--- click (virtual pointer)"
shell_eval "visorTest.move($nx, $ny)" >/dev/null
shell_eval "visorTest.click()" >/dev/null
check 'click on the neck opens' "$state" '"open"'
# What the sheet asks for at its width, without the height the notch gave it.
wanted='(r => { const h = r.height; r.set_height(-1); const [, natural] = r.get_preferred_height(r.width); r.set_height(h); return natural; })(visor.content.sheet.root)'
check 'open size: sheet width x its preferred height' "[$n.body.width === visor.content.sheetWidth(), $n.body.height === $wanted, $n.body.height > 56, visor.content.sheet.root.height === $n.body.height]" '[true,true,true,true]'
check 'the search entry has the key focus' 'global.stage.get_key_focus() === visor.content.sheet.entry.clutter_text' true
check 'registered as the active panel menu, modal' "[Main.panel.menuManager.activeMenu === $n.menu, Main.actionMode === Shell.ActionMode.POPUP]" '[true,true]'
check 'banners blocked while open' 'Main.messageTray._bannerBlocked' true
check 'no timers while open' "$n.timers.size" 0
shell_eval "visorTest.move($nx, $panel + 200)" >/dev/null
shell_eval "visorTest.move(...visorTest.away)" >/dev/null
pause 500
check 'pointer leaving does not close it' "$state" '"open"'
shell_eval "visorTest.move($nx, $ny)" >/dev/null
shell_eval "visorTest.click()" >/dev/null
check 'click on the neck closes' "$state" '"idle"'
check 'modal and banners released' "[Main.panel.menuManager.activeMenu == null, Main.actionMode === Shell.ActionMode.NORMAL, Main.messageTray._bannerBlocked]" '[true,true,false]'
pause 600
check 'no hint while the pointer still rests on the neck' "$quiet" '["idle",false,false,0]'
shell_eval "visorTest.move(...visorTest.away)" >/dev/null
shell_eval "visorTest.move($nx, $ny)" >/dev/null
check 'hint again after leaving and coming back' "$state" '"hint"'
shell_eval "visorTest.move($nx, $panel + 4)" >/dev/null
shell_eval "visorTest.click()" >/dev/null
check 'click on the hint area opens' "$state" '"open"'
shell_eval "visorTest.move(...visorTest.away)" >/dev/null
shell_eval "visorTest.click()" >/dev/null
check 'click outside closes' "$quiet" '["idle",false,false,0]'
shell_eval "visorTest.move($nx, $ny)" >/dev/null
pause 450
shell_eval "visorTest.move($nx, $panel + 40)" >/dev/null
shell_eval "visorTest.click()" >/dev/null
check 'click on the peek area opens' "$state" '"open"'

echo "--- Escape (virtual keyboard)"
shell_eval 'globalThis.escapes = [], visor.content.handleEscape = () => (escapes.push(visor.notch.state), escapes.length === 1)' >/dev/null
shell_eval "visorTest.key(Clutter.KEY_Escape)" >/dev/null
check 'first Escape is used up by the content, stays open' "[escapes.length, $n.state]" '[1,"open"]'
shell_eval "visorTest.key(Clutter.KEY_Escape)" >/dev/null
check 'second Escape: content was asked first (while open), then closed' "[escapes, $n.state]" '[["open","open"],"idle"]'
shell_eval 'delete visor.content.handleEscape' >/dev/null
shell_eval "visorTest.move(...visorTest.away)" >/dev/null
pause 100

echo "--- shortcuts"
check 'toggleCalendar and closeCalendar are taken over' '[Object.hasOwn(Main.panel, "toggleCalendar"), Object.hasOwn(Main.panel, "closeCalendar")]' '[true,true]'
shell_eval 'Main.panel.toggleCalendar()' >/dev/null
check 'toggleCalendar opens' "$state" '"open"'
shell_eval 'Main.panel.closeCalendar()' >/dev/null
check 'closeCalendar closes' "$state" '"idle"'
check 'open-shortcut is registered with the window manager' 'Main.wm._allowedKeybindings["open-shortcut"] !== undefined && global.display.get_keybinding_action(0, 0) !== undefined' true
shell_eval 'visor.getSettings().set_strv("open-shortcut", ["<Super>y"])' >/dev/null
pause 100
press_combo='(async key => { const s = Clutter.get_default_backend().get_default_seat(); const k = s.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE); const t = () => GLib.get_monotonic_time(); k.notify_keyval(t(), Clutter.KEY_Super_L, Clutter.KeyState.PRESSED); k.notify_keyval(t(), key, Clutter.KeyState.PRESSED); k.notify_keyval(t(), key, Clutter.KeyState.RELEASED); k.notify_keyval(t(), Clutter.KEY_Super_L, Clutter.KeyState.RELEASED); await new Promise(r => GLib.timeout_add(0, 150, () => (r(), false))); return visor.notch.state; })'
check 'Super+Y (open-shortcut) opens' "$press_combo(Clutter.KEY_y)" '"open"'
check 'Super+Y closes while open (action mode POPUP)' "$press_combo(Clutter.KEY_y)" '"idle"'
check 'Super+V (shell shortcut for the notification list) opens' "$press_combo(Clutter.KEY_v)" '"open"'
check 'Super+V closes' "$press_combo(Clutter.KEY_v)" '"idle"'
shell_eval 'visor.getSettings().reset("open-shortcut")' >/dev/null
check 'overview did not come up from the Super key' 'Main.overview.visible' false

echo "--- switching with other panel menus (virtual pointer)"
read -r qx qy <<<"$(shell_eval '(b => { const [x, y] = b.get_transformed_position(); return `${x + b.width / 2} ${y + b.height / 2}`; })(Main.panel.statusArea.quickSettings)' | tr -d '"')"
shell_eval "$n.open()" >/dev/null
shell_eval "visorTest.move($nx, $panel + 100)" >/dev/null
shell_eval "visorTest.move($qx, $qy)" >/dev/null
pause 200
check 'pointer onto the quick settings button: that menu opens, the notch closes' "[Main.panel.statusArea.quickSettings.menu.isOpen, $n.state, Main.messageTray._bannerBlocked]" '[true,"idle",false]'
shell_eval "visorTest.move($nx, $ny)" >/dev/null
pause 300
check 'pointer back onto the neck: the notch opens, quick settings close' "[Main.panel.statusArea.quickSettings.menu.isOpen, $n.state, Main.panel.menuManager.activeMenu === $n.menu]" '[false,"open",true]'
shell_eval "$n.close()" >/dev/null
shell_eval "visorTest.move(...visorTest.away)" >/dev/null
pause 400
check 'closed and quiet' "$quiet" '["idle",false,false,0]'

echo "--- flash"
shell_eval "$n.flash()" >/dev/null
check 'flash shows the peek' "[$n.state, ...$n.timers.keys()]" '["peek","flash"]'
pause 2700
check 'still there after 2.7 s' "$state" '"peek"'
pause 500
check 'gone after 3.2 s, quiet' "$quiet" '["idle",false,false,0]'
shell_eval "$n.open(), $n.flash()" >/dev/null
check 'ignored while open' "[$n.state, $n.timers.size]" '["open",0]'
shell_eval "$n.close()" >/dev/null
shell_eval 'visor.getSettings().set_boolean("flash-on-events", false)' >/dev/null
check 'ignored when flash-on-events is off' "($n.flash(), $n.state)" '"idle"'
shell_eval 'visor.getSettings().set_boolean("flash-on-events", true)' >/dev/null
shell_eval 'new Gio.Settings({schema_id: "org.gnome.desktop.notifications"}).set_boolean("show-banners", false)' >/dev/null
pause 100
check 'ignored with Do Not Disturb' "($n.flash(), $n.state)" '"idle"'
shell_eval 'new Gio.Settings({schema_id: "org.gnome.desktop.notifications"}).set_boolean("show-banners", true)' >/dev/null
pause 100
check 'ignored in fullscreen (getter of the primary monitor overridden)' "(m => { Object.defineProperty(m, 'inFullscreen', {get: () => true, configurable: true}); $n.flash(); delete m.inFullscreen; return [$n.state, m.inFullscreen]; })(Main.layoutManager.primaryMonitor)" '["idle",false]'
check 'works again afterwards' "($n.flash(), $n.state)" '"peek"'
shell_eval "$n.close()" >/dev/null

echo "--- content changes"
shell_eval "$n.open()" >/dev/null
sheet='visor.content.sheet.root'
shell_eval "$sheet.set_style('padding: 24px; height: 420px;')" >/dev/null
check 'sheet got higher: contentChanged() resizes the open body' "($n.contentChanged(), [$n.state, $n.body.height, $sheet.height])" '["open",468,468]'
shell_eval "$sheet.set_style('padding: 24px; height: 2000px;')" >/dev/null
check 'height is capped at 820' "($n.contentChanged(), [$n.body.height, $sheet.height])" '[820,820]'
shell_eval "$sheet.set_style('padding: 24px; height: 300px;')" >/dev/null
check 'and shrinks again' "($n.contentChanged(), $n.body.height)" 348
shell_eval "$sheet.set_style(null)" >/dev/null
check 'style removed: back to what the sheet asks for' "($n.contentChanged(), $n.body.height === $wanted)" true
rows='["one", "two", "three"].map(id => ({ id, icon: "alarm-symbolic", title: id }))'
check 'a module adds rows: the open body follows by itself' "(async h => { visorTest.ctx.now.set($rows); await new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => (r(), false))); return [$n.body.height > h + 50, $n.body.height === $sheet.height]; })($n.body.height)" '[true,true]'
shell_eval "$n.close()" >/dev/null
shell_eval "$n.flash()" >/dev/null
check 'chip changed: the peek gets wider by itself' "(w => (visorTest.ctx.peek.set({ ...visorTest.chip, text: 'a much longer chip for the peek row, about twice as long as before' }), $n.body.width > w + 100))($n.body.width)" true
check 'chips gone, pointer away: idle' "(visorTest.ctx.peek.set(null), $quiet)" '["idle",false,false,0]'
shell_eval 'visorTest.ctx.peek.set(visorTest.chip)' >/dev/null
shell_eval "visorTest.move($nx, $ny)" >/dev/null
pause 450
check 'peek by hover' "$state" '"peek"'
check 'chips gone, pointer on it: hint' "(visorTest.ctx.peek.set(null), [$n.state, $n.body.height])" '["hint",8]'
shell_eval 'visorTest.ctx.peek.set(visorTest.chip)' >/dev/null
shell_eval "visorTest.move(...visorTest.away)" >/dev/null
pause 350

echo "--- overview"
shell_eval "$n.open()" >/dev/null
check 'overview showing: idle at once, nothing visible, nothing running' "(Main.overview.show(), $quiet)" '["idle",false,false,0]'
check 'modal of the notch released' "Main.panel.menuManager.activeMenu == null" true
shell_wait_for 'Main.overview.visible && !Main.overview.animationInProgress'
shell_eval "visorTest.move($nx, $ny)" >/dev/null
pause 500
check 'pointer on the neck in the overview: stays idle' "$quiet" '["idle",false,false,0]'
check 'flash in the overview: ignored' "($n.flash(), $n.state)" '"idle"'
shell_eval "visorTest.move(...visorTest.away)" >/dev/null
check 'toggle() in the overview: opens and hides the overview' "($n.toggle(), [$n.state, Main.overview.visibleTarget])" '["open",false]'
shell_wait_for '!Main.overview.visible'
check 'still open after the overview is gone' "$state" '"open"'
shell_eval "$n.close()" >/dev/null
shell_eval "visorTest.move($nx, $ny)" >/dev/null
check 'hover works again' "$state" '"hint"'
shell_eval "visorTest.move(...visorTest.away)" >/dev/null
pause 350

echo "--- fullscreen"
shell_eval "$n.open()" >/dev/null
check 'root hidden by the layout manager while open: closes' "($n.root.hide(), [$n.state, Main.panel.menuManager.activeMenu == null])" '["idle",true]'
shell_eval "$n.root.show()" >/dev/null

echo "--- attention dot"
dot="$n.clock.dot"
css='(c => `#${[c.red, c.green, c.blue].map(v => v.toString(16).padStart(2, "0")).join("")}`)'
check 'none: hidden' "$dot.visible" false
shell_eval "$n.setAttention('unread')" >/dev/null
pause 50
check 'unread: accent colour' "[$dot.visible, $css($dot.get_theme_node().get_background_color()) === $css(St.ThemeContext.get_for_stage(global.stage).get_accent_color()[0])]" '[true,true]'
check 'dot is 6 px and right of the clock' "[$dot.width, $dot.height, $dot.get_transformed_position()[0] > $n.clock.label.get_transformed_position()[0] + $n.clock.label.width]" '[6,6,true]'
shell_eval "$n.setAttention('waiting')" >/dev/null
pause 50
check 'waiting: amber' "[$dot.visible, $css($dot.get_theme_node().get_background_color())]" '[true,"#f6a33b"]'
shell_eval "$n.setAttention(null)" >/dev/null
check 'null: hidden again' "$dot.visible" false

echo "--- theme"
check 'classes from the panel colour' "(c => [$n.root.has_style_class_name(c), $n.neck.has_style_class_name(c)])(St.Settings.get().color_scheme === St.SystemColorScheme.PREFER_LIGHT ? 'visor-light' : 'visor-dark')" '[true,true]'
shell_eval 'Main.panel.set_style("background-color: #f0e0d0;")' >/dev/null
pause 100
check 'light panel: visor-light, body in the colour of the panel' "[$n.root.has_style_class_name('visor-light'), $n.neck.has_style_class_name('visor-light'), $n.root.has_style_class_name('visor-dark'), $n.body.get_style()]" '[true,true,false,"background-color: rgb(240,224,208);"]'
shell_eval 'Main.panel.set_style("background-color: rgba(20, 30, 40, 0.5);")' >/dev/null
pause 100
check 'dark translucent panel: visor-dark, body opaque' "[$n.root.has_style_class_name('visor-dark'), $n.root.has_style_class_name('visor-light'), $n.body.get_style()]" '[true,false,"background-color: rgb(20,30,40);"]'
shell_eval 'Main.panel.set_style(null)' >/dev/null
pause 100
shell_eval 'new Gio.Settings({schema_id: "org.gnome.desktop.a11y.interface"}).set_boolean("high-contrast", true)' >/dev/null
pause 500
check 'high contrast: visor-hc on root and neck' "[$n.root.has_style_class_name('visor-hc'), $n.neck.has_style_class_name('visor-hc')]" '[true,true]'
shell_eval 'new Gio.Settings({schema_id: "org.gnome.desktop.a11y.interface"}).set_boolean("high-contrast", false)' >/dev/null
pause 500
check 'high contrast off: class removed' "$n.root.has_style_class_name('visor-hc')" false

echo "--- enable() time and restoration"
times="$(shell_eval '(() => { const out = []; for (let i = 0; i < 9; i++) { visor.disable(); const t = GLib.get_monotonic_time(); visor.enable(); out.push((GLib.get_monotonic_time() - t) / 1000); } return out.sort((a, b) => a - b); })()')"
echo "enable() in ms, 9 runs, sorted: $times"
check 'median enable() below 5 ms' "(t => t[4] < 5)($times)" true
check 'content not built by enable()' '[visor.content.peek.actor, visor.content.sheet.root]' '[null,null]'
shell_eval "visor.notch.open()" >/dev/null
check 'disable while open: everything handed back' "(visor.disable(), [Object.hasOwn(Main.panel, 'toggleCalendar'), Object.hasOwn(Main.panel, 'closeCalendar'), Main.panel.toggleCalendar === Object.getPrototypeOf(Main.panel).toggleCalendar, Main.wm._allowedKeybindings['open-shortcut'] === Shell.ActionMode.NONE, Main.messageTray._bannerBlocked, Main.panel.menuManager.activeMenu == null, Main.actionMode === Shell.ActionMode.NORMAL, Main.panel.statusArea.dateMenu.container.visible, Main.panel._centerBox.get_n_children()])" '[false,false,true,true,false,true,true,true,1]'
shell_eval 'visor.enable()' >/dev/null
check 'enabled again' "$quiet" '["idle",false,false,0]'
# The dot of an event makes the neck wider, and the flash comes after the
# layout but before the notch has followed: the row of chips, built right
# then, has to be on the stage before it is measured.
check 'first peek ever, right after the neck got wider' "(async () => { visorTest.register(); const neck = $n.neck; const allocated = new Promise(r => { const id = neck.connect('notify::allocation', () => { neck.disconnect(id); r(); }); }); visorTest.ctx.attention('waiting'); await allocated; const pending = neck.has_allocation() && neck.width !== $n.neckWidth; $n.flash(); return [pending, $n.state, visor.content.peek.actor.get_stage() !== null]; })()" '[true,"peek",true]'
shell_eval "$n.close()" >/dev/null
check_log 'no shell warnings during the test'

finish
