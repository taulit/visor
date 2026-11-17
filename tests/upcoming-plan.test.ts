import { describe, expect, it } from 'vitest';
import {
  chipText,
  eventSubtitle,
  eventUuid,
  formatIn,
  nextChipChange,
  nextRowChange,
  nextWake,
  unfoldIcs,
  type PlannedEvent,
} from '../src/modules/upcoming/plan.js';

// Friday 13 November 2026, 14:30 local time.
const now = new Date(2026, 10, 13, 14, 30);
const at = (day: number, hour = 0, minute = 0, second = 0): Date =>
  new Date(2026, 10, day, hour, minute, second);
const _ = (s: string): string => s;
const event = (
  start: Date,
  end: Date,
  summary = 'Sprint Review',
  allDay = false,
): PlannedEvent => ({
  id: `cal\n${summary}\n`,
  summary,
  start,
  end,
  allDay,
});
const opts = { hour12: false };

describe('formatIn', () => {
  it.each([
    [1, 'in 1 min'],
    [5 * 60_000, 'in 5 min'],
    [5 * 60_000 + 1, 'in 6 min'],
    [60 * 60_000, 'in 1 h'],
    [96 * 60_000, 'in 1 h 36 min'],
    [0, 'in 1 min'],
  ])('%d ms is "%s"', (ms, expected) => {
    expect(formatIn(ms, _)).toBe(expected);
  });
});

describe('eventSubtitle', () => {
  it.each([
    ['all day', event(at(14), at(15), 'Birthday', true), 'all day'],
    ['running', event(at(13, 14), at(13, 16)), 'until 16:00'],
    ['later today', event(at(13, 16, 6), at(13, 17)), 'in 1 h 36 min'],
    ['another day', event(at(16, 9), at(16, 10)), '09:00'],
  ])('%s', (_name, e, expected) => {
    expect(eventSubtitle(e, now, _, 'en-US', opts)).toBe(expected);
  });
});

describe('nextRowChange', () => {
  it('is null without rows', () => {
    expect(nextRowChange([], now)).toBeNull();
  });

  it('is the next minute an "in … min" text changes', () => {
    const e = event(at(13, 16, 6, 30), at(13, 17));
    expect(nextRowChange([e], now)).toBe(at(13, 14, 30, 30).getTime());
    expect(nextRowChange([event(at(13, 16, 6), at(13, 17))], now)).toBe(at(13, 14, 31).getTime());
  });

  it('is the end of a running event', () => {
    expect(nextRowChange([event(at(13, 14), at(13, 14, 45))], now)).toBe(at(13, 14, 45).getTime());
  });

  it('is midnight when only other days are shown', () => {
    expect(nextRowChange([event(at(16, 9), at(16, 10))], now)).toBe(at(14).getTime());
  });
});

describe('chip', () => {
  const soon = event(at(13, 14, 40), at(13, 15));
  const running = event(at(13, 14), at(13, 15), 'Standup');
  const later = event(at(13, 15), at(13, 16), 'Later');

  it('shows a running event before one that starts soon', () => {
    expect(chipText([soon, running], now, _, 'en-US', opts)).toBe('Now Standup');
    expect(chipText([soon], now, _, 'en-US', opts)).toBe('14:40 Sprint Review');
  });

  it('shows nothing for events further away, ended or all day', () => {
    expect(chipText([later], now, _, 'en-US', opts)).toBeNull();
    expect(chipText([event(at(13, 13), at(13, 14))], now, _, 'en-US', opts)).toBeNull();
    expect(chipText([event(at(13), at(14), 'Fair', true)], now, _, 'en-US', opts)).toBeNull();
  });

  it('cuts a long summary', () => {
    const long = event(at(13, 14, 40), at(13, 15), 'Quarterly planning with everybody');
    expect(chipText([long], now, _, 'en-US', opts)).toBe('14:40 Quarterly planning wi…');
  });

  it('changes 15 minutes before the start, at the start and at the end', () => {
    expect(nextChipChange([later], now)).toBe(at(13, 14, 45).getTime());
    expect(nextChipChange([soon], now)).toBe(at(13, 14, 40).getTime());
    expect(nextChipChange([running], now)).toBe(at(13, 15).getTime());
    expect(nextChipChange([event(at(13), at(14), 'Fair', true)], now)).toBeNull();
  });
});

describe('nextWake', () => {
  const far = event(at(13, 18), at(13, 19));
  const base = { now, open: false, hasCalendars: true };

  it('is null without calendars and events', () => {
    expect(nextWake({ ...base, events: [], shown: [], hasCalendars: false })).toBeNull();
  });

  it('is midnight when nothing is ahead', () => {
    expect(nextWake({ ...base, events: [], shown: [] })).toBe(at(14).getTime());
  });

  it('is one hour before the chip changes when that is further away', () => {
    expect(nextWake({ ...base, events: [far], shown: [far] })).toBe(at(13, 16, 45).getTime());
  });

  it('is the chip change itself within the hour', () => {
    const near = event(at(13, 15, 30), at(13, 16));
    expect(nextWake({ ...base, events: [near], shown: [near] })).toBe(at(13, 15, 15).getTime());
  });

  it('follows the rows only while the panel is open', () => {
    expect(nextWake({ ...base, open: true, events: [far], shown: [far] })).toBe(
      at(13, 14, 31).getTime(),
    );
  });
});

describe('eventUuid', () => {
  it.each([
    ['system-calendar\nabc\n', 'system-calendar:abc'],
    ['system-calendar\nabc\n20261113T140000Z', 'system-calendar:abc:20261113T140000Z'],
    ['broken', null],
  ])('%j', (id, expected) => {
    expect(eventUuid(id)).toBe(expected);
  });
});

describe('unfoldIcs', () => {
  it('joins folded lines and removes escapes', () => {
    const ics =
      'DESCRIPTION:Join\\, please:\\nhttps://meet.google.com/abc-\r\n defg-hij\r\nEND:VEVENT';
    expect(unfoldIcs(ics)).toBe(
      'DESCRIPTION:Join, please:\nhttps://meet.google.com/abc-defg-hij\r\nEND:VEVENT',
    );
    expect(unfoldIcs(null)).toBe('');
  });
});
