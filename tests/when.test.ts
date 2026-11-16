import { describe, expect, it } from 'vitest';
import {
  formatClock,
  formatRelativeTime,
  formatWhen,
  isAllDay,
  joinWindowOpen,
  pickUpcoming,
} from '../src/modules/upcoming/when.js';

// Friday 13 November 2026, 14:30 local time.
const now = new Date(2026, 10, 13, 14, 30);
const at = (day: number, hour = 0, minute = 0): Date => new Date(2026, 10, day, hour, minute);

// A stand-in for gettext that marks what went through it.
const _ = (s: string): string => s;
const ngettext = (singular: string, plural: string, n: number): string =>
  n === 1 ? singular : plural;

describe('formatClock', () => {
  it.each([
    [at(13, 15, 0), 'de-DE', undefined, '15:00'],
    [at(13, 15, 0), 'en-US', undefined, '3:00 PM'],
    [at(13, 15, 0), 'en-US', false, '15:00'],
    [at(13, 15, 0), 'de-DE', true, '3:00 PM'],
    [at(13, 0, 5), 'en-US', false, '00:05'],
    [at(13, 9, 5), 'de-DE', undefined, '09:05'],
  ])('%s in %s with hour12 %s is %s', (date, locale, hour12, expected) => {
    expect(formatClock(date, locale, { hour12 })).toBe(expected);
  });
});

describe('formatWhen', () => {
  const timed = (start: Date, end: Date) => ({ start, end, allDay: false });
  const allDay = (start: Date, end: Date) => ({ start, end, allDay: true });

  // [name, event, locale, opts, expected]
  const cases: [
    string,
    ReturnType<typeof timed>,
    string,
    { hour12?: boolean } | undefined,
    string,
  ][] = [
    ['running now', timed(at(13, 14, 0), at(13, 15, 0)), 'en-US', undefined, 'Now'],
    ['starts right now', timed(at(13, 14, 30), at(13, 15, 0)), 'en-US', undefined, 'Now'],
    ['later today, 24 h', timed(at(13, 15, 0), at(13, 16, 0)), 'de-DE', undefined, '15:00'],
    ['later today, 12 h', timed(at(13, 15, 0), at(13, 16, 0)), 'en-US', undefined, '3:00 PM'],
    [
      'later today, 12 h forced',
      timed(at(13, 15, 0), at(13, 16, 0)),
      'de-DE',
      { hour12: true },
      '3:00 PM',
    ],
    [
      'later today, 24 h forced',
      timed(at(13, 15, 0), at(13, 16, 0)),
      'en-US',
      { hour12: false },
      '15:00',
    ],
    ['all-day today', allDay(at(13), at(14)), 'en-US', undefined, 'Today'],
    ['multi-day all-day running', allDay(at(12), at(15)), 'en-US', undefined, 'Today'],
    ['tomorrow', timed(at(14, 9, 0), at(14, 10, 0)), 'en-US', undefined, 'Tomorrow'],
    [
      'tomorrow, just after midnight',
      timed(at(14, 0, 5), at(14, 1, 0)),
      'de-DE',
      undefined,
      'Tomorrow',
    ],
    ['all-day tomorrow', allDay(at(14), at(15)), 'en-US', undefined, 'Tomorrow'],
    ['in two days, English', timed(at(15, 9, 0), at(15, 10, 0)), 'en-US', undefined, 'Sun'],
    ['in two days, German', timed(at(15, 9, 0), at(15, 10, 0)), 'de-DE', undefined, 'So'],
    ['in six days', timed(at(19, 9, 0), at(19, 10, 0)), 'en-US', undefined, 'Thu'],
    ['in seven days, English', timed(at(20, 9, 0), at(20, 10, 0)), 'en-US', undefined, 'Nov 20'],
    ['in fifteen days, German', timed(at(28, 9, 0), at(28, 10, 0)), 'de-DE', undefined, '28. Nov.'],
    [
      'across a month end',
      timed(new Date(2026, 11, 2, 9), new Date(2026, 11, 2, 10)),
      'en-US',
      undefined,
      'Dec 2',
    ],
  ];

  it.each(cases)('%s', (_name, event, locale, opts, expected) => {
    expect(formatWhen(event, now, _, locale, opts)).toBe(expected);
  });

  it('runs every text through the translator', () => {
    const shout = (s: string): string => s.toUpperCase();
    expect(formatWhen(timed(at(13, 14, 0), at(13, 15, 0)), now, shout, 'en-US')).toBe('NOW');
    expect(formatWhen(timed(at(14, 9, 0), at(14, 10, 0)), now, shout, 'en-US')).toBe('TOMORROW');
    expect(formatWhen(allDay(at(13), at(14)), now, shout, 'en-US')).toBe('TODAY');
  });
});

describe('isAllDay', () => {
  it.each([
    ['one full day', at(13), at(14), true],
    ['several days', at(13), at(16), true],
    ['one hour', at(13, 9), at(13, 10), false],
    ['midnight start, noon end', at(13), at(13, 12), false],
    ['not at midnight', at(13, 0, 1), at(14), false],
    ['zero length at midnight', at(13), at(13), false],
    ['across a DST change (23 h day)', new Date(2026, 2, 29), new Date(2026, 2, 30), true],
  ])('%s', (_name, start, end, expected) => {
    expect(isAllDay(start, end)).toBe(expected);
  });
});

describe('pickUpcoming', () => {
  const event = (name: string, start: Date, end: Date) => ({ name, start, end });
  const names = (events: { name: string }[]): string[] => events.map((e) => e.name);

  it('puts running events first, then orders by start', () => {
    const events = [
      event('later', at(13, 18), at(13, 19)),
      event('running', at(13, 14), at(13, 15)),
      event('soon', at(13, 15), at(13, 16)),
      event('tomorrow', at(14, 9), at(14, 10)),
    ];
    expect(names(pickUpcoming(events, now))).toEqual(['running', 'soon', 'later']);
  });

  it('drops events that have ended', () => {
    const events = [
      event('over', at(13, 10), at(13, 14, 30)),
      event('open', at(13, 16), at(13, 17)),
    ];
    expect(names(pickUpcoming(events, now))).toEqual(['open']);
  });

  it('drops events that start beyond the horizon', () => {
    const events = [
      event('inside', at(20, 14, 30), at(20, 15)),
      event('outside', at(21), at(21, 1)),
    ];
    expect(names(pickUpcoming(events, now))).toEqual(['inside']);
    expect(names(pickUpcoming(events, now, 3, 10))).toEqual(['inside', 'outside']);
  });

  it('limits the number', () => {
    const events = [1, 2, 3, 4, 5].map((i) => event(`e${i}`, at(13, 15 + i), at(13, 16 + i)));
    expect(names(pickUpcoming(events, now))).toEqual(['e1', 'e2', 'e3']);
    expect(names(pickUpcoming(events, now, 2))).toEqual(['e1', 'e2']);
  });

  it('keeps a running multi-day event ahead of later ones', () => {
    const events = [event('next', at(13, 16), at(13, 17)), event('trip', at(11), at(16))];
    expect(names(pickUpcoming(events, now))).toEqual(['trip', 'next']);
  });

  it('does not modify its input and handles an empty list', () => {
    const events = [event('b', at(13, 18), at(13, 19)), event('a', at(13, 16), at(13, 17))];
    pickUpcoming(events, now);
    expect(names(events)).toEqual(['b', 'a']);
    expect(pickUpcoming([], now)).toEqual([]);
  });
});

describe('formatRelativeTime', () => {
  const minutesAgo = (n: number): Date => new Date(now.getTime() - n * 60_000);

  // [name, then, locale, expected]
  const cases: [string, Date, string, string][] = [
    ['just now', new Date(now.getTime() - 20_000), 'en-US', 'now'],
    ['in the future', new Date(now.getTime() + 5_000), 'en-US', 'now'],
    ['one minute', minutesAgo(1), 'en-US', '1 min ago'],
    ['five minutes', minutesAgo(5), 'en-US', '5 min ago'],
    ['59 minutes', minutesAgo(59), 'de-DE', '59 min ago'],
    ['an hour, same day, 24 h', minutesAgo(90), 'de-DE', '13:00'],
    ['an hour, same day, 12 h', minutesAgo(90), 'en-US', '1:00 PM'],
    ['early today', at(13, 0, 5), 'en-US', '12:05 AM'],
    ['yesterday', at(12, 22, 0), 'en-US', 'Yesterday'],
    ['yesterday just before midnight', at(12, 23, 59), 'de-DE', 'Yesterday'],
    ['two days ago, English', at(11, 9, 0), 'en-US', 'Nov 11'],
    ['two days ago, German', at(11, 9, 0), 'de-DE', '11. Nov.'],
  ];

  it.each(cases)('%s', (_name, then, locale, expected) => {
    expect(formatRelativeTime(then, now, _, ngettext, locale)).toBe(expected);
  });

  it('honours the hour12 option', () => {
    expect(formatRelativeTime(minutesAgo(90), now, _, ngettext, 'en-US', { hour12: false })).toBe(
      '13:00',
    );
  });

  it('asks ngettext with the minute count', () => {
    const calls: number[] = [];
    const spy = (singular: string, plural: string, n: number): string => {
      calls.push(n);
      return ngettext(singular, plural, n);
    };
    formatRelativeTime(minutesAgo(7), now, _, spy, 'en-US');
    expect(calls).toEqual([7]);
  });
});

describe('joinWindowOpen', () => {
  const start = at(13, 15);
  const end = at(13, 16);

  it.each([
    ['11 minutes before', at(13, 14, 49), false],
    ['exactly 10 minutes before', at(13, 14, 50), true],
    ['at the start', at(13, 15), true],
    ['in the middle', at(13, 15, 30), true],
    ['one second before the end', new Date(2026, 10, 13, 15, 59, 59), true],
    ['at the end', at(13, 16), false],
    ['long after', at(13, 18), false],
  ])('%s', (_name, time, expected) => {
    expect(joinWindowOpen(start, end, time)).toBe(expected);
  });
});
