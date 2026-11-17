# AUR package `gnome-shell-extension-visor`

The recipe for the Arch User Repository. It builds Visor from the tarball of a GitHub release and installs it for all users like a package of the distribution.

Nothing of this has been published. Pushing to the AUR is a step of [docs/release-checklist.md](../../docs/release-checklist.md) that only the maintainer takes.

## What the package installs

| Path                                                                       | What                                                         |
| -------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `/usr/share/gnome-shell/extensions/visor@taulit.github.io/`                | The extension: `metadata.json`, `*.js`, `stylesheet.css`     |
| `/usr/share/glib-2.0/schemas/org.gnome.shell.extensions.visor.gschema.xml` | The settings schema (compiled by the pacman hook of `glib2`) |
| `/usr/share/locale/<lang>/LC_MESSAGES/visor.mo`                            | The translations                                             |
| `/usr/share/licenses/gnome-shell-extension-visor/LICENSE`                  | The licence                                                  |

The extension directory has no `schemas/` and no `locale/`. The shell then looks for the schema and the translations in the system directories, which is how a system extension is meant to work (`getSettings()` and `initTranslations()` in `extensions/sharedInternals.js` of the shell).

## Dependencies

- `depends`: `gnome-shell>=50` and `<52`, the versions `metadata.json` lists.
- `makedepends`: `nodejs`, `pnpm`, `glib2` (`glib-compile-schemas`), `gettext` (`msgfmt`). The project needs Node 24 or newer (`engines` in `package.json`).
- `optdepends`: `evolution-data-server` (Join buttons of Up Next), `gnome-calendar` (opens an event).

`prepare()` runs `pnpm install --frozen-lockfile` and so needs the network. The packages it fetches are tools of the build (TypeScript and friends) and are not installed. The lockfile pins them.

## Version

`pkgver` must equal `version-name` in `metadata.json` (and `version` in `package.json`) of the release tag `v<pkgver>`. `prepare()` stops when `metadata.json` disagrees.

`sha256sums` is `SKIP` in the repository. At the release, after the tag exists and the tarball will not change, run `updpkgsums` and put the sum into the file before pushing.

## Release steps for this package

1. The tag `vX.Y.Z` exists on GitHub (release-checklist.md).
2. In a clean directory with only `PKGBUILD` in it: set `pkgver`, run `updpkgsums`, then `makepkg -f` and install the result in a test machine or `systemd-nspawn`, enable the extension, disable it again.
3. `namcap PKGBUILD` and `namcap *.pkg.tar.zst`.
4. `makepkg --printsrcinfo > .SRCINFO`, commit both files to the AUR repository `gnome-shell-extension-visor`, push.

## Checked here

Only `bash -n PKGBUILD` and a dry run of `package()` against a local build (file layout as in the table above). `makepkg` was not run, and `namcap` is not installed on the development machine.
