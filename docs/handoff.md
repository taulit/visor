# Handoff (session 1, Visor)

Written 2026-11-17 for whoever continues without the chat context. Plan: `docs/design/plan/`, status for
other sessions: `docs/STATUS.md`, API facts: `docs/verified.md`, structure: `docs/architecture.md`.

## Done

- V0, V1, V2 are merged to `main` (PRs #1, #2/#3, #4). Tag `api-v1` is set; contract in `docs/api-v1.md`.
- Gate checks: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm pot`,
  `pnpm run test:shell` (sandboxed headless shell), `scripts/shots.sh` (screenshots in `docs/screenshots/`).

## State of V3

Branch `phase/v3-t3`, pull request https://github.com/taulit/visor/pull/5 against `main` (not stacked), waiting for the user to merge. Bug
review done, 11 of 12 findings fixed. The private template repo `taulit/visor-module-template` exists.

## State of V4

Branch `phase/v4-hardening`, pull request https://github.com/taulit/visor/pull/6 against `main` (not stacked), waiting for the user to merge.
Three reviews done and their findings applied. Nothing is running.

## After V4 (2026-11-18)

V3 and V4 are merged (PRs #5, #6). Two pull requests against `main`, independent of each other (not
stacked), wait for the user:

- https://github.com/taulit/visor/pull/7, branch `perf/smooth-notch`: the shadow below the open panel is
  gone, and the sheet is built ahead of the first open (`warmUp()` in `src/core/notch.ts`).
- Branch `feat/quick-answers`: the search answers what Quick Launcher
  (https://github.com/julianullrich99/quick-launcher) answers without an account: units, dates, time
  zones (`src/core/search/quick/`, taken from there, MIT), emoji (`:name`, `data/emoji.json`) and system
  actions. Date phrases are also read in the eight other languages (`quick/phrases.ts`, word lists not
  checked by native speakers).

Not taken over from Quick Launcher, open for the user to decide: passwords (Bitwarden through `rbw`,
1Password through `op`, typing into windows, a pinentry bridge) and time tracking (Clockify, custom
server, indicator in the top bar). The plan (`01-visor.md`, "Weitere Module") puts such integrations
into module repositories of their own; a module can add results to the search through API v1.

## Next

1. After the merge the remaining work is manual and belongs to the maintainer: `docs/release-checklist.md`
   (real session on GNOME 50, first real pairing with T3 Code, screen reader pass, one-hour memory run,
   timings on a quiet machine, native-speaker check of the translations, version bump, store upload).
2. The check "median enable() below 5 ms" in `tests/shell/notch-behaviour.sh` fails when the machine is under
   load (2 ms on a quiet run, up to 5.7 ms loaded).
3. The two workflows `release.yml` and `nightly.yml` have never run; expect fixes on their first run.

## Open items carried forward

- T3 Code: nothing is verified against a real server (token exchange, ticket, socket, approve/deny/reply/stop).
  The access token is in the keyring (libsecret, `docs/t3-protocol.md`); a locked keyring was not
  tested at runtime, the keyring of the sandbox is unlocked.
- "Open in T3 Code" opens the thread in the browser; the desktop app has no deep link for threads.
- API v1 has no kit element for body text or a text field; the T3 module builds both itself.

- Done in V4 (branch `t3/visor-performance-accessibility`): budgets measured (`docs/performance.md`,
  `scripts/measure.sh`, GSettings `debug-metrics`), accessibility (`docs/accessibility.md`,
  `tests/shell/a11y.sh`), a press on a peek chip marks the section of its module or opens the view of a dock
  module. Still open from that work: no screen reader was run; the first open after enable costs about 25 ms
  once (the sheet is built and styled then); a paired T3 Code server is pinged every 10 s also with the panel
  closed.
- Not looked at frame by frame: hint shape while growing, rounded corners during the peek animation.
- Not exercised: scale factor ≠ 1, several monitors, real fullscreen window, touch, right-to-left, screen
  readers (Orca), the timer sound, real GNOME search providers, Join links of recurring events.
- `kit.ts`, `notch.ts`, `sheet.ts` are large; the simplicity review of V4 should start there.
- Refused (incompatible) modules are remembered by the registry but shown nowhere yet (settings, V3).
- UUID of the notes module (`sheaf-visor@…` vs. `visor-<name>@…`): the user decides.
- Session 4 (catalog, website) can start; it reads `docs/STATUS.md` and `docs/api-v1.md`.

## Never without the user

Making repos public, store upload, npm/AUR publishing, installing Visor into the logged-in session, real
T3 Code approvals. Tests run only through `scripts/nested.sh`.
