/** What "Up Next" shows and when it has to look again. Pure logic. */
import { truncate } from '../../lib/format.js';
import { formatClock, formatWhen, pickUpcoming, type TimeOptions } from './when.js';

export interface PlannedEvent {
  /** `source uid \n component uid \n recurrence id`, as the calendar server of the shell names it. */
  id: string;
  summary: string;
  start: Date;
  end: Date;
  allDay: boolean;
}

type Gettext = (s: string) => string;

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
/** The chip shows from this long before the start until the event ends. */
export const CHIP_LEAD_MS = 15 * MINUTE_MS;
/** The same lead as joinWindowOpen() in when.ts. */
const JOIN_LEAD_MS = 10 * MINUTE_MS;
const CHIP_MAX_CHARS = 28;

const sameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export const nextMidnight = (now: Date): number =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();

/** `in 5 min`, `in 2 h`, `in 1 h 36 min`. Minutes are rounded up, so it never says `in 0 min`. */
export function formatIn(ms: number, _: Gettext): string {
  const total = Math.max(1, Math.ceil(ms / MINUTE_MS));
  const hours = String(Math.floor(total / 60));
  const minutes = String(total % 60);
  if (hours === '0') return _('in %d min').replace('%d', minutes);
  if (minutes === '0') return _('in %d h').replace('%d', hours);
  return _('in %d h %d min').replace('%d', hours).replace('%d', minutes);
}

/** The second line of an event row: `all day`, `until 16:00`, `in 1 h 36 min`, or the time on another day. */
export function eventSubtitle(
  event: PlannedEvent,
  now: Date,
  _: Gettext,
  locale?: string,
  opts?: TimeOptions,
): string {
  if (event.allDay) return _('all day');
  const nowMs = now.getTime();
  if (event.start.getTime() <= nowMs && nowMs < event.end.getTime())
    return _('until %s').replace('%s', formatClock(event.end, locale, opts));
  if (sameDay(event.start, now)) return formatIn(event.start.getTime() - nowMs, _);
  return formatClock(event.start, locale, opts);
}

/**
 * The moment the rows read differently without the calendar changing: an
 * event starts or ends, its join window opens, `in 5 min` loses a minute, or
 * the day ends. Null when no row is shown.
 */
export function nextRowChange(shown: readonly PlannedEvent[], now: Date): number | null {
  if (shown.length === 0) return null;
  const nowMs = now.getTime();
  let next = nextMidnight(now);
  const consider = (ms: number): void => {
    if (ms > nowMs && ms < next) next = ms;
  };
  for (const event of shown) {
    const start = event.start.getTime();
    consider(start);
    consider(event.end.getTime());
    if (event.allDay) continue;
    consider(start - JOIN_LEAD_MS);
    if (start > nowMs && sameDay(event.start, now))
      consider(nowMs + ((start - nowMs) % MINUTE_MS || MINUTE_MS));
  }
  return next;
}

const chipCandidates = (events: readonly PlannedEvent[], now: Date): PlannedEvent[] =>
  events.filter(event => !event.allDay && event.end.getTime() > now.getTime());

/** The text of the chip: the event that runs or starts within 15 minutes, as `15:00 Sprint Review`. */
export function chipText(
  events: readonly PlannedEvent[],
  now: Date,
  _: Gettext,
  locale?: string,
  opts?: TimeOptions,
): string | null {
  const soon = chipCandidates(events, now).filter(
    event => event.start.getTime() - now.getTime() < CHIP_LEAD_MS,
  );
  const [event] = pickUpcoming(soon, now, 1);
  if (!event) return null;
  return truncate(`${formatWhen(event, now, _, locale, opts)} ${event.summary}`, CHIP_MAX_CHARS);
}

/** The moment the chip appears, changes from a time to `Now`, or goes. Null without a timed event ahead. */
export function nextChipChange(events: readonly PlannedEvent[], now: Date): number | null {
  const nowMs = now.getTime();
  let next: number | null = null;
  for (const event of chipCandidates(events, now)) {
    const start = event.start.getTime();
    for (const ms of [start - CHIP_LEAD_MS, start, event.end.getTime()])
      if (ms > nowMs && (next === null || ms < next)) next = ms;
  }
  return next;
}

/**
 * When to look again, with one timeout at most. With the panel open that is
 * the next change of a row. For the chip it is the moment the chip changes if
 * that is within the next hour, otherwise one hour before it. Midnight moves
 * the seven days on, which matters only while there are calendars.
 */
export function nextWake(state: {
  events: readonly PlannedEvent[];
  shown: readonly PlannedEvent[];
  now: Date;
  open: boolean;
  hasCalendars: boolean;
}): number | null {
  const { events, shown, now, open, hasCalendars } = state;
  const nowMs = now.getTime();
  const candidates: number[] = [];
  if (open) {
    const row = nextRowChange(shown, now);
    if (row !== null) candidates.push(row);
  }
  const chip = nextChipChange(events, now);
  if (chip !== null) candidates.push(chip - nowMs <= HOUR_MS ? chip : chip - HOUR_MS);
  if (hasCalendars) candidates.push(nextMidnight(now));
  return candidates.length > 0 ? Math.min(...candidates) : null;
}

/** The argument of `gnome-calendar --uuid`: `source:uid` or `source:uid:rid`. Null for an id of another shape. */
export function eventUuid(id: string): string | null {
  const [source, uid, rid] = id.split('\n');
  if (!source || !uid) return null;
  return rid ? `${source}:${uid}:${rid}` : `${source}:${uid}`;
}

/** An iCalendar text as one line per property: folded lines joined, escaped characters plain. */
export function unfoldIcs(ics: string | null | undefined): string {
  return (ics ?? '')
    .replace(/\r?\n[ \t]/g, '')
    .replace(/\\n/gi, '\n')
    .replace(/\\([,;\\])/g, '$1');
}
