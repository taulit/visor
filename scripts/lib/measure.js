// Helpers for scripts/measure.sh. Test tooling, not shipped: evaluated in the
// sandboxed shell through shell_eval, which has the globals below in scope.
/* global Main, Gio, GLib, imports */
globalThis.visorMeasure = (() => {
  const UUID = 'visor@taulit.github.io';
  const GObject = imports.gi.GObject;
  const now = () => GLib.get_monotonic_time();
  const wait = ms =>
    new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => (r(true), false)));
  const ext = () => Main.extensionManager.lookup(UUID).stateObj;
  const M = { wait, counts: new Map(), counting: false };

  // --- idle: who runs code of Visor? ---
  // Every way Visor can be called back by the main loop is wrapped: timeouts
  // and idle sources of GLib, GObject signal handlers and D-Bus signal
  // subscriptions. A callback counts as Visor's when it was created with code
  // of the extension on the stack. Visor is enabled after the wrappers are in
  // place, so all of its sources go through them.
  const site = () => {
    // No backslash in this file: gdbus reads escapes in the script it passes on.
    const frame = new Error().stack
      .split(String.fromCharCode(10))
      .find(line => line.includes(`${UUID}/`));
    return frame ? frame.slice(frame.indexOf(UUID) + UUID.length + 1).trim() : null;
  };
  const counted = (kind, fn) => {
    const where = site();
    if (!where || typeof fn !== 'function') return fn;
    return function (...args) {
      if (M.counting) {
        const key = `${kind} ${where}`;
        M.counts.set(key, (M.counts.get(key) ?? 0) + 1);
      }
      return fn.apply(this, args);
    };
  };
  M.wrap = () => {
    if (M.wrapped) return true;
    M.wrapped = true;
    const { timeout_add, timeout_add_seconds, idle_add } = GLib;
    GLib.timeout_add = (p, ms, fn) => timeout_add.call(GLib, p, ms, counted('timeout', fn));
    GLib.timeout_add_seconds = (p, s, fn) =>
      timeout_add_seconds.call(GLib, p, s, counted('timeout', fn));
    GLib.idle_add = (p, fn) => idle_add.call(GLib, p, counted('idle', fn));
    for (const name of ['connect', 'connect_after']) {
      const original = GObject.Object.prototype[name];
      GObject.Object.prototype[name] = function (signal, fn) {
        return original.call(this, signal, counted(`signal ${signal}`, fn));
      };
    }
    const subscribe = Gio.DBusConnection.prototype.signal_subscribe;
    Gio.DBusConnection.prototype.signal_subscribe = function (...args) {
      args[6] = counted(`dbus ${args[2]}`, args[6]);
      return subscribe.apply(this, args);
    };
    return true;
  };
  M.reenable = async () => {
    Main.extensionManager.disableExtension(UUID);
    await wait(300);
    Main.extensionManager.enableExtension(UUID);
    await wait(1500);
    return Main.extensionManager.lookup(UUID).state === 1;
  };
  M.count = on => {
    M.counting = on;
    if (on) M.counts.clear();
    return [...M.counts].sort((a, b) => b[1] - a[1]);
  };

  // --- the process ---
  M.pid = () => new Gio.Credentials().get_unix_pid();
  M.gc = async () => {
    for (let i = 0; i < 3; i++) {
      imports.system.gc();
      await wait(100);
    }
    return true;
  };

  // --- enable ---
  M.toggle = async times => {
    for (let i = 0; i < times; i++) {
      Main.extensionManager.disableExtension(UUID);
      await wait(60);
      Main.extensionManager.enableExtension(UUID);
      await wait(120);
    }
    return true;
  };

  // --- open and close ---
  M.cycle = async (times, open = 900, closed = 650) => {
    for (let i = 0; i < times; i++) {
      ext().notch.open();
      await wait(open);
      ext().notch.close();
      await wait(closed);
    }
    return true;
  };

  // The same amount of use without Visor: the date menu and the search of the overview.
  M.stockCycle = async (times, open = 250, closed = 150) => {
    const { menu } = Main.panel.statusArea.dateMenu;
    for (let i = 0; i < times; i++) {
      menu.open();
      await wait(open);
      menu.close();
      await wait(closed);
    }
    return true;
  };
  M.stockQueries = async times => {
    const q = ['2+3*4', 'se', 'fi', '17*3', 'te', ''];
    Main.overview.show();
    await wait(600);
    for (let i = 0; i < times; i++) {
      Main.overview.searchEntry.set_text(q[i % q.length] + (i % 7));
      await wait(70);
    }
    Main.overview.searchEntry.set_text('');
    Main.overview.hide();
    await wait(600);
    return true;
  };

  // --- search ---
  // Types one query and reports, in µs from the moment the debounce handed
  // the query to the search: when the list was built (`local`), when the next
  // frame began (`frame`), when its layout was done (`laidOut`) and when it
  // was painted (`painted`).
  M.query = async text => {
    const { content } = ext();
    const { sheet, finder } = content;
    const original = sheet.queryHandler;
    let start = 0;
    sheet.queryHandler = query => {
      start = now();
      original(query);
    };
    const result = await new Promise(resolve => {
      let frame = 0;
      let laidOut = 0;
      const ids = [
        global.stage.connect('before-update', () => {
          if (start && !frame) frame = now() - start;
        }),
        global.stage.connect('before-paint', () => {
          if (frame && !laidOut) laidOut = now() - start;
        }),
        global.stage.connect('after-paint', () => {
          if (frame) done([finder.timing.local, frame, laidOut, now() - start]);
        }),
      ];
      const done = value => {
        for (const id of ids.splice(0)) global.stage.disconnect(id);
        resolve(value);
      };
      GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => (done(null), false));
      sheet.entry.set_text(text);
    });
    sheet.queryHandler = original;
    await wait(120);
    return result;
  };
  M.queries = async texts => {
    const out = [];
    for (const text of texts) {
      const result = await M.query(text);
      // An empty query only takes the list away.
      if (result && text !== '') out.push(result);
    }
    return out;
  };
  return M;
})();
