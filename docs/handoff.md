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

## Next

1. After the merge: branch `phase/v4-hardening` from `main`.
2. V4: budgets (`docs/performance.md`, GSettings `debug-metrics`), accessibility, translations (es, fr, pt_BR,
   it, pl, ru, zh_CN, ja by a Sonnet agent, glossary in `docs/design/plan/04-design.md`), one
   simplicity review and one spec review, `docs/ego-checklist.md`, AUR `build-aux/aur/PKGBUILD`, README with
   module table, `docs/release-checklist.md`.

## Open items carried forward

- T3 Code: nothing is verified against a real server (token exchange, ticket, socket, approve/deny/reply/stop).
  The access token is stored as plain text in dconf; move it to the keyring (libsecret) in V4.
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
