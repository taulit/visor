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

## Running now: V4 on branch `phase/v4-hardening` (branched from `phase/v3-t3`)

Four agents, each in its own worktree (`git worktree list`); they commit after each block. If one stopped at
the usage limit, send "continue" to its thread.

| Task                                                                                      | Model  | Thread                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Budgets (`debug-metrics`, `scripts/measure.sh`, `docs/performance.md`) and accessibility  | Fable  | `[V4 budgets and accessibility](t3-thread://v2/5fc2a994-cba4-4d98-859b-e0a5b6af75df/thread:delegated-task:command%3Amcp%3Aee7fc700-384c-4077-9a36-f2372be5e33c%3Adelegate-task%3A2567145d-2e25-482d-a0ea-f413398734c9)`        |
| T3 token into the keyring, untested parts of the settings, `visor.id` for foreign modules | Fable  | `[V4 keyring and settings checks](t3-thread://v2/5fc2a994-cba4-4d98-859b-e0a5b6af75df/thread:delegated-task:command%3Amcp%3Aee7fc700-384c-4077-9a36-f2372be5e33c%3Adelegate-task%3Aa22919f7-2b71-4ba4-8522-741bb47b82c3)`      |
| Translations es, fr, pt_BR, it, pl, ru, zh_CN, ja                                         | Sonnet | `[V4 translations](t3-thread://v2/5fc2a994-cba4-4d98-859b-e0a5b6af75df/thread:delegated-task:command%3Amcp%3Aee7fc700-384c-4077-9a36-f2372be5e33c%3Adelegate-task%3A5c67a253-d067-4c26-940e-c6ccefbe8ee8)`                     |
| README, `docs/ego-checklist.md`, AUR, release checklist, changelog, CI                    | Sonnet | `[V4 README, EGO checklist, packaging](t3-thread://v2/5fc2a994-cba4-4d98-859b-e0a5b6af75df/thread:delegated-task:command%3Amcp%3Aee7fc700-384c-4077-9a36-f2372be5e33c%3Adelegate-task%3A9e0a821b-8db6-4b91-8b53-f54931c08b1d)` |

Then: merge the four branches (conflicts expected in `po/`, the schema, `scripts/shell-tests.sh`,
`scripts/shots.sh`), translate strings the Fable agents added into all nine languages, gate, one bug review,
one simplicity review and one spec review on the diff, fix, and open the V4 pull request against `main` once
the V3 pull request is merged (otherwise say clearly that it is stacked on V3).

## Open items carried forward

- T3 Code: nothing is verified against a real server (token exchange, ticket, socket, approve/deny/reply/stop).
  The access token is stored as plain text in dconf; move it to the keyring (libsecret) in V4.
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
