# Changelog

All notable changes to Visor. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/). Module API v1 is frozen and has its own contract in [docs/api-v1.md](docs/api-v1.md).

## [1.0.0] - unreleased

First release. Nothing has been published yet: the date is set when the tag `v1.0.0` is made. The phases V0 to V3 are merged or in review, V4 (hardening) is under way, see [docs/STATUS.md](docs/STATUS.md).

### Added

- **Notch.** Replaces the date menu with a notch below the top bar. Four states (clock at rest, hint, peek chips, open panel) driven by a damped spring, colours taken from the top bar and the accent colour, high contrast, no animation when GNOME animations are off. Disabling Visor brings the date menu back.
- **Shortcuts.** Takes over the shell's shortcut for the notification list (Super+V by default) and has an optional shortcut of its own. Escape closes the panel.
- **Banners.** The banners of the shell are moved below the notch while it shows the hint or the peek state.
- **Peek chips.** A row of up to four chips for what needs attention: waiting agents, ended timers, events, running timers, media, downloads and unread notifications.
- **Modules.** Media (MPRIS players with cover, controls and progress), Timers (countdowns, alarms and stopwatches, kept over a restart), Downloads (running downloads next to the browser's partial files), T3 Code (agent sessions, approve or deny a command in the row, reply, stop), Up Next (calendar events with Join buttons for Meet, Teams, Zoom and Jitsi) and Notifications (the shell's message tray with Do Not Disturb and Clear all).
- **Search.** One field for commands (`timer`, `stopwatch`/`stoppuhr`, `t3`), a calculator without `eval` (locale aware, percentages), currency conversion with the daily rates of the European Central Bank, apps, module results and GNOME search providers.
- **T3 Code.** Pairing from the settings window (pairing link and token exchange), a mock server for tests ([docs/t3-protocol.md](docs/t3-protocol.md)).
- **Settings window.** General (shortcut, hover preview and delay, flashes, width), Modules (switch and order per module, modules of other extensions, T3 Code pairing) and About.
- **Module API v1 and SDK.** A frozen API for modules that are extensions of their own, the npm package `@taulit/visor-module` with `connectVisor()` and generated types (`sdk/`, not yet published), and a module template (`examples/module-template/`).
- **Translations.** German, Spanish, French, Brazilian Portuguese, Italian, Polish, Russian, Simplified Chinese and Japanese. All but German are machine translated. See [docs/translating.md](docs/translating.md).
- **Tooling.** TypeScript compiled to readable ESM, ESLint, Prettier, Vitest, a sandboxed headless GNOME Shell for tests, leak test and screenshots (`scripts/nested.sh`), GitHub Actions CI, the store ZIP (`pnpm pack:zip`), a nightly shell test in a Fedora 44 container and a release workflow that drafts the GitHub release with notes from `git-cliff` when a `v*` tag is pushed (neither has run on GitHub yet), screenshots in the dark and light scheme with the accents blue and green.
- **Documents.** README with a generated module table, [CONTRIBUTING.md](CONTRIBUTING.md), [docs/ego-checklist.md](docs/ego-checklist.md), [docs/release-checklist.md](docs/release-checklist.md) and the recipe for the AUR package `gnome-shell-extension-visor` in [build-aux/aur](build-aux/aur/README.md).

### Network and privacy

- No telemetry. Requests: the daily ECB rates (only when a conversion is typed, switch `currency-rates`), cover pictures named by media players, and the T3 Code server after pairing. Details in the README.

### Known limits

- Tested on GNOME Shell 50.5 in a sandbox only; GNOME Shell 51 is listed in `metadata.json` but was not available.
- T3 Code approvals have not been tried against a real server.
- Not exercised: a display scale other than 1, several monitors, right-to-left languages, screen readers, touch.
