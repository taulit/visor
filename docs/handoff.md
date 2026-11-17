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
  The access token is in the keyring (libsecret, `docs/t3-protocol.md`); a locked keyring was not
  tested at runtime, the keyring of the sandbox is unlocked.
- "Open in T3 Code" opens the thread in the browser; the desktop app has no deep link for threads.
- API v1 has no kit element for body text or a text field; the T3 module builds both itself.

- Peek chip click should mark and, if needed, expand the matching section (plan 01 §8); today it only opens.
- Search: the frame showing local results came up to 30 ms after the debounce (list itself ≤ 14.6 ms); measure
  again in V4.
- Not looked at frame by frame: hint shape while growing, rounded corners during the peek animation.
- Not exercised: scale factor ≠ 1, several monitors, real fullscreen window, touch, right-to-left, screen
  readers, the timer sound, real GNOME search providers, Join links of recurring events.
- `kit.ts`, `notch.ts`, `sheet.ts` are large; the simplicity review of V4 should start there.
- Refused (incompatible) modules are remembered by the registry but shown nowhere yet (settings, V3).
- UUID of the notes module (`sheaf-visor@…` vs. `visor-<name>@…`): the user decides.
- Session 4 (catalog, website) can start; it reads `docs/STATUS.md` and `docs/api-v1.md`.

## Never without the user

Making repos public, store upload, npm/AUR publishing, installing Visor into the logged-in session, real
T3 Code approvals. Tests run only through `scripts/nested.sh`.
