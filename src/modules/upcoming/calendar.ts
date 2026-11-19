/** The days the calendar of "Up Next" shows: the week as a band, the month as a grid. Pure logic. */

interface Timed {
  start: Date;
  end: Date;
}

const DAY_MS = 86_400_000;

/** Local midnight of the day of `date`. */
export const startOfDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** `n` days after `date`, at local midnight; a DST change does not move it by an hour. */
export const addDays = (date: Date, n: number): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);

export const sameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/** A key per local day, for sets of days. */
export const dayKey = (date: Date): string =>
  `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

/** The first day of the week that holds `date`; `firstDay` 0 is Sunday, 1 Monday. */
export function weekStart(date: Date, firstDay: number): Date {
  return addDays(date, -((date.getDay() - firstDay + 7) % 7));
}

/** The seven days of the week that holds `date`. */
export function weekDays(date: Date, firstDay: number): Date[] {
  const start = weekStart(date, firstDay);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** The ISO 8601 number of the week: weeks start on Monday, week 1 holds the first Thursday. */
export function isoWeek(date: Date): number {
  // The Thursday of the week decides the year; its day of that year, the week.
  const thursday = addDays(date, 3 - ((date.getDay() + 6) % 7));
  const dayOfYear =
    (Date.UTC(thursday.getFullYear(), thursday.getMonth(), thursday.getDate()) -
      Date.UTC(thursday.getFullYear(), 0, 1)) /
    DAY_MS;
  return 1 + Math.floor(dayOfYear / 7);
}

/** The month that holds `date` as whole weeks: four to six rows of seven days. */
export function monthWeeks(date: Date, firstDay: number): Date[][] {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const weeks: Date[][] = [];
  for (let start = weekStart(first, firstDay); start <= last; start = addDays(start, 7))
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)));
  return weeks;
}

/** The first of the month `n` months after the one of `date`. */
export const addMonths = (date: Date, n: number): Date =>
  new Date(date.getFullYear(), date.getMonth() + n, 1);

/** The events that take place on `day`, in the order they start. */
export function eventsOn<T extends Timed>(events: readonly T[], day: Date): T[] {
  const from = startOfDay(day).getTime();
  const until = addDays(day, 1).getTime();
  return events
    .filter(event => event.start.getTime() < until && event.end.getTime() > from)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** The keys of the days between `from` and `until` that have at least one event. */
export function busyDays(events: readonly Timed[], from: Date, until: Date): Set<string> {
  const busy = new Set<string>();
  for (const event of events) {
    const start = Math.max(event.start.getTime(), startOfDay(from).getTime());
    const end = Math.min(event.end.getTime(), until.getTime());
    // An event that ends at midnight does not touch the day that starts there.
    for (let day = startOfDay(new Date(start)); day.getTime() < end; day = addDays(day, 1))
      busy.add(dayKey(day));
  }
  return busy;
}
