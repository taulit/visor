// The connection to the local T3 Code server, see docs/t3-protocol.md:
// descriptor, WebSocket ticket, socket, the shell stream. It reconnects with
// a growing wait and at once when the network or the server's runtime file
// changes. Without a token it does nothing at all.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

import {
  METHODS,
  PONG_FRAME,
  ackFrame,
  applyShellItem,
  backoffSeconds,
  cleanOrigin,
  decodeDescriptor,
  decodeFrames,
  decodeRuntimeState,
  decodeTicket,
  descriptorUrl,
  emptyShell,
  isCompatible,
  requestFrame,
  socketUrl,
  subscribeShellPayload,
  threadLink,
  ticketUrl,
  type Descriptor,
  type ShellState,
} from './protocol.js';

export const SERVER_KEY = 't3-server-url';
export const TOKEN_KEY = 't3-access-token';

/** A thread projection can be large; anything beyond this is not from a sane server. */
const MAX_FRAME_BYTES = 64 * 1024 * 1024;
const MAX_HTTP_BYTES = 256 * 1024;
/** The shared session drops a socket that is silent for its timeout; a ping keeps it. */
const KEEPALIVE_SECONDS = 10;
const REQUEST_TIMEOUT_SECONDS = 20;

interface Pending {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timeout: number;
}

/** Where a running server says it listens: `$T3CODE_HOME` or `~/.t3`. */
function runtimeFile(): Gio.File {
  const base = GLib.getenv('T3CODE_HOME') || GLib.build_filenamev([GLib.get_home_dir(), '.t3']);
  return Gio.File.new_for_path(GLib.build_filenamev([base, 'userdata', 'server-runtime.json']));
}

export class T3Client {
  /** The threads of the server; empty while there is no connection. */
  shell: ShellState = emptyShell();
  descriptor: Descriptor | null = null;
  connected = false;

  private origin: string | null = null;
  private cancellable: Gio.Cancellable | null = null;
  private socket: Soup.WebsocketConnection | null = null;
  private pending = new Map<string, Pending>();
  private shellRequest: string | null = null;
  private nextId = 1;
  private attempt = 0;
  private retrySource = 0;
  private connecting = false;
  private running = false;
  private monitor: Gio.FileMonitor | null = null;
  private network: Gio.NetworkMonitor | null = null;
  private incompatibleLogged = false;

  /** `changed` is called when the threads or the connection changed. */
  constructor(
    private http: Soup.Session,
    private settings: Gio.Settings | null,
    private changed: () => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.settings?.connectObject(
      `changed::${SERVER_KEY}`,
      () => this.restart(),
      `changed::${TOKEN_KEY}`,
      () => this.restart(),
      this,
    );
    this.network = Gio.NetworkMonitor.get_default();
    this.network.connectObject('network-changed', () => this.retryNow(), this);
    try {
      // The server writes this file when it starts and removes it when it stops.
      this.monitor = runtimeFile().monitor_file(Gio.FileMonitorFlags.NONE, null);
      this.monitor.connectObject('changed', () => this.retryNow(), this);
    } catch {
      this.monitor = null;
    }
    this.connect();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.settings?.disconnectObject(this);
    this.network?.disconnectObject(this);
    this.network = null;
    this.monitor?.disconnectObject(this);
    this.monitor?.cancel();
    this.monitor = null;
    this.drop();
    this.attempt = 0;
    this.incompatibleLogged = false;
  }

  /** The address that opens a thread in T3 Code. */
  link(threadId: string): string | null {
    return this.origin && this.descriptor
      ? threadLink(this.origin, this.descriptor.environmentId, threadId)
      : null;
  }

  /** Sends a request; the promise rejects with a short reason. */
  request(method: string, payload: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const socket = this.socket;
      if (!socket || !this.connected) {
        reject(new Error('not connected'));
        return;
      }
      const requestId = String(this.nextId++);
      const timeout = GLib.timeout_add_seconds(
        GLib.PRIORITY_DEFAULT,
        REQUEST_TIMEOUT_SECONDS,
        () => {
          this.pending.delete(requestId);
          reject(new Error('timed out'));
          return GLib.SOURCE_REMOVE;
        },
      );
      this.pending.set(requestId, { resolve, reject, timeout });
      socket.send_text(requestFrame(requestId, method, payload));
    });
  }

  command(command: unknown): Promise<unknown> {
    return this.request(METHODS.dispatchCommand, command);
  }

  // --- connecting ---

  private restart(): void {
    if (!this.running) return;
    this.drop();
    this.attempt = 0;
    this.changed();
    this.connect();
  }

  /** The network or the server's runtime file changed: do not sit out the wait. */
  private retryNow(): void {
    if (!this.running || this.connected || this.connecting) return;
    this.attempt = 0;
    this.connect();
  }

  private connect(): void {
    if (this.retrySource) GLib.source_remove(this.retrySource);
    this.retrySource = 0;
    const token = this.settings?.get_string(TOKEN_KEY) ?? '';
    // Not paired: nothing to do until the setting changes.
    if (!this.running || this.connecting || this.connected || !token) return;
    this.connecting = true;
    const cancellable = (this.cancellable = new Gio.Cancellable());
    this.open(token, cancellable)
      .catch(() => false)
      .then(opened => {
        if (cancellable.is_cancelled()) return;
        this.connecting = false;
        if (!opened) this.retryLater();
      });
  }

  private retryLater(): void {
    if (!this.running || this.retrySource) return;
    this.retrySource = GLib.timeout_add_seconds(
      GLib.PRIORITY_DEFAULT,
      backoffSeconds(this.attempt++),
      () => {
        this.retrySource = 0;
        this.connect();
        return GLib.SOURCE_REMOVE;
      },
    );
  }

  /** True when the socket is open. A server that is not there is no error. */
  private async open(token: string, cancellable: Gio.Cancellable): Promise<boolean> {
    const configured = this.settings?.get_string(SERVER_KEY) ?? '';
    const origin = configured
      ? cleanOrigin(configured)
      : decodeRuntimeState((await this.readFile(runtimeFile(), cancellable)) ?? '');
    if (!origin || cancellable.is_cancelled()) return false;

    const about = await this.fetch('GET', descriptorUrl(origin), null, cancellable);
    const descriptor = about ? decodeDescriptor(about) : null;
    if (!descriptor || cancellable.is_cancelled()) return false;
    if (!isCompatible(descriptor)) {
      if (!this.incompatibleLogged) {
        this.incompatibleLogged = true;
        log(
          `T3 Code speaks orchestration protocol ${descriptor.version ?? 'unknown'}, ` +
            'this module another one; its sessions are not shown.',
        );
      }
      return false;
    }

    const ticket = decodeTicket(
      (await this.fetch('POST', ticketUrl(origin), token, cancellable)) ?? '',
    );
    if (!ticket || cancellable.is_cancelled()) return false;

    const socket = await this.openSocket(socketUrl(origin, ticket), cancellable);
    if (!socket) return false;
    if (cancellable.is_cancelled()) {
      socket.close(Soup.WebsocketCloseCode.NORMAL, null);
      return false;
    }

    this.origin = origin;
    this.descriptor = descriptor;
    this.socket = socket;
    this.connected = true;
    this.attempt = 0;
    socket.max_incoming_payload_size = MAX_FRAME_BYTES;
    socket.keepalive_interval = KEEPALIVE_SECONDS;
    socket.connectObject(
      'message',
      (_socket: Soup.WebsocketConnection, type: Soup.WebsocketDataType, bytes: GLib.Bytes) =>
        this.receive(type, bytes),
      'closed',
      () => this.lost(socket),
      // An error is followed by `closed`; nothing to say about it.
      'error',
      () => {},
      this,
    );
    this.shellRequest = String(this.nextId++);
    socket.send_text(
      requestFrame(this.shellRequest, METHODS.subscribeShell, subscribeShellPayload(descriptor)),
    );
    return true;
  }

  private readFile(file: Gio.File, cancellable: Gio.Cancellable): Promise<string | null> {
    return new Promise(resolve => {
      file.load_contents_async(cancellable, (_source, result) => {
        try {
          const [, bytes] = file.load_contents_finish(result);
          resolve(bytes.length <= MAX_HTTP_BYTES ? new TextDecoder().decode(bytes) : null);
        } catch {
          resolve(null);
        }
      });
    });
  }

  /** The body of a 200 answer, or null. */
  private fetch(
    method: string,
    url: string,
    token: string | null,
    cancellable: Gio.Cancellable,
  ): Promise<string | null> {
    return new Promise(resolve => {
      let message: Soup.Message;
      try {
        message = Soup.Message.new(method, url);
      } catch {
        resolve(null);
        return;
      }
      if (token) message.get_request_headers().append('Authorization', `Bearer ${token}`);
      this.http.send_and_read_async(message, GLib.PRIORITY_DEFAULT, cancellable, (_source, result) => {
        try {
          const data = this.http.send_and_read_finish(result).get_data();
          const ok =
            message.get_status() === Soup.Status.OK && data !== null && data.length <= MAX_HTTP_BYTES;
          resolve(ok ? new TextDecoder().decode(data) : null);
        } catch {
          resolve(null);
        }
      });
    });
  }

  private openSocket(
    url: string,
    cancellable: Gio.Cancellable,
  ): Promise<Soup.WebsocketConnection | null> {
    return new Promise(resolve => {
      let message: Soup.Message;
      try {
        message = Soup.Message.new('GET', url);
      } catch {
        resolve(null);
        return;
      }
      this.http.websocket_connect_async(
        message,
        null,
        null,
        GLib.PRIORITY_DEFAULT,
        cancellable,
        (_source, result) => {
          try {
            resolve(this.http.websocket_connect_finish(result));
          } catch {
            resolve(null);
          }
        },
      );
    });
  }

  // --- the socket ---

  private receive(type: Soup.WebsocketDataType, bytes: GLib.Bytes): void {
    const socket = this.socket;
    const data = bytes.get_data();
    if (!socket || !data) return;
    // The server may send JSON as text or as bytes.
    void type;
    let shellChanged = false;
    for (const frame of decodeFrames(new TextDecoder().decode(data))) {
      switch (frame.tag) {
        case 'chunk':
          // Without the ack the server sends nothing more on this stream.
          socket.send_text(ackFrame(frame.requestId));
          if (frame.requestId !== this.shellRequest) break;
          for (const item of frame.values)
            if (applyShellItem(this.shell, item)) shellChanged = true;
          break;
        case 'exit': {
          if (frame.requestId === this.shellRequest) {
            // The stream ended; a new connection starts a new one.
            socket.close(Soup.WebsocketCloseCode.NORMAL, null);
            break;
          }
          const pending = this.pending.get(frame.requestId);
          if (!pending) break;
          this.pending.delete(frame.requestId);
          GLib.source_remove(pending.timeout);
          if (frame.ok) pending.resolve(frame.value);
          else pending.reject(new Error(frame.error));
          break;
        }
        case 'ping':
          socket.send_text(PONG_FRAME);
          break;
        case 'defect':
          socket.close(Soup.WebsocketCloseCode.NORMAL, null);
          break;
        case 'pong':
          break;
      }
    }
    if (shellChanged) this.changed();
  }

  private lost(socket: Soup.WebsocketConnection): void {
    if (socket !== this.socket) return;
    this.drop();
    this.changed();
    this.retryLater();
  }

  /** Forgets the connection and everything that came over it. */
  private drop(): void {
    this.cancellable?.cancel();
    this.cancellable = null;
    this.connecting = false;
    if (this.retrySource) GLib.source_remove(this.retrySource);
    this.retrySource = 0;
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.disconnectObject(this);
      if (socket.get_state() === Soup.WebsocketState.OPEN)
        socket.close(Soup.WebsocketCloseCode.NORMAL, null);
    }
    for (const pending of this.pending.values()) {
      GLib.source_remove(pending.timeout);
      pending.reject(new Error('not connected'));
    }
    this.pending.clear();
    this.shellRequest = null;
    this.connected = false;
    this.descriptor = null;
    this.origin = null;
    this.shell = emptyShell();
  }
}
