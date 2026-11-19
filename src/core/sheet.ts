// The open panel: search row with the dock, "Now" on the left, the sections of
// the 'ahead' modules on the right, and the views of the dock modules.
import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import type Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';

import { ensureActorVisibleInScrollView } from 'resource:///org/gnome/shell/misc/animationUtils.js';

import type { Kit, KitSection, RowProps, Slot } from '../api.js';
import { diffIds } from '../lib/diff.js';
import { badgeText } from '../lib/modules.js';
import { leftColumnWidth, sheetWidth } from '../lib/widths.js';
import { createKit, ownGuard, Row, scaleFactor } from './kit.js';
import type { ModuleEntry, Registry } from './registry.js';
import { Tooltip } from './tooltip.js';
import type { Updater } from './updater.js';

/** Name of the built-in view that lists the modules. No module can have this id. */
const MODULES_VIEW = ':modules';
const SEARCH_DEBOUNCE_MS = 40;
/** How long the section of a clicked chip stays highlighted. */
const MARK_MS = 1400;
const MARK_CLASS = 'visor-marked';
/**
 * Sections that sit below "Now" in the left column while the panel has two,
 * so both columns are about as tall. Alone in a column they stay in order.
 */
const LEFT_WHEN_SPLIT: ReadonlySet<string> = new Set(['notifications']);

/** What the search needs from the sheet. The search itself is not part of the sheet. */
export interface SearchMount {
  /** Text of the search entry. */
  readonly query: string;
  /** Called with the text of the entry, 40 ms after the last key. */
  setQueryHandler(handler: ((query: string) => void) | null): void;
  /** Shows a widget right below the search row, above the columns. Null hides it. */
  setOverlay(widget: St.Widget | null): void;
  clearQuery(): void;
  /** Replaces the text of the entry and reports it at once; the cursor goes to the end. */
  setQuery(query: string): void;
  /** Gets every key press in the entry first. True means the key was used up. */
  setKeyHandler(handler: ((event: Clutter.Event) => boolean) | null): void;
}

interface SheetCallbacks {
  /** The width or the height the sheet asks for changed. */
  changed(): void;
}

interface NowGroup {
  generation: number;
  box: St.BoxLayout;
  rows: Map<string, Row>;
}

interface Built {
  generation: number;
  widget: St.Widget;
}

interface DockItem {
  id: string;
  actor: St.Widget;
  button: St.Button;
  badge: St.Label;
}

interface ModuleList {
  slot: Slot;
  box: St.BoxLayout;
  shown: string;
  /** The row of each module and what it shows now. */
  rows: Map<string, { row: Row; props: () => RowProps }>;
}

export class Sheet implements SearchMount {
  private kit: Kit | null = null;
  private root: St.Widget | null = null;
  /** Everything inside the padding; its height is what the sheet asks for. */
  private layer: St.Widget | null = null;
  private mainPage: St.BoxLayout | null = null;
  private entry: St.Entry | null = null;
  private dock: St.BoxLayout | null = null;
  private dockItems: DockItem[] = [];
  /** Before the dock while an update of Visor is there, being installed or installed. */
  private updateButton: St.Button | null = null;
  private updateTooltip: Tooltip | null = null;
  private scroll: St.ScrollView | null = null;
  private left: St.BoxLayout | null = null;
  private right: St.BoxLayout | null = null;
  private nowSection: KitSection | null = null;
  private nowGroups = new Map<string, NowGroup>();
  private sections = new Map<string, Built>();

  private viewPage: St.BoxLayout | null = null;
  private viewTitle: St.Label | null = null;
  private viewActions: St.BoxLayout | null = null;
  private viewScroll: St.ScrollView | null = null;
  private viewBox: St.BoxLayout | null = null;
  private views = new Map<string, Built>();
  private view: string | null = null;
  private modulesView: St.BoxLayout | null = null;
  private moduleLists: ModuleList[] = [];

  private overlay: St.Bin | null = null;
  private overlayChild: St.Widget | null = null;
  private overlayShown = false;
  private queryHandler: ((query: string) => void) | null = null;
  private keyHandler: ((event: Clutter.Event) => boolean) | null = null;
  private reportedQuery = '';
  private debounce = 0;

  /** What mark() highlights, until the timeout takes the highlight away. */
  private marked: St.Widget | null = null;
  private markTimeout = 0;

  private isOpen = false;
  private building = false;
  private measureLater = 0;
  private lastHeight = -1;

  constructor(
    private registry: Registry,
    private settings: Gio.Settings,
    private gettext: (s: string) => string,
    private callbacks: SheetCallbacks,
    private updater: Updater | null = null,
  ) {
    if (updater) updater.onChanged = () => this.syncUpdate();
    settings.connectObject(
      'changed::width',
      () => {
        this.layout();
        this.notify();
      },
      this,
    );
  }

  getActor(): St.Widget {
    if (!this.root) {
      this.building = true;
      try {
        this.build();
        this.sync();
      } finally {
        this.building = false;
      }
    }
    return this.root!;
  }

  /** Width of the panel in stage pixels. */
  width(): number {
    const css = sheetWidth(
      this.settings.get_string('width'),
      this.twoColumns(),
      this.view !== null,
    );
    return css * scaleFactor();
  }

  // --- search ---

  get query(): string {
    return this.entry?.get_text() ?? '';
  }

  setQueryHandler(handler: ((query: string) => void) | null): void {
    this.queryHandler = handler;
  }

  setOverlay(widget: St.Widget | null): void {
    this.overlayShown = widget !== null;
    // Taking the widget out would cost it its style: every actor in it would be
    // styled anew when it comes back, 3 to 6 ms for a list of results. It stays
    // in the hidden overlay until another one takes its place.
    if (widget) this.overlayChild = widget;
    if (!this.overlay) return;
    if (widget && this.overlay.get_child() !== widget) this.overlay.set_child(widget);
    this.overlay.visible = this.overlayShown;
  }

  clearQuery(): void {
    this.setQuery('');
  }

  setQuery(query: string): void {
    if (!this.entry) return;
    this.entry.set_text(query);
    this.entry.clutter_text.set_cursor_position(-1);
    this.reportQuery();
  }

  setKeyHandler(handler: ((event: Clutter.Event) => boolean) | null): void {
    this.keyHandler = handler;
  }

  // --- state ---

  /** The panel opened: the keyboard goes to the search entry, or into the view asked for. */
  opened(view?: string): void {
    this.isOpen = true;
    this.lastHeight = -1;
    this.getActor();
    this.updater?.maybeCheck();
    global.stage.connectObject('notify::key-focus', () => this.followFocus(), this);
    if (!(view && this.showView(view))) this.entry?.grab_key_focus();
  }

  /** The panel closed: back to the main view with an empty search. */
  closed(): void {
    this.isOpen = false;
    this.updateTooltip?.hide();
    global.stage.disconnectObject(this);
    this.cancelMeasure();
    this.unmark();
    if (!this.root) return;
    this.clearQuery();
    if (this.view !== null) this.showView(null);
  }

  /**
   * Draws the eye to what a module shows in the main view, for a moment: the
   * rows of a 'now' module or the section of an 'ahead' module.
   */
  mark(id: string): void {
    const target = this.nowGroups.get(id)?.box ?? this.sections.get(id)?.widget;
    if (!target || !this.isOpen) return;
    this.unmark();
    target.add_style_class_name(MARK_CLASS);
    this.marked = target;
    target.connectObject('destroy', () => this.unmark(), this);
    if (this.scroll) ensureActorVisibleInScrollView(this.scroll, target);
    this.markTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, MARK_MS, () => {
      this.markTimeout = 0;
      this.unmark();
      return GLib.SOURCE_REMOVE;
    });
  }

  private unmark(): void {
    if (this.markTimeout) GLib.source_remove(this.markTimeout);
    this.markTimeout = 0;
    const marked = this.marked;
    this.marked = null;
    if (!marked) return;
    marked.disconnectObject(this);
    marked.remove_style_class_name(MARK_CLASS);
  }

  /** Escape: first clears the search, then leaves a view. False when there was nothing to do. */
  handleEscape(): boolean {
    if (this.query !== '') {
      this.clearQuery();
      return true;
    }
    if (this.view !== null) {
      this.showView(null);
      return true;
    }
    return false;
  }

  /**
   * Shows the view of a dock module, the list of modules, or with null the
   * main view. False when there is no such view.
   */
  showView(id: string | null): boolean {
    if (!this.root) return false;
    const _ = this.gettext;
    let widget: St.Widget | null = null;
    let title = '';
    if (id === MODULES_VIEW) {
      title = _('Modules');
      if (!this.modulesView) this.buildModulesView();
      this.syncModulesView();
      widget = this.modulesView;
    } else if (id !== null) {
      const entry = this.registry.get(id);
      if (!entry?.active || entry.module.slot !== 'dock') return false;
      title = entry.module.name;
      let built = this.views.get(id);
      if (built && built.generation !== entry.generation) {
        built.widget.destroy();
        this.views.delete(id);
        built = undefined;
      }
      if (!built) {
        const view = this.registry.buildView(entry);
        if (!view) return false;
        built = { generation: entry.generation, widget: view };
        this.views.set(id, built);
        this.viewBox!.add_child(view);
      }
      widget = built.widget;
    }

    const previous = this.view;
    this.view = widget ? id : null;
    for (const child of this.viewBox!.get_children()) child.visible = child === widget;
    this.viewTitle!.text = title;
    this.syncViewActions();
    this.mainPage!.visible = widget === null;
    this.viewPage!.visible = widget !== null;
    if (widget) {
      this.clearQuery();
      this.viewScroll!.vadjustment.value = 0;
    }
    if (this.isOpen) {
      if (!widget) this.entry!.grab_key_focus();
      else if (!widget.navigate_focus(null, St.DirectionType.TAB_FORWARD, false))
        this.viewPage!.navigate_focus(null, St.DirectionType.TAB_FORWARD, false);
    }
    if (previous !== this.view) this.notify();
    return widget !== null || id === null;
  }

  // --- content ---

  /** Modules were added, removed, turned on or off, or reordered. */
  sync(): void {
    if (!this.root) return;
    this.syncNowGroups();
    this.syncSections();
    this.syncDock();
    this.syncViews();
    this.syncModulesView();
    this.layout();
  }

  /** The rows of one 'now' module changed. */
  rowsChanged(entry: ModuleEntry): void {
    if (!this.root) return;
    const hadRows = this.left!.visible;
    this.syncRows(entry);
    if (hadRows !== this.nowCount() > 0) this.layout();
  }

  badgeChanged(entry: ModuleEntry): void {
    const item = this.dockItems.find(other => other.id === entry.module.id);
    if (item) this.applyBadge(item, entry);
  }

  destroy(): void {
    this.settings.disconnectObject(this);
    global.stage.disconnectObject(this);
    this.cancelMeasure();
    this.unmark();
    if (this.debounce) GLib.source_remove(this.debounce);
    this.debounce = 0;
    this.queryHandler = this.keyHandler = null;
    if (this.root) {
      St.FocusManager.get_for_stage(global.stage).remove_group(this.root);
      this.root.destroy();
    }
    this.updateTooltip?.hide();
    if (this.updater) this.updater.onChanged = null;
    this.updateButton = null;
    this.updateTooltip = null;
    this.root = this.layer = this.mainPage = this.entry = this.dock = this.scroll = null;
    this.left = this.right = this.viewPage = this.viewTitle = this.viewScroll = this.viewBox = null;
    this.viewActions = null;
    this.nowSection = null;
    this.modulesView = this.overlay = this.overlayChild = null;
    this.dockItems = [];
    this.moduleLists = [];
    this.nowGroups.clear();
    this.sections.clear();
    this.views.clear();
  }

  // --- building ---

  private build(): void {
    const _ = this.gettext;
    const kit = (this.kit = createKit(ownGuard));

    const root = (this.root = new St.Widget({
      style_class: 'visor-sheet',
      layout_manager: new Clutter.BinLayout(),
      accessible_role: Atk.Role.PANEL,
      accessible_name: 'Visor',
      // Key events bubble only through reactive actors, see the handler below.
      reactive: true,
    }));
    const layer = (this.layer = new St.Widget({
      layout_manager: new Clutter.BinLayout(),
      x_expand: true,
      y_expand: true,
    }));
    root.add_child(layer);

    // Main view: search row, then the columns.
    const mainPage = (this.mainPage = new St.BoxLayout({
      vertical: true,
      x_expand: true,
      y_expand: true,
    }));
    layer.add_child(mainPage);

    const searchRow = new St.BoxLayout({ style_class: 'visor-search' });
    mainPage.add_child(searchRow);
    searchRow.add_child(
      new St.Icon({
        style_class: 'visor-search-icon',
        icon_name: 'edit-find-symbolic',
        y_align: Clutter.ActorAlign.CENTER,
      }),
    );
    const entry = (this.entry = new St.Entry({
      style_class: 'visor-search-entry',
      hint_text: _('Search, calculate or run a command …'),
      accessible_name: _('Search'),
      can_focus: true,
      x_expand: true,
      y_align: Clutter.ActorAlign.CENTER,
    }));
    searchRow.add_child(entry);
    entry.clutter_text.connect('text-changed', () => this.queryChanged());
    entry.clutter_text.connect('key-press-event', (_actor, event) => {
      const handler = this.keyHandler;
      if (handler && ownGuard.build(() => handler(event))) return Clutter.EVENT_STOP;
      if (event.get_key_symbol() !== Clutter.KEY_Down) return Clutter.EVENT_PROPAGATE;
      this.scroll!.navigate_focus(null, St.DirectionType.TAB_FORWARD, false);
      return Clutter.EVENT_STOP;
    });
    this.dock = new St.BoxLayout({ style_class: 'visor-dock', y_align: Clutter.ActorAlign.CENTER });
    searchRow.add_child(this.dock);
    if (this.updater) {
      const icon = new St.Icon({ style_class: 'visor-dock-icon' });
      const button = (this.updateButton = new St.Button({
        style_class: 'visor-update-button',
        can_focus: true,
        accessible_role: Atk.Role.PUSH_BUTTON,
        child: icon,
        visible: false,
      }));
      button.connect('clicked', () => this.updater?.activate());
      this.updateTooltip = new Tooltip(button, () => this.updateText());
      // Next to the dock, not in it: the dock holds the icons of modules only.
      button.y_align = Clutter.ActorAlign.CENTER;
      searchRow.insert_child_below(button, this.dock);
      this.syncUpdate();
    }

    const columns = new St.BoxLayout({ style_class: 'visor-columns', x_expand: true });
    this.scroll = this.buildScroll(columns);
    mainPage.add_child(this.scroll);
    this.left = new St.BoxLayout({ style_class: 'visor-column', vertical: true });
    this.right = new St.BoxLayout({ style_class: 'visor-column', vertical: true, x_expand: true });
    columns.add_child(this.left);
    columns.add_child(this.right);
    this.nowSection = kit.section({ title: _('Now') });
    this.left.add_child(this.nowSection.actor);

    // A module view: header with back button and title, then the view.
    const viewPage = (this.viewPage = new St.BoxLayout({
      vertical: true,
      x_expand: true,
      y_expand: true,
      visible: false,
    }));
    layer.add_child(viewPage);
    const header = new St.BoxLayout({ style_class: 'visor-view-header' });
    viewPage.add_child(header);
    header.add_child(
      kit.iconButton({
        icon: 'go-previous-symbolic',
        label: _('Back'),
        run: () => this.showView(null),
      }),
    );
    this.viewTitle = new St.Label({
      style_class: 'visor-view-title',
      accessible_role: Atk.Role.HEADING,
      x_expand: true,
      y_align: Clutter.ActorAlign.CENTER,
    });
    header.add_child(this.viewTitle);
    this.viewActions = new St.BoxLayout({
      style_class: 'visor-view-actions',
      y_align: Clutter.ActorAlign.CENTER,
    });
    header.add_child(this.viewActions);
    this.viewBox = new St.BoxLayout({ style_class: 'visor-view', vertical: true, x_expand: true });
    this.viewScroll = this.buildScroll(this.viewBox);
    viewPage.add_child(this.viewScroll);

    // Where the search puts its results.
    this.overlay = new St.Bin({
      style_class: 'visor-search-overlay',
      x_expand: true,
      y_expand: true,
      y_align: Clutter.ActorAlign.START,
      visible: false,
    });
    layer.add_child(this.overlay);
    if (this.overlayChild) this.setOverlay(this.overlayShown ? this.overlayChild : null);

    // Tab and the arrow keys walk through everything that can take the focus.
    // The focus manager does that by itself only for events that reach the
    // stage, and under the modal grab of the open notch none does.
    const focusManager = St.FocusManager.get_for_stage(global.stage);
    focusManager.add_group(root);
    root.connect('key-press-event', (_actor, event) =>
      this.tab(event) || focusManager.navigate_from_event(event)
        ? Clutter.EVENT_STOP
        : Clutter.EVENT_PROPAGATE,
    );
    // Whatever changes the height inside ends up here, also what modules do in their own widgets.
    layer.connect('queue-relayout', () => this.scheduleMeasure());
  }

  /**
   * A scroll view clips its child to the child's content box, so the padding
   * that leaves room for the hover area of the rows sits one level further in.
   */
  private buildScroll(content: St.BoxLayout): St.ScrollView {
    const child = new St.BoxLayout({ vertical: true, x_expand: true });
    child.add_child(content);
    return new St.ScrollView({
      style_class: 'visor-scroll',
      accessible_role: Atk.Role.SCROLL_PANE,
      hscrollbar_policy: St.PolicyType.NEVER,
      vscrollbar_policy: St.PolicyType.AUTOMATIC,
      overlay_scrollbars: true,
      x_expand: true,
      y_expand: true,
      child,
    });
  }

  private buildModulesView(): void {
    const _ = this.gettext;
    const kit = this.kit!;
    const view = (this.modulesView = new St.BoxLayout({
      style_class: 'visor-modules',
      x_expand: true,
    }));
    (view.layout_manager as Clutter.BoxLayout).homogeneous = true;
    const groups: [Slot, string, string][] = [
      ['now', _('Now'), _('Shows up only while something is running.')],
      ['ahead', _('Up Next'), _('A short section next to “Now”.')],
      ['dock', _('Dock'), _('A view of its own behind an icon.')],
    ];
    for (const [slot, title, hint] of groups) {
      const section = kit.section({ title });
      section.actor.x_expand = true;
      section.actor.y_align = Clutter.ActorAlign.START;
      const label = new St.Label({ style_class: 'visor-modules-hint', text: hint, x_expand: true });
      label.clutter_text.line_wrap = true;
      section.body.add_child(label);
      const box = new St.BoxLayout({ vertical: true, x_expand: true });
      section.body.add_child(box);
      view.add_child(section.actor);
      this.moduleLists.push({ slot, box, shown: '\u0000', rows: new Map() });
    }
    this.viewBox!.add_child(view);
  }

  // --- keeping the widgets in step with the registry ---

  private nowCount(): number {
    let count = 0;
    for (const entry of this.registry.active('now')) count += entry.rows.length;
    return count;
  }

  private aheadEntries(): ModuleEntry[] {
    return this.registry
      .active('ahead')
      .filter(entry => typeof entry.module.buildSection === 'function');
  }

  private twoColumns(): boolean {
    return this.nowCount() > 0 && this.aheadEntries().length > 0;
  }

  private syncNowGroups(): void {
    const body = this.nowSection!.body;
    const entries = this.registry.active('now');
    const current = new Map(entries.map(entry => [entry.module.id, entry]));
    for (const [id, group] of this.nowGroups) {
      if (current.get(id)?.generation === group.generation) continue;
      group.box.destroy();
      this.nowGroups.delete(id);
    }
    entries.forEach((entry, index) => {
      let group = this.nowGroups.get(entry.module.id);
      if (!group) {
        group = {
          generation: entry.generation,
          box: new St.BoxLayout({ vertical: true, x_expand: true }),
          rows: new Map(),
        };
        this.nowGroups.set(entry.module.id, group);
        body.add_child(group.box);
      }
      if (body.get_child_at_index(index) !== group.box) body.set_child_at_index(group.box, index);
      this.syncRows(entry);
    });
  }

  private syncRows(entry: ModuleEntry): void {
    const group = this.nowGroups.get(entry.module.id);
    if (!group || group.generation !== entry.generation) return;
    const diff = diffIds(
      [...group.rows.keys()],
      entry.rows.map(row => row.id),
    );
    for (const id of diff.removed) {
      group.rows.get(id)!.actor.destroy();
      group.rows.delete(id);
    }
    const rows = new Map<string, Row>();
    let index = 0;
    for (const props of entry.rows) {
      let row = group.rows.get(props.id) ?? null;
      // Broken data in one row must not cost the module its other rows.
      if (row) entry.guard.call(() => row!.update(props));
      else row = entry.guard.build(() => new Row(props, entry.guard));
      if (!row) continue;
      if (row.actor.get_parent() !== group.box) group.box.add_child(row.actor);
      if (group.box.get_child_at_index(index) !== row.actor)
        group.box.set_child_at_index(row.actor, index);
      rows.set(props.id, row);
      index++;
    }
    group.rows = rows;
    group.box.visible = rows.size > 0;
  }

  private syncSections(): void {
    const right = this.right!;
    const entries = this.aheadEntries();
    const current = new Map(entries.map(entry => [entry.module.id, entry]));
    for (const [id, built] of this.sections) {
      if (current.get(id)?.generation === built.generation) continue;
      built.widget.destroy();
      this.sections.delete(id);
    }
    for (const entry of entries) {
      let built = this.sections.get(entry.module.id);
      if (!built) {
        const widget = this.registry.buildSection(entry);
        if (!widget) continue;
        built = { generation: entry.generation, widget };
        this.sections.set(entry.module.id, built);
        right.add_child(widget);
      }
    }
    this.placeSections();
  }

  /** The sections that go below "Now" now: only with rows there and something left on the right. */
  private leftSections(): string[] {
    if (this.nowCount() === 0) return [];
    const ids = [...this.sections.keys()];
    const left = ids.filter(id => LEFT_WHEN_SPLIT.has(id));
    return left.length < ids.length ? left : [];
  }

  /** Puts each section into its column, in the order of the modules. */
  private placeSections(): void {
    const left = this.left!;
    const right = this.right!;
    const toLeft = new Set(this.leftSections());
    let leftIndex = 1; // after "Now"
    let rightIndex = 0;
    for (const entry of this.aheadEntries()) {
      const widget = this.sections.get(entry.module.id)?.widget;
      if (!widget) continue;
      const column = toLeft.has(entry.module.id) ? left : right;
      const index = column === left ? leftIndex++ : rightIndex++;
      if (widget.get_parent() !== column) {
        widget.get_parent()?.remove_child(widget);
        column.insert_child_at_index(widget, index);
      } else if (column.get_child_at_index(index) !== widget) {
        column.set_child_at_index(widget, index);
      }
    }
  }

  private syncDock(): void {
    const _ = this.gettext;
    const dock = this.dock!;
    const entries = this.registry
      .active('dock')
      .filter(entry => typeof entry.module.buildView === 'function');
    const wanted = [...entries.map(entry => entry.module.id), MODULES_VIEW];
    const diff = diffIds(
      this.dockItems.map(item => item.id),
      wanted,
    );
    if (diff.changed) {
      const focused = this.dockItems.find(item => item.button.has_key_focus())?.id;
      for (const item of this.dockItems) item.actor.destroy();
      this.dockItems = wanted.map(id => {
        const module = this.registry.get(id)?.module;
        const item = this.buildDockItem(
          id,
          module?.name ?? _('Modules'),
          module?.icon ?? 'view-grid-symbolic',
        );
        dock.add_child(item.actor);
        return item;
      });
      this.dockItems.find(item => item.id === focused)?.button.grab_key_focus();
    }
    for (const item of this.dockItems) {
      const entry = this.registry.get(item.id);
      if (entry) this.applyBadge(item, entry);
    }
  }

  /** What the update button says, as its tooltip and to screen readers. */
  private updateText(): string {
    const _ = this.gettext;
    const state = this.updater?.state;
    switch (state?.kind) {
      case 'available':
        return _('Update to Visor %s').replace('%s', state.release.version);
      case 'updating':
        return _('Updating to %s…').replace('%s', state.release.version);
      case 'failed':
        return _('The update did not work. Click to try again.');
      case 'done':
        return _('Updated to %s. Click to log out and use it.').replace('%s', state.version);
      default:
        return '';
    }
  }

  private syncUpdate(): void {
    const button = this.updateButton;
    const kind = this.updater?.state.kind ?? 'none';
    if (!button) return;
    button.visible = kind !== 'none';
    button.reactive = kind !== 'updating';
    for (const name of ['available', 'updating', 'failed', 'done'])
      if (name === kind) button.add_style_class_name(name);
      else button.remove_style_class_name(name);
    (button.child as St.Icon).icon_name =
      kind === 'done'
        ? 'system-log-out-symbolic'
        : kind === 'failed'
          ? 'dialog-warning-symbolic'
          : 'software-update-available-symbolic';
    button.accessible_name = this.updateText();
    this.updateTooltip?.hide();
    this.notify();
  }

  private buildDockItem(id: string, name: string, icon: string): DockItem {
    const button = new St.Button({
      style_class: 'visor-dock-button',
      can_focus: true,
      accessible_role: Atk.Role.PUSH_BUTTON,
      accessible_name: name,
      child: new St.Icon({ style_class: 'visor-dock-icon', icon_name: icon }),
    });
    button.connect('clicked', () => this.showView(id));
    const badge = new St.Label({
      style_class: 'visor-dock-badge',
      x_align: Clutter.ActorAlign.END,
      y_align: Clutter.ActorAlign.START,
      x_expand: true,
      y_expand: true,
      visible: false,
    });
    const actor = new St.Widget({ layout_manager: new Clutter.BinLayout() });
    actor.add_child(button);
    actor.add_child(badge);
    return { id, actor, button, badge };
  }

  private applyBadge(item: DockItem, entry: ModuleEntry): void {
    const text = badgeText(entry.badge);
    item.badge.visible = text !== null;
    if (text !== null) item.badge.text = text;
    const name = text === null ? entry.module.name : `${entry.module.name}, ${text}`;
    if (item.button.accessible_name !== name) item.button.accessible_name = name;
  }

  private syncViews(): void {
    for (const [id, built] of this.views) {
      const entry = this.registry.get(id);
      if (entry?.active && entry.generation === built.generation) continue;
      if (this.view === id) this.showView(null);
      built.widget.destroy();
      this.views.delete(id);
    }
  }

  private syncModulesView(): void {
    if (!this.modulesView) return;
    const _ = this.gettext;
    const all = this.registry.all();
    for (const list of this.moduleLists) {
      const entries = all.filter(entry => entry.module.slot === list.slot);
      const shown = entries
        .map(({ module }) => `${module.id}\u0000${module.name}\u0000${module.icon}`)
        .join('\u0001');
      if (shown !== list.shown) {
        list.shown = shown;
        list.box.destroy_all_children();
        list.rows.clear();
        for (const entry of entries) this.addModuleRow(list, entry);
        if (entries.length === 0) list.box.add_child(this.kit!.empty(_('No modules')));
      }
      for (const { row, props } of list.rows.values()) row.update(props());
    }
  }

  /** The buttons a dock module wants in the header of its view. */
  private syncViewActions(): void {
    const box = this.viewActions!;
    box.destroy_all_children();
    const entry = this.view === null ? null : this.registry.get(this.view);
    const actions = entry?.module.viewActions;
    if (!entry || !Array.isArray(actions)) return;
    const kit = createKit(entry.guard);
    for (const action of actions) {
      const button = entry.guard.build(() => kit.button(action));
      if (button) box.add_child(button);
    }
  }

  private addModuleRow(list: ModuleList, entry: ModuleEntry): void {
    const { id, name, icon } = entry.module;
    const props = (): RowProps => ({
      icon: String(icon),
      title: String(name),
      toggle: {
        active: !this.registry.isDisabled(id),
        onChange: active => this.registry.setEnabled(id, active),
      },
    });
    const row = ownGuard.build(() => new Row(props(), ownGuard));
    if (!row) return;
    list.rows.set(id, { row, props });
    list.box.add_child(row.actor);
  }

  /** One or two columns, and how wide the left one is. */
  private layout(): void {
    if (!this.root) return;
    this.placeSections();
    const hasNow = this.nowCount() > 0;
    const hasAhead = this.aheadEntries().length > 0;
    const left = this.left!;
    const right = this.right!;
    left.visible = hasNow;
    right.visible = hasAhead && right.get_n_children() > 0;
    this.scroll!.visible = hasNow || hasAhead;
    if (hasNow && hasAhead) {
      const width = sheetWidth(this.settings.get_string('width'), true);
      left.x_expand = false;
      left.width = leftColumnWidth(width) * scaleFactor();
      right.add_style_class_name('divided');
    } else {
      left.width = -1;
      left.x_expand = true;
      right.remove_style_class_name('divided');
    }
    this.notify();
  }

  // --- search entry ---

  private queryChanged(): void {
    if (this.debounce) GLib.source_remove(this.debounce);
    this.debounce = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SEARCH_DEBOUNCE_MS, () => {
      this.debounce = 0;
      this.reportQuery();
      return GLib.SOURCE_REMOVE;
    });
  }

  private reportQuery(): void {
    if (this.debounce) GLib.source_remove(this.debounce);
    this.debounce = 0;
    const { query } = this;
    if (query === this.reportedQuery) return;
    this.reportedQuery = query;
    const handler = this.queryHandler;
    if (handler) ownGuard.call(() => handler(query));
  }

  // --- focus and size ---

  /**
   * Tab and Shift+Tab in the main view: search, then the rows on the left,
   * the sections on the right, and the dock last, although the dock sits next
   * to the search entry. After the last stop it starts over; Escape is the way out.
   */
  private tab(event: Clutter.Event): boolean {
    const symbol = event.get_key_symbol();
    const back = symbol === Clutter.KEY_ISO_Left_Tab;
    if (symbol !== Clutter.KEY_Tab && !back) return false;
    if (this.view !== null || !this.entry || !this.scroll || !this.dock) return false;
    // The list of results covers the rows; the keyboard stays with the search.
    if (this.overlay?.visible) return true;
    const direction = back ? St.DirectionType.TAB_BACKWARD : St.DirectionType.TAB_FORWARD;
    const stops: St.Widget[] = [this.entry, this.scroll];
    if (this.updateButton) stops.push(this.updateButton);
    stops.push(this.dock);
    const focus = global.stage.get_key_focus();
    const at = focus ? stops.findIndex(stop => stop.contains(focus)) : -1;
    if (at < 0) return false;
    // Further inside the same stop, as long as there is something.
    if (at > 0 && stops[at]!.navigate_focus(focus, direction, false)) return true;
    for (let step = 1; step <= stops.length; step++) {
      const next = stops[(at + (back ? -step : step) + stops.length * step) % stops.length]!;
      if (next === this.entry) {
        this.entry.grab_key_focus();
        return true;
      }
      if (next.visible && next.navigate_focus(null, direction, false)) return true;
    }
    return true;
  }

  /** Scrolls so that whatever got the keyboard focus is visible. */
  private followFocus(): void {
    const focus = global.stage.get_key_focus();
    if (!focus) return;
    for (const scroll of [this.scroll, this.viewScroll]) {
      if (scroll?.mapped && scroll !== focus && scroll.contains(focus))
        ensureActorVisibleInScrollView(scroll, focus);
    }
  }

  private scheduleMeasure(): void {
    if (this.measureLater || !this.isOpen) return;
    this.measureLater = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
      this.measureLater = 0;
      this.measure();
      return GLib.SOURCE_REMOVE;
    });
  }

  private cancelMeasure(): void {
    if (this.measureLater) global.compositor.get_laters().remove(this.measureLater);
    this.measureLater = 0;
  }

  private measure(): void {
    const layer = this.layer;
    if (!layer?.mapped) return;
    const width = layer.allocation.get_width();
    if (width <= 0) return;
    const [, height] = layer.get_preferred_height(width);
    if (height === this.lastHeight) return;
    this.lastHeight = height;
    this.notify();
  }

  private notify(): void {
    // While the notch is fetching the sheet it measures it anyway.
    if (!this.building) this.callbacks.changed();
  }
}
