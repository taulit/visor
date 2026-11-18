---
title: Install Visor
description: 'How to install the Visor GNOME Shell extension from extensions.gnome.org, the AUR or from source, and how to enable and configure it.'
---

## Requirements

- **GNOME Shell 50 or 51.** Other versions are not supported.
- For the Join button of Up Next: the typelibs of Evolution Data Server (`ECal`, `EDataServer`). Without them the button is missing and nothing else changes.
- For the T3 Code module: a running [T3 Code](https://github.com/pingdotgg/t3code) server. Without one it stays empty.

While Visor is enabled it replaces the date menu in the middle of the top bar. Disabling Visor brings the date menu back unchanged.

## From extensions.gnome.org

_The link follows after the release._

## From the AUR

On Arch and derivatives, the package `gnome-shell-extension-visor` follows after the release.

## From source

You need Node 24 or newer, pnpm, `glib-compile-schemas` (libglib2.0-bin or glib2), gettext and zip.

```sh
git clone https://github.com/taulit/visor.git
cd visor
pnpm install && pnpm build && pnpm pack:zip
gnome-extensions install --force dist/visor@taulit.github.io.shell-extension.zip
```

Log out and in again (on Wayland the shell cannot be restarted), then enable it:

```sh
gnome-extensions enable visor@taulit.github.io
```

## Settings

Open the settings in the Extensions app or with:

```sh
gnome-extensions prefs visor@taulit.github.io
```

There you can turn each built-in module off, change their order, set an extra shortcut, turn off the currency rates and pair Visor with T3 Code.

## Uninstall

```sh
gnome-extensions uninstall visor@taulit.github.io
```
