---
title: Search
description: 'What the Visor search field understands: calculations, currency and unit conversion, dates, time zones, timers, emoji, apps and system actions, all from the GNOME top bar.'
---

Type in the field of the open panel. The arrow keys choose, <kbd>Enter</kbd> runs, <kbd>Ctrl</kbd>+<kbd>Enter</kbd> runs the alternative action of a result, <kbd>Esc</kbd> clears the field and then closes the panel.

![A currency conversion in the search](../../assets/screenshots/search-convert-dark.png)

| You type                                                                                                          | What happens                                                                                 |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `timer 25m Pizza`, `timer 1h30 Laundry`, `timer 90s`                                                              | Starts a countdown with an optional name.                                                    |
| `timer 18:30 Meeting`, `timer 6:30 pm`                                                                            | Starts an alarm for the next time the clock shows that time.                                 |
| `stopwatch Research`                                                                                              | Starts a stopwatch.                                                                          |
| `1+1`, `sqrt(16)`, `2 ^ 3`, `20% of 80`, `pi*2`                                                                   | Calculates. Enter copies the result.                                                         |
| `100 usd in eur`, `50 chf`, `100$ €`                                                                              | Converts with the daily rates of the European Central Bank. Enter copies the result.         |
| `10ft in m`, `100 km/h in mph`, `1 GiB in MB`, `20 c in f`                                                        | Converts units: length, area, volume, mass, time, speed, temperature, data, energy and more. |
| `20% off 80`, `80 + 20%`, `255 in hex`, `145 min to timespan`                                                     | Percentages, number bases and time spans.                                                    |
| `in 3 hours`, `next friday`, `today + 10 days`, `13:59 - 20h`                                                     | A date or a time, moved by any unit. Enter copies it.                                        |
| `days until 24.12.`, `weeks until easter`, `kw 52`, `1760000000`, `17:30 - 9:15`                                  | Countdowns, calendar weeks, Unix timestamps and the time between two moments.                |
| `time in tokyo`, `5pm berlin in tokyo`, `diff london`                                                             | Time zones.                                                                                  |
| `:rocket`                                                                                                         | Emoji by name. Enter copies one.                                                             |
| `lock`, `suspend`, `log out`, `restart`, `power off`, `screenshot`, `dark style`, `do not disturb`, `night light` | The action of the system, or the switch, as a result.                                        |
| `fire`                                                                                                            | Apps that match, then the results of modules and of the GNOME search providers.              |

![A date moved by a number of hours](../../assets/screenshots/search-date-dark.png)

## Details

The calculator is a small parser of its own, not `eval`. It knows `+ - × ÷ * / ^ %`, brackets, `sqrt sin cos tan log ln abs round`, `pi` and `e`, and reads numbers in the notation of your locale. Timer words are understood in English and German.

Units, dates and time zones are answered by the evaluators of [Quick Launcher](https://github.com/julianullrich99/quick-launcher), which know English and German words. Phrases about dates and times are also read in Spanish, French, Brazilian Portuguese, Italian, Polish, Russian, Chinese and Japanese.
