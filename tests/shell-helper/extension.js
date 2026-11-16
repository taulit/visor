// Test-only helper, loaded by scripts/nested.sh inside the sandboxed headless
// shell. It exports io.github.taulit.Visor.Debug so the test scripts can drive
// the shell and take screenshots. Visor itself ships no debug code.
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
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

export default class VisorTestHelper extends Extension {
  enable() {
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
