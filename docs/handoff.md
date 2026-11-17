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

## Running now: V4 on branch `phase/v4-hardening` (branched from `phase/v3-t3`, pushed)

Merged and pushed: translations (9 languages), README, `docs/ego-checklist.md`, AUR, release checklist,
changelog, CI steps, the T3 token in the keyring, the settings checks, `visor.id`, `debug-metrics`,
`scripts/measure.sh`, `docs/performance.md`, accessibility (`docs/accessibility.md`, `tests/shell/a11y.sh`).
Gate on the merged branch: 794 unit tests, 18 shell tests (one timing fix in `tests/shell/prefs-t3.sh`).

The three reviews are done (bug: 1 blocking, 5 minor; simplicity: 19 cuts; spec: 9 gaps). The V3 pull
request (#5) is merged and `main` is merged into this branch, so V4 is not stacked.

Running, each in its own worktree (`git worktree list`), committing after each item:

| Task                                                                                                                                                                      | Model  | Thread                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bugs (pairing with a locked keyring, sources after `disable()`), plan gaps (ear radius, signal count in the leak test, scenario 1 as one test), simplifications in `src/` | Fable  | `[V4 fix review findings (source)](t3-thread://v2/5fc2a994-cba4-4d98-859b-e0a5b6af75df/thread:delegated-task:command%3Amcp%3A2f75c7d8-4126-4cd4-94ec-9b8ebd2fd5c5%3Adelegate-task%3A5917bfb2-f88f-486c-b562-39a871f94188)`   |
| Release and nightly workflows, screenshots in two accents, `docs/verified.md`, checklists, `CONTRIBUTING.md`                                                              | Sonnet | `[V4 fix review findings (CI, docs)](t3-thread://v2/5fc2a994-cba4-4d98-859b-e0a5b6af75df/thread:delegated-task:command%3Amcp%3A2f75c7d8-4126-4cd4-94ec-9b8ebd2fd5c5%3Adelegate-task%3Ae14ba543-8296-4190-b87b-64e6eb629abc)` |

## Next

1. Merge both branches into `phase/v4-hardening`; update `docs/ego-checklist.md` rows the source fixes made
   stale.
2. Full gate once on a quiet machine (`pnpm run test:shell`, `scripts/measure.sh`, `scripts/shots.sh`); a
   short re-check by a fresh agent of the blocking finding (pairing with a locked keyring).
3. Open the V4 pull request against `main` (not stacked). Only the user merges.

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
