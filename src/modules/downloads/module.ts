// Running downloads as rows in "Now". Browsers offer no API for this, but
// they all write a partial file into the download directory and rename it at
// the end, so watching that directory is enough.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { gettext } from 'resource:///org/gnome/shell/extensions/extension.js';

import type { ModuleContext, NowRow, VisorModule } from '../../api.js';
import { truncate } from '../../lib/format.js';
import { formatBytes, isPartial, finalName } from './names.js';
import {
  STALE_MS,
  current,
  displayName,
  isDone,
  isFinished,
  nextLeave,
  type Download,
} from './track.js';

const ICON = 'folder-download-symbolic';
const SIZE = 'standard::size';

const nowMs = (): number => GLib.get_monotonic_time() / 1000;

class DownloadsModule implements VisorModule {
  readonly id = 'downloads';
  readonly name = gettext('Downloads');
  readonly icon = ICON;
  readonly slot = 'now';

  private ctx: ModuleContext | null = null;
  private cancellable: Gio.Cancellable | null = null;
  private dir: Gio.File | null = null;
  private monitor: Gio.FileMonitor | null = null;
  /** By the name of the partial file, oldest first. */
  private downloads = new Map<string, Download>();
  /** Files whose size is being read. */
  private reading = new Set<string>();
  /** The one timeout: until the next finished or stale download leaves the list. */
  private source = 0;
  private reported = false;

  enable(ctx: ModuleContext): void {
    this.ctx = ctx;
    const path = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOWNLOAD);
    // No download directory, or the home directory in its place: nothing to watch.
    if (!path || path === GLib.get_home_dir()) return;
    const cancellable = (this.cancellable = new Gio.Cancellable());
    const dir = (this.dir = Gio.File.new_for_path(path));
    try {
      this.monitor = dir.monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null);
    } catch (e) {
      this.safely(() => {
        throw e;
      });
      return;
    }
    // At most one change event per second and file.
    this.monitor.set_rate_limit(1000);
    this.monitor.connectObject(
      'changed',
      (
        _monitor: Gio.FileMonitor,
        file: Gio.File,
        other: Gio.File | null,
        event: Gio.FileMonitorEvent,
      ) => this.safely(() => this.onEvent(file, other, event)),
      this,
    );
    ctx.onOpenChanged(open => {
      if (!open) return;
      for (const download of this.downloads.values())
        if (!isDone(download)) this.readSize(download.name);
    });
    this.scan(dir, cancellable);
  }

  disable(): void {
    this.monitor?.disconnectObject(this);
    this.monitor?.cancel();
    this.monitor = null;
    this.cancellable?.cancel();
    this.cancellable = null;
    this.dir = null;
    if (this.source) GLib.source_remove(this.source);
    this.source = 0;
    this.downloads.clear();
    this.reading.clear();
    this.ctx = null;
  }

  // --- what happens in the directory ---

  /** Downloads that were running before Visor looked: partial files that changed a moment ago. */
  private scan(dir: Gio.File, cancellable: Gio.Cancellable): void {
    const next = (children: Gio.FileEnumerator) => {
      children.next_files_async(100, GLib.PRIORITY_LOW, cancellable, (_children, result) =>
        this.safely(() => {
          let infos: Gio.FileInfo[];
          try {
            infos = children.next_files_finish(result);
          } catch {
            return;
          }
          if (infos.length === 0) {
            children.close_async(GLib.PRIORITY_LOW, cancellable, null);
            return;
          }
          const wall = Date.now();
          for (const info of infos) {
            const name = info.get_name();
            if (!isPartial(name) || this.downloads.has(name)) continue;
            const modified = info.get_attribute_uint64('time::modified') * 1000;
            const age = Math.max(0, wall - modified);
            if (age >= STALE_MS) continue;
            this.downloads.set(name, { name, size: info.get_size(), seenAt: nowMs() - age });
          }
          this.changed();
          next(children);
        }),
      );
    };
    dir.enumerate_children_async(
      `standard::name,${SIZE},time::modified`,
      Gio.FileQueryInfoFlags.NONE,
      GLib.PRIORITY_LOW,
      cancellable,
      (_dir, result) =>
        this.safely(() => {
          let children;
          try {
            children = dir.enumerate_children_finish(result);
          } catch {
            // No such directory (yet); the monitor tells when files appear.
            return;
          }
          next(children);
        }),
    );
  }

  private onEvent(file: Gio.File, other: Gio.File | null, event: Gio.FileMonitorEvent): void {
    const name = file.get_basename() ?? '';
    const known = this.downloads.get(name);
    switch (event) {
      case Gio.FileMonitorEvent.CREATED:
      case Gio.FileMonitorEvent.MOVED_IN:
      case Gio.FileMonitorEvent.CHANGED:
        if (known && !isDone(known)) {
          known.seenAt = nowMs();
          // Sizes are only shown in the open panel, so they are only read then.
          if (this.ctx?.isOpen) this.readSize(name);
        } else if (isPartial(name)) {
          this.track(name);
        }
        break;
      case Gio.FileMonitorEvent.DELETED:
      case Gio.FileMonitorEvent.MOVED_OUT:
        if (known && !isDone(known)) this.ended(known);
        break;
      case Gio.FileMonitorEvent.RENAMED: {
        const target = other?.get_basename() ?? '';
        if (known && !isDone(known)) {
          this.downloads.delete(name);
          if (isPartial(target)) {
            // Chrome gives the partial file its real name once it knows it.
            this.downloads.set(target, { ...known, name: target, seenAt: nowMs() });
            this.changed();
          } else if (target) {
            this.finish(known, target, null);
          } else {
            this.changed();
          }
        } else if (isPartial(target)) {
          this.track(target);
        }
        break;
      }
      default:
        break;
    }
  }

  private track(name: string): void {
    // A finished download of the same name makes room for the new one.
    this.downloads.delete(name);
    this.downloads.set(name, { name, size: null, seenAt: nowMs() });
    this.changed();
    this.readSize(name);
  }

  /** The partial file is gone: finished when the final file is there, else cancelled. */
  private ended(download: Download): void {
    const target = finalName(download.name);
    const { dir, cancellable } = this;
    if (!target || !dir || !cancellable) {
      this.drop(download);
      return;
    }
    this.querySize(dir.get_child(target), cancellable, size => {
      if (this.downloads.get(download.name) !== download) return;
      this.downloads.delete(download.name);
      if (isFinished(size, download.size)) this.finish(download, target, size);
      else this.changed();
    });
  }

  private drop(download: Download): void {
    if (this.downloads.get(download.name) === download) this.downloads.delete(download.name);
    this.changed();
  }

  private finish(download: Download, target: string, size: number | null): void {
    const done: Download = {
      name: download.name,
      size: size ?? download.size,
      seenAt: download.seenAt,
      doneName: target,
      doneAt: nowMs(),
    };
    this.downloads.set(done.name, done);
    this.changed();
    const { dir, cancellable } = this;
    if (size !== null || !dir || !cancellable) return;
    this.querySize(dir.get_child(target), cancellable, final => {
      if (final === null || final === done.size || this.downloads.get(done.name) !== done) return;
      done.size = final;
      this.render();
    });
  }

  private readSize(name: string): void {
    const { dir, cancellable } = this;
    if (!dir || !cancellable || this.reading.has(name)) return;
    this.reading.add(name);
    this.querySize(dir.get_child(name), cancellable, size => {
      this.reading.delete(name);
      const download = this.downloads.get(name);
      if (size === null || !download || isDone(download) || download.size === size) return;
      download.size = size;
      this.render();
    });
  }

  /** Calls back with the size of the file, or null when it cannot be read. Not at all after disable(). */
  private querySize(
    file: Gio.File,
    cancellable: Gio.Cancellable,
    done: (size: number | null) => void,
  ): void {
    file.query_info_async(
      SIZE,
      Gio.FileQueryInfoFlags.NONE,
      GLib.PRIORITY_DEFAULT,
      cancellable,
      (_file, result) =>
        this.safely(() => {
          let size: number | null = null;
          try {
            size = file.query_info_finish(result).get_size();
          } catch {
            // Gone or unreadable.
          }
          if (!cancellable.is_cancelled()) done(size);
        }),
    );
  }

  // --- what is shown ---

  /** The list changed: rows, chip and the timeout follow. */
  private changed(): void {
    this.render();
    if (this.source) GLib.source_remove(this.source);
    this.source = 0;
    const left = nextLeave([...this.downloads.values()], nowMs());
    if (left === null) return;
    this.source = GLib.timeout_add_seconds(
      GLib.PRIORITY_DEFAULT,
      Math.ceil(left / 1000) + 1,
      () => {
        this.source = 0;
        this.safely(() => {
          const kept = current([...this.downloads.values()], nowMs());
          this.downloads = new Map(kept.map(download => [download.name, download]));
          this.changed();
        });
        return GLib.SOURCE_REMOVE;
      },
    );
  }

  private render(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const downloads = [...this.downloads.values()];
    if (downloads.length === 0) ctx.now.clear();
    else ctx.now.set(downloads.map(download => this.row(download)));
    const active = downloads.filter(download => !isDone(download)).at(-1);
    ctx.peek.set(
      active ? { icon: ICON, text: truncate(displayName(active), 24), priority: 20 } : null,
    );
  }

  private row(download: Download): NowRow {
    const ctx = this.ctx!;
    const _ = ctx.t;
    const id = `download:${download.name}`;
    const title = displayName(download);
    const meta = download.size === null ? undefined : formatBytes(download.size);
    if (!isDone(download)) {
      // Neither Firefox nor Chrome says how large the file will be, so there is no bar to draw.
      return { id, icon: ICON, title, meta, progress: 'indeterminate' };
    }
    const uri = this.dir?.get_child(download.doneName ?? '').get_uri() ?? '';
    const open = () => {
      this.open(uri);
      ctx.close();
    };
    return {
      id,
      icon: ICON,
      title,
      subtitle: _('Done'),
      meta,
      status: 'done',
      activate: open,
      actions: [
        {
          label: _('Show in folder'),
          style: 'ghost',
          run: () => {
            this.showInFolder(uri);
            ctx.close();
          },
        },
        { label: _('Open'), run: open },
      ],
    };
  }

  private open(uri: string): void {
    Gio.AppInfo.launch_default_for_uri_async(
      uri,
      global.create_app_launch_context(0, -1),
      this.cancellable,
      (_source, result) => {
        try {
          Gio.AppInfo.launch_default_for_uri_finish(result);
        } catch {
          // No app for this kind of file.
        }
      },
    );
  }

  private showInFolder(uri: string): void {
    const connection = Gio.DBus.session;
    connection.call(
      'org.freedesktop.FileManager1',
      '/org/freedesktop/FileManager1',
      'org.freedesktop.FileManager1',
      'ShowItems',
      new GLib.Variant('(ass)', [[uri], '']),
      null,
      Gio.DBusCallFlags.NONE,
      -1,
      this.cancellable,
      (_connection, result) => {
        try {
          connection.call_finish(result);
        } catch {
          // No file manager on the bus.
        }
      },
    );
  }

  /** For callbacks nobody else guards: an exception is logged once and goes no further. */
  private safely(fn: () => void): void {
    try {
      fn();
    } catch (e) {
      if (this.reported) return;
      this.reported = true;
      logError(e as Error, 'Visor: downloads');
    }
  }
}

export function downloadsModule(): VisorModule {
  return new DownloadsModule();
}
