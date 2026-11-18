# Contributing to Visor

Thank you for helping. Bugs, ideas, translations and modules are all welcome. Everything in this repository is in English: code, comments, commit messages, issues and documents.

## Issues

Open an issue at <https://github.com/taulit/visor/issues>. For a bug, say which GNOME Shell version you run (`gnome-shell --version`), how you installed Visor, and what the shell logged (`journalctl -b /usr/bin/gnome-shell`). Visor supports GNOME Shell 50 and 51 only (`metadata.json`); a report from another version is welcome but may not be fixable.

## Set up and run the checks

You need Node 24 or newer, pnpm, `glib-compile-schemas`, gettext and zip (see the README, "Install").

```sh
pnpm install
pnpm lint        # ESLint and prettier --check
pnpm typecheck
pnpm test        # unit tests (Vitest)
pnpm readme:check
pnpm test:shell  # sandboxed headless GNOME Shell 50; needs dbus-run-session
```

`pnpm format` fixes what prettier complains about. The pull request checks (`.github/workflows/ci.yml`) run lint, typecheck, the unit tests, the schema and README checks, the SDK and template checks and `pnpm pack:zip`; the shell tests run nightly (`.github/workflows/nightly.yml`) and on your machine.

## Never test in your own session

Do not install Visor into the session you are logged in to, do not enable it with `gnome-extensions`, and do not write its settings with `gsettings` or `dconf` while you work on it. A bug in a shell extension can take the whole session down.

Use the sandbox instead: `scripts/nested.sh` starts a headless GNOME Shell with its own home directory, D-Bus session, settings and keyring, loads the extension from `build/` into it and runs your command there. It never reaches the shell you are logged in to.

```sh
pnpm build
scripts/nested.sh -- bash -c 'source scripts/lib/shell.sh; shell_eval "Main.panel.statusArea.dateMenu.container.visible"'
```

The options are listed at the top of `scripts/nested.sh` (`--scheme`, `--accent`, `--size`, `--extension DIR`, `--animations`, `--no-keyring`, `--log`). The tests in `tests/shell/` are examples of what to do inside it.

## Branches and commits

- Work on a branch and open a pull request against `main`. Any short descriptive branch name will do; the maintainer's own branches are `phase/vN-name` for a phase of the plan and `t3/<slug>` for a task.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): subject`, in the imperative and in English, for example `fix(notch): keep the peek chips inside the panel`. The types in use are `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `ci`, `build`, `chore`, `style` and `i18n`. The release notes are generated from these subjects (`cliff.toml`).
- Keep commits small: one change and its test or document per commit. Do not mix a reformat with a change.
- Add a line to the part of [CHANGELOG.md](CHANGELOG.md) that is still marked unreleased for anything a user would notice.
- Visor is kept small on purpose, and the extensions.gnome.org reviewers read the code: write comments that explain why, leave out dead code, and use only shell APIs that are checked in [docs/verified.md](docs/verified.md). A shell API that is not listed there needs an entry (file and line in the source of GNOME Shell 50) in the same pull request.

## Add a screenshot scenario

A scenario is a short script in `scripts/scenarios/<name>.sh`. `scripts/shell-shot.sh <name>` runs it in the sandbox: the script drives the shell into a state with `shell_eval` and `shell_wait_for` (`scripts/lib/shell.sh`), and the screenshot is taken when it ends. Look at `scripts/scenarios/hint.sh` (three lines) and `scripts/scenarios/content-peek.sh` as examples; a scenario that wants one window instead of the whole monitor sets `SHOT_WINDOW` to its title (see `prefs-general.sh`).

1. Write `scripts/scenarios/<name>.sh` and try it: `pnpm build && scripts/shell-shot.sh <name> --scheme light --out /tmp/try.png`.
2. Add `"<screenshot name>=<name>"` to the list at the top of `scripts/shots.sh`. A listed scenario is taken in the dark and the light scheme, each with the accent blue and green, into `docs/screenshots/<screenshot name>-<scheme>[-green].png`.
3. Run `scripts/shots.sh <screenshot name>` and look at the images. The run fails when the shell logs an error while one is taken.
4. Commit the PNGs together with the scenario.

## Add a language

Follow "Add a language" in [docs/translating.md](docs/translating.md): `pnpm pot`, `msginit`, an entry in `po/LINGUAS`, and `msgfmt --check` without untranslated or fuzzy entries. The same document has the tone, the rules and the glossary. Fixing a wrong text in an existing language is the same file: edit the `.po` and open a pull request.

## Write a module

A module for Visor is an extension of its own. The contract is [docs/api-v1.md](docs/api-v1.md) (frozen as version 1), the types and `connectVisor()` are in [sdk/](sdk/README.md), and a starting point is [examples/module-template](examples/module-template).

## Licence

By contributing you agree that your contribution is licensed as the part of the repository it goes into: GPL-2.0-or-later for Visor ([LICENSE](LICENSE)), MIT for [sdk/](sdk/) and the module template.
