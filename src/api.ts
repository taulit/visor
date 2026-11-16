/**
 * Visor module API, version 1.
 *
 * Built-in modules and modules from other extensions use exactly this API.
 * A module takes one place: rows in "Now", a section in "Up Next", or an icon
 * in the dock with its own view.
 */
import type Gio from 'gi://Gio';
import type Soup from 'gi://Soup?version=3.0';
import type St from 'gi://St';

export const API_VERSION = 1;

export type Slot = 'now' | 'ahead' | 'dock';

export interface VisorModule {
  /** Unique, lower case letters, digits and dashes: 'notes'. */
  id: string;
  /** Translated name, shown in the settings and as tooltip of the dock icon. */
  name: string;
  /** Symbolic icon name. */
  icon: string;
  slot: Slot;
  enable(ctx: ModuleContext): void;
  disable(): void;
  /** Slot 'ahead': called once, the first time the panel opens. */
  buildSection?(): St.Widget;
  /** Slot 'dock': called once, on the first click on the dock icon. */
  buildView?(): St.Widget;
  /** Results of this module in the search. */
  search?: SearchSource;
  /** Commands such as 'note <text>'. */
  commands?: Command[];
  /** Desktop id whose GNOME search provider is hidden because this module searches the same content. */
  replacesSearchProvider?: string;
}

export interface ModuleContext {
  kit: Kit;
  /** Slot 'now': the rows of this module. Rows are matched by id, so set() can be called often. */
  now: { set(rows: NowRow[]): void; clear(): void };
  /** The chip of this module in the peek state. flash() also shows the peek state for a moment. */
  peek: { set(chip: PeekChip | null): void; flash(chip: PeekChip): void };
  /** Number on the dock icon, null removes it. */
  badge(count: number | null): void;
  /** Dot next to the clock while this module has something unread or waiting. */
  attention(kind: 'unread' | 'waiting' | null): void;
  /** Settings of the extension that owns the module, null if it has no schema. */
  settings: Gio.Settings | null;
  /** Shared HTTP session. Modules never create their own. */
  http: Soup.Session;
  /** True while the panel is open. Live updates (progress, countdowns) run only then. */
  readonly isOpen: boolean;
  /** Calls back when the panel opens or closes. Returns a function that removes the callback. */
  onOpenChanged(callback: (open: boolean) => void): () => void;
  /** Opens the panel, with a dock module optionally on its view. */
  open(view?: string): void;
  close(): void;
  /** gettext of the extension that owns the module. */
  t: (s: string) => string;
}

export interface Action {
  /** Text of the button, or accessible name of an icon button. */
  label: string;
  /** Symbolic icon name. With an icon and no style the action is an icon button. */
  icon?: string;
  /** 'primary' is the accent button, 'ghost' has no background, 'filled' is the round play button. */
  style?: 'default' | 'primary' | 'ghost' | 'filled';
  run(): void;
}

export interface NowRow {
  id: string;
  icon: string | Gio.Icon;
  title: string;
  subtitle?: string;
  /** Large number on the right, such as the remaining time of a timer. */
  value?: string;
  /** 'waiting' tints the row amber: it waits for the user. */
  status?: 'normal' | 'waiting' | 'done';
  /** Click on the row. */
  activate?: () => void;
  /** Always visible on the right. */
  primary?: Action;
  /** Always visible icon buttons on the right, such as media controls. */
  controls?: Action[];
  /** Appear on hover or keyboard focus of the row. */
  actions?: Action[];
  /** One line below the title in monospace, such as the command an agent asks about. */
  detail?: string;
  /** Content shown when the row is expanded. Built on first expand. */
  expand?: () => St.Widget;
  /** 0..1, or 'indeterminate' when the end is unknown. */
  progress?: number | 'indeterminate';
  /** Colour of the progress line. */
  progressTone?: 'muted' | 'accent';
}

export interface PeekChip {
  icon: string | Gio.Icon;
  text: string;
  /** 'accent' marks a new event, 'waiting' is amber. */
  tone?: 'normal' | 'accent' | 'waiting';
  /** Higher comes first. At most four chips are shown. */
  priority: number;
}

export interface Result {
  id: string;
  title: string;
  subtitle?: string;
  icon?: string | Gio.Icon;
  /** Short hint on the right, such as 'Enter copies'. */
  hint?: string;
  /** Enter. */
  activate(): void;
  /** Ctrl+Enter, such as 'Open in app'. */
  alternate?: () => void;
}

export interface SearchSource {
  id: string;
  title: string;
  search(query: string, cancellable: Gio.Cancellable): Promise<Result[]>;
}

export interface Command {
  /** Words that trigger the command, in every supported language: ['timer']. */
  keyword: string[];
  /** Shown while typing: 'timer 25m Pizza'. */
  hint: string;
  /** Results to show for the arguments typed so far, or nothing when Enter runs the command directly. */
  run(args: string): Promise<Result[] | void>;
}

/** UI building blocks. Modules use only these, so everything follows the theme. */
export interface Kit {
  section(props: { title: string; links?: Action[] }): KitSection;
  row(props: NowRow): KitRow;
  button(action: Action): St.Widget;
  iconButton(action: Action & { icon: string }): St.Widget;
  toggle(props: { label: string; active: boolean; onChange(active: boolean): void }): KitToggle;
  progress(props: { value: number | 'indeterminate'; tone?: 'muted' | 'accent' }): KitProgress;
  empty(text: string): St.Widget;
  chip(chip: PeekChip): St.Widget;
}

export interface KitSection {
  actor: St.Widget;
  /** Add rows and other content here. */
  body: St.Widget;
  /** Links on the right of the title; they appear on hover. */
  setLinks(links: Action[]): void;
}

export interface KitRow {
  actor: St.Widget;
  update(props: NowRow): void;
}

export interface KitToggle {
  actor: St.Widget;
  active: boolean;
}

export interface KitProgress {
  actor: St.Widget;
  set(value: number | 'indeterminate'): void;
}

/** The object other extensions reach through `stateObj.api` of the Visor extension. */
export interface VisorApi {
  readonly version: number;
  /**
   * Adds a module. `owner` is the Extension object of the module's extension;
   * its settings and translations end up in the module context.
   * Throws when the id is taken or the module was built for another API version.
   */
  register(module: VisorModule, owner?: ModuleOwner): void;
  unregister(id: string): void;
}

/** The part of an Extension object Visor uses. */
export interface ModuleOwner {
  uuid: string;
  metadata: Record<string, unknown>;
  getSettings(schema?: string): Gio.Settings;
  gettext(s: string): string;
}
