// Where the results below the local ones come from: installed apps, the
// search sources of modules and the search providers of GNOME apps.
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import St from 'gi://St';

import { getDefault as getParentalControls } from 'resource:///org/gnome/shell/misc/parentalControlsManager.js';
import {
  loadRemoteSearchProviders,
  type RemoteSearchProvider,
} from 'resource:///org/gnome/shell/ui/remoteSearch.js';

import type { Result } from '../../api.js';
import { uniqueById } from '../../lib/diff.js';
import type { Guard } from '../kit.js';
import type { Item } from './results.js';

export const MAX_APPS = 5;
export const MAX_PER_SOURCE = 5;
export const MAX_PER_PROVIDER = 3;

const SEARCH_PROVIDERS_SCHEMA = 'org.gnome.desktop.search-providers';

function text(value: unknown): string {
  if (typeof value === 'string') return value;
  return value === undefined || value === null ? '' : String(value);
}

/**
 * Results of a module as lines of the list. Whatever the module put into them,
 * the list gets strings and a usable icon, and its callbacks cannot throw.
 */
export function fromResults(results: unknown, guard: Guard, icon: string, max: number): Item[] {
  if (!Array.isArray(results)) return [];
  const items: Item[] = [];
  for (const result of results as Partial<Result>[]) {
    if (!result || typeof result.activate !== 'function') continue;
    const { alternate } = result;
    const own = result.icon;
    items.push({
      id: text(result.id),
      title: text(result.title),
      subtitle: text(result.subtitle) || undefined,
      icon: typeof own === 'string' || own instanceof Gio.Icon ? own : icon,
      iconStyle: typeof own === 'string' || !(own instanceof Gio.Icon) ? 'symbolic' : 'app',
      hint: text(result.hint) || undefined,
      activate: () => guard.call(() => result.activate!()),
      alternate:
        typeof alternate === 'function'
          ? () => guard.call(() => alternate.call(result))
          : undefined,
    });
  }
  return uniqueById(items).slice(0, max);
}

/** Installed apps for the words of a query, ordered as in the overview of the shell. */
export function searchApps(terms: readonly string[]): Item[] {
  const apps = Shell.AppSystem.get_default();
  const usage = Shell.AppUsage.get_default();
  const parental = getParentalControls();
  const items: Item[] = [];
  for (const group of Shell.AppSystem.search(terms.join(' '))) {
    const found = group
      .map(id => apps.lookup_app(id))
      .filter(app => app !== null && parental.shouldShowApp(app.app_info));
    found.sort((a, b) => usage.compare(a.get_id(), b.get_id()));
    for (const app of found) {
      items.push({
        id: app.get_id(),
        title: app.get_name(),
        subtitle: app.get_description() || undefined,
        icon: app.get_icon(),
        iconStyle: 'app',
        activate: () => app.activate(),
        alternate: () => app.open_new_window(-1),
      });
      if (items.length === MAX_APPS) return items;
    }
  }
  return items;
}

/** The search providers of GNOME apps: loaded on first use, again after a change of the settings. */
export class RemoteProviders {
  private settings: Gio.Settings | null = null;
  private providers: RemoteSearchProvider[] | null = null;

  /** False until load() ran, and again after the settings changed. */
  get loaded(): boolean {
    return this.providers !== null;
  }

  /** The providers in the order of the settings. Creates one D-Bus proxy each, so it is kept. */
  load(): RemoteSearchProvider[] {
    if (!this.settings) {
      this.settings = new Gio.Settings({ schema_id: SEARCH_PROVIDERS_SCHEMA });
      const drop = () => (this.providers = null);
      this.settings.connectObject(
        'changed::disabled',
        drop,
        'changed::enabled',
        drop,
        'changed::disable-external',
        drop,
        'changed::sort-order',
        drop,
        this,
      );
      Shell.AppSystem.get_default().connectObject('installed-changed', drop, this);
    }
    this.providers ??= loadRemoteSearchProviders(this.settings);
    return this.providers;
  }

  destroy(): void {
    this.settings?.disconnectObject(this);
    if (this.settings) Shell.AppSystem.get_default().disconnectObject(this);
    this.settings = null;
    this.providers = null;
  }
}

/** True when a module stands in for this provider. Desktop ids match with or without `.desktop`. */
export function isReplaced(provider: RemoteSearchProvider, replaced: readonly string[]): boolean {
  const bare = (id: string) => id.replace(/\.desktop$/, '');
  return replaced.some(id => bare(id) === bare(provider.id));
}

/** Asks one provider. Null when the query was cancelled meanwhile. */
export async function searchProvider(
  provider: RemoteSearchProvider,
  terms: string[],
  cancellable: Gio.Cancellable,
): Promise<Item[] | null> {
  const ids = await provider.getInitialResultSet(terms, cancellable);
  if (cancellable.is_cancelled()) return null;
  if (ids.length === 0) return [];
  const wanted = provider.filterResults(ids, MAX_PER_PROVIDER).slice(0, MAX_PER_PROVIDER);
  const metas = await provider.getResultMetas(wanted, cancellable);
  if (cancellable.is_cancelled()) return null;
  const fallback = provider.appInfo.get_icon() ?? undefined;
  return metas.slice(0, MAX_PER_PROVIDER).map(meta => ({
    id: text(meta.id),
    title: text(meta.name),
    subtitle: text(meta.description) || undefined,
    icon: fallback,
    iconStyle: 'app' as const,
    createIcon: (size: number) => meta.createIcon(size),
    activate: () => {
      provider.activateResult(meta.id, terms);
      if (meta.clipboardText)
        St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, meta.clipboardText);
    },
  }));
}
