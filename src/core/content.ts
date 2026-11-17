// The content half of Visor: owns the registry, the sheet and the peek chips,
// and talks to the notch only through the contract in types.ts.
import type Clutter from 'gi://Clutter';
import type Gio from 'gi://Gio';
import type St from 'gi://St';

import type { ModuleOwner, PeekChip, VisorApi } from '../api.js';
import { disposeHttpSession } from '../lib/http.js';
import { Peek } from './peek.js';
import { Registry, type ModuleEntry, type RegistryListener } from './registry.js';
import { Search } from './search/controller.js';
import { Sheet } from './sheet.js';
import type { Attention, NotchContent, NotchHost, NotchState } from './types.js';

export class Content implements NotchContent, RegistryListener {
  /** The module API. Other extensions reach it through the Visor extension object. */
  readonly api: VisorApi;

  private registry: Registry;
  private sheet: Sheet;
  private peek: Peek;
  /** The search behind the entry of the sheet. Does nothing until the first query. */
  private finder: Search;
  private host: NotchHost | null = null;
  private attention: Attention = null;
  /** The view a module asked for with ctx.open(view), until the panel is open. */
  private pendingView: string | undefined;
  /** The module whose chip was clicked, until the panel is open. */
  private pendingMark: string | undefined;
  private syncing = false;
  private syncAgain = false;

  constructor(settings: Gio.Settings, extension: ModuleOwner) {
    this.registry = new Registry(settings, extension);
    this.api = this.registry.api;
    this.sheet = new Sheet(this.registry, settings, s => extension.gettext(s), {
      changed: () => this.host?.contentChanged(),
    });
    this.finder = new Search(this.sheet, this.registry, settings, s => extension.gettext(s), {
      close: () => this.close(),
    });
    this.peek = new Peek(this.registry, {
      activate: id => this.openAt(id),
      changed: () => this.host?.contentChanged(),
    });
    this.registry.setListener(this);
  }

  setHost(host: NotchHost): void {
    this.host = host;
    host.setAttention(this.attention);
  }

  // --- NotchContent ---

  hasPeek(): boolean {
    return this.peek.hasChips();
  }

  getPeek(): St.Widget {
    return this.peek.getActor();
  }

  getSheet(): St.Widget {
    return this.sheet.getActor();
  }

  sheetWidth(): number {
    return this.sheet.width();
  }

  stateChanged(state: NotchState, previous: NotchState): void {
    // A view asked for with ctx.open(view) is meant for the very next state, nothing later.
    const view = this.pendingView;
    const mark = this.pendingMark;
    this.pendingView = this.pendingMark = undefined;
    const open = state === 'open';
    if (open === (previous === 'open')) return;
    if (open) {
      this.sheet.opened(view);
      if (mark) this.sheet.mark(mark);
    } else {
      this.sheet.closed();
      this.finder.closed();
    }
    this.registry.setOpen(open);
  }

  pressed(target: Clutter.Actor | null): void {
    const id = this.peek.chipAt(target);
    if (id === null) return;
    // A dock module has no section in the main view; its view is the place.
    if (this.registry.get(id)?.module.slot === 'dock') this.pendingView = id;
    else this.pendingMark = id;
  }

  handleEscape(): boolean {
    return this.sheet.handleEscape();
  }

  destroy(): void {
    this.host = null;
    // Modules first: their disable() may still touch widgets they built.
    this.registry.setOpen(false);
    this.registry.destroy();
    this.finder.destroy();
    this.sheet.destroy();
    this.peek.destroy();
    disposeHttpSession();
  }

  // --- RegistryListener ---

  modulesChanged(): void {
    // Building a section can fail and change the modules again while we are at it.
    if (this.syncing) {
      this.syncAgain = true;
      return;
    }
    this.syncing = true;
    try {
      do {
        this.syncAgain = false;
        this.sheet.sync();
        this.peek.sync();
        this.finder.modulesChanged();
      } while (this.syncAgain);
    } finally {
      this.syncing = false;
    }
  }

  rowsChanged(entry: ModuleEntry): void {
    this.sheet.rowsChanged(entry);
  }

  chipChanged(_entry: ModuleEntry): void {
    this.peek.sync();
  }

  flash(entry: ModuleEntry, chip: PeekChip): void {
    this.peek.flash(entry, chip);
    this.host?.flash();
  }

  badgeChanged(entry: ModuleEntry): void {
    this.sheet.badgeChanged(entry);
  }

  attentionChanged(attention: Attention): void {
    this.attention = attention;
    this.host?.setAttention(attention);
  }

  open(view?: string): void {
    if (!this.host) return;
    if (this.host.state === 'open') {
      this.sheet.showView(view ?? null);
      return;
    }
    this.pendingView = view;
    this.host.open();
  }

  close(): void {
    this.host?.close();
  }

  /** A chip was activated, with the keyboard: the panel opens on what the chip is about. */
  private openAt(id: string): void {
    if (!this.host) return;
    const dock = this.registry.get(id)?.module.slot === 'dock';
    // With the pointer the press has opened the panel already, see pressed().
    if (this.host.state === 'open') {
      if (dock) this.sheet.showView(id);
      else this.sheet.mark(id);
      return;
    }
    if (dock) this.pendingView = id;
    else this.pendingMark = id;
    this.host.open();
  }
}
