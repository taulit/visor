---
title: Privacy and network
description: 'Visor has no account, no telemetry and no server of its own. These are all the network requests the GNOME extension can make, and how to turn each one off.'
---

Visor has no account, no telemetry and no server of its own. These are all the requests it can make.

| Request                                                                                     | When                                                                                                                       | Turn it off                                                                                                                 |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| The daily rates of the European Central Bank (`eurofxref-daily.xml`)                        | Only when you type a currency conversion, at most once a day. The answer is kept in `~/.cache/visor/rates.json`.           | The switch "Load currency rates" in the settings, or `gsettings set org.gnome.shell.extensions.visor currency-rates false`. |
| The cover picture a player names in `mpris:artUrl`, when it is an `http` or `https` address | When a player reports one. Pictures are limited to 8 MB and kept in `~/.cache/visor`. `file://` covers are read from disk. | Turn off the Media module.                                                                                                  |
| The T3 Code server: HTTP and a WebSocket                                                    | Only after you paired Visor in the settings. Plain `http` is accepted for this machine only.                               | Turn off the T3 Code module, or press Disconnect in the settings.                                                           |
| The same server, from the settings window                                                   | Only when you press Connect.                                                                                               | Do not pair.                                                                                                                |

What Visor stores: the timers, the module order and the list of turned-off modules, all in GSettings. The T3 Code access token is kept in the system keyring (libsecret).

The result of a calculation or conversion is copied to the clipboard when you press Enter. Visor never reads the clipboard.

Visor never loads code from the network. Modules are installed like any other extension.
