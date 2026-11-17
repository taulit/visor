// "Up Next": the next events of the calendars the shell knows.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import type St from 'gi://St';

import { gettext } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Calendar from 'resource:///org/gnome/shell/ui/calendar.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import type { KitRow, KitSection, ModuleContext, RowProps, VisorModule } from '../../api.js';
import { MeetingLinks } from './links.js';
import type { MeetingService } from './meeting-link.js';
import { chipText, eventSubtitle, eventUuid, nextWake, type PlannedEvent } from './plan.js';
import { formatWhen, isAllDay, joinWindowOpen, pickUpcoming, type TimeOptions } from './when.js';

const DAY_MS = 86_400_000;
const RANGE_DAYS = 7;
const ICON = 'x-office-calendar-symbolic';
const CHIP_PRIORITY = 60;
/** How long after disable() the proxy of the event source is disposed, see retire(). */
const RETIRE_MS = 1000;
/** A timeout fires a little early now and then; this keeps it from firing twice. */
const WAKE_SLACK_MS = 20;

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
  private clock: Gio.Settings | null = null;
  private cancellable: Gio.Cancellable | null = null;
  private links: MeetingLinks | null = null;
  private removeOpenHandler: (() => void) | null = null;

  private section: KitSection | null = null;
  private empty: St.Widget | null = null;
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
        this.sourceReady = true;
        this.refresh();
      },
      this,
    );
    this.request();

    this.removeOpenHandler = ctx.onOpenChanged(open => {
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

    const source = this.source;
    this.source = null;
    if (source) {
      source.disconnectObject(this);
      const ready =
        this.sourceReady || (source as unknown as { _initialized: boolean })._initialized;
      retire(source, ready);
      giveRangeBack();
    }
    this.sourceReady = false;

    // Visor destroys the section.
    this.section = null;
    this.empty = null;
    this.rows.clear();
    this.chip = null;
    this.requestedDay = '';
    this.ctx = null;
  }

  buildSection(): St.Widget {
    const ctx = this.ctx!;
    const _ = ctx.t;
    this.section = ctx.kit.section({ title: _('Up Next') });
    this.empty = ctx.kit.empty(_('Nothing else today'));
    this.section.body.add_child(this.empty);
    this.refresh();
    return this.section.actor;
  }

  /** Asks the calendar server for the next seven days. */
  private request(): void {
    const now = new Date();
    this.requestedDay = now.toDateString();
    this.source?.requestRange(now, new Date(now.getTime() + RANGE_DAYS * DAY_MS));
  }

  private events(now: Date): PlannedEvent[] {
    const until = new Date(now.getTime() + RANGE_DAYS * DAY_MS);
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

    if (this.section) this.render(shown, now, opts);

    this.arm(
      nextWake({ events, shown, now, open: ctx.isOpen, hasCalendars: this.sourceReady }),
      now,
    );
  }

  private render(shown: PlannedEvent[], now: Date, opts: TimeOptions): void {
    const ctx = this.ctx!;
    const body = this.section!.body;
    const wanted = new Set(shown.map(event => event.id));
    for (const [id, row] of this.rows) {
      if (wanted.has(id)) continue;
      row.actor.destroy();
      this.rows.delete(id);
    }
    shown.forEach((event, index) => {
      const props = this.rowProps(event, now, opts);
      let row = this.rows.get(event.id);
      if (row) {
        row.update(props);
      } else {
        row = ctx.kit.row(props);
        this.rows.set(event.id, row);
        body.add_child(row.actor);
      }
      if (body.get_child_at_index(index) !== row.actor) body.set_child_at_index(row.actor, index);
    });
    this.empty!.visible = shown.length === 0;
  }

  private rowProps(event: PlannedEvent, now: Date, opts: TimeOptions): RowProps {
    const ctx = this.ctx!;
    const _ = ctx.t;
    let subtitle = eventSubtitle(event, now, _, undefined, opts);
    const props: RowProps = {
      lead: formatWhen(event, now, _, undefined, opts),
      title: event.summary,
    };

    // Details are read only for what can be joined now, and only while somebody looks.
    if (ctx.isOpen && !event.allDay && joinWindowOpen(event.start, event.end, now)) {
      const link = this.links?.get(event.id);
      if (link) {
        subtitle = `${subtitle} · ${SERVICE_NAMES[link.service]}`;
        props.primary = { label: _('Join'), run: () => this.join(link.url) };
      }
    }
    props.subtitle = subtitle;

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
 * Takes an event source down. Its proxy cannot go while the source still
 * connects to the calendar server or waits for an answer: the shell touches
 * the proxy when either comes back, and a disposed one makes it complain. So
 * the proxy goes a moment later, by a timeout that holds nothing but the
 * source. A source that never connects has nothing to take down.
 */
function retire(source: Calendar.DBusEventSource, ready: boolean): void {
  const later = (): void => {
    GLib.timeout_add(GLib.PRIORITY_LOW, RETIRE_MS, () => {
      source.destroy();
      return GLib.SOURCE_REMOVE;
    });
  };
  if (ready) {
    later();
    return;
  }
  const id = source.connect('notify::has-calendars', () => {
    source.disconnect(id);
    later();
  });
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
