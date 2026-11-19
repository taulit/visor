import { describe, expect, it } from 'vitest';

import {
  addMonths,
  busyDays,
  dayKey,
  eventsOn,
  isoWeek,
  monthWeeks,
  weekDays,
} from '../src/modules/upcoming/calendar.js';

const d = (y: number, m: number, day: number, h = 0, min = 0): Date =>
  new Date(y, m - 1, day, h, min);

describe('weekDays', () => {
  it('starts on Monday', () => {
    const days = weekDays(d(2026, 11, 19), 1);
    expect(days.map(dayKey)).toEqual([
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
    ]);
  });

  it('starts on Sunday', () => {
    expect(dayKey(weekDays(d(2026, 11, 19), 0)[0]!)).toBe('2026-11-15');
    expect(dayKey(weekDays(d(2026, 11, 15), 0)[0]!)).toBe('2026-11-15');
  });

  it('crosses a change of the clocks without losing a day', () => {
    expect(weekDays(d(2026, 10, 25), 1).map(day => day.getDate())).toEqual([
      19, 20, 21, 22, 23, 24, 25,
    ]);
  });
});

describe('isoWeek', () => {
  it.each([
    [d(2026, 11, 19), 47],
    [d(2026, 1, 1), 1],
    [d(2027, 1, 1), 53],
    [d(2027, 1, 4), 1],
    [d(2024, 12, 30), 1],
    [d(2021, 1, 3), 53],
  ])('%s is in week %i', (date, week) => {
    expect(isoWeek(date)).toBe(week);
  });
});

describe('monthWeeks', () => {
  it('covers November 2026 in whole weeks from Monday', () => {
    const weeks = monthWeeks(d(2026, 11, 19), 1);
    expect(weeks).toHaveLength(6);
    expect(dayKey(weeks[0]![0]!)).toBe('2026-10-26');
    expect(dayKey(weeks.at(-1)!.at(-1)!)).toBe('2026-12-6');
  });

  it('needs four rows for a February that starts on the first day', () => {
    expect(monthWeeks(d(2027, 2, 10), 1)).toHaveLength(4);
  });

  it('moves by months from the first', () => {
    expect(dayKey(addMonths(d(2026, 1, 31), 1))).toBe('2026-2-1');
    expect(dayKey(addMonths(d(2026, 1, 15), -1))).toBe('2025-12-1');
  });
});

describe('events of a day', () => {
  const events = [
    { id: 'b', start: d(2026, 11, 20, 15), end: d(2026, 11, 20, 16) },
    { id: 'a', start: d(2026, 11, 20, 9), end: d(2026, 11, 20, 10) },
    { id: 'all', start: d(2026, 11, 21), end: d(2026, 11, 22) },
    { id: 'trip', start: d(2026, 11, 23), end: d(2026, 11, 26) },
    { id: 'night', start: d(2026, 11, 19, 23), end: d(2026, 11, 20, 1) },
  ];

  it('lists what touches the day, by start', () => {
    expect(eventsOn(events, d(2026, 11, 20)).map(e => e.id)).toEqual(['night', 'a', 'b']);
    expect(eventsOn(events, d(2026, 11, 22)).map(e => e.id)).toEqual([]);
    expect(eventsOn(events, d(2026, 11, 24)).map(e => e.id)).toEqual(['trip']);
  });

  it('marks every day an event touches, and not the one it ends at', () => {
    const busy = busyDays(events, d(2026, 11, 16), d(2026, 11, 30));
    expect([...busy].sort()).toEqual(
      ['2026-11-19', '2026-11-20', '2026-11-21', '2026-11-23', '2026-11-24', '2026-11-25'].sort(),
    );
  });

  it('marks nothing outside the range', () => {
    expect(busyDays(events, d(2026, 11, 1), d(2026, 11, 19)).size).toBe(0);
  });
});
