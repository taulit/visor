# Handoff (session 1, Visor)

Written 2026-11-17 for whoever continues without the chat context. Plan: `docs/design/plan/`, status for
other sessions: `docs/STATUS.md`, API facts: `docs/verified.md`, structure: `docs/architecture.md`.

## Done

- V0, V1, V2 are merged to `main` (PRs #1, #2/#3, #4). Tag `api-v1` is set; contract in `docs/api-v1.md`.
- Gate checks: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm pot`,
  `pnpm run test:shell` (sandboxed headless shell), `scripts/shots.sh` (screenshots in `docs/screenshots/`).

## Running now: V3 on branch `phase/v3-t3` (based on `main`)

Three agents, each in its own git worktree under `~/.t3/worktrees/visor/` (see `git worktree list`). Their
branches are local only until merged; they were told to commit after each block.

| Task                                                                                               | Model  | Thread                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T3 Code module: `docs/t3-protocol.md`, mock server `tests/t3-mock/`, `src/modules/t3/`, scenario 3 | Fable  | `[V3 T3 Code module](t3-thread://v2/5fc2a994-cba4-4d98-859b-e0a5b6af75df/thread:delegated-task:command%3Amcp%3Ab8a3cbba-25c3-446a-8e6c-e755e20c69e1%3Adelegate-task%3A8a168891-d3d6-459d-9e96-a39ac8e725e4)`          |
| Settings window `src/prefs.ts`, `src/prefs/`                                                       | Sonnet | `[V3 settings (prefs)](t3-thread://v2/5fc2a994-cba4-4d98-859b-e0a5b6af75df/thread:delegated-task:command%3Amcp%3Ab8a3cbba-25c3-446a-8e6c-e755e20c69e1%3Adelegate-task%3Af0840ed0-6de1-48fb-9d1f-4029e95728e6)`        |
| SDK `sdk/`, `examples/module-template/`, `docs/module-ideas.md`                                    | Sonnet | `[V3 SDK and module template](t3-thread://v2/5fc2a994-cba4-4d98-859b-e0a5b6af75df/thread:delegated-task:command%3Amcp%3Ab8a3cbba-25c3-446a-8e6c-e755e20c69e1%3Adelegate-task%3A1780880d-7a72-47be-9522-48893dd9bac8)` |

If an agent stopped at the usage limit: send "continue" to its thread; its worktree keeps the state.

## Next

1. Merge the three V3 branches into `phase/v3-t3` (expect conflicts in `src/modules/index.ts`,
   `scripts/shell-tests.sh`, `scripts/shots.sh`, `po/`, the schema key `flash-on-waiting-agents`).
2. V3 gate: scenario 3 (agent waits → amber dot → peek → Allow → mock got the approval), the template builds a
   store ZIP. One bug review on the phase diff by a fresh agent, fix findings together.
3. Create the private repo `taulit/visor-module-template` from `examples/module-template/` (approved; mark it
   as template repo). Open the V3 PR against `main` with screenshots. Only the user merges.
4. V4: budgets (`docs/performance.md`, GSettings `debug-metrics`), accessibility, translations (es, fr, pt_BR,
   it, pl, ru, zh_CN, ja by a Sonnet agent, glossary in `docs/design/plan/04-design.md`), one
   simplicity review and one spec review, `docs/ego-checklist.md`, AUR `build-aux/aur/PKGBUILD`, README with
   module table, `docs/release-checklist.md`.

## Open items carried forward

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
