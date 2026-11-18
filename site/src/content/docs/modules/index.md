---
title: Write a module
description: 'Add rows, sections and dock views to Visor from your own GNOME Shell extension with the stable module API v1, the connectVisor() helper and the module template.'
---

A **module** is a GNOME extension of its own that hands Visor rows for **Now**, a section for **Up Next**, or an icon with a view of its own in the dock. The built-in modules (Media, Timers, Downloads, Up Next, Notifications, T3 Code) use exactly the same API. The contract is frozen as [version 1](/visor/modules/api-v1/).

| Slot      | Place                                        | What the module provides                       |
| --------- | -------------------------------------------- | ---------------------------------------------- |
| `'now'`   | Rows in "Now" (left column)                  | `ctx.now.set(rows)`, only while something runs |
| `'ahead'` | A section in "Up Next" (right column)        | `buildSection()`                               |
| `'dock'`  | An icon in the dock next to the search field | `buildView()`, optional actions and a badge    |

Any module can also add a chip to the peek row, a dot next to the clock, search results and commands.

## Start from the template

The quickest start is the template repository [taulit/visor-module-template](https://github.com/taulit/visor-module-template): click **Use this template**. The same files are in [examples/module-template](https://github.com/taulit/visor/tree/main/examples/module-template) of the Visor repository. It has TypeScript, ESLint, a settings window, translations and a script for the ZIP that extensions.gnome.org wants.

## The SDK

The package `@taulit/visor-module` ([sdk/](https://github.com/taulit/visor/tree/main/sdk)) has the types of the API and `connectVisor()`, about 60 lines of plain GJS without dependencies. A GNOME extension has no `node_modules` at run time, so copy `connect.js`, `connect.d.ts` and `index.d.ts` into your extension, for example to `src/visor/`.

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

`connectVisor()` registers the module as soon as Visor is active, now or later, registers it again when Visor comes back after it was disabled, never throws when Visor is missing, and `disconnect()` unregisters it.

`metadata.json` of the module names the API version and the slot. With the optional `id`, the settings window of Visor can switch the module off and put it in order like a built-in one:

```json
{
  "description": "Requires Visor. Shows …",
  "visor": { "api": 1, "slot": "now", "id": "my-module" }
}
```

## Rules for modules

- **Only what happens now.** One place (slot) per module.
- **Quiet when idle.** No polling while nothing runs and the panel is closed. Live updates run only while `ctx.isOpen`.
- **No synchronous I/O.** Use async `Gio`, D-Bus and `Soup` calls.
- **Shared HTTP.** Use `ctx.http`; never create a `Soup.Session`.
- **Wiring in `enable()`.** Build widgets in `buildSection()` and `buildView()`, which run lazily.
- **Clean `disable()`.** Remove every actor, signal, source, watch and request the module made.
- **Kit only.** No colours of your own; cover art and app icons are the exception.
- **Every string through `ctx.t`.** English is the source language.

## Ideas

Modules that are not built yet: Spotify controls, GoodDay tasks, 1Password search, GitHub pull requests waiting for review, the weather for the next hours. Each one would be a repository of its own, started from the template.

The full contract, with every type and the behaviour of each call, is the [API reference](/visor/modules/api-v1/).
