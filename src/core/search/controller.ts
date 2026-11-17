// The search: takes the text of the entry, asks the parser and the providers,
// and keeps the list of results below the search row up to date.
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import type { RemoteSearchProvider } from 'resource:///org/gnome/shell/ui/remoteSearch.js';

import type { Command } from '../../api.js';
import { ownGuard } from '../kit.js';
import { metricsOn, reportSearch } from '../metrics.js';
import type { ModuleEntry, Registry, SearchParts } from '../registry.js';
import type { SearchMount } from '../sheet.js';
import { formatResult } from './calc.js';
import { RatesStore } from './currency.js';
import { completions, localeOf, rateLine } from './model.js';
import { parseQuery, type Query } from './parser.js';
import {
  fromResults,
  isReplaced,
  MAX_APPS,
  MAX_PER_SOURCE,
  RemoteProviders,
  searchApps,
  searchProvider,
} from './providers.js';
import { convert, formatMoney, homeCurrencyForRegion } from './rates.js';
import { Results, type Group, type Item } from './results.js';

/** A command can offer more than one thing to do; more than this is not a command any more. */
const MAX_PER_COMMAND = 5;
const CALC_ICON = 'accessories-calculator-symbolic';
/** How often, 10 ms apart, the search waits for the D-Bus proxies of freshly loaded providers. */
const PROXY_WAITS = 50;
/** Microseconds a change of the list may spend before new icons are left for later. */
const ICON_BUDGET = 6000;

export interface SearchHost {
  /** Closes the panel. */
  close(): void;
}

/** How long the last query took, in microseconds. */
export interface SearchTiming {
  /** Until commands, calculation and apps were in the list. */
  local: number;
  /** Until the modules and the GNOME search providers were asked as well. */
  total: number;
}

function text(value: unknown): string {
  if (typeof value === 'string') return value;
  return value === undefined || value === null ? '' : String(value);
}

function isActivateKey(symbol: number): boolean {
  return (
    symbol === Clutter.KEY_Return ||
    symbol === Clutter.KEY_KP_Enter ||
    symbol === Clutter.KEY_ISO_Enter
  );
}

export class Search {
  /** For the tests. */
  timing: SearchTiming | null = null;

  private results: Results | null = null;
  private rates: RatesStore | null = null;
  private remote = new RemoteProviders();
  private locale: string | undefined;
  private homeCurrency = 'EUR';

  /** Counts the queries; an answer that belongs to an older one is dropped. */
  private generation = 0;
  private cancellable: Gio.Cancellable | null = null;
  /** The text the list was built for. */
  private text = '';
  private query: Query | null = null;
  /** The groups in the order they are shown; `items` of a group is replaced, never changed. */
  private groups: Group[] = [];
  /** Shown below everything else. */
  private completion: Group | null = null;
  /** The command whose results are in the first group. */
  private command: Command | null = null;
  private none: Group | null = null;
  private shown = false;
  /** The source that loads the GNOME search providers, or waits for their proxies. */
  private idle = 0;

  constructor(
    private mount: SearchMount,
    private registry: Registry,
    private settings: Gio.Settings,
    private gettext: (s: string) => string,
    private host: SearchHost,
  ) {
    mount.setQueryHandler(query => this.onQuery(query));
    mount.setKeyHandler(event => this.onKey(event));
  }

  /** Modules came or went: what they add to the search changed. */
  modulesChanged(): void {
    if (this.text.trim() === '') return;
    const current = this.text;
    this.text = '';
    this.onQuery(current);
  }

  /** The panel closed: the running query is cancelled and nothing is left of it. */
  closed(): void {
    this.cancel();
    this.text = '';
    this.clear();
    this.rates?.stop();
  }

  destroy(): void {
    this.closed();
    this.mount.setQueryHandler(null);
    this.mount.setKeyHandler(null);
    this.rates?.destroy();
    this.rates = null;
    this.remote.destroy();
    this.results?.destroy();
    this.results = null;
  }

  // --- query ---

  private onQuery(input: string): void {
    if (input === this.text) return;
    const start = GLib.get_monotonic_time();
    this.cancel();
    this.text = input;
    if (input.trim() === '') {
      this.clear();
      return;
    }
    this.start();
    const _ = this.gettext;
    const { generation } = this;
    const cancellable = (this.cancellable = new Gio.Cancellable());
    const parts = this.registry.searchParts();
    const query = (this.query = parseQuery(input, {
      commands: parts.commands.map(({ command }) => command.keyword),
      locale: this.locale,
      homeCurrency: this.homeCurrency,
    }));
    // As typed, the way the shell hands them to apps and providers.
    const terms = query.text.split(/\s+/);

    // What the slower groups showed for the previous text stays until they answer.
    const previous = new Map(this.groups.map(group => [group.id, group.items]));
    const groups: Group[] = (this.groups = []);
    groups.push({
      id: 'command',
      label: _('Commands'),
      items: this.commandItems(query, parts, previous.get('command'), generation),
    });
    // A recognised command is the whole answer: 'timer' neither launches an app from a
    // group further down nor asks anybody else.
    const recognised = query.command !== null && parts.commands[query.command.index] !== undefined;
    const sources = recognised ? [] : parts.sources;
    if (!recognised) {
      groups.push({ id: 'calc', label: _('Calculate'), items: this.calcItems(query) });
      groups.push({ id: 'apps', label: _('Apps'), items: searchApps(terms) });
    }
    for (const { entry, source } of sources) {
      const id = `source:${entry.module.id}`;
      groups.push({
        id,
        label: text(source.title) || entry.module.name,
        items: previous.get(id) ?? [],
      });
    }
    const providers =
      recognised || this.remote.loaded ? this.providersFor(parts, previous, recognised) : null;
    // Completing a keyword is offered last: Enter on 't' launches the first app, not 'timer'.
    this.completion = {
      id: 'complete',
      label: _('Commands'),
      items: recognised ? [] : this.completionItems(query, parts),
    };
    this.render(true, start);
    const local = GLib.get_monotonic_time() - start;

    for (const { entry, source } of sources)
      this.askSource(entry, source.search.bind(source), query.text, generation, cancellable);
    if (providers) {
      this.askProviders(providers, terms, generation, cancellable);
    } else {
      // Loading them reads files and creates a D-Bus proxy each; the first results do not wait for that.
      this.idle = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        this.idle = 0;
        this.askProviders(this.providersFor(parts, previous), terms, generation, cancellable);
        return GLib.SOURCE_REMOVE;
      });
    }

    this.timing = { local, total: GLib.get_monotonic_time() - start };
    if (metricsOn(this.settings)) reportSearch(local, this.timing.total);
  }

  /** Built on the first query, not before. */
  private start(): void {
    if (this.results) return;
    const _ = this.gettext;
    this.results = new Results({ activate: item => this.choose(item, false) });
    this.rates = new RatesStore(this.settings, () => this.ratesChanged());
    const { locale, region } = localeOf(GLib.get_language_names());
    this.locale = locale;
    this.homeCurrency = region ? homeCurrencyForRegion(region) : 'EUR';
    this.none = { id: 'none', label: '', items: [{ id: 'none', title: _('No results') }] };
    this.results.reserve('command', 1);
    this.results.reserve('calc', 1);
    this.results.reserve('apps', MAX_APPS);
  }

  /**
   * The first key in the entry: what the first query would otherwise pay for
   * is done now, in the 40 ms before that query arrives.
   */
  private warmUp(): void {
    this.start();
    const query = parseQuery('1+1', { commands: [], locale: this.locale, homeCurrency: 'EUR' });
    if (query.calc) formatResult(query.calc.value, this.locale);
    searchApps(['a']);
  }

  /** Ends the running query: its answers are dropped from now on. */
  private cancel(): void {
    this.generation++;
    this.cancellable?.cancel();
    this.cancellable = null;
    if (this.idle) GLib.source_remove(this.idle);
    this.idle = 0;
  }

  private clear(): void {
    this.query = null;
    this.command = null;
    this.groups = [];
    this.completion = null;
    if (this.shown) this.mount.setOverlay(null);
    this.shown = false;
    this.results?.set([], true);
  }

  private render(fresh: boolean, start = GLib.get_monotonic_time()): void {
    if (!this.results) return;
    const groups = this.completion ? [...this.groups, this.completion] : this.groups;
    const empty = groups.every(group => group.items.length === 0);
    this.results.set(
      empty && this.none ? [...groups, this.none] : groups,
      fresh,
      start + ICON_BUDGET,
    );
    if (!this.shown) this.mount.setOverlay(this.results.actor);
    this.shown = true;
  }

  /** Puts the answer of a group into the list, unless it belongs to an older query. */
  private update(id: string, items: Item[], generation: number): void {
    if (generation !== this.generation) return;
    const group = this.groups.find(other => other.id === id);
    if (!group) return;
    group.items = items;
    this.render(false);
  }

  // --- the groups ---

  private commandItems(
    query: Query,
    parts: SearchParts,
    previous: Item[] | undefined,
    generation: number,
  ): Item[] {
    const last = this.command;
    this.command = null;
    const match = query.command ? parts.commands[query.command.index] : undefined;
    if (!query.command || !match) return [];

    const { entry, command } = match;
    const { icon, name } = entry.module;
    // Incomplete arguments: the example says what is missing.
    const hint: Item[] = [
      { id: 'hint', title: text(command.hint) || query.command.keyword, subtitle: name, icon },
    ];
    const toItems = (results: unknown): Item[] => {
      const items = fromResults(results, entry.guard, icon, MAX_PER_COMMAND);
      return items.length > 0 ? items : hint;
    };
    let resolved: unknown;
    try {
      resolved = command.resolve(query.command.args);
    } catch (e) {
      this.report(entry, e);
      return hint;
    }
    this.command = command;
    if (!(resolved instanceof Promise)) return toItems(resolved);
    resolved.then(
      results => this.update('command', toItems(results), generation),
      e => {
        this.report(entry, e);
        this.update('command', hint, generation);
      },
    );
    return last === command && previous && previous.length > 0 ? previous : hint;
  }

  /** `tim` offers `timer`: choosing the line writes the keyword into the entry. */
  private completionItems(query: Query, parts: SearchParts): Item[] {
    const _ = this.gettext;
    return completions(
      query.text,
      parts.commands.map(({ command }) => command.keyword),
    ).flatMap(({ index, keyword }) => {
      const offered = parts.commands[index];
      if (!offered) return [];
      return {
        id: `complete:${offered.entry.module.id}:${keyword}`,
        title: keyword,
        subtitle: text(offered.command.hint) || offered.entry.module.name,
        icon: offered.entry.module.icon,
        hint: _('Enter completes'),
        keepOpen: true,
        activate: () => this.mount.setQuery(`${keyword} `),
      };
    });
  }

  private calcItems(query: Query): Item[] {
    const _ = this.gettext;
    if (query.calc) {
      const value = formatResult(query.calc.value, this.locale);
      return [
        {
          id: 'calc',
          title: `= ${value}`,
          icon: CALC_ICON,
          large: true,
          hint: _('Enter copies'),
          activate: () => this.copy(value),
        },
      ];
    }
    const { currency } = query;
    const store = this.rates;
    if (!currency || !store) return [];
    if (!store.enabled) return [{ id: 'rates', title: _('Currency rates are turned off') }];
    const rates = store.get();
    if (!rates) return [{ id: 'rates', title: _('Rates are loading') }];
    const amount = convert(currency.amount, currency.from, currency.to, rates.rates);
    if (amount === null) return [];
    const value = formatMoney(amount, currency.to, this.locale);
    return [
      {
        id: 'currency',
        title: value,
        subtitle: rateLine(currency, rates, this.locale) ?? undefined,
        icon: CALC_ICON,
        large: true,
        hint: _('Enter copies'),
        activate: () => this.copy(value),
      },
    ];
  }

  /** Rates arrived, or the setting was switched, while a conversion is on screen. */
  private ratesChanged(): void {
    if (this.query?.currency) this.update('calc', this.calcItems(this.query), this.generation);
  }

  private askSource(
    entry: ModuleEntry,
    search: (query: string, cancellable: Gio.Cancellable) => Promise<unknown>,
    query: string,
    generation: number,
    cancellable: Gio.Cancellable,
  ): void {
    const id = `source:${entry.module.id}`;
    const failed = (e: unknown) => {
      // A module may well pass on that its own work was cancelled.
      if (!cancellable.is_cancelled()) this.report(entry, e);
      this.update(id, [], generation);
    };
    try {
      Promise.resolve(search(query, cancellable)).then(
        results =>
          this.update(
            id,
            fromResults(results, entry.guard, entry.module.icon, MAX_PER_SOURCE),
            generation,
          ),
        failed,
      );
    } catch (e) {
      failed(e);
    }
  }

  /** The providers no module stands in for, each with its group at the end of the list. */
  private providersFor(
    parts: SearchParts,
    previous: Map<string, Item[]>,
    none = false,
  ): RemoteSearchProvider[] {
    if (none) return [];
    const providers = this.remote.load().filter(provider => !isReplaced(provider, parts.replaced));
    for (const provider of providers) {
      const id = `provider:${provider.id}`;
      this.groups.push({
        id,
        label: provider.appInfo.get_name(),
        items: previous.get(id) ?? [],
      });
    }
    return providers;
  }

  private askProviders(
    providers: RemoteSearchProvider[],
    terms: string[],
    generation: number,
    cancellable: Gio.Cancellable,
    waits = PROXY_WAITS,
  ): void {
    // A proxy without a connection cannot be called yet; the shell creates them long before it searches.
    const ready = providers.filter(provider => provider.proxy.get_connection() !== null);
    if (ready.length < providers.length && waits > 0) {
      this.idle = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
        this.idle = 0;
        this.askProviders(providers, terms, generation, cancellable, waits - 1);
        return GLib.SOURCE_REMOVE;
      });
      return;
    }
    for (const provider of ready) {
      searchProvider(provider, terms, cancellable).then(
        items => {
          if (items) this.update(`provider:${provider.id}`, items, generation);
        },
        e => {
          logError(e as Error, `Visor: search provider ${provider.id}`);
          this.update(`provider:${provider.id}`, [], generation);
        },
      );
    }
  }

  /** Logs what a module threw, once per module, as the registry does for everything else. */
  private report(entry: ModuleEntry, error: unknown): void {
    entry.guard.call(() => {
      throw error;
    });
  }

  // --- choosing ---

  private onKey(event: Clutter.Event): boolean {
    if (!this.results) this.warmUp();
    const symbol = event.get_key_symbol();
    const step = symbol === Clutter.KEY_Down ? 1 : symbol === Clutter.KEY_Up ? -1 : 0;
    if (step === 0 && !isActivateKey(symbol)) return false;
    // A key right after typing: the list has to be the one for the text in the entry.
    if (this.mount.query !== this.text) this.onQuery(this.mount.query);
    if (!this.shown || !this.results) return false;
    if (step !== 0) {
      this.results.move(step);
      return true;
    }
    const item = this.results.selected;
    const alternate = (event.get_state() & Clutter.ModifierType.CONTROL_MASK) !== 0;
    if (item) this.choose(item, alternate);
    return true;
  }

  private choose(item: Item, alternate: boolean): void {
    const run = alternate ? item.alternate : item.activate;
    if (!run) return;
    // First the panel, so that what the result opens gets the focus and may open the panel again.
    if (!item.keepOpen) this.host.close();
    ownGuard.call(run);
  }

  private copy(value: string): void {
    St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, value);
  }
}
