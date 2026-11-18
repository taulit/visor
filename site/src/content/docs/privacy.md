---
title: Privacy and network
description: 'Visor has no account, no telemetry and no server of its own. These are all the network requests the GNOME extension can make, and how to turn each one off.'
---

Visor has no account, no telemetry and no server of its own. These are all the requests it can make.

| Request                                                                                     | When                                                                                                                       | Turn it off                                                                                                                 |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| The daily rates of the European Central Bank (`eurofxref-daily.xml`)                        | Only when you type a currency conversion, at most once a day. The answer is kept in `~/.cache/visor/rates.json`.           | The switch "Load currency rates" in the settings, or `gsettings set org.gnome.shell.extensions.visor currency-rates false`. |
| The cover picture a player names in `mpris:artUrl`, when it is an `http` or `https` address | When a player reports one. Pictures are limited to 8 MB and kept in `~/.cache/visor`. `file://` covers are read from disk. | Turn off the Media module.                                                                                                  |

What Visor stores: the timers, the module order and the list of turned-off modules, all in GSettings.

The result of a calculation or conversion is copied to the clipboard when you press Enter. Visor never reads the clipboard.

Visor never loads code from the network. Modules are installed like any other extension, make their own requests and list them on their own pages. Visor: T3 Code, for example, talks only to the T3 Code server you pair it with and keeps its token in the keyring.
