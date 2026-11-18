// What the settings window asks the shell about other extensions, through
// org.gnome.Shell.Extensions. The window cannot use Main.extensionManager,
// it runs in its own process.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { foreignModule, type ForeignModule } from './foreign.js';

const BUS_NAME = 'org.gnome.Shell';
const OBJECT_PATH = '/org/gnome/Shell';
const INTERFACE = 'org.gnome.Shell.Extensions';

function call(method: string, parameters: GLib.Variant | null): Promise<GLib.Variant> {
  return new Promise((resolve, reject) => {
    Gio.DBus.session.call(
      BUS_NAME,
      OBJECT_PATH,
      INTERFACE,
      method,
      parameters,
      null,
      Gio.DBusCallFlags.NONE,
      3000,
      null,
      (connection, result) => {
        try {
          resolve(connection!.call_finish(result));
        } catch (error) {
          reject(error);
        }
      },
    );
  });
}

/** metadata.json of the extension in `path`, or null when it cannot be read. */
function readMetadata(path: unknown): unknown {
  if (typeof path !== 'string') return null;
  try {
    const [, bytes] = Gio.File.new_for_path(`${path}/metadata.json`).load_contents(null);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/**
 * The installed extensions that bring modules for Visor. The shell sends only
 * flat values of the metadata, so the "visor" object comes from metadata.json.
 * Empty when the shell does not answer.
 */
export async function listForeignModules(): Promise<ForeignModule[]> {
  try {
    const reply = await call('ListExtensions', null);
    const extensions = reply.recursiveUnpack() as [Record<string, Record<string, unknown>>];
    return Object.entries(extensions[0]).flatMap(([uuid, info]) => {
      const module = foreignModule(uuid, info, readMetadata(info['path']));
      return module ? [module] : [];
    });
  } catch (error) {
    console.warn(`Visor: cannot list the extensions: ${error}`);
    return [];
  }
}

/** Opens the settings window of another extension. */
export function openExtensionPrefs(uuid: string): void {
  call('OpenExtensionPrefs', new GLib.Variant('(ssa{sv})', [uuid, '', {}])).catch(error =>
    console.warn(`Visor: cannot open the settings of ${uuid}: ${error}`),
  );
}

/** The UUIDs of all installed extensions, enabled or not. Empty when the shell does not answer. */
export async function listInstalledUuids(): Promise<Set<string>> {
  try {
    const reply = await call('ListExtensions', null);
    const [extensions] = reply.recursiveUnpack() as [Record<string, unknown>];
    return new Set(Object.keys(extensions));
  } catch {
    return new Set();
  }
}

/**
 * Asks the shell to install an extension from the GNOME extension store. The
 * shell shows its own dialog and downloads from extensions.gnome.org; Visor
 * loads nothing itself. True when it was installed, false when the user
 * declined or the store does not have it.
 */
export function installExtension(uuid: string): Promise<boolean> {
  return new Promise(resolve => {
    Gio.DBus.session.call(
      BUS_NAME,
      OBJECT_PATH,
      INTERFACE,
      'InstallRemoteExtension',
      new GLib.Variant('(s)', [uuid]),
      null,
      Gio.DBusCallFlags.NONE,
      // The answer comes when the user has answered the dialog.
      10 * 60 * 1000,
      null,
      (connection, result) => {
        try {
          const [answer] = connection!.call_finish(result).recursiveUnpack() as [string];
          resolve(answer === 'successful');
        } catch {
          resolve(false);
        }
      },
    );
  });
}
