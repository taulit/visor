// The part of Evolution's calendar libraries the Join button uses. There are
// no type packages for them here, and they are only ever imported dynamically.
declare module 'gi://EDataServer?version=1.2' {
  import type Gio from 'gi://Gio';
  import type GObject from 'gi://GObject';

  namespace EDataServer {
    class Source extends GObject.Object {}
    class SourceRegistry extends GObject.Object {
      static new(cancellable: Gio.Cancellable | null, callback: Gio.AsyncReadyCallback): void;
      static new_finish(result: Gio.AsyncResult): SourceRegistry;
      ref_source(uid: string): Source | null;
    }
  }
  export default EDataServer;
}

declare module 'gi://ECal?version=2.0' {
  import type Gio from 'gi://Gio';
  import type GObject from 'gi://GObject';
  import type EDataServer from 'gi://EDataServer?version=1.2';

  namespace ECal {
    enum ClientSourceType {
      EVENTS,
    }
    /** An ICalGLib.Component. */
    interface Component {
      get_location(): string | null;
      get_description(): string | null;
      as_ical_string(): string | null;
    }
    class Client extends GObject.Object {
      static connect(
        source: EDataServer.Source,
        type: ClientSourceType,
        waitForConnectedSeconds: number,
        cancellable: Gio.Cancellable | null,
        callback: Gio.AsyncReadyCallback,
      ): void;
      static connect_finish(result: Gio.AsyncResult): Client;
      get_object(
        uid: string,
        rid: string | null,
        cancellable: Gio.Cancellable | null,
        callback: Gio.AsyncReadyCallback,
      ): void;
      get_object_finish(result: Gio.AsyncResult): [boolean, Component | null];
    }
  }
  export default ECal;
}
