// Installs a module from the release of its GitHub repository, for the
// settings window, which runs in a process of its own and asks over D-Bus.
// The shell installs from extensions.gnome.org only, and loads an extension
// put into its folder only at the next login; this does what its downloader
// does, for one address: download, check, unpack, load, enable.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

import { ExtensionType } from 'resource:///org/gnome/shell/misc/extensionUtils.js';
import { recursivelyDeleteDir } from 'resource:///org/gnome/shell/misc/fileUtils.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {
  MAX_ZIP_BYTES,
  githubRepo,
  isUuid,
  metadataProblem,
  releaseZipUrl,
} from '../lib/github-install.js';
import { httpSession } from '../lib/http.js';

/** Where the settings window finds the installer, on the connection of the shell (org.gnome.Shell). */
export const INSTALLER_PATH = '/io/github/taulit/Visor/Installer';
const ERROR = 'io.github.taulit.Visor.Installer.Failed';
const IFACE = `<node>
  <interface name="io.github.taulit.Visor.Installer">
    <method name="InstallFromGitHub">
      <arg type="s" direction="in" name="uuid"/>
      <arg type="s" direction="in" name="repo"/>
    </method>
  </interface>
</node>`;

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

function download(url: string, cancellable: Gio.Cancellable): Promise<GLib.Bytes> {
  return new Promise((resolve, reject) => {
    const message = Soup.Message.new('GET', url);
    if (!message) {
      reject(new Error(`not an address: ${url}`));
      return;
    }
    httpSession().send_and_read_async(message, GLib.PRIORITY_DEFAULT, cancellable, (s, result) => {
      try {
        const bytes = s!.send_and_read_finish(result);
        if (message.get_status() !== Soup.Status.OK)
          throw new Error(`the release answered ${message.get_status()} for ${url}`);
        resolve(bytes);
      } catch (e) {
        reject(e as Error);
      }
    });
  });
}

export class Installer {
  private exported: Gio.DBusExportedObject;
  private cancellable = new Gio.Cancellable();
  /** The UUIDs being installed, so a second click does not race the first. */
  private running = new Set<string>();
  /** Where the ZIP of a module is. Tests point it at a server of their own. */
  zipUrl: (repo: string, uuid: string) => string = releaseZipUrl;

  constructor() {
    this.exported = Gio.DBusExportedObject.wrapJSObject(IFACE, this);
    this.exported.export(Gio.DBus.session, INSTALLER_PATH);
  }

  destroy(): void {
    this.cancellable.cancel();
    this.exported.unexport();
  }

  /** The D-Bus method; GJS hands the invocation to methods named …Async. */
  InstallFromGitHubAsync(params: unknown[], invocation: Gio.DBusMethodInvocation): void {
    const [uuid, repo] = params as [string, string];
    this.install(uuid, repo).then(
      () => invocation.return_value(null),
      (e: unknown) => {
        console.warn(`Visor: cannot install ${uuid}: ${e instanceof Error ? e.message : e}`);
        invocation.return_dbus_error(ERROR, e instanceof Error ? e.message : String(e));
      },
    );
  }

  async install(uuid: string, repoUrl: string): Promise<void> {
    if (!isUuid(uuid)) throw new Error('not the UUID of an extension');
    const repo = githubRepo(repoUrl);
    if (!repo) throw new Error('only the releases of GitHub repositories are installed');
    if (Main.extensionManager.lookup(uuid)) throw new Error('already installed');
    if (this.running.has(uuid)) throw new Error('being installed');
    this.running.add(uuid);
    try {
      const dir = await this.unpack(
        uuid,
        await download(this.zipUrl(repo, uuid), this.cancellable),
      );
      const extension = Main.extensionManager.createExtensionObject(
        uuid,
        dir,
        ExtensionType.PER_USER,
      ) as unknown as Parameters<typeof Main.extensionManager.loadExtension>[0];
      await Main.extensionManager.loadExtension(extension);
      if (!Main.extensionManager.enableExtension(uuid)) throw new Error('cannot enable it');
    } finally {
      this.running.delete(uuid);
    }
  }

  /** Unpacks the ZIP next to the folder it is meant for, checks it, and moves it there. */
  private async unpack(uuid: string, bytes: GLib.Bytes): Promise<Gio.File> {
    if (bytes.get_size() > MAX_ZIP_BYTES) throw new Error('the ZIP is too large');
    const root = Gio.File.new_for_path(
      GLib.build_filenamev([GLib.get_user_data_dir(), 'gnome-shell', 'extensions']),
    );
    const target = root.get_child(uuid);
    if (target.query_exists(null)) throw new Error(`${target.get_path()} exists already`);
    // In the same folder, so the last step is a rename and never half done.
    const staging = root.get_child(`.${uuid}.visor-install-${Date.now()}`);
    staging.make_directory_with_parents(null);
    const [zip, stream] = Gio.File.new_tmp('XXXXXX.shell-extension.zip');
    try {
      stream.output_stream.write_bytes(bytes, null);
      stream.close(null);
      await run(
        ['unzip', '-qo', '-d', staging.get_path()!, '--', zip.get_path()!],
        this.cancellable,
      );
      const [, meta] = staging.get_child('metadata.json').load_contents(null);
      const problem = metadataProblem(new TextDecoder().decode(meta), uuid);
      if (problem) throw new Error(problem);
      const schemas = staging.get_child('schemas');
      if (schemas.query_exists(null))
        await run(['glib-compile-schemas', '--strict', schemas.get_path()!], this.cancellable);
      staging.move(target, Gio.FileCopyFlags.NONE, null, null);
      return target;
    } catch (e) {
      if (staging.query_exists(null)) recursivelyDeleteDir(staging, true);
      throw e;
    } finally {
      zip.delete(null);
    }
  }
}
