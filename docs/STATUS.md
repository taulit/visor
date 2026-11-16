# Status

Session 1 (Visor). Other sessions read only this file. Plan: [design/plan](design/plan/README.md).

## Tags

| Tag      | State                                                        |
| -------- | ------------------------------------------------------------ |
| `api-v1` | not yet (set after phase V2, together with `docs/api-v1.md`) |

## Phases

| Phase | Content                                                                                      | State       | PR                                           |
| ----- | -------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------- |
| V0    | Tooling, repo, CI, `docs/verified.md`, headless shell and screenshots                        | in review   | [#1](https://github.com/taulit/visor/pull/1) |
| V1    | Core: panel integration, states, spring, theme, clock, shortcuts, registry, kit, empty sheet | in review   | [#2](https://github.com/taulit/visor/pull/2) |
| V2    | Modules: notifications, up next, media, timers, downloads. Search. Freeze API                | in progress | –                                            |
| V3    | T3 Code, peek chips, settings, SDK, `visor-module-template`                                  | open        | –                                            |
| V4    | Hardening: budgets, accessibility, translations, reviews, EGO checklist, packages, README    | open        | –                                            |

## Done

- Private repo `taulit/visor`, build (`tsc` to readable ESM in `build/`), lint, type check, Vitest, store ZIP, CI.
- Sandboxed headless shell: `scripts/nested.sh` and `scripts/shell-shot.sh` (own HOME, D-Bus session and
  runtime directory; never touches the logged-in session).
- `docs/verified.md`: every _(prüfen)_ assumption of the plan checked against GNOME Shell 50.5.
- Core (V1): notch with four states and spring, theme from the panel colour, clock, shortcut takeover, module
  registry, UI kit, sheet, peek chips. Module API draft in `src/api.ts` (not frozen yet).

## Open

- Session 4 (catalogue, website) starts after `api-v1`.

## Not done by this session (needs the maintainer)

Making repos public, uploading to extensions.gnome.org, publishing to npm and AUR, installing Visor into
the logged-in session, real T3 Code approvals.
