# Verified GNOME Shell APIs for Visor

Date: 2026-11-16. Checked against what is installed on this machine: **gnome-shell 50.5, mutter 50.5 (API 18), gjs 1.88.1, gnome-calendar 50.0**. Shell 51 was not available and is not covered.

Sources (all paths below are relative to the repo root):

- `.shell-src/org/gnome/shell/{ui,misc,extensions,theme,dbus-interfaces}/` — extracted from `libshell-18.so`, `gnome-shell-theme.gresource`, `gnome-shell-dbus-interfaces.gresource`.
- `.shell-src/org/gnome/Shell/Extensions/js/` — the prefs process (`extensions/prefs.js`).
- `.shell-src/gir/{St,Shell}-18.gir` — decompiled from the typelibs (no doc comments). Clutter/Meta/Cogl/Mtk GIRs are in `/usr/lib/mutter-18/`.
- Nothing was run inside a shell. Items marked **(not runtime-tested)** are derived from reading source only. GJS probes ran standalone against the same typelibs.

## Summary

| #   | Assumption from the plan                                                                                             | Verdict                 | Consequence                                                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------ |
| 1a  | `addTopChrome(actor, {affectsInputRegion, trackFullscreen})`                                                         | **wrong**               | `affectsInputRegion` no longer exists; passing it **throws**. Only `trackFullscreen`, `affectsStruts`. |
| 1b  | `statusArea.dateMenu`, `.container`, `_centerBox`, `primaryMonitor`, `monitors-changed`, overview `showing`/`hiding` | confirmed               | Panel re-shows `dateMenu.container` on every session-mode update; re-hide it.                          |
| 1c  | Panel goes transparent in overview via a style class                                                                 | changed                 | It is the pseudo class `:overview`, not a class.                                                       |
| 2a  | `Clutter.Timeline.set_progress_func` usable from GJS                                                                 | **wrong**               | Symbol exists, but GJS mangles the callback's `double` return. Compute the spring in `new-frame`.      |
| 2b  | `CUSTOM_MODE` with `actor.ease()`                                                                                    | wrong                   | No way to supply the function; do not use.                                                             |
| 3a  | `St.Settings.get().accent_color` gives the colour                                                                    | changed                 | It is an enum. Use `St.ThemeContext.get_accent_color()` → `[color, fgColor]`.                          |
| 3b  | `stylesheet-dark.css` / `-light.css` supported                                                                       | confirmed, with a catch | Exactly **one** file is loaded; the variant replaces `stylesheet.css`. No high-contrast variant.       |
| 3c  | CSS variables / `color-mix`                                                                                          | wrong (as expected)     | Use `st-mix/st-transparentize/st-lighten/st-darken`, `-st-accent-color`, or inline `style`.            |
| 4   | `GnomeDesktop.WallClock`, `clock`, `notify::clock`                                                                   | confirmed               | `gi://GnomeDesktop?version=4.0`.                                                                       |
| 5   | Shell binds `toggle-message-tray` with `setCustomKeybindingHandler`                                                  | **wrong**               | It uses `Main.wm.addKeybinding`; handler calls `Main.panel.toggleCalendar()`. Override that method.    |
| 5b  | Default is `['<Super>v','<Super>m']`                                                                                 | confirmed               | But on this machine it is overridden and Super+V belongs to another extension (see Risks).             |
| 6   | `pushModal(actor, params)` / `popModal(grab)`                                                                        | confirmed               | Register a duck-typed menu with `Main.panel.menuManager`.                                              |
| 7   | Reuse `ui/mpris.js`                                                                                                  | changed                 | Exports exist, but no position/length/seek and no teardown. Write an own MPRIS proxy.                  |
| 8   | MessageTray API                                                                                                      | confirmed               | Sources self-destroy when empty. DND = `show-banners`.                                                 |
| 9a  | `DBusEventSource` exported, usable                                                                                   | confirmed               | Events carry only `id, date, end, summary`.                                                            |
| 9b  | LOCATION / DESCRIPTION available                                                                                     | **wrong**               | Not sent by the calendar server. Join links need ECal (typelibs are installed).                        |
| 9c  | `gnome-calendar --uuid`                                                                                              | confirmed               | Format `source_uid:comp_uid[:rid]`.                                                                    |
| 10  | `loadRemoteSearchProviders(searchSettings)`                                                                          | confirmed               | Filtering/sorting happens inside it. Provider classes are not exported.                                |
| 11  | ExtensionManager, `ExtensionState`, D-Bus methods, base classes                                                      | confirmed               | —                                                                                                      |
| 12a | `Shell.Screenshot` usable in-process                                                                                 | confirmed               | Already promisified by the shell.                                                                      |
| 12b | `--headless --wayland --virtual-monitor 1920x1080`                                                                   | confirmed               | All three flags exist in 50.5. `--nested` is gone; `--devkit` exists.                                  |
| 12c | D-Bus `Screenshot` / `Eval` callable by tools                                                                        | restricted              | Allow-list or `global.context.unsafe_mode = true`.                                                     |

## 1. Panel integration

Evidence:

- `statusArea = {}`, `menuManager`, `_leftBox/_centerBox/_rightBox`: `ui/panel.js:442-451`.
- User-mode layout `center: ['dateMenu']`: `ui/sessionMode.js:96-100`. The date menu is the only child of `_centerBox`, index 0.
- Insertion: `_updateBox` → `_addToPanelBox(role, indicator, i + nChildren, box)` → `container.show()` + `box.insert_child_at_index(container, position)`: `ui/panel.js:680-710`. `_updatePanel` runs on every `Main.sessionMode` `updated` (`:473-475`, `:634-655`), so a hidden `dateMenu.container` is shown again.
- `container` is an `St.Bin` wrapping the button: `ui/panelMenu.js:21`.
- Chrome params are only `trackFullscreen` and `affectsStruts`: `ui/layout.js:174-177`. `Params.parse` throws `Unrecognized parameter` for anything else: `misc/params.js:18-27`. There is no input-region code left in `layout.js`.
- `addChrome` `ui/layout.js:865-870` (below `global.top_window_group`), `addTopChrome` `:877-880` (top of `uiGroup`), `removeChrome` `:925-928`. The panel itself uses `addChrome(panelBox, {affectsStruts: true, trackFullscreen: true})` `:271-274`.
- `primaryMonitor` (`{x, y, width, height, index, geometryScale, inFullscreen}` or `null`): `ui/layout.js:407-412`. Signal `monitors-changed`: `:185`, emitted `:628`.
- Overview: `add_style_pseudo_class('overview')` on `showing`, removed on `hiding`: `ui/panel.js:461-466`. CSS `#panel:overview { background-color: transparent }`: `theme/gnome-shell-dark.css:1901-1902`. Panel has `transition-duration: 250ms` (`:1803-1807`).
- Overview signals `showing`, `shown`, `hiding`, `hidden`: `ui/overview.js:89-103`. `Main.overview` is a `Signals.EventEmitter`.
- Panel colours: dark `#000000` (`gnome-shell-dark.css:1804`), light `#fafafb` plus an inset bottom line (`gnome-shell-light.css:1803-1808`), high contrast `#000000`.
- `St.ThemeNode.get_background_color()` has one out param → returns a `Cogl.Color` directly: `gir/St-18.gir:3238`. `Clutter.Color` no longer exists.

Use this:

```ts
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// enable
const dateMenu = Main.panel.statusArea.dateMenu;            // undefined in modes without it
dateMenu?.container.hide();
dateMenu?.container.connectObject('notify::visible', c => c.hide(), this); // panel re-shows it
Main.layoutManager.addChrome(notch, {trackFullscreen: true});            // NOT affectsInputRegion
Main.layoutManager.connectObject('monitors-changed', () => this._reposition(), this);
Main.overview.connectObject('showing', ..., 'hiding', ..., this);
Main.panel.connectObject('style-changed', () => this._syncPanelColor(), this);

const mon = Main.layoutManager.primaryMonitor;               // may be null
const bg = Main.panel.get_theme_node().get_background_color(); // Cogl.Color {red,green,blue,alpha} 0-255

// disable
dateMenu?.container.disconnectObject(this);
dateMenu?.container.show();
Main.layoutManager.removeChrome(notch);
```

Notes:

- `get_background_color()` returns the target colour, not the value mid-transition. In the overview it is fully transparent; switch on the `showing`/`hiding` signals rather than polling.
- Recommendation on stacking: `addChrome` puts the notch at the panel's level, so modal dialogs, the screenshot UI and the on-screen keyboard cover it. `addTopChrome` would paint the notch above all of those. Raise it just above the panel with `Main.uiGroup.set_child_above_sibling(notch, Main.layoutManager.panelBox)`.
- With the date menu hidden, `_centerBox` is empty and the side boxes may grow under the notch (`ui/panel.js:498-546`). Put an empty placeholder of the notch's collapsed width into `_centerBox` at index 0.

## 2. Spring animation

Evidence:

- `set_progress_func` exists: `/usr/lib/mutter-18/Clutter-18.gir:60812`; callback returns `gdouble` (`:61398-61409`). `Clutter.AnimationMode.CUSTOM_MODE === 0`.
- GJS probe (gjs 1.88.1, standalone, `timeline.get_progress()` after `set_progress_func(() => v)`):

  | returned `v`     | 0.25 | 0.5 | 0.999 | 1      | 1.25   | 2.7    | −1.5 |
  | ---------------- | ---- | --- | ----- | ------ | ------ | ------ | ---- |
  | Clutter received | 0    | 0   | 0     | 5e-324 | 5e-324 | 1e-323 | NaN  |

  The return is truncated to an integer and written as raw bits. The function is unusable from JS.

- `ease()` only forwards `mode` to `set_easing_mode` (`ui/environment.js:144-208`); there is no hook for a function, so `CUSTOM_MODE` cannot work.
- `enable-animations=false`: `adjustAnimationTime` returns 0 unless `animationRequired` (`misc/animationUtils.js:23-33`); it is applied through the patched `set_easing_duration`/`set_easing_delay` (`ui/environment.js:333-340`). It also multiplies by `St.Settings.slow_down_factor`.
- `new-frame` signal: `(timeline, msecs: number)`; `stopped`: `(timeline, isFinished: boolean)`: `Clutter-18.gir:61183`, `:61220`.

Use this (not runtime-tested):

```ts
import Clutter from 'gi://Clutter';
import St from 'gi://St';

function springTo(actor: Clutter.Actor, w1: number, h1: number, durationMs: number) {
  const s = St.Settings.get();
  if (!s.enable_animations) {
    actor.set_size(w1, h1);
    return null;
  }
  const [w0, h0] = actor.get_size();
  const tl = new Clutter.Timeline({ actor, duration: durationMs * s.slow_down_factor });
  tl.connect('new-frame', (_t, ms) => {
    const p = spring(ms / (1000 * s.slow_down_factor)); // own damped-spring function, may exceed 1
    actor.set_size(w0 + (w1 - w0) * p, h0 + (h1 - h0) * p);
  });
  tl.connect('stopped', () => actor.set_size(w1, h1));
  tl.start();
  return tl; // keep it; call tl.stop() on retarget/disable
}
```

- The actor must be on the stage (the timeline takes its frame clock from `actor`).
- Pick `durationMs` as the spring's settling time. Stiffness 300, damping 26, mass 1 gives a damping ratio of 0.75 and decay rate 13/s: within 1 % after about 350 ms, 0.1 % after about 530 ms.
- Fallback without custom maths: `actor.ease({width, height, duration, mode: Clutter.AnimationMode.EASE_OUT_BACK})` gives one overshoot and honours `enable-animations` automatically.

## 3. Theme

Evidence:

- `St.Settings` properties (GJS probe): `enable-animations: boolean`, `color-scheme: St.SystemColorScheme {DEFAULT:0, PREFER_DARK:1, PREFER_LIGHT:2}`, `accent-color: St.SystemAccentColor {BLUE:0 … SLATE:8}`, `high-contrast: boolean`, `slow-down-factor: number`, `font-name`, `drag-threshold`.
- `St.ThemeContext.get_accent_color(out color, out fg_color)`: `gir/St-18.gir:3048-3060`. `St.ThemeContext` has a `changed` signal.
- `St.ThemeNode.lookup_color(property_name, inherit)` → `[found, Cogl.Color]`: `gir/St-18.gir:3588`.
- Shell stylesheet choice: `ui/main.js:439-472`. In the user session the variant is `light` **only** when `color-scheme` is `prefer-light`; `default` and `prefer-dark` both give `dark`. High contrast overrides both. Reloads on `notify::high-contrast` and `notify::color-scheme` (`:176-177`).
- Extension stylesheets: `ui/extensionSystem.js:124-149`. Candidates in order: `<sessionMode>-<variant>.css`, `stylesheet-<variant>.css`, `<sessionMode>.css`, `stylesheet.css`; the first that exists is loaded and the loop **breaks**. Reload on `notify::color-scheme` only if the loaded file ends in `-dark.css` or `-light.css` (`:44-45`, `:102-121`).
- CSS functions present in the stock theme and in `libst-18.so`: `st-mix(a, b, pct)`, `st-transparentize(c, amount)`, `st-lighten(c, pct)`, `st-darken(c, pct)`; colour keywords `-st-accent-color`, `-st-accent-fg-color`; `rgba()`, hex, `transparent`. No `var()`, `color-mix()`, `hsl()` in theme or library strings.
- Per-corner radius: `border-radius: 999px 0 0 999px` (`gnome-shell-dark.css:2078`). `box-shadow` outer (`:928`) and `inset` (`:1815`). `transition-duration` is the only transition property.

Use this:

```ts
import St from 'gi://St';

const settings = St.Settings.get();
const ctx = St.ThemeContext.get_for_stage(global.stage);
const [accent, accentFg] = ctx.get_accent_color(); // Cogl.Color, channels 0-255
settings.connectObject(
  'notify::accent-color',
  () => this._restyle(),
  'notify::color-scheme',
  () => this._restyle(),
  'notify::high-contrast',
  () => this._restyle(),
  this,
);

const css = (c: Cogl.Color, a = c.alpha / 255) => `rgba(${c.red},${c.green},${c.blue},${a})`;
actor.set_style(`background-color: ${css(accent, 0.2)};`); // dynamic colours: inline style
```

- Static accent use belongs in the stylesheet: `background-color: st-transparentize(-st-accent-color, 0.8);`. It follows accent changes without any JS.
- Do not map the `accent-color` GSettings string or the enum to colours by hand. This machine reports `'maia'` (`St.SystemAccentColor.MAIA = 108`, a distro patch).
- Because only one stylesheet is loaded, either ship one `stylesheet.css` and drive light/dark with a class set from JS, or generate complete `stylesheet-dark.css` and `stylesheet-light.css` at build time. High contrast must be handled with a JS-set class.
- `transition-duration` cross-fades painted state (background, border, shadow) on style changes; it does not animate size.

## 4. Clock

Evidence: `ui/dateMenu.js:865-887` (label and box), `:971-973` (clock binding). `WallClock` properties: `clock: string`, `timezone: GLib.TimeZone`, `time-only`, `force-seconds` (GJS probe, GnomeDesktop 4.0).

```ts
import GnomeDesktop from 'gi://GnomeDesktop?version=4.0';
import GObject from 'gi://GObject';

this._clock = new GnomeDesktop.WallClock(); // {time_only: true} drops the date
this._clock.bind_property('clock', label, 'text', GObject.BindingFlags.SYNC_CREATE);
// or: this._clock.connectObject('notify::clock', () => ..., this);
// disable: this._clock.run_dispose() or drop all references and handlers
```

The string already follows `org.gnome.desktop.interface clock-format`, `clock-show-date`, `clock-show-seconds`, `clock-show-weekday`. Stock label style: `style_class: 'clock'`, `clutter_text.ellipsize = Pango.EllipsizeMode.NONE`.

## 5. Keybindings

Evidence:

- `addKeybinding(name, settings, flags, modes, handler)` → action id; `removeKeybinding(name)`; `setCustomKeybindingHandler(name, modes, handler)`: `ui/windowManager.js:1101-1120`.
- Shell registration: `ui/windowManager.js:747-752` — `addKeybinding('toggle-message-tray', new Gio.Settings({schema_id: 'org.gnome.shell.keybindings'}), Meta.KeyBindingFlags.IGNORE_AUTOREPEAT, NORMAL | OVERVIEW | POPUP, this._toggleCalendar.bind(this))`.
- `_toggleCalendar() { Main.panel.toggleCalendar(); }`: `:1741-1743`. `toggleCalendar` does nothing when the date menu is not mapped: `ui/panel.js:580-605`.
- Schema default `["<Super>v","<Super>m"]`: `/usr/share/glib-2.0/schemas/org.gnome.shell.gschema.xml:199-200`.
- Filtering by action mode: `ui/windowManager.js:1617-1630`.
- `Main.panel.closeCalendar()` is called from nine places (notification activation, screenshot UI, extension update, network): e.g. `ui/main.js:860`, `ui/messageList.js:817`.

Use this — take over the existing binding without touching GSettings or re-registering anything:

```ts
// enable
Main.panel.toggleCalendar = () => this._visor.toggle(); // instance property shadows the prototype
Main.panel.closeCalendar = () => this._visor.close();
// disable
delete Main.panel.toggleCalendar;
delete Main.panel.closeCalendar;
```

- This follows whatever accelerators the user has for "Show the notification list", and keeps the shell's action modes. To let the shortcut close Visor while it is open, the modal must use `Shell.ActionMode.POPUP` (section 6).
- For an additional Visor-only shortcut: `Main.wm.addKeybinding('visor-toggle', this.getSettings(), Meta.KeyBindingFlags.IGNORE_AUTOREPEAT, Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW | Shell.ActionMode.POPUP, () => ...)` and `Main.wm.removeKeybinding('visor-toggle')`. Ship it with default `[]`; a second binding on `<Super>v` would collide with the shell's own.

## 6. Modal and focus

Evidence:

- `pushModal(actor, params = {})` → `Clutter.Grab`; only param is `actionMode` (default `NONE`, which blocks all keybindings); sets key focus to `actor`: `ui/main.js:697-739`. `popModal(grab)`: `:748-801`; throws `incorrect pop` for an unknown grab.
- `PopupMenuManager`: `ui/popupMenu.js:1434-1570`. Default grab params `{actionMode: Shell.ActionMode.POPUP}` (`:1436-1437`). On open it calls `pushModal(menu.actor, …)` (`:1485`). In `captured-event` on `menu.actor`: Escape closes (`:1532-1534`); press or touch outside `actor` closes (`:1542-1546`); pointer entering another managed menu's `sourceActor` switches menus (`:1536-1541`).
- Minimal menu shape accepted by the manager: `PopupDummyMenu`, `ui/popupMenu.js:1128-1164` (`sourceActor`, `actor`, `actor._delegate`, `isOpen`, `open()`, `close()`, `toggle()`, signals `open-state-changed(bool)`, `destroy`).
- `GrabHelper` (`ui/grabHelper.js:113-183`) does the same with a `Clutter.ClickGesture`; it adds nothing Visor needs.

Use this (not runtime-tested):

```ts
import * as Signals from 'resource:///org/gnome/shell/misc/signals.js';

class VisorMenu extends Signals.EventEmitter {
  isOpen = false;
  constructor(
    public sourceActor: Clutter.Actor,
    public actor: Clutter.Actor,
  ) {
    super();
    (actor as any)._delegate = this; // manager reads actor._delegate
  }
  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.emit('open-state-changed', true);
  }
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.emit('open-state-changed', false);
  }
  toggle() {
    this.isOpen ? this.close() : this.open();
  }
  destroy() {
    this.close();
    this.emit('destroy');
  }
}

Main.panel.menuManager.addMenu(menu); // enable
menu.connect('open-state-changed', (_m, open) => {
  if (open) entry.grab_key_focus(); // after the manager's pushModal
  Main.messageTray.bannerBlocked = open; // as ui/panel.js:748-749 does
});
Main.panel.menuManager.removeMenu(menu); // disable (pops the modal if open)
```

- `actor` must be reactive and contain every interactive child; it is the grab root. `sourceActor` is the notch (may be the same actor).
- Runtime-tested: while the grab is held, a key event goes from the key focus up to the grab root and only through
  reactive actors; the stage never sees it. `St.FocusManager` handles Tab and the arrow keys in a handler on the
  stage, so under the grab a reactive actor inside has to call `navigate_from_event()` itself (as `PopupMenu` does).
- `open`/`close` are called with a `BoxPointer.PopupAnimation` argument; ignore it.
- Result: Esc and click-outside close Visor; hovering another panel button while Visor is open switches to that menu and vice versa, as with the stock date menu. A click outside is consumed by the grab; it closes Visor but does not reach the window or button underneath (same as stock menus).
- Self-contained fallback: `const grab = Main.pushModal(actor, {actionMode: Shell.ActionMode.POPUP})`, handle Escape and outside presses in `actor`'s `captured-event` with `!actor.contains(global.stage.get_event_actor(event))`, then `Main.popModal(grab)`.

## 7. MPRIS

Evidence: `ui/mpris.js` (258 lines).

- `export const MprisPlayer` (`:20`), `constructor(busName)`. Property `can-play`. Signal `changed`. Getters: `canPlay`, `status` (`'Playing' | 'Paused' | 'Stopped'`), `trackArtists: string[]`, `trackTitle`, `trackCoverUrl`, `app: Shell.App | null`, `canGoNext`, `canGoPrevious`; field `source` (`MessageList.Source` with `title`, `icon`). Methods: `playPause()`, `next()`, `previous()`, `raise()`.
- `export const MprisSource` (`:192`), no constructor args. Getter `players` (only those with `canPlay`). Signals `player-added(MprisPlayer)`, `player-removed(MprisPlayer)`.
- The embedded interface has only `PlayPause, Next, Previous, CanGoNext, CanGoPrevious, CanPlay, Metadata, PlaybackStatus`: `dbus-interfaces/org.mpris.MediaPlayer2.Player.xml`. No `Position`, `Seek`, `SetPosition`, `Seeked`, `Rate`, `Shuffle`, `Volume`. `mpris:length` is not extracted from `Metadata`.
- `MprisSource` has no `destroy()`; its `NameOwnerChanged` subscription and each player's proxies cannot be released from outside.
- The stock message list owns a private instance: `ui/messageList.js:1506`, players are shown as `MediaMessage` rows (`:1784-1805`).

Use this: write an own module (clean teardown, full interface).

```ts
// Gio.DBusProxy on org.mpris.MediaPlayer2.Player, path /org/mpris/MediaPlayer2
// Discover: org.freedesktop.DBus ListNames + NameOwnerChanged, prefix 'org.mpris.MediaPlayer2.'
// State:    g-properties-changed → PlaybackStatus, Metadata (xesam:title, xesam:artist as, mpris:artUrl, mpris:length x µs)
// Position: not announced via PropertiesChanged. Poll org.freedesktop.DBus.Properties.Get(iface, 'Position')
//           once per second while playing and visible; resync on the 'Seeked' signal.
// App:      org.mpris.MediaPlayer2.DesktopEntry → Shell.AppSystem.get_default().lookup_app(`${entry}.desktop`)
```

Copy the metadata validation from `ui/mpris.js:124-170`; players send malformed values.

## 8. Notifications

Evidence (`ui/messageTray.js` unless noted):

- `NotificationDestroyedReason {EXPIRED:1, DISMISSED:2, SOURCE_CLOSED:3, REPLACED:4}` `:48-53`; `Urgency {LOW:0, NORMAL:1, HIGH:2, CRITICAL:3}` `:59-64`.
- `Notification` `:355-505`, properties `:630-690`: `source`, `title`, `body`, `use-body-markup`, `gicon`, `icon-name`, `sound`, `datetime` (`GLib.DateTime`), `privacy-scope`, `urgency`, `acknowledged`, `resident`, `for-feedback`, `is-transient`. Getter `actions` → `Action[]` (`label`, `activate()`). Methods `addAction(label, callback)`, `removeAction`, `clearActions`, `activate()`, `destroy(reason = DISMISSED)`. Signals `action-added`, `action-removed`, `activated`, `destroy(reason)`.
- `Source` `:507-627` (extends `MessageList.Source`: `title`, `icon`, `icon-name`, `ui/messageList.js:282-308`): `notifications[]`, `count`, `unseenCount`, `policy`, `addNotification(n)`, `destroy(reason)`, `open()`. Signals `notification-added`, `notification-removed`, `notification-request-banner`, `destroy`. Max 10 notifications per source (`:25`). A source **destroys itself** when its last notification goes (`:575-576`).
- Daemon sources also have `.app` (`Shell.App`): `ui/notificationDaemon.js:326-332`, `:498`.
- Tray: `add(source)` `:860-874`, `getSources()` `:893-895`, signals `source-added`, `source-removed`, `queue-changed` `:703-706`.
- Banner rules `:927-958`: none for `acknowledged`, `Urgency.LOW`, or when `!policy.showBanners` unless `CRITICAL`.
- DND: `org.gnome.desktop.notifications show-banners` (`false` = DND). Quick-settings toggle binds it inverted: `ui/status/doNotDisturb.js:18-20`.
- Sound: `play_from_theme(name: string, description: string, cancellable: Gio.Cancellable | null): void` — `/usr/lib/mutter-18/Meta-18.gir` (`MetaSoundPlayer`), used at `:328-331`.
- Stock list: `MessageView` creates one `NotificationMessageGroup` per tray source (`ui/messageList.js:1807-1830`). MPRIS rows come from its own `MprisSource` and are not tray sources.

Use this:

```ts
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

// read
for (const src of Main.messageTray.getSources()) this._track(src);
Main.messageTray.connectObject('source-added', (_t, s) => this._track(s),
                               'source-removed', (_t, s) => this._untrack(s), this);
src.connectObject('notification-added', (_s, n) => ..., 'notification-removed', (_s, n) => ..., this);
n.activate();  n.destroy(MessageTray.NotificationDestroyedReason.DISMISSED);  n.acknowledged = true;

// own source (Timer); recreate after it self-destroys, pattern from messageTray.js:1322-1337
if (!this._source) {
    this._source = new MessageTray.Source({title: 'Visor', iconName: 'alarm-symbolic'});
    this._source.connect('destroy', () => { this._source = null; });
    Main.messageTray.add(this._source);
}
const n = new MessageTray.Notification({source: this._source, title, body, urgency: MessageTray.Urgency.HIGH});
n.addAction(_('Restart'), () => ...);
this._source.addNotification(n);

global.display.get_sound_player().play_from_theme('complete', _('Timer finished'), null);
```

## 9. Calendar

Evidence:

- `export const DBusEventSource`: `ui/calendar.js:207`. Base class contract `:91-137`. Methods `requestRange(begin: Date, end: Date)` `:369-377`, `getEvents(begin, end)` → sorted `CalendarEvent[]` `:386-396`, `hasEvents(day)` `:398-404`, `destroy()` `:264-266`. Properties `hasCalendars`, `isLoading`. Signal `changed`.
- `CalendarEvent {id, date: Date, end: Date, summary}`: `:79-86`.
- Interface: `dbus-interfaces/org.gnome.Shell.CalendarServer.xml` — `SetTimeRange(x since, x until, b force_reload)`, signals `EventsAddedOrUpdated(a(ssxxa{sv}))`, `EventsRemoved(as)`, `ClientDisappeared(s)`, property `HasCalendars`.
- The tuple is `(id, summary, start, end, extras)`. The shell ignores the fifth field (`:311`), and `/usr/lib/gnome-shell-calendar-server` only references `i_cal_component_get_summary` and `get_uid` — no location or description accessors. The dict is empty.
- Event id is `source_uid\ncomp_uid\n[rid]`: `:315-322`, `:343-345`.
- ECal path: `ECal-2.0`, `EDataServer-1.2`, `ICalGLib-4.0` typelibs are in `/usr/lib/girepository-1.0`. Async entry points exist (GJS probe): `EDataServer.SourceRegistry.new`, `ECal.Client.connect`, `ECal.Client.prototype.get_object`; `ICalGLib.Component.get_location()` and `get_description()` return the strings.
- `gnome-calendar --help-all`: `-u, --uuid` ("open calendar at the given event") and `-d, --date`. The binary contains `get_uuid_from_component` and the format `%s:%s:%s`.

Use this:

```ts
import * as Calendar from 'resource:///org/gnome/shell/ui/calendar.js';

this._events = new Calendar.DBusEventSource();
this._events.connectObject('changed', () => this._refresh(), 'notify::has-calendars', ..., this);
this._events.requestRange(begin, end);                       // Date objects; triggers SetTimeRange
const events = this._events.getEvents(begin, end);
this._events.destroy();                                      // disable

const [sourceUid, compUid, rid] = event.id.split('\n');
const uuid = rid ? `${sourceUid}:${compUid}:${rid}` : `${sourceUid}:${compUid}`;
Gio.AppInfo.create_from_commandline(`gnome-calendar --uuid ${GLib.shell_quote(uuid)}`, null,
    Gio.AppInfoCreateFlags.NONE).launch([], global.create_app_launch_context(0, -1));
```

Recommendation for the Join button: keep `DBusEventSource` for the list. For Join links, load ECal lazily and only for the next few events, fully async, behind a dynamic import so a missing typelib degrades to "no button":

```ts
const { default: EDataServer } = await import('gi://EDataServer?version=1.2');
const { default: ECal } = await import('gi://ECal?version=2.0');
// registry = await EDataServer.SourceRegistry.new(cancellable)      (promisify first)
// client   = await ECal.Client.connect(registry.ref_source(sourceUid), ECal.ClientSourceType.EVENTS, 5, cancellable)
// comp     = await client.get_object(compUid, rid ?? null, cancellable)   → ICalGLib.Component
// scan comp.get_location(), comp.get_description(), URL and X-GOOGLE-CONFERENCE properties
```

This pulls libecal/libical into the shell process, which the shell itself avoids (hence the separate calendar server). Never use the `_sync` variants. The two-part `--uuid` form is inferred from the three-part format string; confirm once by hand.

## 10. Search

Evidence:

- `export function loadRemoteSearchProviders(searchSettings: Gio.Settings)` → provider array: `ui/remoteSearch.js:71-189`. Returns `[]` when `disable-external` is set (`:141-142`). Filters with `disabled` / `enabled` (per `DefaultDisabled`) and sorts by `sort-order`, then by name (`:147-186`). `search.js` only reloads on changes: `ui/search.js:630-657`.
- `RemoteSearchProvider` `:191-316` and `RemoteSearchProvider2` `:318-334` are **not exported**. Instance shape: `appInfo` (`GioUnix.DesktopAppInfo`), `id`, `isRemoteProvider = true`, `canLaunchSearch` (v2 only), `defaultEnabled`, `proxy`.
  - `getInitialResultSet(terms: string[], cancellable)` → `Promise<string[]>` (errors are swallowed, returns `[]`).
  - `getSubsearchResultSet(previousResults, terms, cancellable)` → `Promise<string[]>`.
  - `getResultMetas(ids, cancellable)` → `Promise<{id, name, description, createIcon(size), clipboardText}[]>`.
  - `activateResult(id, terms)`, `launchSearch(terms)`, `filterResults(results, max)`, `createIcon(size, meta)`.
- Activation and clipboard as the shell does it: `ui/search.js:59-68`.
- Apps: `Shell.AppSystem.search(query)` is a **static** function returning `string[][]` (groups of desktop ids, best group first): `gir/Shell-18.gir:351`. `AppSearchProvider` keeps the group order and sorts inside each group with `Shell.AppUsage.get_default().compare(a, b)`: `ui/appDisplay.js:1813-1825`; `maxResults = 6`.
- Launch: `app.open_new_window(-1)` or `app.activate()`: `ui/appDisplay.js:3055-3074`.

Use this:

```ts
import * as RemoteSearch from 'resource:///org/gnome/shell/ui/remoteSearch.js';
import Shell from 'gi://Shell';
import St from 'gi://St';

const searchSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.search-providers' });
let providers = RemoteSearch.loadRemoteSearchProviders(searchSettings); // reload on changed::disabled|enabled|sort-order|disable-external

const ids = await provider.getInitialResultSet(terms, cancellable);
const metas = await provider.getResultMetas(provider.filterResults(ids, 5), cancellable);
provider.activateResult(meta.id, terms);
if (meta.clipboardText)
  St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, meta.clipboardText);

const appSys = Shell.AppSystem.get_default();
const usage = Shell.AppUsage.get_default();
const appIds = Shell.AppSystem.search(terms.join(' ')).flatMap((g) =>
  g.sort((a, b) => usage.compare(a, b)),
);
const app = appSys.lookup_app(appIds[0]); // Shell.App | null
app.get_name();
app.get_icon(); /* Gio.Icon */
app.create_icon_texture(32);
app.activate(); // or app.open_new_window(-1)
```

Each call to `loadRemoteSearchProviders` creates a new `Gio.DBusProxy` per provider. Call it once and again only on settings changes. Cancel the previous `Gio.Cancellable` on every keystroke.

## 11. Extensions

Evidence:

- `Main.extensionManager.lookup(uuid)`: `ui/extensionSystem.js:95-97`. Object shape `{metadata, uuid, type, dir, path, error, hasPrefs, enabled, hasUpdate, canChange, sessionModes}` (`:379-397`) plus `state`, `stateObj` (`:520`), `stylesheet`, `isImported`. `undefined` when unknown.
- Signal `extension-state-changed(extension)`: `:160-166`. `ExtensionManager` is a `Signals.EventEmitter`.
- `ExtensionState {ACTIVE:1, INACTIVE:2, ERROR:3, OUT_OF_DATE:4, DOWNLOADING:5, INITIALIZED:6, DEACTIVATING:7, ACTIVATING:8, UNINSTALLED:99}`: `misc/extensionUtils.js:15-28`.
- D-Bus `org.gnome.Shell.Extensions` at `org.gnome.Shell` `/org/gnome/Shell` (`ui/shellDBus.js:417-420`): `InstallRemoteExtension(s uuid) → s` (`'successful'` or `'cancelled'`, shows a confirmation dialog, fails if `allow-extension-installation` is off: `ui/extensionDownloader.js:32-68`, `:295`, `:328`); `OpenExtensionPrefs(s uuid, s parent_window, a{sv} options)`; also `EnableExtension`, `DisableExtension`, `GetExtensionInfo`, `ListExtensions`.
- Base classes: `Extension` (`extensions/extension.js:7-29`) with `enable()`, `disable()`, `openPreferences()`, static `lookupByUUID`; exports `gettext`, `ngettext`, `pgettext`, `InjectionManager`. `ExtensionBase` (`extensions/sharedInternals.js:9-190`): `metadata`, `uuid`, `dir`, `path`, `getSettings(schema?)`, `getLogger()`, `initTranslations(domain?)` (already called in the constructor), `gettext/ngettext/pgettext`. Constructor receives `{...metadata, dir, path}` (`ui/extensionSystem.js:514`).
- Prefs: `ExtensionPreferences` with `fillPreferencesWindow(window: Adw.PreferencesWindow)` or `getPreferencesWidget()`: `.shell-src/org/gnome/Shell/Extensions/js/extensions/prefs.js:7-58`.

Use this:

```ts
import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {ExtensionState} from 'resource:///org/gnome/shell/misc/extensionUtils.js';

const ext = Main.extensionManager.lookup(uuid);
const active = ext?.state === ExtensionState.ACTIVE;
Main.extensionManager.connectObject('extension-state-changed', (_m, e) => ..., this);
Main.extensionManager.openExtensionPrefs(uuid, '', {});      // or this.openPreferences() for our own

Gio.DBus.session.call('org.gnome.Shell', '/org/gnome/Shell', 'org.gnome.Shell.Extensions',
    'InstallRemoteExtension', new GLib.Variant('(s)', [uuid]), null,
    Gio.DBusCallFlags.NONE, -1, null);                        // async; result '(s)'
```

## 12. Misc

- **Animations:** `St.Settings.get().enable_animations` (boolean, `notify::enable-animations`); see section 2.
- **Screenshot in-process:** `Shell.Screenshot.prototype.screenshot(include_cursor: boolean, stream: Gio.OutputStream)` (`gir/Shell-18.gir:1768`), promisified by the shell at `ui/screenshot.js:18-24`; finish has an out param `area: Mtk.Rectangle` (`gir/Shell-18.gir:1828`) that the shell ignores. Stream creation as in `ui/screenshot.js:2579-2580`.

  ```ts
  const file = Gio.File.new_for_path(path);
  const stream = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
  await new Shell.Screenshot().screenshot(false, stream);
  stream.close(null);
  ```

  Also available: `screenshot_area(x, y, w, h, stream)`, `screenshot_window(include_frame, include_cursor, stream)`.

- **D-Bus `org.gnome.Shell.Screenshot`:** allowed senders are `org.gnome.SettingsDaemon.MediaKeys` and `org.freedesktop.impl.portal.desktop.gnome` (`ui/screenshot.js:2489-2492`). Everyone else gets `ACCESS_DENIED` unless `global.context.unsafe_mode` is true (`misc/util.js:399-409`).
- **D-Bus `org.gnome.Shell.Eval`:** returns `(false, '')` unless `global.context.unsafe_mode` (`ui/shellDBus.js:71-75`). There is no command-line flag for it; in a throwaway test session set `global.context.unsafe_mode = true` from code that already runs in the shell.
- **Headless flags** (`gnome-shell --help-all`, 50.5): `--wayland`, `--no-x11`, `--wayland-display`, `--display-server`, `--headless`, `--virtual-monitor` (`WxH` or `WxH@R`), `--devkit`, `--debug-control`, `--mode`, `--force-animations`. `--nested` is not listed. `gnome-shell --headless --wayland --virtual-monitor 1920x1080` is valid; `--no-x11` avoids starting Xwayland. Not executed here.

## Deviations from the plan

1. **`affectsInputRegion`** does not exist and makes `addTopChrome`/`addChrome` throw. Use `{trackFullscreen: true}`. Prefer `addChrome` and raise above `panelBox` (section 1).
2. **Spring via `set_progress_func`** is broken under GJS 1.88 (return value mangled). Use `Clutter.Timeline` + `new-frame` and compute the spring in JS; read `St.Settings.enable_animations` and `slow_down_factor` yourself.
3. **Accent colour:** `St.Settings.accent_color` is an enum, not a colour. Use `St.ThemeContext.get_for_stage(global.stage).get_accent_color()` in JS and `-st-accent-color` in CSS; react to `St.Settings` `notify::accent-color`.
4. **Stylesheet variants** are exclusive, not layered. Either one `stylesheet.css` plus JS-set classes, or two complete generated files. High contrast needs JS.
5. **Panel transparency in the overview** is the pseudo class `:overview`, not a style class.
6. **Super+V takeover:** the shell uses `addKeybinding`, not `setCustomKeybindingHandler`. Override `Main.panel.toggleCalendar` / `closeCalendar` on the instance and `delete` them on disable. Do not write to `org.gnome.shell.keybindings`.
7. **MPRIS:** `ui/mpris.js` lacks position, length, seek and teardown. Implement an own proxy (the plan's fallback becomes the main path).
8. **Calendar LOCATION/DESCRIPTION** are not available over `org.gnome.Shell.CalendarServer`. Join buttons need lazy async ECal access, or are dropped for v1.
9. **Search provider classes** are not exported; only use instances returned by `loadRemoteSearchProviders`. Filtering by `org.gnome.desktop.search-providers` happens inside that function.
10. **Modal handling:** register a duck-typed menu with `Main.panel.menuManager` instead of hand-rolling `pushModal`; it provides Esc, click-outside and hover-switching with other panel menus.
11. **`Clutter.Color`** is gone; all colours are `Cogl.Color`.

## Risks seen on this machine

- `org.gnome.shell.keybindings toggle-message-tray` is `['<Shift><Control><Super>i']` here, and the enabled extension `copyous@boerdereinar.dev` binds `<Super>v`. With the recommended takeover, Super+V will not open Visor on this machine until the user changes one of the two.
- The accent colour is the non-standard `'maia'`; any hard-coded accent table would miss it.
- `color-scheme` is `prefer-dark`, and `user-theme` plus `legacyschemeautoswitcher` are enabled, so the panel colour may not match the stock values in section 1. Always read it from the theme node.
- Notification banners appear top-centre directly under the panel (`ui/messageTray.js:724-735`, alignment set in `ui/panel.js:641-647`) and will overlap the notch. Block them while Visor is open; the collapsed state needs a design decision.
- Sections 2 and 6 are source-derived and need a first runtime check in the headless shell.

## Decisions taken from this

The plan in `docs/design/plan/` was edited where an assumption turned out wrong. What Visor does instead:

| Topic          | Decision                                                                                                                 | Why                                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Chrome         | `addChrome(actor, {trackFullscreen: true})`, raised just above `panelBox`                                                | `affectsInputRegion` throws; top chrome would paint above modal dialogs and the screenshot UI                                                   |
| Spring         | `Clutter.Timeline` + `new-frame`, spring computed in `core/motion.ts`                                                    | `set_progress_func` is unusable from GJS                                                                                                        |
| Stylesheet     | One `stylesheet.css`. `core/theme.ts` sets `visor-dark` / `visor-light` (from the luminance of the panel) and `visor-hc` | Variants are exclusive and follow the colour scheme, but Visor follows the colour of the panel                                                  |
| Accent         | `-st-accent-color` in CSS, `ThemeContext.get_accent_color()` where JS needs the value                                    | The setting is an enum, and distros add values                                                                                                  |
| Shortcut       | Take over `Main.panel.toggleCalendar` / `closeCalendar` while enabled; extra own shortcut `open-shortcut`, default empty | Follows the user's shortcut for the notification list (default Super+V, Super+M) without writing to foreign settings                            |
| Modal          | Duck-typed menu registered with `Main.panel.menuManager`                                                                 | Esc, click outside and switching to other panel menus behave like stock menus                                                                   |
| Media          | Own MPRIS proxy                                                                                                          | `ui/mpris.js` has no position, length or teardown                                                                                               |
| Join links     | Lazy async ECal access, only with the panel open and an event inside the join window                                     | The calendar server does not send location or description                                                                                       |
| Headless tests | Sandbox (`scripts/nested.sh`) and a separate test helper extension exporting `io.github.taulit.Visor.Debug`              | `gnome-extensions install/enable` would write to the real session; D-Bus `Eval`/`Screenshot` are closed to tools; Visor must ship no debug code |
| Store ZIP      | Plain `zip` of `build/`                                                                                                  | `gnome-extensions pack` does not handle the nested output of `tsc` well and would need gnome-shell in CI                                        |

Open design question for V2: notification banners appear top-centre right under the panel and would cover
the peek state. To be settled with a runtime test when the notifications module is built.
