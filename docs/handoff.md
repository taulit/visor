# Handoff (Visor)

Written 2026-11-18 for whoever continues without the chat context. Plan: `docs/design/plan/`, status for
other sessions: `docs/STATUS.md`, API facts: `docs/verified.md`, structure: `docs/architecture.md`.

## Done

- V0 to V4 are merged to `main` (PRs #1 to #9). Tag `api-v1` is set; contract in `docs/api-v1.md`.
- Gate before every pull request: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm pot`,
  `pnpm sdk:check`, `pnpm run template:check`, `pnpm run readme:check` and `pnpm run test:shell`
  (sandboxed headless shell, about ten minutes; one test with `pnpm run test:shell <name>`). Changes of
  texts in the settings window need the shell tests too: descriptions of Adw are markup.

## The store of modules (session of 2026-11-18)

The maintainer wants "a store with extensions". Order of work, each step a pull request of its own against
`main`, nothing stacked:

1. **T3 Code moved out of Visor** into the module repository `taulit/visor-t3` (private, local
   `~/development/visor-t3`, UUID `visor-t3@taulit.github.io`, store name "Visor: T3 Code", module id
   `t3`). Visor's side is the branch `refactor/extract-t3`. It deletes what pull request #10
   (`fix/t3-open-in-app`) changes, and `visor-t3` was started from the code of #10, so **#10 is closed, not
   merged**, once the extraction is merged.
2. Template and SDK: what the extraction showed is missing (list below).
3. Catalog `taulit/visor-modules` (plan 11.1 to 11.3) and "Discover" in the settings (`src/prefs/discover.ts`,
   a link so far).
4. Website in `site/` (plan 11.4).
5. More modules as repositories of their own (`docs/module-ideas.md`, and from Quick Launcher: passwords
   through `rbw`/`op`, Clockify).

### What the extraction showed

- A module can be tested next to Visor with the sandbox of this repository:
  `scripts/nested.sh --extension <module>/build -- <test>`. `visor-t3/tests/shell/lib.sh` is the pattern
  (`VISOR_REPO`, default `../visor`). The template has nothing like it yet.
- The template's `scripts/build.sh` does not copy a `stylesheet.css`; it has no unit test setup (Vitest) and
  no shell test.
- **API gap, not decided:** v1 has no kit element for body text and none for a text field. Both `visor-t3`
  and the notes module of Sheaf build them from `St.Label` and `St.Entry` and style them through the classes
  `.visor-dark`, `.visor-light` and `.visor-hc` that Visor sets on its root. Those classes are not part of
  the contract. Proposal to the maintainer: add `kit.text()` and `kit.entry()` (additive, v1 stays), or at
  least write the three classes into `docs/api-v1.md`. The API is frozen: nothing changes without the
  maintainer.
- A leak test of a module has to open the panel once before it counts actors: Visor builds its sheet three
  seconds after `enable()` or at the first open (`visor-t3/tests/shell/leak.sh`, `warm`).
- `scripts/lib/keyring.sh` keeps the keyring of the sandbox (guard, start, lock); what stores a token of T3
  Code moved to `visor-t3`.

### Open decisions of the maintainer

- Name and UUID of the T3 module (in use: `visor-t3`).
- UUID of the notes module: `sheaf-visor@…` (plan 03, in use) or `visor-notes@…` (convention of plan 01).
- The API addition above.
- Website: stack (plan recommends Astro static + Tailwind) and address (`taulit.github.io/visor` needs a
  public repository or a paid plan).
- Which modules come first.

## Next (maintainer, by hand)

1. `docs/release-checklist.md` (real session on GNOME 50, screen reader pass, one-hour memory run, timings
   on a quiet machine, native-speaker check of the translations, version bump, store upload).
2. The check "median enable() below 5 ms" in `tests/shell/notch-behaviour.sh` fails when the machine is under
   load (2 ms on a quiet run, up to 5.7 ms loaded).
3. The two workflows `release.yml` and `nightly.yml` have never run; expect fixes on their first run.

## Open items carried forward

- The plan (`docs/design/plan/01-visor.md`) still describes T3 Code as a built-in module; the plan is kept as
  it was written.
- The four pictures `docs/screenshots/search-date-*.png` still show the shadow that was removed; make them
  again with `scripts/shots.sh search-date`.
- Still open from V4: no screen reader was run; the first open after enable costs about 25 ms once.
- Not looked at frame by frame: hint shape while growing, rounded corners during the peek animation.
- Not exercised: scale factor ≠ 1, several monitors, real fullscreen window, touch, right-to-left, screen
  readers (Orca), the timer sound, real GNOME search providers, Join links of recurring events.
- `kit.ts`, `notch.ts`, `sheet.ts` are large; a simplicity review should start there.
- Refused (incompatible) modules are remembered by the registry but shown nowhere yet.

## Never without the user

Making repos public, store upload, npm/AUR publishing, tags and releases, GitHub Pages, installing Visor
into the logged-in session. Tests run only through `scripts/nested.sh`. Only the maintainer merges.
