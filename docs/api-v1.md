# Visor module API, version 1

Visor is a GNOME Shell 50/51 extension (UUID `visor@taulit.github.io`): a notch below the top bar that shows what is happening now.
Other extensions, called **modules** here, plug into it through the small API in this document.
This document is the contract of version 1 (git tag `api-v1`). It is written from the source: `src/api.ts` is authoritative for the types, the other files for the behaviour.

## 1. What a module is

A module is a GNOME extension of its own (UUID convention `visor-<name>@<domain>`) that registers one `VisorModule` object with Visor.
Built-in modules (Media, Timers, Downloads, Up Next, Notifications) use exactly the same API.
Visor never loads code from the network; a module is installed like any other extension.

A module takes **one place**, chosen by its `slot`. A module has exactly one slot and never adds a tile of its own.

| Slot      | Place                                                                | What the module provides                                       |
| --------- | -------------------------------------------------------------------- | -------------------------------------------------------------- |
| `'now'`   | Rows in the "Now" section (left column)                              | `ctx.now.set(rows)`; shown only while something is running     |
| `'ahead'` | A section in "Up Next" (right column)                                | `buildSection()`                                               |
| `'dock'`  | An icon in the dock next to the search field, with a view of its own | `buildView()`, optional `viewActions`, optional dock `badge()` |

Any module, whatever its slot, can also add a chip to the peek state (`ctx.peek`), a dot next to the clock (`ctx.attention`), search results (`search`) and commands (`commands`).

## 2. Quick start

This is an **example**, not part of the API. It is a complete module extension in plain GJS ESM.
The example shows one row in "Now".

`metadata.json`:

```json
{
  "uuid": "visor-hello@example.org",
  "name": "Visor: Hello",
  "description": "Requires Visor. Shows one row in Now.",
  "shell-version": ["50", "51"],
  "gettext-domain": "visor-hello",
  "visor": { "api": 1, "slot": "now" }
}
```

Visor reads only `visor.api` (see section 3). `slot` is not read by Visor.

`extension.js`:

```js
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { ExtensionState } from 'resource:///org/gnome/shell/misc/extensionUtils.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const VISOR_UUID = 'visor@taulit.github.io';

export default class HelloModule extends Extension {
  enable() {
    this._registered = false;
    this._module = this._createModule();
    Main.extensionManager.connectObject(
      'extension-state-changed',
      (_manager, extension) => {
        if (extension.uuid === VISOR_UUID) this._sync();
      },
      this,
    );
    this._sync();
  }

  disable() {
    Main.extensionManager.disconnectObject(this);
    if (this._registered) this._api()?.unregister(this._module.id);
    this._registered = false;
    this._module = null;
  }

  // The API of Visor, or null while Visor is not active.
  _api() {
    const visor = Main.extensionManager.lookup(VISOR_UUID);
    return visor?.state === ExtensionState.ACTIVE ? (visor.stateObj?.api ?? null) : null;
  }

  // Registers when Visor is active. When Visor was switched off it has already called
  // disable() on the module and forgotten it; the next ACTIVE registers again.
  _sync() {
    const api = this._api();
    if (!api) {
      this._registered = false;
    } else if (!this._registered) {
      try {
        api.register(this._module, this);
        this._registered = true;
      } catch (e) {
        logError(e, `${this.uuid}: register`);
      }
    }
  }

  _createModule() {
    let ctx = null;
    return {
      id: 'hello',
      name: this.gettext('Hello'),
      icon: 'face-smile-symbolic',
      slot: 'now',
      enable: (c) => {
        ctx = c;
        ctx.now.set([
          {
            id: 'hello',
            icon: 'face-smile-symbolic',
            title: ctx.t('Hello from a module'),
            activate: () => ctx.close(),
          },
        ]);
      },
      disable: () => {
        ctx = null;
      },
    };
  }
}
```

An `'ahead'` module adds `buildSection()` to the object, a `'dock'` module `buildView()`. A real `'now'` module sets rows only while something runs.

## 3. Reaching the API and the lifecycle

### Reaching the API

```js
Main.extensionManager.lookup('visor@taulit.github.io')?.stateObj?.api;
```

The `api` property of the Visor extension object is a `VisorApi`. It is `null` (or `stateObj` is missing) while Visor is not enabled.
Check `state === ExtensionState.ACTIVE` and listen to `extension-state-changed` of `Main.extensionManager` to know when Visor comes and goes, as the example does.
The helper `connectVisor(extension, module)` from the SDK does all of this for you (see below). What it does, step by step:

1. Look up Visor. If it is `ACTIVE`, call `api.register(module, this)`.
2. Otherwise wait for `extension-state-changed` of the Visor UUID and register then.
3. When Visor is disabled it calls `disable()` on every module and forgets them all. The module must register again when Visor is `ACTIVE` again.
4. In the module extension's own `disable()`, call `api.unregister(id)` and disconnect the signal.

### The helper `connectVisor()`

`sdk/connect.js` in the Visor repository (npm package `@taulit/visor-module`, file `connect.js`) is about 60 lines of plain, dependency-free GJS ESM. A GNOME extension has no `node_modules` at run time and no bundler, so **copy it into your extension**, together with `connect.d.ts` and `index.d.ts` (the types of this API, generated from `src/api.ts`), for example to `src/visor/`.
The template [`examples/module-template/`](../examples/module-template/) (also published as `taulit/visor-module-template`) has them in place; `pnpm run sync:sdk` there updates the copies.

```js
import { connectVisor } from './visor/connect.js';

// in enable():
this._visor = connectVisor(this, module);
// in disable():
this._visor.disconnect();
```

- It registers `module` as soon as Visor is active (`register(module, extension)`), now or later, and again when Visor comes back after it was disabled.
- It never throws when Visor is missing, and logs one line when Visor refuses the module (for example another API version).
- `disconnect()` unregisters the module if Visor is still there and removes the signal.

### `register(module, owner?)`

Pass the `Extension` object of the module's extension (`this`) as `owner`. Visor takes from it:

- `owner.metadata`: the field `"visor": {"api": 1, …}`;
- `owner.getSettings()` (called without a schema name): becomes `ctx.settings` (`null` if that throws, for example without a schema);
- `owner.gettext`: becomes `ctx.t`. Without an owner, `ctx.t` is the gettext of Visor and `ctx.settings` the settings of Visor.

`register` throws an `Error` when:

- Visor is disabled;
- `module` is not an object;
- `id` does not match `^[a-z0-9-]+$`;
- a module with this `id` is already registered;
- `slot` is not `'now'`, `'ahead'` or `'dock'`;
- `enable` or `disable` is not a function;
- `name` or `icon` is not a string;
- the `owner`'s metadata declares another API version (see section 10).

If the module is not switched off by the user, `enable(ctx)` runs synchronously inside `register`. An exception from `enable()` does not leave `register`.

`unregister(id)` calls `disable()` and removes the module. An unknown `id` is ignored. The user's choices (switched off, order) are stored by `id` and survive `unregister` and a new `register`.

### `enable()` and `disable()`

- `enable(ctx)` can run many times for one registration: after registering, and again each time the user switches the module off and on in the **Modules** view (the last icon in the dock lists all modules with a switch). Each run gets a **new** context. The module must be able to start again from nothing.
- `disable()` runs on `unregister`, when the user switches the module off, when Visor is disabled (in reverse order of registration, after the panel was reported closed), and after an `enable()` that threw. It must cope with a half finished `enable()`.
- After `disable()` the context is dead: `now.set`, `now.clear`, `peek.set`, `peek.flash`, `badge`, `attention`, `onOpenChanged`, `open` and `close` do nothing. `isOpen`, `t`, `kit`, `http` and `settings` keep working.
- Visor removes what it holds for the module: rows, chip, badge, attention, the widget from `buildSection()` or `buildView()`, open callbacks, commands and search source. A view that is on screen is left for the main view.
- The module removes everything else it made: timers, signal connections, D-Bus watches, running requests, widgets it did not hand to Visor. Visor aborts only the shared `http` session, and only when Visor itself is disabled.
- `buildSection()` and `buildView()` run once per `enable()`. The section is built when the panel is first shown (or at once if the panel has been shown before), the view on the first click on the dock icon. A section is built for slot `'ahead'` only and a view for slot `'dock'` only; a module of another slot is never asked.

### Errors

Exceptions of a module never reach Visor or the shell. Callbacks of a module (`activate`, `run`, `onChange`, `expand`, `onOpenChanged`, `resolve`, `search`, `alternate`) are called inside a guard.
The first exception of a module goes to the log (`Visor: module '<id>'`); further ones of the same module are not logged again until the user switches it off and on.

If `enable()`, `buildSection()` or `buildView()` throws, or a build function returns no widget, the module is logged, `disable()` runs and the module **stays out** until the user switches it off and on again.
A row that cannot be built is skipped; the other rows of the module stay.

## 4. Reference: the types of `src/api.ts`

Order and text as in the file. Comments are part of the contract.

```ts
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
  /** Translated name: title of the module's view, entry in the Modules view, accessible name of the dock icon. */
  name: string;
  /** Symbolic icon name. */
  icon: string;
  slot: Slot;
  /** Called when the module is registered and not turned off, and again when the user turns it back on. */
  enable(ctx: ModuleContext): void;
  /** Calls that change something through the context do nothing after this. Visor removes rows, chip, badge, section and view of the module itself. Must cope with an enable() that threw halfway. */
  disable(): void;
  /**
   * Slot 'ahead': called once per enable(): the first time the panel opens, or at once if it has been open before.
   * Visor owns the returned widget and destroys it when the module is disabled.
   * A hidden widget leaves a gap; the right column stays.
   */
  buildSection?(): St.Widget;
  /**
   * Slot 'dock': called once per enable(), on the first click on the dock icon.
   * The view is shown below a header with a back button and the module name.
   * Visor owns the returned widget and destroys it when the module is disabled.
   */
  buildView?(): St.Widget;
  /**
   * Slot 'dock': buttons on the right of the header of the view, such as
   * 'Open in app' or 'New'. Read every time the view is shown.
   */
  viewActions?: Action[];
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
  /** The chip of this module in the peek state. flash() also shows the peek state for three seconds, unless the user turned that off, Do Not Disturb is on or a window is in fullscreen. */
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
  /** Opens the panel, optionally on the view of the dock module with this id. */
  open(view?: string): void;
  close(): void;
  /** gettext of the extension that owns the module. */
  t: (s: string) => string;
}
```

Notes:

- `id` is checked at `register`. `name` and `icon` must be strings. The name is the title of the view header, the label of the module in the Modules view and the accessible name of the dock icon.
- Order of modules (rows in "Now", sections, dock icons, search groups, equal chip priorities) follows the order setting of Visor (`module-order`), then the order of registration.
- `buildSection` is read only for slot `'ahead'`, `buildView` and `viewActions` only for `'dock'`. A `'dock'` module without `buildView` has no icon, an `'ahead'` module without `buildSection` no section.
- Hiding the section widget does not remove the right column; with rows in "Now" the panel stays two columns wide.
- `viewActions` become buttons made with `kit.button` each time the view is shown. A change while the view is on screen shows at the next show.
- `badge(count)`: a number is rounded down; zero, negative, not finite or `null` shows nothing; 100 and more shows `99+`. Only `'dock'` modules with a view have an icon, so only they show a badge.
- `attention`: one dot for all modules; `'waiting'` wins over `'unread'`.
- `open(view)` opens the panel; if it is open already it switches to the view, or to the main view without `view`. An unknown `view`, or one that is not an active dock module, opens the main view. `close()` closes the panel.
- `onOpenChanged` callbacks run when the panel opens or closes (with `false` also when Visor is disabled while the panel is open). The returned function removes the callback.
- The height of the panel follows whatever changes in module widgets; no call is needed. The panel is at most 820 px high (and 120 px less than the screen); main view and module view scroll.

```ts
export interface Action {
  /** Text of the button, or accessible name of an icon button. */
  label: string;
  /**
   * Symbolic icon name. With an icon and no style (or 'filled') the action is
   * a round icon button; with an icon and another style the icon sits before the text.
   */
  icon?: string;
  /**
   * 'primary' is the accent button, 'ghost' has no background, 'link' is accent
   * text without a background, 'filled' is the round play button.
   */
  style?: 'default' | 'primary' | 'ghost' | 'link' | 'filled';
  run(): void;
}

/** One row. Every field can change in KitRow.update(); the row is changed in place. */
export interface RowProps {
  /**
   * Symbolic icon name, or an image such as an app icon or cover art.
   * A row has an icon, a `lead` text, or neither.
   */
  icon?: string | Gio.Icon;
  /**
   * How the icon is drawn: 'symbolic' (17 px in the text colour, the default
   * for names), 'app' (28 px, the default for a Gio.Icon) or 'cover'
   * (a 36 px picture with round corners; needs a Gio.FileIcon).
   */
  iconStyle?: 'symbolic' | 'app' | 'cover';
  /** Short text in place of the icon, in a column of its own: a time or a day, such as '15:00'. */
  lead?: string;
  title: string;
  subtitle?: string;
  /** One line in monospace after the subtitle, such as the command an agent asks about. */
  detail?: string;
  /** Small quiet text on the right, such as a time or a size. Makes room for `actions` while they show. */
  meta?: string;
  /** Large number on the right, such as the remaining time of a timer. */
  value?: string;
  /** 'waiting' tints the row amber: it waits for the user. 'done' makes it quieter. */
  status?: 'normal' | 'waiting' | 'done';
  /** Click on the row, or Enter while it has the focus. */
  activate?: () => void;
  /** The main button, always visible on the right. Enter runs it when the row has no `activate`. */
  primary?: Action;
  /** Always visible on the right, before `primary`: media controls, or a ghost button such as 'Deny'. */
  controls?: Action[];
  /** Appear on hover or keyboard focus of the row. */
  actions?: Action[];
  /**
   * Content shown below the row when it is expanded. Built on first expand.
   * A row without `activate` and `toggle` expands on click; every expandable row has an arrow that does it. Pass the same function on every update(), a new one rebuilds the content.
   */
  expand?: () => St.Widget;
  /** 0..1 draws a thin line under the text, 'indeterminate' a small spinner when the end is unknown. */
  progress?: number | 'indeterminate';
  /** Colour of the progress line. */
  progressTone?: 'muted' | 'accent';
  /**
   * A switch at the very end of the row. A click on a row without `activate`
   * and `primary`, or Enter while it has the focus, flips it as well.
   * onChange gets the new state; the switch shows `active` of the last update().
   */
  toggle?: { active: boolean; onChange(active: boolean): void };
}

/** A row in "Now". Rows are matched by id between two calls of now.set(). */
export interface NowRow extends RowProps {
  id: string;
}

export interface PeekChip {
  icon: string | Gio.Icon;
  text: string;
  /** 'accent' marks a new event, 'waiting' is amber. */
  tone?: 'normal' | 'accent' | 'waiting';
  /** Higher comes first. At most four chips are shown. */
  priority: number;
}
```

See section 5 for `Action`, section 6 for rows and section 7 for chips; search is section 8.

```ts
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
  /** Example shown while the arguments are incomplete: 'timer 25m Pizza'. */
  hint: string;
  /**
   * Called while the user types, so it must not change anything. Returns what
   * Enter would do for these arguments as results, each with its own
   * activate(). An empty list means the arguments are incomplete; then the
   * hint is shown.
   */
  resolve(args: string): Result[] | Promise<Result[]>;
}
```

```ts
/** UI building blocks. Modules use only these, so everything follows the theme. */
export interface Kit {
  /**
   * `toggle` puts a switch with its label at the right end of the header. Unlike
   * the links it is always visible, such as 'Do Not Disturb' for notifications.
   */
  section(props: { title: string; links?: Action[]; toggle?: ToggleProps }): KitSection;
  row(props: RowProps): KitRow;
  button(action: Action): St.Widget;
  iconButton(action: Action & { icon: string }): St.Widget;
  /** A switch without visible text; `label` is its accessible name. */
  toggle(props: ToggleProps): KitToggle;
  progress(props: { value: number | 'indeterminate'; tone?: 'muted' | 'accent' }): KitProgress;
  /** Quiet line for a section without content, such as 'No new notifications'. */
  empty(text: string): St.Widget;
  chip(chip: PeekChip): St.Widget;
}

export interface ToggleProps {
  label: string;
  active: boolean;
  /** The user moved the switch. */
  onChange(active: boolean): void;
}

export interface KitSection {
  actor: St.Widget;
  /** Add rows and other content here. */
  body: St.Widget;
  /** Links on the right of the title; they appear on hover or keyboard focus of the section. */
  setLinks(links: Action[]): void;
  /** The switch in the header, null when the section was built without `toggle`. */
  readonly toggle: KitToggle | null;
}

export interface KitRow {
  actor: St.Widget;
  /** Changes the row in place: hover, focus and the expanded state stay. */
  update(props: RowProps): void;
}

export interface KitToggle {
  actor: St.Widget;
  /** Setting it moves the switch without calling onChange. */
  active: boolean;
}

export interface KitProgress {
  actor: St.Widget;
  set(value: number | 'indeterminate'): void;
}
```

```ts
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
```

## 5. The kit

Modules build their widgets from `ctx.kit` only. Everything then follows the theme: dark or light panel, accent colour, high contrast, display scale.
Arrange kit elements with plain `St` layout containers. Do not set colours of your own.
The only exceptions are content that has its own colours: cover art and app icons (`Gio.Icon`).
Every text goes through `ctx.t`. Text fields that are not strings are shown as strings (`undefined` as empty).

| Element               | Looks like                                                                                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kit.section(props)`  | A heading with a body below. Links (always drawn in the `link` style) at the right of the heading appear on hover or focus. An optional switch with its label stays visible. |
| `kit.row(props)`      | One row, 34 px high at least, see section 6.                                                                                                                                 |
| `kit.button(action)`  | A button of 28 px height with text (12 px), or a round icon button of 30 px if the action has an icon and no style (or `'filled'`).                                          |
| `kit.iconButton(a)`   | Always a round icon button. Every style except `'filled'` is dropped.                                                                                                        |
| `kit.toggle(props)`   | A switch of 34 × 18 px without text. `label` is its accessible name.                                                                                                         |
| `kit.progress(props)` | A 2 px line filled from the start (muted or accent), or a 14 px spinner for `'indeterminate'`.                                                                               |
| `kit.empty(text)`     | One quiet line of text.                                                                                                                                                      |
| `kit.chip(chip)`      | A pill of 26 px height with icon and text. It only shows something; it cannot be clicked.                                                                                    |

Button styles: `default` is the plain button, `primary` the accent button, `ghost` has no background, `link` is accent text, `filled` is the round, filled play button.
If `icon` and another style are given, the icon sits before the text. A button runs `run()` on click.

- `section`: `body` is a vertical box; add rows and other content to it. `setLinks()` replaces the links. `toggle` is `null` unless the section was built with `toggle`. Setting `toggle.active` moves the switch without calling `onChange`; only a user click calls it.
- `progress`: a number is clamped to 0..1 (not finite counts as 0). `set()` can switch between a number and `'indeterminate'`; the tone is fixed when the element is built. The spinner runs only while it is on screen.
- `toggle`: `active` set from code does not call `onChange`.
- `row`: `update(props)` changes the row in place, see below.

## 6. Rows in detail

`kit.row(props)` returns a `KitRow`. In slot `'now'`, a `NowRow` is the same with an `id`; Visor builds the rows itself and calls `update` on the row with the same `id`.

`ctx.now.set(rows)` replaces all rows of the module. Rows are matched by `id`: a row that stays is updated in place (hover, keyboard focus and the expanded state stay), a new `id` creates a row, a missing `id` removes it and with it its expanded state.
Order is the order of the array. Rows without a string `id` are dropped; of two rows with the same `id` the first stays. The rows of one module sit together; modules follow each other in module order.
`ctx.now.clear()` removes all rows. "Now" has no rows and is not shown when no module has rows.

### Fields

| Field          | Effect                                                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `icon`         | Name: symbolic icon, 17 px, text colour. `Gio.Icon`: app icon, 28 px. Takes the place of `lead`.                                                                                |
| `iconStyle`    | `'symbolic'` (17 px), `'app'` (28 px), `'cover'`: a 36 px picture with round corners if `icon` is a `Gio.FileIcon`; with a name or another `Gio.Icon` it is a 36 px icon.       |
| `lead`         | Text in place of the icon (used only when there is no `icon`), at least 52 px wide, 12 px. Rows in one container share the width of the widest `lead`, so their titles line up. |
| `title`        | The main line, 13 px. It is also the accessible name of the row's switch and arrow.                                                                                             |
| `subtitle`     | Quiet line below the title.                                                                                                                                                     |
| `detail`       | Monospace text with a quiet background after the subtitle, on the same line.                                                                                                    |
| `meta`         | Quiet text at the right. While the row is hovered or focused and it has `actions`, the actions fade in at the same place and `meta` fades out.                                  |
| `value`        | Large (17 px, tabular digits) text at the right.                                                                                                                                |
| `status`       | `'waiting'`: amber tint, the row waits for the user. `'done'`: quieter. `'normal'`: default.                                                                                    |
| `activate`     | Click on the row, or Enter on the focused row.                                                                                                                                  |
| `primary`      | The main button at the right, always visible. Enter runs it if there is no `activate`.                                                                                          |
| `controls`     | Buttons at the right, always visible, before `primary`.                                                                                                                         |
| `actions`      | Buttons at the right that appear on hover or keyboard focus of the row.                                                                                                         |
| `expand`       | Builds the content below the row; called on the first expand. An arrow at the right (visible on hover, focus, or while expanded) opens and closes it.                           |
| `progress`     | A number (0..1, clamped) draws a thin line under the text; `'indeterminate'` a small spinner at the right.                                                                      |
| `progressTone` | `'muted'` (default) or `'accent'`, for the line only.                                                                                                                           |
| `toggle`       | A switch at the very end. `onChange(active)` gets the new state. Each `update()` sets the switch to `active` again.                                                             |

Left to right, the end of a row is: `actions` / `meta`, spinner, `value`, `controls`, `primary`, arrow, switch.
A button kind changes from icon to text (or back) when the action's icon or style changes; the button is then rebuilt, a focused `primary` keeps the focus.

### Click and keys

Click on the row:

1. `activate`, if there is one;
2. otherwise, if there is `toggle` and no `primary`: flips the switch (calls `onChange`);
3. otherwise, if there is `expand`: expands or collapses.

Enter (also on the keypad) on the focused row, with no Shift, Ctrl, Alt or Super held:

1. `activate`, else
2. `primary.run()`, else
3. flips `toggle`, else
4. expands or collapses, else
5. the key is not used.

Space expands or collapses an expandable row. A row with `toggle` and `expand` but no `activate` and no `primary` flips the switch on click; it expands only with the arrow or Space.
A row with `primary` and `expand` but no `activate` expands on click; Enter runs `primary`.

### `expand`

`expand` runs on the first expand and its widget is kept while the row lives. If `update()` passes **another function** (not the same one), the old content is destroyed and, if the row is expanded, built again.
A new closure on every `update()` therefore rebuilds the content each time; keep one function if the content must stay. A row that loses `expand` collapses.
If `expand` throws, the error is logged and nothing is shown.

## 7. Peek chips and attention

The peek state is a row of chips in the notch. It shows when the pointer rests on the notch (setting "hover preview", only if there is a chip) and for a moment after `flash`. Every module has at most one resting chip: `ctx.peek.set(chip)`; `ctx.peek.set(null)` removes it.
A click on a chip opens the panel; there is no click handler for modules.

Which chips show: at most **four**. Flashing chips come first (newest first), then the others by `priority`, highest first; equal priorities keep the module order. A `priority` that is not finite counts as 0.
The icon is a name or a `Gio.Icon`. An empty `text` shows the icon alone.

Tones: `'normal'` (default), `'accent'` marks a new event, `'waiting'` is amber and means "waits for you".

`ctx.peek.flash(chip)` shows the chip first, always in the `'accent'` tone, for **3 seconds**, and the notch goes to the peek state for that time. A new flash of the same module restarts the 3 seconds. Afterwards the resting chip (if any) is shown again.
The notch goes to the peek state for a flash only when the setting "Flash on events" is on, the primary monitor is not in full screen and notification banners are on (not Do Not Disturb). Otherwise the chip is just first in line for those 3 seconds if the peek state shows anyway.

Priorities of the built-in modules:

| Module        | Chip                                        | `priority` | Tone     |
| ------------- | ------------------------------------------- | ---------- | -------- |
| Timers        | a timer is done (`%s done`, also the flash) | 90         | `accent` |
| Up Next       | an event runs or starts within 15 minutes   | 60         | –        |
| Timers        | a timer or stopwatch is running             | 40         | –        |
| Media         | a track is playing                          | 30         | –        |
| Downloads     | the active download                         | 20         | –        |
| Notifications | number of unread notifications (also flash) | 10         | –        |

`ctx.attention('unread' | 'waiting' | null)` sets a dot next to the clock. All modules share one dot: `'waiting'` beats `'unread'`; `null` takes the module's part away. The built-in modules use only `'unread'` (Notifications).
`ctx.badge(count)` is the number on the dock icon of a `'dock'` module (see section 4).

## 8. Search

The search entry of the panel searches commands, calculations, apps, modules and GNOME search providers. Input is debounced by 40 ms. Modules add `commands` and one `search` source, and may hide a GNOME provider with `replacesSearchProvider`.

### Commands

```ts
commands: [{ keyword: ['timer'], hint: 'timer 25m Pizza', resolve: (args) => [...] }]
```

- The first word of the input is compared with every `keyword` (case-insensitive, whole word). The rest of the input, with single spaces, is `args`. List every language: `['stopwatch', 'stoppuhr']`.
- A command with a `keyword` that is not an array of non-empty strings, or without a `resolve` function, is ignored.
- `resolve(args)` runs on every change of the input, also on the way to Enter, so it **must have no side effect**. It returns what Enter would do, as `Result[]` or a `Promise` of it; the work belongs in each result's `activate()`.
- At most 5 results are used. An empty list, an exception or a rejected promise shows one line with `hint` (module name below it, module icon) that cannot be chosen. While a promise is pending the line shows the previous results of the same command, else the hint. An exception is logged.
- A recognised command is the whole answer: calculation, apps, module sources and GNOME providers are neither shown nor asked.
- Typing the beginning of a keyword (one word, shorter than the keyword) offers a line at the very end, subtitle = `hint`, right hint "Enter completes". Enter writes the keyword and a space into the entry and keeps the panel open.

### Sources

`search: { id, title, search(query, cancellable) }` is asked for every input that is not a recognised command, with the trimmed input as `query`.

- Return `Result[]` (or reject). At most 5 results are used. Anything without an `activate` function is dropped. Of equal `id`s the first stays.
- `title` is the heading of the group (shown in capital letters; the module name if `title` is empty).
- `cancellable` is cancelled as soon as the input changes or the panel closes. Stop work then. An answer that comes late is dropped. A rejection after cancelling is not logged; any other exception is, and the group stays empty.

### Results

| Field       | Meaning                                                                                                                 |
| ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| `id`        | Identifies the line within its group.                                                                                   |
| `title`     | The line.                                                                                                               |
| `subtitle`  | Quiet text below it.                                                                                                    |
| `icon`      | Symbolic name (16 px) or `Gio.Icon` (22 px, in its own colours). Without a usable icon the icon of the module is shown. |
| `hint`      | Short text at the right. Without one, the selected line shows `↵`.                                                      |
| `activate`  | Enter, or a click on the line.                                                                                          |
| `alternate` | Ctrl+Enter. Without it Ctrl+Enter on that line does nothing.                                                            |

`activate` and `alternate` are called with the result as `this`. Enter closes the panel **first**, then runs `activate()`, so a result may open an app, or `ctx.open()` the panel again.
The first line that can be chosen is selected; Up and Down move without wrapping, the pointer selects, a click chooses.

### `replacesSearchProvider`

A desktop id (`org.gnome.Notes.desktop` or `org.gnome.Notes`). While the module runs, the GNOME search provider of that app is not asked and has no group, so results do not appear twice.

### Order and limits

| #   | Group                                                      | Limit          |
| --- | ---------------------------------------------------------- | -------------- |
| 1   | Commands (only for a recognised command)                   | 5              |
| 2   | Calculate (calculation or currency)                        | 1              |
| 3   | Apps                                                       | 5              |
| 4   | Module sources, in module order                            | 5 per module   |
| 5   | GNOME search providers, in the order of the GNOME settings | 3 per provider |
| 6   | Completion of a keyword                                    | –              |

If every group is empty, "No results" is shown. Each new input starts a new generation: answers of an older input are dropped, its `Cancellable` is cancelled and groups keep their position while they fill.

## 9. Rules for modules

- **Only what happens now.** One place per module (section 1).
- **Quiet when idle.** No polling and no timer while nothing runs and the panel is closed. React to signals (D-Bus, Gio, MessageTray). Live updates (progress, countdowns) run only while `ctx.isOpen`; start and stop them in `ctx.onOpenChanged`.
- **No synchronous I/O.** Use async `Gio`, D-Bus and `Soup` calls. Never `GLib.spawn_sync` or blocking file reads on hot paths.
- **Shared HTTP.** Use `ctx.http`; never create a `Soup.Session`.
- **Wiring in `enable()`.** Build widgets in `buildSection()` and `buildView()`, which run lazily. Visor holds its own `enable()` to 5 ms.
- **Clean `disable()`.** Remove every actor, signal, source, watch and request the module made.
- **Kit only.** No own colours; cover art and app icons are the exception.
- **Every string through `ctx.t`** (and `owner.gettext` for `name`). English is the source language.
- **State of the module** goes into its own settings (`ctx.settings`), not into Visor's.
- **Do not rely on the guard.** Exceptions in callbacks are caught and logged once (section 3), but a module should not throw on normal input.

## 10. Stability

- `API_VERSION` is `1`. It is raised only for changes that break modules. `VisorApi.version` has the same value.
- `metadata.json` of a module names the version it was built for: `"visor": {"api": 1, …}`. Visor reads only `api`.
- On `register(module, owner)` Visor compares `owner.metadata.visor.api` with its `API_VERSION`. It must be **equal**. A number that differs, or a value that is not a number, makes `register` throw (`was built for module API N, but this Visor has module API 1`) and the module is not enabled.
- A module without a `visor.api` field is accepted, and so is a module registered without `owner`. Declare the field anyway.
- Visor keeps a list of refused modules (id, name, UUID, requested version) for the settings to show. The settings do not list them yet; the error from `register` is the only message.

### Not in v1

- A way to learn when the peek row is on screen (the Timers module's chip does not count down for that reason).
- A click handler for peek chips: a click always opens the panel.
- Extra row options: `RowOptions.trailing` (a widget at the end of a row) exists only for Visor's own Modules view and is not part of the API.
- A `prefs` hook on the module: the plan sketched it, `src/api.ts` has none.
