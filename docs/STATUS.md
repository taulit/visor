# Status

Session 1 (Visor). Other sessions read only this file. Plan: [design/plan](design/plan/README.md).

## Tags

| Tag      | State                                                         |
| -------- | ------------------------------------------------------------- |
| `api-v1` | set on `phase/v2-modules`; contract in [api-v1.md](api-v1.md) |

## Phases

| Phase | Content                                                                                      | State  | PR                                                                                         |
| ----- | -------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------ |
| V0    | Tooling, repo, CI, `docs/verified.md`, headless shell and screenshots                        | merged | [#1](https://github.com/taulit/visor/pull/1)                                               |
| V1    | Core: panel integration, states, spring, theme, clock, shortcuts, registry, kit, empty sheet | merged | [#2](https://github.com/taulit/visor/pull/2), [#3](https://github.com/taulit/visor/pull/3) |
| V2    | Modules: notifications, up next, media, timers, downloads. Search. Freeze API                | merged | [#4](https://github.com/taulit/visor/pull/4)                                               |
| V3    | T3 Code, peek chips, settings, SDK, `visor-module-template`                                  | merged | [#5](https://github.com/taulit/visor/pull/5)                                               |
| V4    | Hardening: budgets, accessibility, translations, reviews, EGO checklist, packages, README    | merged | [#6](https://github.com/taulit/visor/pull/6)                                               |

## Done

- Private repo `taulit/visor`, build (`tsc` to readable ESM in `build/`), lint, type check, Vitest, store ZIP, CI.
- Sandboxed headless shell: `scripts/nested.sh` and `scripts/shell-shot.sh` (own HOME, D-Bus session and
  runtime directory; never touches the logged-in session).
- `docs/verified.md`: every _(prüfen)_ assumption of the plan checked against GNOME Shell 50.5.
- Core (V1): notch with four states and spring, theme from the panel colour, clock, shortcut takeover, module
  registry, UI kit, sheet, peek chips. Module API draft in `src/api.ts` (frozen as v1).
- V2: modules Media, Timers, Downloads, Up Next, Notifications; search with commands, calculator, currency,
  apps and GNOME search providers.

## For other sessions

- **Module API v1 is frozen**: tag `api-v1`, types in `src/api.ts`, description in `docs/api-v1.md`.
- `connectVisor()` and the types of the npm package `@taulit/visor-module` are in `sdk/` (not yet published to npm);
  the module template is `examples/module-template/`. See `docs/api-v1.md`.
- UUID of the notes module: plan 03 says `sheaf-visor@taulit.github.io`, plan 01 the convention
  `visor-<name>@<domain>`. Visor accepts either; the maintainer decides.

## Modules in repositories of their own

- T3 Code is no longer built in: `taulit/visor-t3` (UUID `visor-t3@taulit.github.io`, module id `t3`).
- Notes: `sheaf/visor-module` in `taulit/sheaf`.

## Open

- Catalogue (`taulit/visor-modules`) and website (`site/`): see [handoff.md](handoff.md).

## Not done by this session (needs the maintainer)

Making repos public, uploading to extensions.gnome.org, publishing to npm and AUR, installing Visor into
the logged-in session.
