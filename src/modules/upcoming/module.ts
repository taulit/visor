// "Up Next": the next events of the calendars the shell knows.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import { gettext } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Calendar from 'resource:///org/gnome/shell/ui/calendar.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import type { KitRow, KitSection, ModuleContext, RowProps, VisorModule } from '../../api.js';
import { addDays, busyDays, eventsOn, sameDay, startOfDay } from './calendar.js';
import { CalendarView } from './calendar-view.js';
import { MeetingLinks } from './links.js';
import type { MeetingService } from './meeting-link.js';
import { chipText, eventSubtitle, eventUuid, nextWake, type PlannedEvent } from './plan.js';
import {
  formatClock,
  formatWhen,
  isAllDay,
  joinWindowOpen,
  pickUpcoming,
  type TimeOptions,
} from './when.js';

const DAY_MS = 86_400_000;
const RANGE_DAYS = 7;
const ICON = 'x-office-calendar-symbolic';
const CHIP_PRIORITY = 60;
/** How long after a request the calendar server may still owe its answer, see disable(). */
const ANSWER_WAIT_US = 1_000_000;
/** A timeout fires a little early now and then; this keeps it from firing twice. */
const WAKE_SLACK_MS = 20;
/** The setting that shows the calendar above the events. */
const CALENDAR_KEY = 'upcoming-calendar';

/** Names of products, not translated. */
const SERVICE_NAMES: Record<MeetingService, string> = {
  meet: 'Google Meet',
  teams: 'Teams',
  zoom: 'Zoom',
  jitsi: 'Jitsi',
};

class Upcoming implements VisorModule {
  readonly id = 'upcoming';
  // Needed before enable(), for the list of modules: there is no context yet.
  readonly name = gettext('Up Next');
  readonly icon = ICON;
  readonly slot = 'ahead' as const;

  private ctx: ModuleContext | null = null;
  private source: Calendar.DBusEventSource | null = null;
  /** The source finished connecting to the calendar server. */
  private sourceReady = false;
  /** When the source last asked the calendar server something, on the monotonic clock. */
  private askedAt = 0;
  private clock: Gio.Settings | null = null;
  private cancellable: Gio.Cancellable | null = null;
  private links: MeetingLinks | null = null;
  private removeOpenHandler: (() => void) | null = null;

  private wrapper: St.BoxLayout | null = null;
  private section: KitSection | null = null;
  private empty: St.Widget | null = null;
  /** "Nothing planned", for a picked day. */
  private dayEmpty: St.Widget | null = null;
  /** The picked day above its events. */
  private dayTitle: St.Label | null = null;
  private calendar: CalendarView | null = null;
  /** The day picked in the calendar; null shows what comes next. Forgotten when the panel closes. */
  private picked: Date | null = null;
  private rows = new Map<string, KitRow>();
  /** Null until the first row needs to know. */
  private hasCalendarApp: boolean | null = null;

  private wake = 0;
  /** The local day the range was last asked for. */
  private requestedDay = '';
  private chip: string | null = null;

  enable(ctx: ModuleContext): void {
    this.ctx = ctx;
    this.cancellable = new Gio.Cancellable();
    this.links = new MeetingLinks(this.cancellable, () => this.refresh());

    this.clock = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
    this.clock.connectObject('changed::clock-format', () => this.refresh(), this);

    this.source = new Calendar.DBusEventSource();
    this.source.connectObject(
      'changed',
      () => this.refresh(),
      'notify::has-calendars',
      () => {
        // Connected: the source asks for its range now.
        this.askedAt = GLib.get_monotonic_time();
        this.sourceReady = true;
        this.refresh();
      },
      this,
    );
    ctx.settings?.connectObject(`changed::${CALENDAR_KEY}`, () => this.syncCalendar(), this);
    this.request();

    this.removeOpenHandler = ctx.onOpenChanged(open => {
      // Closed: next time it opens on today and the week.
      if (!open && (this.picked || this.calendar)) {
        this.picked = null;
        this.calendar?.reset();
      }
      // What is on screen has to be right; the answer of the server follows as 'changed'.
      if (open) this.request();
      this.refresh();
    });
  }

  disable(): void {
    this.removeOpenHandler?.();
    this.removeOpenHandler = null;
    if (this.wake) GLib.source_remove(this.wake);
    this.wake = 0;

    this.cancellable?.cancel();
    this.cancellable = null;
    this.links?.destroy();
    this.links = null;

    this.clock?.disconnectObject(this);
    this.clock = null;
    this.ctx?.settings?.disconnectObject(this);

    const source = this.source;
    this.source = null;
    if (source) {
      source.disconnectObject(this);
      // As the date menu does with its own, but only a source that is at
      // rest: while it connects to the calendar server or waits for an answer
      // the shell touches the proxy afterwards, and a disposed one makes it
      // complain. The shell does not say when a source waits, so one that
      // was asked something a moment ago is only let go.
      const connected = (source as unknown as { _initialized: boolean })._initialized;
      const atRest = GLib.get_monotonic_time() - this.askedAt > ANSWER_WAIT_US;
      if (connected && atRest) source.destroy();
      giveRangeBack();
    }
    this.sourceReady = false;

    // Visor destroys the section.
    this.wrapper = null;
    this.section = null;
    this.empty = null;
    this.dayEmpty = null;
    this.dayTitle = null;
    this.calendar = null;
    this.picked = null;
    this.rows.clear();
    this.chip = null;
    this.requestedDay = '';
    this.ctx = null;
  }

  buildSection(): St.Widget {
    const ctx = this.ctx!;
    const _ = ctx.t;
    this.wrapper = new St.BoxLayout({ vertical: true, x_expand: true });
    this.section = ctx.kit.section({ title: _('Up Next') });
    this.dayTitle = new St.Label({ style_class: 'visor-calendar-day-title', visible: false });
    this.section.body.add_child(this.dayTitle);
    this.empty = ctx.kit.empty(_('Nothing else today'));
    this.section.body.add_child(this.empty);
    this.dayEmpty = ctx.kit.empty(_('Nothing planned'));
    this.section.body.add_child(this.dayEmpty);
    this.wrapper.add_child(this.section.actor);
    this.syncCalendar();
    return this.wrapper;
  }

  /** Builds or drops the calendar as the setting says. */
  private syncCalendar(): void {
    const ctx = this.ctx;
    const wrapper = this.wrapper;
    if (!ctx || !wrapper) return;
    const wanted = ctx.settings?.get_boolean(CALENDAR_KEY) ?? false;
    if (wanted && !this.calendar) {
      this.calendar = new CalendarView({
        t: ctx.t,
        firstDay: Shell.util_get_week_start(),
        onPick: day => this.pick(day),
        onShownChanged: () => {
          this.request();
          this.refresh();
        },
      });
      wrapper.insert_child_at_index(this.calendar.actor, 0);
    } else if (!wanted && this.calendar) {
      this.calendar.actor.destroy();
      this.calendar = null;
      this.picked = null;
    }
    this.request();
    this.refresh();
  }

  /** A day in the calendar was clicked: its events show; today, or the same day again, goes back. */
  private pick(day: Date): void {
    const today = new Date();
    this.picked =
      sameDay(day, today) || (this.picked !== null && sameDay(day, this.picked)) ? null : day;
    this.request();
    this.refresh();
  }

  /**
   * Asks the calendar server for today and the next seven days, and for the
   * days the calendar shows. From midnight, so asking again on the same day
   * asks nothing new.
   */
  private request(): void {
    const now = new Date();
    this.requestedDay = now.toDateString();
    let from = startOfDay(now);
    let until = addDays(now, RANGE_DAYS + 1);
    const shown = this.calendar?.shown(now);
    if (shown) {
      if (shown.from < from) from = shown.from;
      if (shown.until > until) until = shown.until;
    }
    if (this.picked) {
      if (this.picked < from) from = startOfDay(this.picked);
      const after = addDays(this.picked, 1);
      if (after > until) until = after;
    }
    this.askedAt = GLib.get_monotonic_time();
    this.source?.requestRange(from, until);
  }

  private events(now: Date, until = new Date(now.getTime() + RANGE_DAYS * DAY_MS)): PlannedEvent[] {
    return (this.source?.getEvents(now, until) ?? []).map(event => ({
      id: event.id,
      summary: event.summary,
      start: event.date,
      end: event.end,
      allDay: isAllDay(event.date, event.end),
    }));
  }

  private timeOptions(): TimeOptions {
    return { hour12: this.clock?.get_string('clock-format') === '12h' };
  }

  /** Brings chip, rows and the timeout in line with the calendar and the time. */
  private refresh(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const _ = ctx.t;
    const now = new Date();
    const opts = this.timeOptions();
    const events = this.events(now);
    const shown = pickUpcoming(events, now, 3, RANGE_DAYS);

    const chip = chipText(events, now, _, undefined, opts);
    if (chip !== this.chip) {
      this.chip = chip;
      ctx.peek.set(chip === null ? null : { icon: ICON, text: chip, priority: CHIP_PRIORITY });
    }

    if (this.section) {
      const picked = this.picked;
      if (picked) {
        const day = eventsOn(this.events(startOfDay(picked), addDays(picked, 1)), picked);
        this.render(day, now, opts, picked);
      } else {
        this.render(shown, now, opts, null);
      }
    }
    if (this.calendar && ctx.isOpen) {
      const { from, until } = this.calendar.shown(now);
      this.calendar.render({
        today: startOfDay(now),
        picked: this.picked ?? startOfDay(now),
        busy: busyDays(this.events(from, until), from, until),
      });
    }

    this.arm(
      nextWake({
        events,
        shown,
        now,
        open: ctx.isOpen,
        // The calendar marks today: midnight matters for it also without calendars.
        hasCalendars: this.sourceReady || this.calendar !== null,
      }),
      now,
    );
  }

  private render(shown: PlannedEvent[], now: Date, opts: TimeOptions, picked: Date | null): void {
    const ctx = this.ctx!;
    const body = this.section!.body;
    const wanted = new Set(shown.map(event => event.id));
    for (const [id, row] of this.rows) {
      if (wanted.has(id)) continue;
      row.actor.destroy();
      this.rows.delete(id);
    }
    shown.forEach((event, index) => {
      const props = this.rowProps(event, now, opts, picked);
      let row = this.rows.get(event.id);
      if (row) {
        row.update(props);
      } else {
        row = ctx.kit.row(props);
        this.rows.set(event.id, row);
        body.add_child(row.actor);
      }
      // After the title of the picked day, which is always the first child.
      if (body.get_child_at_index(index + 1) !== row.actor)
        body.set_child_at_index(row.actor, index + 1);
    });
    this.empty!.visible = shown.length === 0 && picked === null;
    this.dayEmpty!.visible = shown.length === 0 && picked !== null;
    this.dayTitle!.visible = picked !== null;
    if (picked) {
      this.dayTitle!.text = picked.toLocaleDateString(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
    }
  }

  private rowProps(
    event: PlannedEvent,
    now: Date,
    opts: TimeOptions,
    picked: Date | null,
  ): RowProps {
    const ctx = this.ctx!;
    const _ = ctx.t;
    let subtitle = eventSubtitle(event, now, _, undefined, opts);
    const props: RowProps = {
      lead: formatWhen(event, now, _, undefined, opts),
      title: event.summary,
    };
    // On a picked day the day is said above: the rows say only the hours.
    if (picked) {
      const startsThatDay = event.start >= startOfDay(picked);
      props.lead =
        event.allDay || !startsThatDay ? _('all day') : formatClock(event.start, undefined, opts);
      subtitle = event.allDay
        ? ''
        : _('until %s').replace('%s', formatClock(event.end, undefined, opts));
    }

    // Details are read only for what can be joined now, and only while somebody looks.
    if (ctx.isOpen && !event.allDay && joinWindowOpen(event.start, event.end, now)) {
      const link = this.links?.get(event.id);
      if (link) {
        subtitle = `${subtitle} · ${SERVICE_NAMES[link.service]}`;
        props.primary = { label: _('Join'), run: () => this.join(link.url) };
      }
    }
    if (subtitle) props.subtitle = subtitle;

    this.hasCalendarApp ??= GLib.find_program_in_path('gnome-calendar') !== null;
    const uuid = this.hasCalendarApp ? eventUuid(event.id) : null;
    if (uuid) props.activate = () => this.openInCalendar(uuid);
    return props;
  }

  private join(url: string): void {
    try {
      Gio.AppInfo.launch_default_for_uri(url, global.create_app_launch_context(0, -1));
    } finally {
      this.ctx?.close();
    }
  }

  private openInCalendar(uuid: string): void {
    try {
      Gio.AppInfo.create_from_commandline(
        `gnome-calendar --uuid ${GLib.shell_quote(uuid)}`,
        null,
        Gio.AppInfoCreateFlags.NONE,
      ).launch([], global.create_app_launch_context(0, -1));
    } finally {
      this.ctx?.close();
    }
  }

  /** One timeout to the moment something changes by itself, none when nothing will. */
  private arm(at: number | null, now: Date): void {
    if (this.wake) GLib.source_remove(this.wake);
    this.wake = 0;
    if (at === null) return;
    const delay = Math.max(0, at - now.getTime()) + WAKE_SLACK_MS;
    this.wake = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
      this.wake = 0;
      // A new day: the seven days moved on.
      if (new Date().toDateString() !== this.requestedDay) this.request();
      this.refresh();
      return GLib.SOURCE_REMOVE;
    });
  }
}

/**
 * The calendar server keeps one time range for all its clients (`SetTimeRange`
 * has no client in it), and the last request was the seven days of Visor. The
 * date menu asks again only when its month changes, so it would stay without
 * the events of the rest of its month. Its source sends its own range again.
 */
function giveRangeBack(): void {
  const menu = Main.panel.statusArea.dateMenu as unknown as { _eventSource?: unknown } | undefined;
  const stock = menu?._eventSource as { _loadEvents?: (forceReload: boolean) => void } | undefined;
  if (stock instanceof Calendar.DBusEventSource) stock._loadEvents?.(true);
}

export function upcomingModule(): VisorModule {
  return new Upcoming();
}
