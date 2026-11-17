// What plays: one row per MPRIS player on the session bus, with cover,
// controls and a progress line. The stock MPRIS code of the shell cannot be
// released and knows no position, so this is a client of its own.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

import { gettext } from 'resource:///org/gnome/shell/extensions/extension.js';

import type { Action, ModuleContext, NowRow, VisorModule } from '../../api.js';
import { truncate } from '../../lib/format.js';
import { MPRIS_PREFIX, Player } from './player.js';
import { describeTrack, hashName, nextPauseEnd, trackProgress, visiblePlayers } from './track.js';

const BUS = 'org.freedesktop.DBus';
const BUS_PATH = '/org/freedesktop/DBus';
const FALLBACK_ICON = 'audio-x-generic-symbolic';
const COVER_PREFIX = 'cover-';
const MAX_COVER_BYTES = 8_000_000;

const nowMs = (): number => GLib.get_monotonic_time() / 1000;

class MediaModule implements VisorModule {
  readonly id = 'media';
  readonly name = gettext('Media');
  readonly icon = 'emblem-music-symbolic';
  readonly slot = 'now';

  private ctx: ModuleContext | null = null;
  private cancellable: Gio.Cancellable | null = null;
  private subscription = 0;
  private players = new Map<string, Player>();
  /** The players that have a row, in the order of the rows. */
  private visible: Player[] = [];
  /** Asks the playing players for their position once per second while the panel is open. */
  private pollSource = 0;
  /** Takes the row of a paused player away after ten minutes. */
  private pauseSource = 0;
  /** Cover art by address: the picture, or null while it loads or when it cannot be had. */
  private covers = new Map<string, Gio.Icon | null>();
  private pruned = false;
  private reported = false;

  enable(ctx: ModuleContext): void {
    this.ctx = ctx;
    const cancellable = (this.cancellable = new Gio.Cancellable());
    const connection = Gio.DBus.session;
    this.subscription = connection.signal_subscribe(
      BUS,
      BUS,
      'NameOwnerChanged',
      BUS_PATH,
      MPRIS_PREFIX.slice(0, -1),
      Gio.DBusSignalFlags.MATCH_ARG0_NAMESPACE,
      (_connection, _sender, _path, _iface, _signal, parameters) =>
        this.safely(() => {
          const [name, , owner] = parameters.deepUnpack() as [string, string, string];
          this.removePlayer(name);
          if (owner) this.addPlayer(name);
          this.render();
        }),
    );
    connection.call(
      BUS,
      BUS_PATH,
      BUS,
      'ListNames',
      null,
      new GLib.VariantType('(as)'),
      Gio.DBusCallFlags.NONE,
      -1,
      cancellable,
      (_connection, result) =>
        this.safely(() => {
          let reply;
          try {
            reply = connection.call_finish(result);
          } catch {
            return;
          }
          if (cancellable.is_cancelled()) return;
          const [names] = reply.deepUnpack() as [string[]];
          for (const name of names) this.addPlayer(name);
        }),
    );
    ctx.onOpenChanged(open => {
      if (open) for (const player of this.visible) player.readPosition();
      this.syncPoll();
    });
  }

  disable(): void {
    if (this.subscription) Gio.DBus.session.signal_unsubscribe(this.subscription);
    this.subscription = 0;
    this.cancellable?.cancel();
    this.cancellable = null;
    for (const player of this.players.values()) player.destroy();
    this.players.clear();
    this.visible = [];
    this.covers.clear();
    this.pruned = false;
    if (this.pollSource) GLib.source_remove(this.pollSource);
    if (this.pauseSource) GLib.source_remove(this.pauseSource);
    this.pollSource = this.pauseSource = 0;
    this.ctx = null;
  }

  // --- players ---

  private addPlayer(name: string): void {
    if (!name.startsWith(MPRIS_PREFIX) || this.players.has(name)) return;
    const player = new Player(name, Gio.DBus.session, (changed, what) =>
      this.safely(() => {
        if (this.players.get(name) !== changed) return;
        // Another track or a new state: what was known about the position is over.
        if (what === 'state' && this.ctx?.isOpen && changed.status !== 'Stopped')
          changed.readPosition();
        this.render();
      }),
    );
    this.players.set(name, player);
  }

  private removePlayer(name: string): void {
    this.players.get(name)?.destroy();
    this.players.delete(name);
  }

  // --- what is shown ---

  private render(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = nowMs();
    const all = [...this.players.values()];
    this.visible = visiblePlayers(all, now);
    if (this.visible.length === 0) ctx.now.clear();
    else ctx.now.set(this.visible.map(player => this.row(player)));

    const playing = this.visible.find(player => player.status === 'Playing');
    ctx.peek.set(
      playing
        ? {
            icon: 'media-playback-start-symbolic',
            text: truncate(describeTrack(playing.track, playing.name).title, 24),
            priority: 30,
          }
        : null,
    );

    this.syncPoll();
    if (this.pauseSource) GLib.source_remove(this.pauseSource);
    this.pauseSource = 0;
    const left = nextPauseEnd(all, now);
    if (left !== null) {
      this.pauseSource = GLib.timeout_add_seconds(
        GLib.PRIORITY_DEFAULT,
        Math.ceil(left / 1000) + 1,
        () => {
          this.pauseSource = 0;
          this.safely(() => this.render());
          return GLib.SOURCE_REMOVE;
        },
      );
    }
  }

  private row(player: Player): NowRow {
    const ctx = this.ctx!;
    const _ = ctx.t;
    const { track } = player;
    const playing = player.status === 'Playing';
    const controls: Action[] = [];
    if (player.canPrevious) {
      controls.push({
        label: _('Previous'),
        icon: 'media-skip-backward-symbolic',
        run: () => player.previous(),
      });
    }
    controls.push({
      label: playing ? _('Pause') : _('Play'),
      icon: playing ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic',
      style: 'filled',
      run: () => player.playPause(),
    });
    if (player.canNext) {
      controls.push({
        label: _('Next'),
        icon: 'media-skip-forward-symbolic',
        run: () => player.next(),
      });
    }
    return {
      id: player.busName,
      icon: this.cover(track.artUrl) ?? player.icon ?? FALLBACK_ICON,
      iconStyle: 'cover',
      ...describeTrack(track, player.name),
      progress: trackProgress(player.positionUs, track.lengthUs),
      controls,
      activate: () => {
        player.raise();
        ctx.close();
      },
    };
  }

  /** One timeout while the panel is open and something with a row plays, none otherwise. */
  private syncPoll(): void {
    const wanted =
      this.ctx !== null &&
      this.ctx.isOpen &&
      this.visible.some(player => player.status === 'Playing');
    if (wanted === (this.pollSource !== 0)) return;
    if (!wanted) {
      GLib.source_remove(this.pollSource);
      this.pollSource = 0;
      return;
    }
    this.pollSource = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
      for (const player of this.visible) if (player.status === 'Playing') player.readPosition();
      return GLib.SOURCE_CONTINUE;
    });
  }

  // --- cover art ---

  /** The picture for an address, null when there is none (yet). A picture from the web is loaded once. */
  private cover(url: string): Gio.Icon | null {
    if (!url) return null;
    const known = this.covers.get(url);
    if (known !== undefined) return known;
    let icon: Gio.Icon | null = null;
    if (url.startsWith('file://')) icon = new Gio.FileIcon({ file: Gio.File.new_for_uri(url) });
    else if (/^https?:\/\//i.test(url)) this.loadCover(url);
    this.covers.set(url, icon);
    return icon;
  }

  private loadCover(url: string): void {
    const ctx = this.ctx;
    const cancellable = this.cancellable;
    if (!ctx || !cancellable) return;
    const dir = Gio.File.new_for_path(GLib.build_filenamev([GLib.get_user_cache_dir(), 'visor']));
    const file = dir.get_child(COVER_PREFIX + hashName(url));
    const ready = () => {
      if (cancellable.is_cancelled()) return;
      this.covers.set(url, new Gio.FileIcon({ file }));
      this.render();
    };
    const store = (bytes: GLib.Bytes) => {
      file.replace_contents_bytes_async(
        bytes,
        null,
        false,
        Gio.FileCreateFlags.REPLACE_DESTINATION,
        cancellable,
        (_file, result) =>
          this.safely(() => {
            try {
              file.replace_contents_finish(result);
            } catch {
              return;
            }
            ready();
            this.pruneCovers(dir);
          }),
      );
    };
    const download = () => {
      let message;
      try {
        message = Soup.Message.new('GET', url);
      } catch {
        return;
      }
      if (!message) return;
      const session = ctx.http;
      session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, cancellable, (_session, result) =>
        this.safely(() => {
          let bytes;
          try {
            bytes = session.send_and_read_finish(result);
          } catch {
            return;
          }
          const size = bytes.get_size();
          if (message.get_status() !== Soup.Status.OK || size === 0 || size > MAX_COVER_BYTES)
            return;
          dir.make_directory_async(GLib.PRIORITY_DEFAULT, cancellable, (_dir, made) =>
            this.safely(() => {
              try {
                dir.make_directory_finish(made);
              } catch (e) {
                if (!(e as GLib.Error).matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS)) return;
              }
              store(bytes);
            }),
          );
        }),
      );
    };
    file.query_info_async(
      'standard::size',
      Gio.FileQueryInfoFlags.NONE,
      GLib.PRIORITY_DEFAULT,
      cancellable,
      (_file, result) =>
        this.safely(() => {
          try {
            if (file.query_info_finish(result).get_size() > 0) {
              ready();
              return;
            }
          } catch (e) {
            if ((e as GLib.Error).matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) return;
          }
          download();
        }),
    );
  }

  /** Once per run, after the first download: removes the covers nobody shows any more. */
  private pruneCovers(dir: Gio.File): void {
    const cancellable = this.cancellable;
    if (this.pruned || !cancellable) return;
    this.pruned = true;
    const used = new Set<string>();
    for (const icon of this.covers.values())
      if (icon instanceof Gio.FileIcon) used.add(icon.get_file().get_basename() ?? '');
    dir.enumerate_children_async(
      'standard::name',
      Gio.FileQueryInfoFlags.NONE,
      GLib.PRIORITY_LOW,
      cancellable,
      (_dir, result) =>
        this.safely(() => {
          let children: Gio.FileEnumerator;
          try {
            children = dir.enumerate_children_finish(result);
          } catch {
            return;
          }
          children.next_files_async(200, GLib.PRIORITY_LOW, cancellable, (_children, batch) =>
            this.safely(() => {
              let infos: Gio.FileInfo[] = [];
              try {
                infos = children.next_files_finish(batch);
              } catch {
                // Nothing to remove then.
              }
              children.close_async(GLib.PRIORITY_LOW, cancellable, null);
              for (const info of infos) {
                const name = info.get_name();
                if (!name.startsWith(COVER_PREFIX) || used.has(name)) continue;
                dir.get_child(name).delete_async(GLib.PRIORITY_LOW, cancellable, null);
              }
            }),
          );
        }),
    );
  }

  /** For callbacks nobody else guards: an exception is logged once and goes no further. */
  private safely(fn: () => void): void {
    try {
      fn();
    } catch (e) {
      if (this.reported) return;
      this.reported = true;
      logError(e as Error, 'Visor: media');
    }
  }
}

export function mediaModule(): VisorModule {
  return new MediaModule();
}
