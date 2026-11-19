// Updates of Visor from its GitHub releases, for the button next to the dock.
// Asks GitHub when the panel opens, at most every six hours and never with
// "update-check" off; installs with one click. The shell keeps running the code
// it loaded at login, so after an update the button offers to log out.
import Gio from 'gi://Gio';

import { httpSession } from '../lib/http.js';
import { parseVersion } from '../lib/self-update.js';
import {
  installRelease,
  logOut,
  newerRelease,
  ownInstall,
  type Release,
} from '../lib/self-update-io.js';

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

export type UpdateState =
  | { kind: 'none' }
  | { kind: 'available' | 'updating' | 'failed'; release: Release }
  /** Installed; runs after the next login. `version` is what is on disk now. */
  | { kind: 'done'; version: string };

export class Updater {
  state: UpdateState = { kind: 'none' };
  /** Called whenever the state changes. */
  onChanged: (() => void) | null = null;
  /** When GitHub was last asked; 0 asks at the next open. */
  checkedAt = 0;
  private checking = false;
  private cancellable = new Gio.Cancellable();

  constructor(
    private settings: Gio.Settings,
    private uuid: string,
    /** The version the shell runs. */
    private running: string,
    private path: string,
  ) {}

  destroy(): void {
    this.cancellable.cancel();
    this.onChanged = null;
  }

  /** The panel opened. */
  maybeCheck(): void {
    if (this.state.kind === 'updating' || this.state.kind === 'done' || this.checking) return;
    // Updated meanwhile, in the settings window: only the login is left.
    const onDisk = this.diskVersion();
    if (onDisk && onDisk !== this.running) {
      this.set({ kind: 'done', version: onDisk });
      return;
    }
    if (!this.settings.get_boolean('update-check') || !ownInstall(this.path)) return;
    if (Date.now() - this.checkedAt < CHECK_EVERY_MS) return;
    this.checking = true;
    newerRelease(
      httpSession(),
      this.settings.get_string('update-url'),
      this.uuid,
      this.running,
      this.cancellable,
    )
      .then(
        release => {
          this.checkedAt = Date.now();
          if (this.state.kind === 'none' || this.state.kind === 'available')
            this.set(release ? { kind: 'available', release } : { kind: 'none' });
        },
        (e: unknown) => {
          if (this.cancellable.is_cancelled()) return;
          // Offline or GitHub busy: quiet, and again at the next open in six hours.
          this.checkedAt = Date.now();
          console.warn(`Visor: cannot look for updates: ${e}`);
        },
      )
      .finally(() => {
        this.checking = false;
      });
  }

  /** The button was clicked: install, try again, or log out. */
  activate(): void {
    const state = this.state;
    if (state.kind === 'done') {
      logOut();
      return;
    }
    if (state.kind !== 'available' && state.kind !== 'failed') return;
    const { release } = state;
    this.set({ kind: 'updating', release });
    installRelease(httpSession(), release, this.uuid, this.path, this.cancellable).then(
      () => this.set({ kind: 'done', version: release.version }),
      (e: unknown) => {
        if (this.cancellable.is_cancelled()) return;
        console.warn(`Visor: the update did not work: ${e}`);
        this.set({ kind: 'failed', release });
      },
    );
  }

  private set(state: UpdateState): void {
    this.state = state;
    this.onChanged?.();
  }

  /** The version-name in metadata.json on disk; null when it cannot be read. */
  private diskVersion(): string | null {
    try {
      const [, bytes] = Gio.File.new_for_path(`${this.path}/metadata.json`).load_contents(null);
      const version = (JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>)[
        'version-name'
      ];
      return parseVersion(version) ? String(version) : null;
    } catch {
      return null;
    }
  }
}
