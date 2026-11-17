// Test-only helper, loaded by scripts/nested.sh inside the sandboxed headless
// shell. It exports io.github.taulit.Visor.Debug so the test scripts can drive
// the shell and take screenshots. Visor itself ships no debug code.
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as LoginManager from 'resource:///org/gnome/shell/misc/loginManager.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const VISOR_UUID = 'visor@taulit.github.io';

const IFACE = `
<node>
  <interface name="io.github.taulit.Visor.Debug">
    <method name="Eval">
      <arg type="s" direction="in" name="script"/>
      <arg type="b" direction="out" name="success"/>
      <arg type="s" direction="out" name="result"/>
    </method>
    <method name="Screenshot">
      <arg type="s" direction="in" name="path"/>
    </method>
  </interface>
</node>`;

// The handlers connected to one object, as {signal: count}. A GObject is
// asked signal by signal (blocking and unblocking them counts them); the
// emitters of the shell that are no GObject keep a list by name.
function handlerCounts(object) {
  const counts = {};
  if (!object) return counts;
  if (!(object instanceof GObject.Object)) {
    for (const [name, ids] of Object.entries(object._signalConnectionsByName ?? {}))
      if (ids.length) counts[name] = ids.length;
    return counts;
  }
  const seen = new Set();
  for (let type = object.constructor.$gtype; GObject.type_name(type);) {
    for (const owner of [type, ...GObject.type_interfaces(type)]) {
      for (const id of GObject.signal_list_ids(owner)) {
        if (seen.has(id)) continue;
        seen.add(id);
        const match = { signalId: GObject.signal_name(id) };
        const found = GObject.signal_handlers_block_matched(object, match);
        if (!found) continue;
        GObject.signal_handlers_unblock_matched(object, match);
        counts[match.signalId] = found;
      }
    }
    if (GObject.type_name(type) === 'GObject') break;
    type = GObject.type_parent(type);
  }
  return counts;
}

// The handlers on the objects of the shell that Visor connects to and that
// outlive it, as {"object:signal": count}, for the leak tests: a handler Visor
// leaves behind stays on one of them.
function signalCounts() {
  const dateMenu = Main.panel.statusArea.dateMenu;
  const objects = {
    panel: Main.panel,
    panelLeft: Main.panel._leftBox,
    panelCenter: Main.panel._centerBox,
    panelRight: Main.panel._rightBox,
    layoutManager: Main.layoutManager,
    panelBox: Main.layoutManager.panelBox,
    uiGroup: Main.layoutManager.uiGroup,
    messageTray: Main.messageTray,
    overview: Main.overview,
    sessionMode: Main.sessionMode,
    wm: Main.wm,
    display: global.display,
    stage: global.stage,
    windowManager: global.window_manager,
    workspaceManager: global.workspace_manager,
    shellSettings: global.settings,
    dateMenu,
    dateMenuContainer: dateMenu?.container,
    dateMenuMenu: dateMenu?.menu,
    wallClock: dateMenu?._clock,
    themeContext: St.ThemeContext.get_for_stage(global.stage),
    stSettings: St.Settings.get(),
    appSystem: Shell.AppSystem.get_default(),
    windowTracker: Shell.WindowTracker.get_default(),
    network: Gio.NetworkMonitor.get_default(),
    loginManager: LoginManager.getLoginManager(),
  };
  const counts = {};
  for (const [name, object] of Object.entries(objects)) {
    for (const [signal, count] of Object.entries(handlerCounts(object)))
      counts[`${name}:${signal}`] = count;
  }
  return counts;
}

export default class VisorTestHelper extends Extension {
  enable() {
    globalThis.visorSignalCounts = signalCounts;
    this._dbus = Gio.DBusExportedObject.wrapJSObject(IFACE, this);
    this._dbus.export(Gio.DBus.session, '/io/github/taulit/Visor/Debug');
    this._nameId = Gio.bus_own_name_on_connection(
      Gio.DBus.session,
      'io.github.taulit.Visor.Debug',
      Gio.BusNameOwnerFlags.NONE,
      null,
      null,
    );
  }

  disable() {
    delete globalThis.visorSignalCounts;
    Gio.bus_unown_name(this._nameId);
    this._dbus.unexport();
    this._dbus = null;
  }

  // The script is an expression. `visor` is the running Visor extension
  // object (or null); a returned promise is awaited.
  async EvalAsync([script], invocation) {
    try {
      const visor = Main.extensionManager.lookup(VISOR_UUID)?.stateObj ?? null;
      const run = new Function(
        'Main',
        'St',
        'Clutter',
        'Gio',
        'GLib',
        'Shell',
        'Meta',
        'visor',
        `return (${script});`,
      );
      const value = await run(Main, St, Clutter, Gio, GLib, Shell, Meta, visor);
      const json = JSON.stringify(value);
      invocation.return_value(new GLib.Variant('(bs)', [true, json ?? '']));
    } catch (e) {
      invocation.return_value(new GLib.Variant('(bs)', [false, `${e}\n${e.stack ?? ''}`]));
    }
  }

  ScreenshotAsync([path], invocation) {
    const file = Gio.File.new_for_path(path);
    const stream = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
    const shooter = new Shell.Screenshot();
    shooter.screenshot(false, stream, (source, result) => {
      try {
        source.screenshot_finish(result);
        stream.close(null);
        invocation.return_value(null);
      } catch (e) {
        invocation.return_gerror(e);
      }
    });
  }
}
