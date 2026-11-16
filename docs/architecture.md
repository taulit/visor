# Architecture

Visor is one GNOME Shell extension without a daemon. `tsc` turns `src/` into readable ESM in `build/`, file by file.
API facts and the reasons behind the choices below are in [verified.md](verified.md).

## Parts

```text
src/
├── extension.ts        enable/disable, wires notch and content, exposes `api`
├── api.ts              the module API (types only); also published as the SDK
├── core/
│   ├── types.ts        contract between notch and content
│   ├── notch.ts        actors in and below the panel, state, position, modal
│   ├── state.ts        state machine idle → hint → peek → open (pure logic)
│   ├── motion.ts       damped spring on a Clutter.Timeline
│   ├── theme.ts        light or dark from the panel colour, high contrast
│   ├── clock.ts        clock and attention dot in the neck
│   ├── keybindings.ts  takes over the shell's notification-list shortcut, optional own one
│   ├── content.ts      implements NotchContent: owns registry, sheet and peek chips
│   ├── registry.ts     modules, slots, order, lazy building
│   ├── sheet.ts        the open panel: search row, dock, columns, module views
│   ├── peek.ts         the row of chips
│   └── kit.ts          UI building blocks handed to modules
├── modules/            built-in modules, using only api.ts
└── lib/                small helpers
styles/                 joined into one stylesheet.css by the build
```

## Two halves, one contract

`core/types.ts` splits the core in two:

- **Notch** (`NotchHost`) knows the panel, the monitor, animation, hover, the modal grab and the theme.
  It does not know what it shows.
- **Content** (`NotchContent`) knows modules, the sheet and the chips. It does not know where it is shown.

The notch asks the content for two widgets (`getPeek()`, `getSheet()`), both built on first use, and tells it
about state changes. The content asks the notch to open, close, flash or re-measure.

## Rules

- **Nothing in `enable()` but wiring.** Widgets of the sheet, the chips and module sections are built when first
  shown. Budget for `enable()`: 5 ms.
- **Quiet when idle.** No timeout and no polling while nothing runs and the panel is closed. Live updates
  (progress, countdowns, animations of content) run only while the panel is open.
- **Animate the reveal, not the layout.** Content is laid out once at its final size. Only a clip and a
  background actor without children change size per frame.
- **One way out.** Every class has `destroy()`, connects signals with `connectObject(..., this)` and removes
  them with `disconnectObject(this)`. After `disable()` the shell is as it was, including the date menu.
- **Colours.** The body has the colour of the panel (inline style). Everything else comes from two static token
  sets in the stylesheet, chosen by the class `visor-dark` or `visor-light` on the notch root and the neck, by
  the luminance of the panel, not by the colour scheme. `visor-hc` is added for high contrast. The accent is
  `-st-accent-color`. Amber `#f6a33b` means "waits for you" and nothing else.
- **Sizes.** Stylesheet lengths are scaled by St. Lengths set from code are multiplied by
  `St.ThemeContext.get_for_stage(global.stage).scale_factor`.
- **Text.** Every user-visible string goes through gettext. English is the source.
- **Modules use only `api.ts`.** Built-in modules get no shortcut into the core.

## Testing

- Pure logic (no `gi://` imports) is tested with Vitest: `pnpm test`.
- Everything else runs in a sandboxed headless shell (`scripts/nested.sh`): `pnpm test:shell` runs the tests in
  `tests/shell/` and the leak test, `scripts/shots.sh` takes the screenshots in `docs/screenshots/`,
  `scripts/shell-shot.sh <scenario>` a single one. The test helper in `tests/shell-helper/` exports
  `io.github.taulit.Visor.Debug` (`Eval`, `Screenshot`); in `Eval`, `visor` is the running extension object.
