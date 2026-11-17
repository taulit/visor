// Test helper: sends one notification on the session bus of the sandbox and
// stays on the bus, like an app would. That keeps the notification alive (the
// shell drops those of an app that left the bus) and lets it hear the answer:
// every action the shell reports is printed as "action <id>", the end as
// "closed <reason>". Run with gjs inside scripts/nested.sh.
//
// Usage: gjs -m notify.js '<json>'
//   { "app": "Mail", "title": "…", "body": "…", "desktop": "org.gnome.Settings",
//     "actions": ["default", "Open", "reply", "Reply"], "urgency": 1 }
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import System from 'system';

const { print } = globalThis;
const spec = JSON.parse(System.programArgs[0] ?? '{}');
const bus = Gio.DBus.session;
const loop = new GLib.MainLoop(null, false);
const hints = {};
if (spec.desktop) hints['desktop-entry'] = new GLib.Variant('s', spec.desktop);
if (spec.urgency !== undefined) hints['urgency'] = new GLib.Variant('y', spec.urgency);

let id = 0;
const listen = (signal, report) =>
  bus.signal_subscribe(
    'org.freedesktop.Notifications',
    'org.freedesktop.Notifications',
    signal,
    '/org/freedesktop/Notifications',
    null,
    Gio.DBusSignalFlags.NONE,
    (_c, _sender, _path, _iface, _signal, params) => {
      const [which, what] = params.deepUnpack();
      if (which !== id) return;
      print(`${report} ${what}`);
      if (report === 'closed') loop.quit();
    },
  );
listen('ActionInvoked', 'action');
listen('NotificationClosed', 'closed');

[id] = bus
  .call_sync(
    'org.freedesktop.Notifications',
    '/org/freedesktop/Notifications',
    'org.freedesktop.Notifications',
    'Notify',
    new GLib.Variant('(susssasa{sv}i)', [
      spec.app ?? 'Test',
      0,
      spec.icon ?? '',
      spec.title ?? 'Title',
      spec.body ?? '',
      spec.actions ?? [],
      hints,
      -1,
    ]),
    new GLib.VariantType('(u)'),
    Gio.DBusCallFlags.NONE,
    -1,
    null,
  )
  .deepUnpack();
print(`sent ${id}`);
loop.run();
