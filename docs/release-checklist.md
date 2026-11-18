# Release checklist

The steps of the release 1.0.0 in order. A step marked **maintainer only** publishes something outside this repository or cannot be undone; nobody else, and no tool acting for the maintainer, takes it without being told to. Nothing in this list has been done yet.

Tick a step only after its "Verify" lines hold.

## 1. Prepare (in the repository)

1. Merge the open phase branches into `main` (V3 is pull request #5, V4 follows) and make sure `main` is green in CI.
   - Verify: `git log --oneline main` shows them, CI of the last commit is green.
2. Work through [ego-checklist.md](ego-checklist.md): every "maintainer" row has a decision.
   - Verify: each row of the file is "ok", "fixed" with the line re-checked, or has a written decision.
3. Bring the texts up to date with the code: the "Privacy and network" table of [README.md](../README.md) and the `description` of `metadata.json` must say what the code does at the release.
   - Verify: read both against `grep -rn "Soup\.\|St.Clipboard" src`.
4. Set the version everywhere, in one commit: `version-name` in `metadata.json`, `version` in `package.json`, the entry in [CHANGELOG.md](../CHANGELOG.md) (replace "unreleased" with the date), `pkgver` in [build-aux/aur/PKGBUILD](../build-aux/aur/PKGBUILD). `sdk/package.json` has its own version.
   - Verify: `node -p "[require('./metadata.json')['version-name'], require('./package.json').version].join(' ')"` prints the same number twice; `grep ^pkgver build-aux/aur/PKGBUILD` agrees.
5. Run all checks on a clean checkout.
   - `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build`
   - `pnpm run readme:check && pnpm sdk:check && pnpm template:check`
   - `pnpm test:shell` (needs GNOME Shell 50 and `dbus-run-session`; runs in a sandbox)
   - Verify: all pass, `pnpm run pack:zip` writes `dist/visor@taulit.github.io.shell-extension.zip`.
6. Look into the ZIP.
   - Verify: `unzip -l dist/*.zip` shows `metadata.json`, `extension.js`, `prefs.js`, `stylesheet.css`, `schemas/*.gschema.xml` (no `gschemas.compiled`), `locale/*/LC_MESSAGES/visor.mo` and the `.js` files; no `.po`, scripts, `node_modules` or media.
7. Read the README on GitHub's rendering, with the store link and the AUR line still marked "after release". Check that every link resolves.
8. Commit, push, open the pull request, merge it.

## 2. Try it in a real session (**maintainer only**)

Visor has only ever run in the sandbox (docs/STATUS.md). These are the checks that need a person, a real session or a real server, and are still open before 1.0.

1. Install the ZIP in your own session, log out and in, enable it, and use it for a few days: open and close, search, a timer, a download, a notification, a calendar event.
   - Verify: `journalctl --user -b | grep -i visor` shows no error; disabling Visor gives the date menu back.
2. Run it on **GNOME Shell 50** in the real session, and on **GNOME Shell 51**, or take `"51"` out of `shell-version` in `metadata.json` before the release (the README and the AUR `depends` name the same range; keep them in step).
   - Verify: no error in the journal on each version you keep listed; the notch opens, the date menu comes back on disable.
3. T3 Code is a module of its own now (https://github.com/taulit/visor-t3); its first real approval is on the checklist there.
4. Go through it with a screen reader (Orca): what is announced, in which order, and whether the selected search result is read. The list of what to listen for is in [accessibility.md](accessibility.md); no screen reader has been run so far.
   - Verify: the open items of accessibility.md are answered, and fixed or written down.
5. Run it for one hour with real use and compare the memory of the shell with and without Visor (plan 05: below 15 MB more after one hour). `scripts/measure.sh memory` covers 200 cycles in the sandbox, not one hour of use.
   - Verify: `grep -E 'VmRSS|RssAnon' /proc/$(pgrep -o gnome-shell)/status` at the start and after the hour; write the numbers into [performance.md](performance.md).
6. Take the timing numbers again on a quiet machine (nothing else running, on its own kernel, not in a virtual machine): `scripts/measure.sh` (all parts, about ten minutes). The first open after `enable()` and the frame times on 60 Hz were the numbers that depended on a noisy machine.
   - Verify: the table of [performance.md](performance.md) is replaced by the new run and every budget is "met" or has a reason.
7. Have the eight machine-translated languages (es, fr, pt_BR, it, pl, ru, zh_CN, ja) read by a native speaker each, and German by one more person if you can. The glossary and rules are in [translating.md](translating.md).
   - Verify: corrections are merged as a pull request on `po/*.po`; `msgfmt --check --statistics` reports no fuzzy entries.
8. Record the GIF for the top of the README. It needs a recording of a real session (the sandbox cannot move a real pointer or play real media): the notch at rest, a peek, opening, a search with a calculation, a waiting agent. Keep it short and make sure nothing private is on the screen. Put it in `docs/` and place it under the title of the README, as plan 05, section 7, lists it (title, GIF, three sentences, install, features, modules, build, contributing, license).
   - Verify: it renders on the GitHub page of the repository in both the light and the dark theme.

## 3. Make the repository public (**maintainer only**)

1. Check what becomes visible: the whole history, `docs/design/` (German plans and prototypes), `docs/handoff.md`, `docs/STATUS.md` and the screenshots. Decide whether any of it stays private.
   - Verify: no tokens, no private hostnames, no personal data in the history (`git log -p | grep -iE "token|secret|password"` and a look at the hits).
2. Set the description and topics of the repository from the plan (`docs/design/plan/05-quality-release.md`, section 7): "Visor – a Dynamic Island / notch for GNOME Shell: media, timers, AI agent approvals, calendar and notifications in one calm panel. Modular." and `gnome`, `gnome-shell-extension`, `dynamic-island`, `notch`, `linux`, `wayland`, `typescript`.
3. Switch the repository to public.
   - Verify: open `https://github.com/taulit/visor` in a window where you are logged out.

## 4. Tag and GitHub release (**maintainer only**)

1. Tag the merge commit on `main`: `git tag -a v1.0.0 -m "Visor 1.0.0"` and `git push origin v1.0.0`. The tag `api-v1` already exists and stays.
   - Verify: `git show v1.0.0` is the commit with the version bump of step 1.4.
2. Build the ZIP from the tag, not from your working tree: check out the tag in a clean directory, `pnpm install --frozen-lockfile && pnpm pack:zip`, or take the artifact `visor-extension` of the CI run of that commit.
3. The push of the tag starts [.github/workflows/release.yml](../.github/workflows/release.yml): it checks that the tag is the version of `metadata.json` and `package.json`, runs lint, typecheck, the unit tests and the build, packs the ZIP and creates a **draft** GitHub release with notes from the Conventional Commits (`git-cliff`, `cliff.toml`) and the ZIP attached. It uploads nothing to extensions.gnome.org and publishes nothing to npm or the AUR; those are steps 5, 6 and 7. It has never run on GitHub. Read the draft, edit the notes (replace them with the entry of CHANGELOG.md if you prefer it), and publish it yourself.
   - Verify: the draft has the ZIP; download it and compare `sha256sum` with the local file; install it in a test session. If the workflow fails, make the release by hand: `gh release create v1.0.0 dist/*.zip --draft`.

## 5. extensions.gnome.org (**maintainer only**)

1. Before the upload: step 1.2 is done, you have read and understand the code (last section of ego-checklist.md), the repository from `url` in `metadata.json` is public (step 3), the name "Visor" is free in the store.
2. Upload the ZIP of the release at <https://extensions.gnome.org/upload/>. Put the notes of ego-checklist.md in the message to the reviewers: network access, clipboard write, the two shell-private reads, the module API.
   - Verify: the page of the extension shows the right description, the version the store assigned, and "50", "51".
3. Answer the review. Each fix is a new patch release with the version raised in all places of step 1.4.
4. After approval: install from the store in a clean session and enable it. Then fill in the store link in the README ("after release") and add it to the AUR description.

## 6. AUR package (**maintainer only**)

After the tag exists (step 4). The steps are in [build-aux/aur/README.md](../build-aux/aur/README.md).

- Set `sha256sums` with `updpkgsums` in a copy of the directory (the file in the repository keeps `SKIP`).
- `makepkg -f` and install the package in a test machine, `namcap` on the PKGBUILD and the package, then `makepkg --printsrcinfo > .SRCINFO` and push both files to `ssh://aur@aur.archlinux.org/gnome-shell-extension-visor.git`.
- Verify: `yay -S gnome-shell-extension-visor` (or a clean `makepkg`) installs it, `gnome-extensions list` shows `visor@taulit.github.io`, and the extension starts with no `schemas/` or `locale/` directory next to it.

## 7. npm package for modules (**maintainer only**)

The package `@taulit/visor-module` is in `sdk/` (MIT).

1. `pnpm sdk:check`, then `cd sdk && npm pack --dry-run`.
   - Verify: the listing holds exactly `index.d.ts`, `index.js`, `connect.js`, `connect.d.ts`, `README.md`, `LICENSE`, `package.json`; the version in `sdk/package.json` is the one you want.
2. Make sure the scope `@taulit` exists on npm and you are logged in with two-factor authentication, then `npm publish --access public` in `sdk/`.
   - Verify: `npm view @taulit/visor-module version` prints it; `npm pack @taulit/visor-module` in an empty directory yields the same files.

## 8. Module template (**maintainer only**)

The template lives in `examples/module-template/` and is mirrored in the repository `taulit/visor-module-template`.

1. Copy the state of `examples/module-template/` into that repository (without `node_modules`, `build`, `dist`), commit.
   - Verify: `pnpm template:check` passes in the Visor repository; in a fresh clone of the template, `pnpm install && pnpm lint && pnpm typecheck && pnpm pack:zip` pass.
2. In its settings on GitHub, tick "Template repository", add the topics, then make it public.
   - Verify: the "Use this template" button shows on the page while you are logged out of the organisation.
3. Check the links to it in `README.md` and `sdk/README.md`.

## 9. Announce (**maintainer only**)

1. Remove "after release" from the README (store link, AUR line, npm package, template) and check that no link is dead. Commit to `main`.
2. Post the announcement where you want it (the repository's releases page, the GNOME discourse, social accounts). Link the store page, not the ZIP.
3. Watch the issues for the first days; the open items in [handoff.md](handoff.md) are the likely questions.

## After the release

- Open the next phase: fill `docs/STATUS.md` and `docs/handoff.md` with what is left.
- The catalogue of modules (plan 01, section 11) and the module ideas ([module-ideas.md](module-ideas.md)) come after 1.0.
