// The content half of Visor: owns the registry, the sheet and the peek chips,
// and talks to the notch only through the contract in types.ts.
import type Gio from 'gi://Gio';
import type St from 'gi://St';

import type { ModuleOwner, PeekChip, VisorApi } from '../api.js';
import { disposeHttpSession } from '../lib/http.js';
import { Peek } from './peek.js';
import {
  Registry,
  type IncompatibleModule,
  type ModuleEntry,
  type RegistryListener,
} from './registry.js';
import { Sheet, type SearchMount } from './sheet.js';
import type { Attention, NotchContent, NotchHost, NotchState } from './types.js';

export class Content implements NotchContent, RegistryListener {
  /** The module API. Other extensions reach it through the Visor extension object. */
  readonly api: VisorApi;

  private registry: Registry;
  private sheet: Sheet;
  private peek: Peek;
  private host: NotchHost | null = null;
  private attention: Attention = null;
  /** The view a module asked for with ctx.open(view), until the panel is open. */
  private pendingView: string | undefined;
  private syncing = false;
  private syncAgain = false;

  constructor(settings: Gio.Settings, extension: ModuleOwner) {
    this.registry = new Registry(settings, extension);
    this.api = this.registry.api;
    this.sheet = new Sheet(this.registry, settings, s => extension.gettext(s), {
      changed: () => this.contentChanged(this.sheet.widget),
    });
    this.peek = new Peek(this.registry, {
      activate: () => this.host?.open(),
      changed: () => this.contentChanged(this.peek.widget),
    });
    this.registry.setListener(this);
  }

  setHost(host: NotchHost): void {
    this.host = host;
    host.setAttention(this.attention);
  }

  /** Where the search hooks into the sheet. */
  get search(): SearchMount {
    return this.sheet;
  }

  /** Modules that were refused because they need another version of the API. */
  get incompatibleModules(): readonly IncompatibleModule[] {
    return this.registry.incompatible;
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
    this.pendingView = undefined;
    const open = state === 'open';
    if (open === (previous === 'open')) return;
    if (open) {
      this.sheet.opened(view);
    } else {
      this.sheet.closed();
    }
    this.registry.setOpen(open);
  }

  handleEscape(): boolean {
    return this.sheet.handleEscape();
  }

  destroy(): void {
    this.host = null;
    // Modules first: their disable() may still touch widgets they built.
    this.registry.destroy();
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

  /**
   * Tells the notch to measure again. A size the notch may have set on the
   * widget is dropped first, so it sees the natural size and not its own old one.
   */
  private contentChanged(widget: St.Widget | null): void {
    widget?.set_size(-1, -1);
    this.host?.contentChanged();
  }
}
