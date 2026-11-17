// Test helper: writes events into the calendar of the sandbox through
// Evolution's data server, the same way a calendar app would. Run with gjs
// inside scripts/nested.sh; it never sees the calendars of the real session,
// because the sandbox has its own HOME and D-Bus session.
//
// Usage: gjs -m calendar-events.js '<json>'
//   [{ "uid": "review", "summary": "Sprint Review", "start": 5, "minutes": 60,
//      "location": "https://meet.google.com/abc-defg-hij", "description": "…" },
//    { "uid": "birthday", "summary": "Birthday", "allDay": 1 }]
//   start: minutes from now. allDay: days from today.
//   "remove": true takes the event with that uid away.
// Prints "done" when everything is written.
import ECal from 'gi://ECal?version=2.0';
import EDataServer from 'gi://EDataServer?version=1.2';
import GLib from 'gi://GLib';
import ICalGLib from 'gi://ICalGLib?version=4.0';
import System from 'system';

const pad = n => String(n).padStart(2, '0');
const utc = date =>
  date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z');
const day = date => `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
const text = value =>
  String(value)
    .replace(/([\\,;])/g, '\\$1')
    .replace(/\n/g, '\\n');

// A source registry that is still alive when gjs exits crashes it there, and
// one from new_sync() cannot be taken down before. So: asynchronous, inside a
// main loop, and disposed before leaving.
const call = (start, finish) =>
  new Promise((resolve, reject) => {
    start((_source, result) => {
      try {
        resolve(finish(result));
      } catch (e) {
        reject(e);
      }
    });
  });

async function main() {
  const registry = await call(
    done => EDataServer.SourceRegistry.new(null, done),
    result => EDataServer.SourceRegistry.new_finish(result),
  );
  const client = await call(
    done =>
      ECal.Client.connect(
        registry.ref_builtin_calendar(),
        ECal.ClientSourceType.EVENTS,
        30,
        null,
        done,
      ),
    result => ECal.Client.connect_finish(result),
  );
  try {
    for (const event of JSON.parse(System.programArgs[0] ?? '[]')) write(client, event);
  } finally {
    client.run_dispose();
    registry.run_dispose();
  }
}

function write(client, event) {
  if (event.remove) {
    client.remove_object_sync(event.uid, null, ECal.ObjModType.ALL, ECal.OperationFlags.NONE, null);
    return;
  }
  const now = new Date();
  const lines = ['BEGIN:VEVENT', `UID:${event.uid}`, `DTSTAMP:${utc(now)}`];
  if (event.allDay !== undefined) {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() + event.allDay);
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1);
    lines.push(`DTSTART;VALUE=DATE:${day(from)}`, `DTEND;VALUE=DATE:${day(to)}`);
  } else {
    const from = new Date(now.getTime() + event.start * 60000);
    const to = new Date(from.getTime() + (event.minutes ?? 60) * 60000);
    lines.push(`DTSTART:${utc(from)}`, `DTEND:${utc(to)}`);
  }
  lines.push(`SUMMARY:${text(event.summary)}`);
  if (event.location) lines.push(`LOCATION:${text(event.location)}`);
  if (event.description) lines.push(`DESCRIPTION:${text(event.description)}`);
  lines.push('END:VEVENT');
  client.create_object_sync(
    ICalGLib.Component.new_from_string(lines.join('\r\n')),
    ECal.OperationFlags.NONE,
    null,
  );
}

const loop = new GLib.MainLoop(null, false);
let status = 0;
main()
  .then(() => globalThis.print('done'))
  .catch(e => {
    globalThis.printerr(`calendar-events: ${e}`);
    status = 1;
  })
  .finally(() => loop.quit());
loop.run();
System.exit(status);
