# @taulit/visor-module

Types and a small connect helper for **modules** of [Visor](https://github.com/taulit/visor), the notch for GNOME Shell 50/51.
A module is a GNOME extension of its own that puts rows into "Now", a section into "Up Next" or an icon with a view into the dock.

The full contract is in [docs/api-v1.md](https://github.com/taulit/visor/blob/main/docs/api-v1.md).
The quickest start is the template repository [taulit/visor-module-template](https://github.com/taulit/visor-module-template) ("Use this template").

## What is in the package

| File           | Purpose                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------ |
| `index.d.ts`   | The types of the API, generated from `src/api.ts` of Visor: `VisorModule`, `ModuleContext`…      |
| `connect.js`   | `connectVisor(extension, module)`: plain GJS ESM, no dependencies. **Copy it into your module.** |
| `connect.d.ts` | Types of `connectVisor`.                                                                         |

A GNOME extension has no `node_modules` at run time and needs no bundler, so `connect.js` is copied (together with `connect.d.ts` and `index.d.ts`) into the module, for example to `src/visor/`.
The package is for the types and for fetching the files: `npm pack @taulit/visor-module`, or copy them from the repository.

## Use

```ts
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { connectVisor, type VisorConnection } from './visor/connect.js';
import type { VisorModule } from './visor/index.js';

export default class MyModule extends Extension {
  private connection: VisorConnection | null = null;

  override enable(): void {
    const module: VisorModule = {
      id: 'my-module',
      name: this.gettext('My module'),
      icon: 'face-smile-symbolic',
      slot: 'now',
      enable: (ctx) =>
        ctx.now.set([{ id: 'hello', title: ctx.t('Hello'), icon: 'face-smile-symbolic' }]),
      disable: () => {},
    };
    this.connection = connectVisor(this, module);
  }

  override disable(): void {
    this.connection?.disconnect();
    this.connection = null;
  }
}
```

`connectVisor()`:

- looks up `visor@taulit.github.io`; if Visor is active it calls `api.register(module, extension)`,
- otherwise waits for `extension-state-changed` and registers then,
- registers again when Visor comes back after it was disabled (Visor forgets all modules when it is disabled),
- never throws when Visor is missing; logs one line when Visor refuses the module (for example another API version),
- `disconnect()` unregisters the module (if Visor is still there) and removes the signal.

`metadata.json` of the module names the API version it was built for and, by convention, the slot:

```json
{ "visor": { "api": 1, "slot": "now" } }
```

Start the `description` with "Requires Visor." so the store page says so.

## Rules for modules

- **Only what happens now.** One place (slot) per module.
- **Quiet when idle.** No polling and no timer while nothing runs and the panel is closed. React to signals (D-Bus, Gio, MessageTray). Live updates (progress, countdowns) run only while `ctx.isOpen`; start and stop them in `ctx.onOpenChanged`.
- **No synchronous I/O.** Use async `Gio`, D-Bus and `Soup` calls. Never `GLib.spawn_sync` or blocking file reads on hot paths.
- **Shared HTTP.** Use `ctx.http`; never create a `Soup.Session`.
- **Wiring in `enable()`.** Build widgets in `buildSection()` and `buildView()`, which run lazily. Visor holds its own `enable()` to 5 ms.
- **Clean `disable()`.** Remove every actor, signal, source, watch and request the module made.
- **Kit only.** No own colours; cover art and app icons are the exception.
- **Every string through `ctx.t`** (and `owner.gettext` for `name`). English is the source language.
- **State of the module** goes into its own settings (`ctx.settings`), not into Visor's.
- **Do not rely on the guard.** Exceptions in callbacks are caught and logged once, but a module should not throw on normal input.

## Versions

The version of this package follows the module API: `1.x` is for API version 1. A new API version breaks modules and gets a new major version.
`index.d.ts` is generated from `src/api.ts` (`pnpm sdk:gen` in the Visor repository); a test fails when it is out of date.

## License

MIT
