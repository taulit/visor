// The shell's loader for GNOME search providers has no type declarations.
// Shapes as verified in docs/verified.md, section 10.
declare module 'resource:///org/gnome/shell/ui/remoteSearch.js' {
  import type Clutter from 'gi://Clutter';
  import type Gio from 'gi://Gio';

  export interface RemoteResultMeta {
    id: string;
    name: string;
    description?: string;
    createIcon(size: number): Clutter.Actor | null;
    clipboardText?: string;
  }

  export interface RemoteSearchProvider {
    readonly id: string;
    readonly appInfo: Gio.AppInfo;
    /** Created with init_async(): it has no connection until that finished. */
    readonly proxy: Gio.DBusProxy;
    getInitialResultSet(terms: string[], cancellable: Gio.Cancellable): Promise<string[]>;
    getResultMetas(ids: string[], cancellable: Gio.Cancellable): Promise<RemoteResultMeta[]>;
    filterResults(ids: string[], max: number): string[];
    activateResult(id: string, terms: string[]): void;
  }

  export function loadRemoteSearchProviders(settings: Gio.Settings): RemoteSearchProvider[];
}
