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

Running, all read-only except the first (which edits `po/` only):

| Task                                      | Model  | Thread                                                                                                                                                                                                           |
| ----------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8 new strings in eight languages          | Sonnet | `[V4 translation top-up](t3-thread://v2/5fc2a994-cba4-4d98-859b-e0a5b6af75df/thread:delegated-task:command%3Amcp%3A2f75c7d8-4126-4cd4-94ec-9b8ebd2fd5c5%3Adelegate-task%3Ae20db198-b123-4202-a982-0647da13b67f)` |
| Bug review of the V4 diff                 | Fable  | `[V4 bug review](t3-thread://v2/5fc2a994-cba4-4d98-859b-e0a5b6af75df/thread:delegated-task:command%3Amcp%3A2f75c7d8-4126-4cd4-94ec-9b8ebd2fd5c5%3Adelegate-task%3A7aa7e5a5-cc3a-4756-958f-12387fdaf183)`         |
| Simplicity review of `src/` and `styles/` | Fable  | `[V4 simplicity review](t3-thread://v2/5fc2a994-cba4-4d98-859b-e0a5b6af75df/thread:delegated-task:command%3Amcp%3A2f75c7d8-4126-4cd4-94ec-9b8ebd2fd5c5%3Adelegate-task%3A518cec42-f0ef-4b6e-a8b7-aef10411fb0d)`  |
| Spec review against the plans             | Sonnet | `[V4 spec review](t3-thread://v2/5fc2a994-cba4-4d98-859b-e0a5b6af75df/thread:delegated-task:command%3Amcp%3A2f75c7d8-4126-4cd4-94ec-9b8ebd2fd5c5%3Adelegate-task%3A559bb0c4-b921-4f57-bdc7-6865fae953bc)`        |

## Next

1. Fix the findings of the three reviews together with the two violations in `docs/ego-checklist.md` (timeouts
   that outlive `disable()` in `src/modules/upcoming/`, `run_dispose()` without a reason) and the gaps in
   `docs/verified.md` (private shell members of the calendar, five shell modules).
2. Full gate once more on a quiet machine (`pnpm run test:shell`, `scripts/measure.sh`, `scripts/shots.sh`).
3. Open the V4 pull request against `main` once the V3 pull request (#5) is merged; if it is still open, say
   clearly that V4 is stacked on #5 and must be merged after it.

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
