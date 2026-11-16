// The modules: who is registered, in which order, turned on or off, and what
// each one currently contributes. The registry holds data only; the sheet and
// the peek row turn it into widgets.
import type Gio from 'gi://Gio';
import type St from 'gi://St';

import {
  API_VERSION,
  type Kit,
  type ModuleContext,
  type ModuleOwner,
  type NowRow,
  type PeekChip,
  type Slot,
  type VisorApi,
  type VisorModule,
} from '../api.js';
import { uniqueById } from '../lib/diff.js';
import { httpSession } from '../lib/http.js';
import { aggregateAttention, declaredApi, isValidModuleId, orderIds } from '../lib/modules.js';
import { createKit, type Guard } from './kit.js';
import type { Attention } from './types.js';

const SLOTS: readonly Slot[] = ['now', 'ahead', 'dock'];

export interface ModuleEntry {
  readonly module: VisorModule;
  /** Null for the modules of Visor itself. */
  readonly owner: ModuleOwner | null;
  /** Runs callbacks of the module; exceptions end in the log, once per module. */
  readonly guard: Guard;
  /** enable() ran and disable() did not yet. */
  active: boolean;
  /** Counts the calls of enable(), so widgets built for an earlier run can be told apart. */
  generation: number;
  /** Something of the module threw while it was set up; it stays out until it is turned on again. */
  failed: boolean;
  rows: NowRow[];
  chip: PeekChip | null;
  badge: number | null;
  attention: Attention;
}

interface InternalEntry extends ModuleEntry {
  reported: boolean;
  openCallbacks: Set<(open: boolean) => void>;
}

/** A module that was refused because it was built for another version of the API. */
export interface IncompatibleModule {
  id: string;
  name: string;
  /** UUID of the extension the module came from. */
  uuid: string;
  /** The version the extension asked for. */
  api: number;
}

/** What the registry tells the content about. */
export interface RegistryListener {
  /** Modules were added, removed, turned on or off, or put in another order. */
  modulesChanged(): void;
  rowsChanged(entry: ModuleEntry): void;
  chipChanged(entry: ModuleEntry): void;
  /** The module wants its chip shown for a moment because something happened. */
  flash(entry: ModuleEntry, chip: PeekChip): void;
  badgeChanged(entry: ModuleEntry): void;
  attentionChanged(attention: Attention): void;
  open(view?: string): void;
  close(): void;
}

export class Registry {
  readonly api: VisorApi;
  /** Modules refused for their API version, for the settings to list. */
  readonly incompatible: IncompatibleModule[] = [];

  private entries = new Map<string, InternalEntry>();
  private listener: RegistryListener | null = null;
  private open = false;
  private attention: Attention = null;
  private destroyed = false;

  constructor(
    private settings: Gio.Settings,
    private extension: ModuleOwner,
  ) {
    this.api = {
      version: API_VERSION,
      register: (module, owner) => this.register(module, owner),
      unregister: id => this.unregister(id),
    };
    settings.connectObject(
      'changed::disabled-modules',
      () => this.applyDisabled(),
      'changed::module-order',
      () => this.listener?.modulesChanged(),
      this,
    );
  }

  setListener(listener: RegistryListener | null): void {
    this.listener = listener;
  }

  /** Every registered module in display order, turned off ones included. */
  all(): ModuleEntry[] {
    const order = orderIds([...this.entries.keys()], this.settings.get_strv('module-order'));
    return order.map(id => this.entries.get(id)!);
  }

  /** The running modules of a slot in display order. */
  active(slot: Slot): ModuleEntry[] {
    return this.all().filter(entry => entry.active && entry.module.slot === slot);
  }

  get(id: string): ModuleEntry | null {
    return this.entries.get(id) ?? null;
  }

  isDisabled(id: string): boolean {
    return this.settings.get_strv('disabled-modules').includes(id);
  }

  /** Turns a module on or off by writing the setting; the module follows through the change signal. */
  setEnabled(id: string, enabled: boolean): void {
    const disabled = this.settings.get_strv('disabled-modules').filter(other => other !== id);
    if (!enabled) disabled.push(id);
    this.settings.set_strv('disabled-modules', disabled);
  }

  /** Tells the modules that the panel opened or closed. */
  setOpen(open: boolean): void {
    if (open === this.open) return;
    this.open = open;
    for (const entry of [...this.entries.values()]) {
      if (!entry.active) continue;
      for (const callback of [...entry.openCallbacks]) entry.guard.call(() => callback(open));
    }
  }

  /** Builds the section of an 'ahead' module. Null when it has none or building failed. */
  buildSection(entry: ModuleEntry): St.Widget | null {
    return this.build(entry, 'buildSection');
  }

  /** Builds the view of a 'dock' module. Null when it has none or building failed. */
  buildView(entry: ModuleEntry): St.Widget | null {
    return this.build(entry, 'buildView');
  }

  destroy(): void {
    this.destroyed = true;
    this.listener = null;
    this.settings.disconnectObject(this);
    for (const entry of [...this.entries.values()].reverse()) this.stop(entry);
    this.entries.clear();
    this.incompatible.length = 0;
  }

  private register(module: VisorModule, owner?: ModuleOwner): void {
    if (this.destroyed) throw new Error('Visor is disabled');
    if (typeof module !== 'object' || module === null)
      throw new Error('Visor: register() needs a module object');
    const { id } = module;
    if (!isValidModuleId(id)) {
      throw new Error(
        `Visor: invalid module id ${JSON.stringify(id)}; use lower case letters, digits and dashes`,
      );
    }
    if (this.entries.has(id))
      throw new Error(`Visor: a module with the id '${id}' is already registered`);
    if (!SLOTS.includes(module.slot))
      throw new Error(`Visor: module '${id}' has the unknown slot ${JSON.stringify(module.slot)}`);
    if (typeof module.enable !== 'function' || typeof module.disable !== 'function')
      throw new Error(`Visor: module '${id}' needs enable() and disable()`);

    if (owner) {
      const api = declaredApi(owner.metadata);
      if (api !== null && api !== API_VERSION) {
        const index = this.incompatible.findIndex(other => other.id === id);
        if (index >= 0) this.incompatible.splice(index, 1);
        this.incompatible.push({ id, name: String(module.name ?? id), uuid: owner.uuid, api });
        throw new Error(
          `Visor: module '${id}' of ${owner.uuid} was built for module API ${api}, ` +
            `but this Visor has module API ${API_VERSION}`,
        );
      }
    }
    const index = this.incompatible.findIndex(other => other.id === id);
    if (index >= 0) this.incompatible.splice(index, 1);

    const entry: InternalEntry = {
      module,
      owner: owner ?? null,
      guard: {
        call: fn => {
          try {
            fn();
          } catch (e) {
            this.report(entry, e);
          }
        },
        build: fn => {
          try {
            return fn();
          } catch (e) {
            this.report(entry, e);
            return null;
          }
        },
      },
      active: false,
      generation: 0,
      failed: false,
      rows: [],
      chip: null,
      badge: null,
      attention: null,
      reported: false,
      openCallbacks: new Set(),
    };
    this.entries.set(id, entry);
    if (!this.isDisabled(id)) this.start(entry);
    this.listener?.modulesChanged();
  }

  private unregister(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.stop(entry);
    this.entries.delete(id);
    this.listener?.modulesChanged();
  }

  private applyDisabled(): void {
    const disabled = new Set(this.settings.get_strv('disabled-modules'));
    for (const entry of [...this.entries.values()]) {
      if (disabled.has(entry.module.id)) {
        this.stop(entry);
        // Turning a module off and on again is the way to retry one that failed.
        entry.failed = false;
        entry.reported = false;
      } else if (!entry.active && !entry.failed) {
        this.start(entry);
      }
    }
    this.listener?.modulesChanged();
  }

  private start(entry: InternalEntry): void {
    if (entry.active) return;
    entry.active = true;
    entry.generation++;
    try {
      entry.module.enable(this.createContext(entry));
    } catch (e) {
      this.fail(entry, e);
    }
  }

  private stop(entry: InternalEntry): void {
    if (!entry.active) return;
    entry.active = false;
    try {
      entry.module.disable();
    } catch (e) {
      this.report(entry, e);
    }
    entry.openCallbacks.clear();
    entry.rows = [];
    entry.chip = null;
    entry.badge = null;
    entry.attention = null;
    this.updateAttention();
  }

  /** Something the module needs to work threw: log it and leave the module out. */
  private fail(entry: InternalEntry, error: unknown): void {
    this.report(entry, error);
    entry.failed = true;
    this.stop(entry);
  }

  private report(entry: InternalEntry, error: unknown): void {
    if (entry.reported) return;
    entry.reported = true;
    logError(error as Error, `Visor: module '${entry.module.id}'`);
  }

  private build(entry: ModuleEntry, method: 'buildSection' | 'buildView'): St.Widget | null {
    const internal = entry as InternalEntry;
    if (!entry.active || typeof entry.module[method] !== 'function') return null;
    try {
      const widget = entry.module[method]();
      if (widget) return widget;
      throw new Error(`${method}() returned no widget`);
    } catch (e) {
      this.fail(internal, e);
      this.listener?.modulesChanged();
      return null;
    }
  }

  private updateAttention(): void {
    const attention = aggregateAttention(
      [...this.entries.values()].map(entry => (entry.active ? entry.attention : null)),
    );
    if (attention === this.attention) return;
    this.attention = attention;
    this.listener?.attentionChanged(attention);
  }

  private createContext(entry: InternalEntry): ModuleContext {
    const { owner } = entry;
    const { generation } = entry;
    // A context that outlives its module (a late callback, a forgotten reference) must not do anything.
    const alive = () => entry.active && entry.generation === generation;
    const getOpen = () => this.open;
    const getSettings = () => this.settings;
    const translator = owner ?? this.extension;
    let kit: Kit | null = null;
    let settings: Gio.Settings | null | undefined;

    return {
      get kit() {
        kit ??= createKit(entry.guard);
        return kit;
      },
      now: {
        set: rows => {
          if (!alive()) return;
          entry.rows = uniqueById(
            (Array.isArray(rows) ? rows : []).filter(row => row && typeof row.id === 'string'),
          );
          this.listener?.rowsChanged(entry);
        },
        clear: () => {
          if (!alive() || entry.rows.length === 0) return;
          entry.rows = [];
          this.listener?.rowsChanged(entry);
        },
      },
      peek: {
        set: chip => {
          if (!alive()) return;
          entry.chip = chip ?? null;
          this.listener?.chipChanged(entry);
        },
        flash: chip => {
          if (!alive() || !chip) return;
          this.listener?.flash(entry, chip);
        },
      },
      badge: count => {
        if (!alive()) return;
        entry.badge = count ?? null;
        this.listener?.badgeChanged(entry);
      },
      attention: kind => {
        if (!alive()) return;
        entry.attention = kind === 'waiting' || kind === 'unread' ? kind : null;
        this.updateAttention();
      },
      get settings() {
        if (settings === undefined) {
          if (owner) {
            try {
              settings = owner.getSettings();
            } catch {
              settings = null;
            }
          } else {
            settings = getSettings();
          }
        }
        return settings;
      },
      get http() {
        return httpSession();
      },
      get isOpen() {
        return getOpen();
      },
      onOpenChanged: callback => {
        if (!alive()) return () => {};
        entry.openCallbacks.add(callback);
        return () => entry.openCallbacks.delete(callback);
      },
      open: view => {
        if (alive()) this.listener?.open(view);
      },
      close: () => {
        if (alive()) this.listener?.close();
      },
      t: s => translator.gettext(s),
    };
  }
}
