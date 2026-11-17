// One MPRIS player on the session bus: its state, kept current by the signals
// of the player, and the few calls Visor makes.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import {
  NO_TRACK,
  parseMetadata,
  parseStatus,
  type PlayerState,
  type Status,
  type Track,
} from './track.js';

const PATH = '/org/mpris/MediaPlayer2';
const ROOT = 'org.mpris.MediaPlayer2';
const PLAYER = 'org.mpris.MediaPlayer2.Player';
const PROPERTIES = 'org.freedesktop.DBus.Properties';

export const MPRIS_PREFIX = `${ROOT}.`;

const nowMs = (): number => GLib.get_monotonic_time() / 1000;

export class Player implements PlayerState {
  status: Status = 'Stopped';
  track: Track = NO_TRACK;
  canNext = false;
  canPrevious = false;
  /** Microseconds; null until it was read, and again when another track starts. */
  positionUs: number | null = null;
  activeAt = nowMs();

  private proxy: Gio.DBusProxy | null = null;
  private cancellable = new Gio.Cancellable();
  private identity = '';
  private app: Shell.App | null = null;

  /**
   * `changed` is called after the state or the position changed. Failing
   * calls are not reported: a player may leave the bus at any moment.
   */
  constructor(
    readonly busName: string,
    private connection: Gio.DBusConnection,
    private changed: (player: Player, what: 'state' | 'position') => void,
  ) {
    Gio.DBusProxy.new(
      connection,
      Gio.DBusProxyFlags.DO_NOT_AUTO_START,
      null,
      busName,
      PATH,
      PLAYER,
      this.cancellable,
      (_source, result) => {
        let proxy;
        try {
          proxy = Gio.DBusProxy.new_finish(result);
        } catch {
          return;
        }
        if (this.cancellable.is_cancelled()) return;
        this.proxy = proxy;
        proxy.connectObject(
          'g-properties-changed',
          () => this.read(),
          'g-signal',
          (_proxy: Gio.DBusProxy, _sender: string, signal: string, parameters: GLib.Variant) => {
            if (signal === 'Seeked') this.setPosition(parameters.get_child_value(0));
          },
          this,
        );
        this.read();
      },
    );
    connection.call(
      busName,
      PATH,
      PROPERTIES,
      'GetAll',
      new GLib.Variant('(s)', [ROOT]),
      new GLib.VariantType('(a{sv})'),
      Gio.DBusCallFlags.NONE,
      -1,
      this.cancellable,
      (_connection, result) => {
        let reply;
        try {
          reply = connection.call_finish(result);
        } catch {
          return;
        }
        const [props] = reply.recursiveUnpack() as [Record<string, unknown>];
        if (typeof props.Identity === 'string') this.identity = props.Identity;
        if (typeof props.DesktopEntry === 'string' && props.DesktopEntry)
          this.app = Shell.AppSystem.get_default().lookup_app(`${props.DesktopEntry}.desktop`);
        this.changed(this, 'state');
      },
    );
  }

  /** `Spotify`: the name of the app, what the player calls itself, or the end of its bus name. */
  get name(): string {
    return this.app?.get_name() || this.identity || this.busName.slice(MPRIS_PREFIX.length);
  }

  get icon(): Gio.Icon | null {
    return this.app?.get_icon() ?? null;
  }

  playPause(): void {
    this.call('PlayPause');
  }

  next(): void {
    this.call('Next');
  }

  previous(): void {
    this.call('Previous');
  }

  /** Brings the player to the front. Raise() can fail at focus stealing prevention, so the app is preferred. */
  raise(): void {
    if (this.app) {
      this.app.activate();
      return;
    }
    this.connection.call(
      this.busName,
      PATH,
      ROOT,
      'Raise',
      null,
      null,
      Gio.DBusCallFlags.NONE,
      -1,
      this.cancellable,
      (_connection, result) => {
        try {
          this.connection.call_finish(result);
        } catch {
          // The player cannot raise itself.
        }
      },
    );
  }

  /** Asks for the position; it is not part of the change signal of the properties. */
  readPosition(): void {
    this.connection.call(
      this.busName,
      PATH,
      PROPERTIES,
      'Get',
      new GLib.Variant('(ss)', [PLAYER, 'Position']),
      new GLib.VariantType('(v)'),
      Gio.DBusCallFlags.NONE,
      -1,
      this.cancellable,
      (_connection, result) => {
        let reply;
        try {
          reply = this.connection.call_finish(result);
        } catch {
          return;
        }
        this.setPosition(reply.get_child_value(0).get_variant());
      },
    );
  }

  destroy(): void {
    this.cancellable.cancel();
    this.proxy?.disconnectObject(this);
    this.proxy = null;
  }

  private call(method: string): void {
    this.proxy?.call(
      method,
      null,
      Gio.DBusCallFlags.NONE,
      -1,
      this.cancellable,
      (proxy, result) => {
        try {
          proxy?.call_finish(result);
        } catch {
          // The player is gone or does not do this.
        }
      },
    );
  }

  private setPosition(value: GLib.Variant): void {
    const position: unknown = value.unpack();
    const positionUs =
      typeof position === 'number' && Number.isFinite(position) && position >= 0 ? position : null;
    if (positionUs === this.positionUs) return;
    this.positionUs = positionUs;
    this.changed(this, 'position');
  }

  private read(): void {
    const { proxy } = this;
    if (!proxy) return;
    const get = (name: string): unknown => proxy.get_cached_property(name)?.recursiveUnpack();

    const status = parseStatus(get('PlaybackStatus'));
    if (status !== this.status) {
      this.status = status;
      this.activeAt = nowMs();
    }
    const track = parseMetadata(get('Metadata'));
    if (track.key !== this.track.key) this.positionUs = null;
    this.track = track;
    this.canNext = get('CanGoNext') === true;
    this.canPrevious = get('CanGoPrevious') === true;
    this.changed(this, 'state');
  }
}
