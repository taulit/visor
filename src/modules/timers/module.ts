// Timers, alarms and stopwatches as rows in "Now". Started from the search
// with `timer 25m Pizza` or `stopwatch`, kept in the settings so they survive
// a lock screen and a restart of the shell.
import GLib from 'gi://GLib';

import { gettext } from 'resource:///org/gnome/shell/extensions/extension.js';
import { formatTime } from 'resource:///org/gnome/shell/misc/dateUtils.js';
import { getLoginManager } from 'resource:///org/gnome/shell/misc/loginManager.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import type {
  Action,
  Command,
  ModuleContext,
  NowRow,
  PeekChip,
  Result,
  VisorModule,
} from '../../api.js';
import { formatDuration, truncate } from '../../lib/format.js';
import { parseTimer } from './parse.js';
import {
  addTime,
  chipTimer,
  createAlarm,
  createCountdown,
  createStopwatch,
  isDone,
  isPaused,
  isRunning,
  nextDeadline,
  parseTimers,
  pause,
  progressOf,
  restart,
  resume,
  serializeTimers,
  step,
  timeOf,
  type Timer,
} from './state.js';

const ICON = 'alarm-symbolic';
const MINUTE_MS = 60_000;

/** `14:32` or `2:32 PM`, as the clock of the shell shows the time. */
const clock = (at: number): string => formatTime(new Date(at), { timeOnly: true });

class TimersModule implements VisorModule {
  readonly id = 'timers';
  readonly name = gettext('Timers');
  readonly icon = ICON;
  readonly slot = 'now';
  readonly commands: Command[] = [
    {
      keyword: ['timer'],
      hint: gettext('timer 25m Pizza'),
      resolve: args => this.resolveTimer(args),
    },
    {
      keyword: ['stopwatch', 'stoppuhr'],
      hint: gettext('stopwatch Research'),
      resolve: args => this.resolveStopwatch(args),
    },
  ];

  private ctx: ModuleContext | null = null;
  private timers: Timer[] = [];
  /** What the settings hold, so they are written only when something changed. */
  private saved = '';
  /** The one timeout: a tick per second while the panel is open, else the wait for the next end. */
  private source = 0;
  /** The timeout is the tick. */
  private ticking = false;
  private sleepId = 0;
  private created = 0;
  private reported = false;
  private tray: MessageTray.Source | null = null;
  private trayDestroyId = 0;
  private notifications = new Map<string, MessageTray.Notification>();

  enable(ctx: ModuleContext): void {
    this.ctx = ctx;
    this.saved = ctx.settings?.get_string('timers') ?? '[]';
    this.timers = parseTimers(this.saved);
    ctx.onOpenChanged(() => this.advance());
    // A timeout does not run while the machine sleeps; look at the clock again when it wakes up.
    this.sleepId = getLoginManager().connect('prepare-for-sleep', (_manager, sleeping: boolean) => {
      if (!sleeping) this.safely(() => this.advance());
    });
    if (this.timers.length > 0) this.advance();
  }

  disable(): void {
    this.unschedule();
    if (this.sleepId) getLoginManager().disconnect(this.sleepId);
    this.sleepId = 0;
    if (this.tray) {
      this.tray.disconnect(this.trayDestroyId);
      this.tray.destroy(MessageTray.NotificationDestroyedReason.SOURCE_CLOSED);
    }
    this.tray = null;
    this.trayDestroyId = 0;
    this.notifications.clear();
    this.timers = [];
    this.ctx = null;
  }

  // --- commands ---

  private resolveTimer(args: string): Result[] {
    const ctx = this.ctx;
    if (!ctx) return [];
    const _ = ctx.t;
    const spec = parseTimer(args, new Date());
    if (!spec) return [];
    const subtitle = spec.label || undefined;
    if (spec.kind === 'alarm') {
      const at = spec.at.getTime();
      return [
        {
          id: 'timers:alarm',
          icon: ICON,
          title: _('Alarm at %s').replace('%s', clock(at)),
          subtitle,
          activate: () => this.add(id => createAlarm(id, at, spec.label, Date.now())),
        },
      ];
    }
    return [
      {
        id: 'timers:countdown',
        icon: ICON,
        title: _('Start timer · %s').replace('%s', formatDuration(spec.durationMs)),
        subtitle,
        activate: () =>
          this.add(id => createCountdown(id, spec.durationMs, spec.label, Date.now())),
      },
    ];
  }

  private resolveStopwatch(args: string): Result[] {
    const ctx = this.ctx;
    if (!ctx) return [];
    const _ = ctx.t;
    const label = args.trim();
    return [
      {
        id: 'timers:stopwatch',
        icon: ICON,
        title: _('Start stopwatch'),
        subtitle: label || undefined,
        activate: () => this.add(id => createStopwatch(id, label, Date.now())),
      },
    ];
  }

  // --- changes ---

  private add(create: (id: string) => Timer): void {
    if (!this.ctx) return;
    this.timers = [...this.timers, create(`${Date.now().toString(36)}-${this.created++}`)];
    this.advance();
  }

  private change(id: string, fn: (timer: Timer) => Timer): void {
    this.timers = this.timers.map(timer => (timer.id === id ? fn(timer) : timer));
    this.advance();
  }

  private remove(id: string): void {
    this.timers = this.timers.filter(timer => timer.id !== id);
    this.dismiss(id);
    this.advance();
  }

  /** From the row or the notification; the row may be gone by then. */
  private restart(done: Timer): void {
    if (!this.ctx) return;
    const next = restart(done, Date.now());
    this.timers = this.timers.some(timer => timer.id === done.id)
      ? this.timers.map(timer => (timer.id === done.id ? next : timer))
      : [...this.timers, next];
    this.dismiss(done.id);
    this.advance();
  }

  /** Brings everything in line with the clock: what ended, the settings, the rows, the chip, the timeout. */
  private advance(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = Date.now();
    const { timers, finished } = step(this.timers, now);
    this.timers = timers;
    const json = serializeTimers(timers);
    if (json !== this.saved) {
      this.saved = json;
      ctx.settings?.set_string('timers', json);
    }
    this.render(now);
    this.schedule(now);
    for (const timer of finished) this.ring(timer);
  }

  private schedule(now: number): void {
    const ctx = this.ctx;
    const deadline = nextDeadline(this.timers);
    const wait = deadline === null ? Infinity : Math.max(0, deadline - now);
    // The last second before an end is awaited exactly, so a timer never ends late.
    const tick = ctx !== null && ctx.isOpen && this.timers.some(isRunning) && wait > 1000;
    if (tick && this.ticking) return;
    this.unschedule();
    if (tick) {
      this.ticking = true;
      // Repeating: a seconds timeout that is set anew every time fires only every other second.
      this.source = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
        this.safely(() => this.advance());
        return this.ticking ? GLib.SOURCE_CONTINUE : GLib.SOURCE_REMOVE;
      });
    } else if (ctx && deadline !== null) {
      this.source = GLib.timeout_add(GLib.PRIORITY_DEFAULT, wait, () => {
        this.source = 0;
        this.safely(() => this.advance());
        return GLib.SOURCE_REMOVE;
      });
    }
  }

  private unschedule(): void {
    if (this.source) GLib.source_remove(this.source);
    this.source = 0;
    this.ticking = false;
  }

  // --- what is shown ---

  private kindName(timer: Timer): string {
    const _ = this.ctx!.t;
    if (timer.kind === 'stopwatch') return _('Stopwatch');
    return timer.kind === 'alarm' ? _('Alarm') : _('Timer');
  }

  private render(now: number): void {
    const ctx = this.ctx!;
    if (this.timers.length === 0) {
      ctx.now.clear();
      ctx.peek.set(null);
      return;
    }
    ctx.now.set(this.timers.map(timer => this.row(timer, now)));
    ctx.peek.set(this.chip());
  }

  private row(timer: Timer, now: number): NowRow {
    const _ = this.ctx!.t;
    const { id } = timer;
    const kind = this.kindName(timer);
    const title = timer.label || kind;
    const subtitle = (state: string) =>
      [timer.label ? kind : '', state].filter(Boolean).join(' · ');
    if (isDone(timer)) {
      return {
        id,
        icon: ICON,
        title,
        subtitle: subtitle(_('Done')),
        primary: { label: _('Restart'), style: 'primary', run: () => this.restart(timer) },
      };
    }

    const paused = isPaused(timer);
    const toggle: Action = paused
      ? {
          label: _('Resume'),
          icon: 'media-playback-start-symbolic',
          run: () => this.change(id, t => resume(t, Date.now())),
        }
      : {
          label: _('Pause'),
          icon: 'media-playback-pause-symbolic',
          run: () => this.change(id, t => pause(t, Date.now())),
        };
    const stop: Action = {
      label: _('Stop'),
      icon: 'media-playback-stop-symbolic',
      run: () => this.remove(id),
    };
    const more: Action = {
      label: _('+1 min'),
      style: 'ghost',
      run: () => this.change(id, t => addTime(t, MINUTE_MS)),
    };
    const left = timeOf(timer, now);
    if (timer.kind === 'stopwatch') {
      return {
        id,
        icon: ICON,
        title,
        subtitle: subtitle(paused ? _('Paused') : ''),
        value: formatDuration(left),
        actions: [toggle, stop],
      };
    }
    const state = paused ? _('Paused') : _('until %s').replace('%s', clock(timer.endsAt ?? now));
    return {
      id,
      icon: ICON,
      title,
      subtitle: subtitle(state),
      // Rounded up, so a timer of 25 minutes starts at 25:00 and ends when it leaves 0:01.
      value: formatDuration(Math.ceil(left / 1000) * 1000),
      progress: progressOf(timer, now) ?? undefined,
      // An alarm rings at a time of day; there is nothing to pause.
      actions: timer.kind === 'alarm' ? [more, stop] : [more, toggle, stop],
    };
  }

  /**
   * The chip does not count down: the API does not say when the peek row is
   * on screen, and a tick with the panel closed is not worth it. It names the
   * end instead.
   */
  private chip(): PeekChip | null {
    const _ = this.ctx!.t;
    const timer = chipTimer(this.timers);
    if (!timer) return null;
    if (isDone(timer)) return this.doneChip(timer);
    const label = truncate(timer.label, 16);
    if (timer.kind === 'stopwatch')
      return { icon: ICON, text: label || this.kindName(timer), priority: 40 };
    const end = clock(timer.endsAt ?? 0);
    const text = label ? `${label} · ${end}` : _('until %s').replace('%s', end);
    return { icon: ICON, text, priority: 40 };
  }

  private doneChip(timer: Timer): PeekChip {
    const _ = this.ctx!.t;
    const name = truncate(timer.label, 16) || this.kindName(timer);
    return { icon: ICON, text: _('%s done').replace('%s', name), tone: 'accent', priority: 90 };
  }

  // --- the end of a timer ---

  private ring(timer: Timer): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const _ = ctx.t;
    const chip = this.doneChip(timer);
    ctx.peek.flash(chip);
    global.display.get_sound_player().play_from_theme('complete', _('Timer finished'), null);

    // A source destroys itself with its last notification, so there may be none.
    if (!this.tray) {
      const tray = new MessageTray.Source({ title: _('Timer'), iconName: ICON });
      this.trayDestroyId = tray.connect('destroy', () => {
        this.tray = null;
        this.trayDestroyId = 0;
        this.notifications.clear();
      });
      Main.messageTray.add(tray);
      this.tray = tray;
    }
    const body =
      timer.kind === 'alarm'
        ? `${this.kindName(timer)} · ${clock(timer.doneAt ?? 0)}`
        : `${this.kindName(timer)} · ${formatDuration(timer.durationMs)}`;
    const notification = new MessageTray.Notification({
      source: this.tray,
      title: chip.text,
      body,
      urgency: MessageTray.Urgency.HIGH,
    });
    notification.addAction(_('Restart'), () => this.safely(() => this.restart(timer)));
    notification.connect('activated', () => this.ctx?.open());
    notification.connect('destroy', () => {
      if (this.notifications.get(timer.id) === notification) this.notifications.delete(timer.id);
    });
    this.dismiss(timer.id);
    this.notifications.set(timer.id, notification);
    this.tray.addNotification(notification);
  }

  /** Takes back the notification of a timer that runs again or was removed. */
  private dismiss(id: string): void {
    const notification = this.notifications.get(id);
    this.notifications.delete(id);
    notification?.destroy(MessageTray.NotificationDestroyedReason.SOURCE_CLOSED);
  }

  /** For callbacks nobody else guards: an exception is logged once and goes no further. */
  private safely(fn: () => void): void {
    try {
      fn();
    } catch (e) {
      if (this.reported) return;
      this.reported = true;
      logError(e as Error, 'Visor: timers');
    }
  }
}

export function timersModule(): VisorModule {
  return new TimersModule();
}
