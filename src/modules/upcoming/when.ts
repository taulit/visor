/** Date and time wording for the upcoming-events and notification rows. Pure logic. */

export interface CalendarEvent {
  start: Date;
  end: Date;
  allDay: boolean;
}

export interface TimeOptions {
  /** Force the 12- or 24-hour clock; the locale decides when unset. */
  hour12?: boolean;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** The number of the local calendar day, so that day differences ignore DST and the time. */
const dayNumber = (date: Date): number =>
  Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);

/** The ICU of newer runtimes puts a narrow no-break space before PM; keep it a plain space. */
const plainSpaces = (text: string): string => text.replace(/\u202f/g, ' ');

export function formatClock(date: Date, locale?: string, opts?: TimeOptions): string {
  // Name the cycle: `hour12: false` alone can print midnight as 24:00.
  const hourCycle =
    opts?.hour12 === undefined
      ? new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hourCycle
      : opts.hour12
        ? 'h12'
        : 'h23';
  const twentyFourHour = hourCycle === 'h23' || hourCycle === 'h24';
  const format = new Intl.DateTimeFormat(locale, {
    hour: twentyFourHour ? '2-digit' : 'numeric',
    minute: '2-digit',
    hourCycle: hourCycle as Intl.DateTimeFormatOptions['hourCycle'],
  });
  return plainSpaces(format.format(date));
}

const shortDate = (date: Date, locale?: string): string =>
  new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(date);

const shortWeekday = (date: Date, locale?: string): string =>
  new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date).replace(/\.$/, '');

/** Both at local midnight and at least one day apart (a day may be 23 h long at a DST change). */
export function isAllDay(start: Date, end: Date): boolean {
  const atMidnight = (d: Date): boolean =>
    d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0;
  return atMidnight(start) && atMidnight(end) && end.getTime() - start.getTime() >= 23 * HOUR_MS;
}

/** The short text for the "when" column of an event row. */
export function formatWhen(
  event: CalendarEvent,
  now: Date,
  _: (s: string) => string,
  locale?: string,
  opts?: TimeOptions,
): string {
  const running = event.start.getTime() <= now.getTime() && now.getTime() < event.end.getTime();
  if (running) return event.allDay ? _('Today') : _('Now');

  const days = dayNumber(event.start) - dayNumber(now);
  if (days === 0) return event.allDay ? _('Today') : formatClock(event.start, locale, opts);
  if (days === 1) return _('Tomorrow');
  if (days >= 2 && days <= 6) return shortWeekday(event.start, locale);
  return shortDate(event.start, locale);
}

/** Events that have not ended and start within `days` days: running ones first, then by start. */
export function pickUpcoming<T extends { start: Date; end: Date }>(
  events: T[],
  now: Date,
  max = 3,
  days = 7,
): T[] {
  const nowMs = now.getTime();
  const horizon = nowMs + days * DAY_MS;
  const isRunning = (e: T): boolean => e.start.getTime() <= nowMs;
  return events
    .filter((e: T) => e.end.getTime() > nowMs && e.start.getTime() <= horizon)
    .sort(
      (a, b) =>
        Number(isRunning(b)) - Number(isRunning(a)) || a.start.getTime() - b.start.getTime(),
    )
    .slice(0, max);
}

/** How long ago a notification arrived: `now`, `5 min ago`, a clock time, `Yesterday`, a date. */
export function formatRelativeTime(
  then: Date,
  now: Date,
  _: (s: string) => string,
  ngettext: (singular: string, plural: string, n: number) => string,
  locale?: string,
  opts?: TimeOptions,
): string {
  const minutes = Math.floor((now.getTime() - then.getTime()) / MINUTE_MS);
  if (minutes < 1) return _('now');
  if (minutes < 60)
    return ngettext('%d min ago', '%d min ago', minutes).replace('%d', String(minutes));

  const days = dayNumber(now) - dayNumber(then);
  if (days === 0) return formatClock(then, locale, opts);
  if (days === 1) return _('Yesterday');
  return shortDate(then, locale);
}

/** The Join button shows from 10 minutes before the start until the event ends. */
export function joinWindowOpen(start: Date, end: Date, now: Date): boolean {
  return now.getTime() >= start.getTime() - 10 * MINUTE_MS && now.getTime() < end.getTime();
}
