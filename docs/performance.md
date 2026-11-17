# Performance

The budgets of Visor (plan 05 §1), what was measured, and how. Measure again with `scripts/measure.sh`
(all parts, about ten minutes) or `scripts/measure.sh enable frames search idle memory` (any subset).

## Result

Two sets of numbers, because the machine changed under the work: the first runs were on the native kernel,
the last full run of `scripts/measure.sh` was on the same CPU inside WSL2 with a load average of 6 to 7 from
other work (a plain Python loop took four times as long as usual there). The timing budgets can only be judged
by the first set; the second is the complete output of the script as required, and shows what does not depend
on speed.

### On the native kernel (Linux 6.18, i5-11400F, GNOME Shell 50.5, headless; partial runs, 2026-11-17)

| What                                   | Budget           | Measured                                                                                                                      | Result                         |
| -------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `enable()`                             | < 5 ms           | median 2.73 ms (min 2.52, max 5.15, n=20); a run under load: median 7.06 ms                                                   | met when the machine is quiet  |
| open: frame interval                   | 16.7 ms, no drop | mean 16.6 ms; 2 of 11 runs had one frame above 25 ms (32.8 ms, on the first open)                                             | met except the first open      |
| open: main-loop work per frame         | < 8 ms           | mean 1.3 to 2.3 ms; worst frame per run 2.5 to 7.0 ms, first open 9.1 ms                                                      | met except the first open      |
| open: of that in Visor's handler       |                  | worst frame 0.15 to 0.37 ms                                                                                                   |                                |
| open: work before the first frame      | < 8 ms           | 5.5 to 8.9 ms                                                                                                                 | at the limit                   |
| close: frame interval                  | 16.7 ms, no drop | mean 16.6 ms, worst 17.2 to 18.4 ms in 10 of 12 runs; two runs with one late frame (42 and 51 ms)                             | met, with outliers             |
| close: main-loop work per frame        | < 8 ms           | mean 0.7 to 1.7 ms; worst frame 1.2 to 2.8 ms, one run 12.9 ms                                                                | met, one outlier               |
| close: work before the first frame     | < 8 ms           | 1.7 to 5.9 ms                                                                                                                 | met                            |
| first open after `enable()` (once)     |                  | 22 to 25 ms before the first frame                                                                                            | not met, once                  |
| search: local results in the list      | < 16 ms          | median 2.2 ms; worst 15.8 ms in a quiet run, 20.0 ms in a loaded one (first letter into an empty field, before the fix below) | met when quiet                 |
| search: wait for the next frame        |                  | median 10.7 ms                                                                                                                |                                |
| search: style and layout of that frame |                  | median 0.6 ms, max 2.4 ms                                                                                                     |                                |
| search: paint of that frame (software) |                  | median 2.7 ms, max 11.7 ms                                                                                                    |                                |
| idle: Visor's own sources fired, 60 s  | 0                | 0                                                                                                                             | met                            |
| idle: signal handlers of Visor run     |                  | 1 (`notify::clock`, the minute tick of the shell's clock)                                                                     |                                |
| idle: wakeups of the shell, 60 s       | no more          | 67 with Visor, 95 without; a run before: 74 and 61                                                                            | no difference beyond the noise |
| memory                                 | < 15 MB          | not usable: the kernel was swapping the sandbox out during those runs                                                         | see below                      |

### Full run of `scripts/measure.sh` (WSL2, load average 6 to 7, 2026-11-17)

```text
Machine: 11th Gen Intel(R) Core(TM) i5-11400F @ 2.60GHz, 12 threads, GNOME Shell 50.5, headless, virtual monitor 1920x1080

| What                               | Budget       | Measured                                             | Result   |
| ---                                | ---          | ---                                                  | ---      |
| enable()                           | < 5 ms       | median 22.43 ms (min 10.30, max 38.17, n=20)         | NOT MET  |
| open: frame interval               | 16.7 ms, no drop | mean 37.03 ms, worst 236.54 ms, 94 of 173 frames > 25 ms (11 runs) | NOT MET  |
| open: main-loop work per frame     | < 8 ms       | mean 33.07 ms, worst frame: median 98.89 ms, max 236.05 ms | NOT MET  |
| open: of that in Visor's handler   |              | worst frame: median 0.40 ms, max 0.79 ms             |          |
| open: work before the first frame  | < 8 ms       | median 16.72 ms, max 323.86 ms (n=11)                | NOT MET  |
| close: frame interval              | 16.7 ms, no drop | mean 25.85 ms, worst 226.17 ms, 23 of 183 frames > 25 ms (11 runs) | NOT MET  |
| close: main-loop work per frame    | < 8 ms       | mean 12.64 ms, worst frame: median 125.20 ms, max 211.23 ms | NOT MET  |
| close: of that in Visor's handler  |              | worst frame: median 0.23 ms, max 1.55 ms             |          |
| close: work before the first frame | < 8 ms       | median 2.27 ms, max 6.84 ms (n=12)                   | met      |
| first open after enable (once)     |              | 396.32 ms before the first frame, worst frame 303.65 ms |          |
| search: local results in the list  | < 16 ms      | median 7.62 ms, max 35.38 ms (n=21)                  | NOT MET  |
| search: wait for the next frame    |              | median 16.29 ms, max 87.56 ms                        |          |
| search: style and layout of that frame |              | median 1.53 ms, max 11.35 ms                         |          |
| search: paint of that frame        |              | median 47.24 ms, max 167.34 ms                       |          |
| search: on screen after the debounce |              | median 65.01 ms, max 237.02 ms                       |          |
| idle: Visor's own sources fired, 60 s | 0            | 0 (timeouts, idle sources, D-Bus signals)            | met      |
| idle: signal handlers of Visor run |              | 1 (listed below)                                     |          |
| idle: wakeups of the shell, 60 s   | no more      | 60 with Visor, 60 without                            |          |
  what ran while idle: 1x signal notify::clock core/clock.js:51:24
| memory: shell with Visor vs. without | < 15 MB      | RSS +-6.4 MB, anonymous +-8.0 MB after 200 cycles and 200 queries | met      |
| memory: the same use without Visor |              | RSS 29.8 MB, anonymous 29.8 MB (date menu, overview search) |          |
| memory: growth over those cycles   |              | RSS 20.9 MB, anonymous 20.9 MB (after first use → end) |          |
| memory: at start, with vs. without |              | RSS +5.2 MB                                          |          |
```

What this run does show: Visor's own frame handler stays below 0.8 ms per frame while opening and 1.6 ms while
closing even when the whole frame takes 100 ms; nothing of Visor fires while idle, and the shell wakes up as
often with Visor as without (60 and 60); after the same amount of use the shell with Visor holds 6 MB less
than the shell without it that opened the date menu and searched in the overview as often, and 5 MB more right
after start. Both shells grow with use (21 MB and 30 MB over 200 cycles and 200 queries in the software
renderer), so that growth is not Visor's. The timing rows of this run say how slow that machine was, not
whether a budget holds: they have to be measured again on a quiet machine before the release.

Read the table with these limits in mind:

- **Everything runs in a headless shell in a sandbox** (`scripts/nested.sh`): a virtual 1920×1080 monitor at
  60 Hz, painted in software. Frame intervals show whether the main loop keeps up with the frame clock, not
  how a GPU paces frames on a real display. Paint times are those of the software renderer.
- **No `powertop`.** It needs root and a real session. Wakeups are counted inside the shell instead, see below.
- **No one-hour run.** Memory is taken after 200 open/close cycles and 200 queries, a few minutes of use.
- **The machine is shared** with other work. Single samples move by a factor of two between runs; that is why
  the table gives medians next to the worst value, and why a miss in one run was checked in a second one
  before anything was changed.

## How each number comes about

**Debug metrics.** With the GSettings key `debug-metrics` on, Visor writes one line per measurement to the
journal (`src/core/metrics.ts`):

```text
Visor metrics: enable ms=2.73
Visor metrics: enter open ms=5.56
Visor metrics: transition open frames=38 interval-ms-mean=16.67 interval-ms-max=16.95 dropped=0 update-ms-mean=1.84 update-ms-max=3.54 visor-ms-mean=0.17 visor-ms-max=0.23
Visor metrics: search local-ms=2.19 total-ms=3.02
```

The key is read once in `enable()`, once per state change and once per query. With it off the frame probe is
never created: no handler is connected to the stage, no timer runs, and the per-frame handler of the
animation takes the branch without a single allocation (`src/core/motion.ts`).

| Row                               | How                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enable()`                        | The extension is disabled and enabled 20 times through the extension manager; median of the `enable` lines. It covers the whole of `enable()`, including the six built-in modules.                                                                                                                                                                                                                                                                                    |
| frame interval                    | Time from the begin of one frame to the begin of the next (`before-update` of the stage) during the transition, with animations on (`--animations`), 11 transitions each way with the demo content. A frame counts as dropped above 25 ms.                                                                                                                                                                                                                            |
| main-loop work per frame          | `before-update` to `after-update` of the stage: timelines, layout and paint of the whole shell for that frame, not only Visor. "In Visor's handler" is the part spent in Visor's own frame callback.                                                                                                                                                                                                                                                                  |
| work before the first frame       | The state change itself (`enter` line): measuring the sheet, taking the grab, telling the modules. It runs in the main loop before the first frame of the transition.                                                                                                                                                                                                                                                                                                 |
| first open                        | The same two numbers for the very first open after `enable()`, when the sheet is built and styled.                                                                                                                                                                                                                                                                                                                                                                    |
| search: local results             | From the query leaving the 40 ms debounce until commands, calculation and apps are in the list (`SearchTiming.local`), 20 queries typed letter by letter.                                                                                                                                                                                                                                                                                                             |
| search: next frame, layout, paint | For the same queries: when the next frame began, how long its style and layout pass took, how long its paint took.                                                                                                                                                                                                                                                                                                                                                    |
| idle: own sources                 | Before Visor is enabled, the test helper wraps `GLib.timeout_add`, `timeout_add_seconds`, `idle_add`, `GObject.Object.connect` and `Gio.DBusConnection.signal_subscribe`. A callback counts as Visor's when it was created with a file of the extension on the stack. Then: all built-in modules on, panel opened and closed once, 60 s untouched. Reliable for everything Visor creates in JS; it does not see timers inside libraries (see the T3 Code ping below). |
| idle: wakeups of the shell        | Voluntary context switches of the shell's main thread (`/proc/<pid>/task/<pid>/status`) over the same 60 s, with Visor and in a second sandbox without it. One per wakeup of the main loop. This number is noisy: two runs of the same shell differ by ±15, so it can show a timer that fires every second, not a single extra wakeup.                                                                                                                                |
| memory                            | `VmRSS + VmSwap` and `RssAnon + VmSwap` of the shell after three forced garbage collections. With Visor: 200 open/close cycles, then 200 queries. Without: the same number of date menu openings and overview searches.                                                                                                                                                                                                                                               |

## What can fire while the panel is closed

Nothing of Visor's own runs on a timer when nothing is running. The complete list of what can call into Visor
with the panel closed:

| Source                                                                                                                                                                     | When                                                    | Why it stays                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `notify::clock` of the shell's wall clock (`core/clock.ts`)                                                                                                                | once a minute                                           | The neck shows the clock. Visor uses the clock object of the date menu it replaces, so there is no timer of its own; the shell wakes up for that tick anyway.                                                                                                                         |
| State timers of the notch: peek delay, leave delay, 3 s flash (`core/notch.ts`, `core/peek.ts`)                                                                            | after the pointer touched the notch or a module flashed | One-shot, started by an event, gone when they fire.                                                                                                                                                                                                                                   |
| Signals of the shell: monitors, panel allocation and style, overview, high contrast, scale factor, visibility of the date menu, allocation of the neck                     | when that thing changes                                 | Position and colour have to follow.                                                                                                                                                                                                                                                   |
| `Gio.Settings` changes (Visor's keys, shell keybindings)                                                                                                                   | when a setting is changed                               |                                                                                                                                                                                                                                                                                       |
| Timers module: one timeout to the end of the next running timer; `prepare-for-sleep`                                                                                       | only while a timer runs                                 | The timer has to ring. The one-second tick runs only while the panel is open.                                                                                                                                                                                                         |
| Media module: D-Bus signals of MPRIS players                                                                                                                               | when a player appears, goes or changes                  | The chip and the row follow. Position polling runs only while the panel is open.                                                                                                                                                                                                      |
| Notifications module: signals of the message tray                                                                                                                          | when a notification comes or goes                       | The dot and the chip follow. The 30 s tick for "2 min ago" runs only while open.                                                                                                                                                                                                      |
| Upcoming module: signals of the calendar server; one timeout to the next moment the list changes by itself (an event starts or ends, the day turns)                        | only with events in the calendar, once per such moment  | The rows and the chip have to be right when the panel opens. No polling.                                                                                                                                                                                                              |
| Downloads module: file monitor on the downloads folder; one timeout to the moment a finished download leaves the list                                                      | when a file there changes                               |                                                                                                                                                                                                                                                                                       |
| T3 Code module, only when paired with a server: WebSocket messages, a file monitor on the runtime file, a retry timeout after a lost connection, and **a ping every 10 s** | while connected                                         | The ping keeps the socket through which approvals arrive; it is a libsoup timer and the one periodic wakeup Visor causes with the panel closed. Without a paired server the module does nothing. Open: a session of its own without the idle timeout would make the ping unnecessary. |

Search, the measuring of the sheet, live ticks of modules and all animations run only while the panel is open.

## What was changed for the budgets

- **Search frame.** The handoff of V3 said the frame with local results came up to 30 ms after the debounce.
  Traced per query, the time splits into three parts: building the list (2 to 4 ms usually), waiting for the
  frame clock (0 to 16.7 ms: the debounce timer is not aligned with the display), and layout and paint of that
  frame (layout below 2.5 ms, paint 2 to 12 ms in the software renderer). The sheet is not laid out again as a
  whole. The outlier was the **first letter typed into an empty field**: 8 to 19 ms for the list alone. Every
  time the query was cleared the list of results was taken out of its overlay, which costs it its style, so
  the next first letter styled all of it anew (3 to 6 ms, measured in `setOverlay`). The list now stays in
  the hidden overlay (`core/sheet.ts`). Icons were already bounded (lookups stop 6 ms after the query began
  and continue when idle). What remains is the wait for the frame clock, which is one frame at most and not
  work.
- **Idle.** The neck had a wall clock of its own, with its own timer each minute; it now uses the one of the
  date menu.
- **`enable()`.** Within budget as it was; nothing was moved. Its parts (median, µs): settings 205, content
  139, notch 1430 (actors, chrome, panel menu, reading the panel colour 450), creating the six modules 357,
  registering them 1080 (upcoming 336, media 254, t3 220, notifications 185, timers 67, downloads 20).
- **First open.** Not fixed. The first open after `enable()` builds and styles the sheet: about 25 ms before
  the first frame, once (later opens: 5 to 9 ms). Building it ahead while the pointer rests on the notch was
  tried and dropped: St resolves styles only for mapped actors, so the cost stayed where it was.
- **The test.** `tests/shell/search.sh` failed once with 16.3 ms against 16. It now types the same queries in
  five rounds and judges each query by its median over the rounds against the budget (16 ms for the list,
  33 ms until painted), and keeps a hard limit for any single sample (50 ms for the list, 250 ms until
  painted). A regression is slow every round and fails the median; a stall fails the limit.
