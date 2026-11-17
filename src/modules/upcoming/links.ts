// Meeting links of calendar events. The calendar server of the shell sends
// neither location nor description (docs/verified.md, section 9), so they are
// read through Evolution's libraries: loaded on first use, asynchronous only,
// and without them there is simply no Join button.
//
// The connection to Evolution lives only as long as a lookup runs. A source
// registry that is still alive when the shell exits crashes it there (seen
// with libedataserver 3.60 under gjs 1.88), and one that is disposed while
// the shell runs does not.
import type Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import type ECal from 'gi://ECal?version=2.0';
import type EDataServer from 'gi://EDataServer?version=1.2';

import { findMeetingLink, type MeetingLink } from './meeting-link.js';
import { unfoldIcs } from './plan.js';

/** Seconds ECal waits for a calendar that is still connecting. */
const CONNECT_WAIT = 5;
/** How long after the last lookup the connection is taken down; at once, the client still has work queued. */
const CLOSE_DELAY_MS = 1000;
/** A lookup that failed is tried again, but not sooner than this. */
const RETRY_MS = 30_000;

interface Libraries {
  EDataServer: typeof EDataServer;
  ECal: typeof ECal;
}

const nowMs = (): number => GLib.get_monotonic_time() / 1000;

/** One asynchronous GIO call as a promise, without changing the class it belongs to. */
function call<T>(
  start: (done: Gio.AsyncReadyCallback) => void,
  finish: (result: Gio.AsyncResult) => T,
): Promise<T> {
  return new Promise((resolve, reject) => {
    start((_source, result) => {
      try {
        resolve(finish(result));
      } catch (e) {
        reject(e as Error);
      }
    });
  });
}

/** What one round of lookups opened. */
interface Session {
  registry: Promise<EDataServer.SourceRegistry>;
  clients: Map<string, Promise<ECal.Client>>;
  /** Registry and clients as they came into being, for taking them down. */
  opened: { run_dispose(): void }[];
}

export class MeetingLinks {
  /** By event id. Null: looked at, no link. */
  private cache = new Map<string, MeetingLink | null>();
  private loading = new Set<string>();
  /** By event id: when the lookup last failed, on the monotonic clock. */
  private failed = new Map<string, number>();
  private libraries: Promise<Libraries> | null = null;
  private session: Session | null = null;
  /** Lookups that still run. */
  private running = 0;
  private complained = false;
  /** The timeout that takes the last session down. */
  private closing = 0;
  private closingSessions: Session[] = [];
  private destroyed = false;

  /** `found` is called when a link turned up for an event asked about before. */
  constructor(
    private cancellable: Gio.Cancellable,
    private found: () => void,
  ) {}

  /** The link of an event, null when it has none, undefined while that is not known yet. */
  get(id: string): MeetingLink | null | undefined {
    if (this.cache.has(id)) return this.cache.get(id);
    const failedAt = this.failed.get(id);
    const waits = failedAt !== undefined && nowMs() - failedAt < RETRY_MS;
    if (!this.loading.has(id) && !waits) {
      this.loading.add(id);
      void this.load(id);
    }
    return undefined;
  }

  destroy(): void {
    this.destroyed = true;
    if (this.closing) GLib.source_remove(this.closing);
    this.closing = 0;
    // Let go, not disposed: the clients may still have work queued.
    this.closingSessions = [];
    this.session = null;
    this.cache.clear();
    this.loading.clear();
    this.failed.clear();
    this.libraries = null;
  }

  private async load(id: string): Promise<void> {
    let link: MeetingLink | null = null;
    let failed = false;
    this.running++;
    try {
      link = await this.find(id);
    } catch (e) {
      failed = true;
      if (!this.cancellable.is_cancelled() && !this.complained) {
        this.complained = true;
        console.debug(`Visor: no Join buttons, reading the event failed: ${e}`);
      }
    } finally {
      if (--this.running === 0) this.closeSession();
    }
    if (this.cancellable.is_cancelled()) return;
    this.loading.delete(id);
    // "No link" is only what an event that was read says; a failure is asked again later.
    if (failed) {
      this.failed.set(id, nowMs());
      return;
    }
    this.failed.delete(id);
    this.cache.set(id, link);
    if (link) this.found();
  }

  private async find(id: string): Promise<MeetingLink | null> {
    const [sourceUid, uid, rid] = id.split('\n');
    if (!sourceUid || !uid) return null;
    const client = await this.client(sourceUid);
    const get = (recurrence: string | null): Promise<ECal.Component | null> =>
      call(
        done => client.get_object(uid, recurrence, this.cancellable, done),
        result => client.get_object_finish(result)[1],
      );
    let component: ECal.Component | null;
    try {
      component = await get(rid || null);
    } catch (e) {
      // An occurrence of a series that was never changed exists only as the series.
      if (!rid || this.cancellable.is_cancelled()) throw e;
      component = await get(null);
    }
    if (!component) return null;
    // Location first, then the notes, then everything else: URL and the
    // conference properties Google and Microsoft add.
    return findMeetingLink(
      component.get_location(),
      component.get_description(),
      unfoldIcs(component.as_ical_string()),
    );
  }

  private client(sourceUid: string): Promise<ECal.Client> {
    this.session ??= this.openSession();
    const session = this.session;
    let client = session.clients.get(sourceUid);
    if (!client) {
      client = this.connect(session, sourceUid);
      session.clients.set(sourceUid, client);
    }
    return client;
  }

  private openSession(): Session {
    const opened: Session['opened'] = [];
    const registry = this.loadLibraries().then(({ EDataServer: eds }) =>
      call(
        done => eds.SourceRegistry.new(this.cancellable, done),
        result => {
          const created = eds.SourceRegistry.new_finish(result);
          opened.push(created);
          return created;
        },
      ),
    );
    // Whoever asks for a client hears about a failure; nobody else has to.
    registry.catch(() => {});
    return { registry, clients: new Map(), opened };
  }

  /** The last lookup is over: nothing of Evolution stays in the shell. */
  private closeSession(): void {
    const session = this.session;
    this.session = null;
    if (!session || this.destroyed) return;
    // One timeout for all that wait; a round that ends meanwhile starts it anew.
    this.closingSessions.push(session);
    if (this.closing) GLib.source_remove(this.closing);
    this.closing = GLib.timeout_add(GLib.PRIORITY_LOW, CLOSE_DELAY_MS, () => {
      this.closing = 0;
      for (const closed of this.closingSessions.splice(0)) {
        for (const object of closed.opened.reverse()) object.run_dispose();
        closed.opened.length = 0;
      }
      return GLib.SOURCE_REMOVE;
    });
  }

  private async connect(session: Session, sourceUid: string): Promise<ECal.Client> {
    const { ECal: ecal } = await this.loadLibraries();
    const source = (await session.registry).ref_source(sourceUid);
    if (!source) throw new Error(`no calendar ${sourceUid}`);
    return call(
      done =>
        ecal.Client.connect(
          source,
          ecal.ClientSourceType.EVENTS,
          CONNECT_WAIT,
          this.cancellable,
          done,
        ),
      result => {
        const client = ecal.Client.connect_finish(result);
        session.opened.push(client);
        return client;
      },
    );
  }

  private loadLibraries(): Promise<Libraries> {
    this.libraries ??= (async () => {
      const { default: eds } = await import('gi://EDataServer?version=1.2');
      const { default: ecal } = await import('gi://ECal?version=2.0');
      return { EDataServer: eds, ECal: ecal };
    })();
    return this.libraries;
  }
}
