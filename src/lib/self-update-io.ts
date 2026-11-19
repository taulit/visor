// Looking for and installing a release of Visor from GitHub: Gio and Soup only,
// so both the settings window and Visor in the shell use it. The shell keeps
// running the code it loaded at login: an installed update runs after the next
// login.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

import {
  DEFAULT_UPDATE_URL,
  MAX_ANSWER_BYTES,
  MAX_ZIP_BYTES,
  isNewer,
  metadataProblem,
  parseRelease,
  type Release,
} from './self-update.js';

export type { Release } from './self-update.js';

export function download(
  http: Soup.Session,
  url: string,
  maxBytes: number,
  cancellable: Gio.Cancellable,
): Promise<GLib.Bytes> {
  return new Promise((resolve, reject) => {
    const message = Soup.Message.new('GET', url);
    if (!message) {
      reject(new Error(`not an address: ${url}`));
      return;
    }
    message.request_headers.append('Accept', 'application/vnd.github+json');
    http.send_and_read_async(message, GLib.PRIORITY_DEFAULT, cancellable, (_s, result) => {
      try {
        const bytes = http.send_and_read_finish(result);
        if (message.get_status() !== Soup.Status.OK)
          throw new Error(`${url} answered ${message.get_status()}`);
        if (bytes.get_size() > maxBytes) throw new Error(`${url} sent too much`);
        resolve(bytes);
      } catch (e) {
        reject(e as Error);
      }
    });
  });
}

function run(argv: string[], cancellable: Gio.Cancellable): Promise<void> {
  return new Promise((resolve, reject) => {
    const process = Gio.Subprocess.new(argv, Gio.SubprocessFlags.STDOUT_SILENCE);
    process.wait_check_async(cancellable, (_p, result) => {
      try {
        process.wait_check_finish(result);
        resolve();
      } catch (e) {
        reject(e as Error);
      }
    });
  });
}

function deleteTree(file: Gio.File): void {
  const info = file.query_info('standard::type', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
  if (info.get_file_type() === Gio.FileType.DIRECTORY) {
    const children = file.enumerate_children(
      'standard::name',
      Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
      null,
    );
    for (let child = children.next_file(null); child; child = children.next_file(null))
      deleteTree(file.get_child(child.get_name()));
    children.close(null);
  }
  file.delete(null);
}

/**
 * Unpacks the release next to the installed folder, checks it, and swaps the
 * two folders with renames, so Visor is never half replaced.
 */
export async function installRelease(
  http: Soup.Session,
  release: Release,
  uuid: string,
  path: string,
  cancellable: Gio.Cancellable,
): Promise<void> {
  const bytes = await download(http, release.zipUrl, MAX_ZIP_BYTES, cancellable);
  const installed = Gio.File.new_for_path(path);
  const root = installed.get_parent()!;
  const stamp = Date.now();
  const staging = root.get_child(`.${uuid}.update-${stamp}`);
  const old = root.get_child(`.${uuid}.old-${stamp}`);
  const [zip, stream] = Gio.File.new_tmp('XXXXXX.shell-extension.zip');
  staging.make_directory(null);
  try {
    stream.output_stream.write_bytes(bytes, null);
    stream.close(null);
    await run(['unzip', '-qo', '-d', staging.get_path()!, '--', zip.get_path()!], cancellable);
    const [, meta] = staging.get_child('metadata.json').load_contents(null);
    const problem = metadataProblem(new TextDecoder().decode(meta), uuid, release.version);
    if (problem) throw new Error(problem);
    const schemas = staging.get_child('schemas');
    if (schemas.query_exists(null))
      await run(['glib-compile-schemas', '--strict', schemas.get_path()!], cancellable);
    installed.move(old, Gio.FileCopyFlags.NONE, null, null);
    try {
      staging.move(installed, Gio.FileCopyFlags.NONE, null, null);
    } catch (e) {
      old.move(installed, Gio.FileCopyFlags.NONE, null, null);
      throw e;
    }
  } finally {
    zip.delete(null);
    for (const leftover of [staging, old]) {
      try {
        if (leftover.query_exists(null)) deleteTree(leftover);
      } catch (e) {
        console.warn(`Visor: cannot remove ${leftover.get_path()}: ${e}`);
      }
    }
  }
}

/** Asks the session to log out; the session shows its own dialog first. */
export function logOut(): void {
  Gio.DBus.session.call(
    'org.gnome.SessionManager',
    '/org/gnome/SessionManager',
    'org.gnome.SessionManager',
    'Logout',
    new GLib.Variant('(u)', [0]),
    null,
    Gio.DBusCallFlags.NONE,
    -1,
    null,
    null,
  );
}

/**
 * The latest release when it is newer than `current`, null when Visor is up to
 * date. Throws when GitHub cannot be asked.
 */
export async function newerRelease(
  http: Soup.Session,
  updateUrl: string,
  uuid: string,
  current: string,
  cancellable: Gio.Cancellable,
): Promise<Release | null> {
  const url = updateUrl || DEFAULT_UPDATE_URL;
  const answer = await download(http, url, MAX_ANSWER_BYTES, cancellable);
  const release = parseRelease(new TextDecoder().decode(answer.get_data()!), uuid, url);
  return release && isNewer(release.version, current) ? release : null;
}

/** Visor is installed for this user only, so its files may be replaced. */
export function ownInstall(path: string): boolean {
  return path.startsWith(`${GLib.get_user_data_dir()}/`);
}
