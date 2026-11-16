import { describe, expect, it } from 'vitest';
import { parseTimer } from '../src/modules/timers/parse.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
// Local-time constructor: independent of the machine's time zone.
const now = new Date(2026, 10, 13, 12, 0, 0);

describe('parseTimer countdowns', () => {
  // [args, durationMs, label]
  const cases: [string, number, string][] = [
    ['25m Pizza', 25 * MIN, 'Pizza'],
    ['25 min Pizza', 25 * MIN, 'Pizza'],
    ['25 minutes Pizza', 25 * MIN, 'Pizza'],
    ['25 Minuten Pizza', 25 * MIN, 'Pizza'],
    ['25M', 25 * MIN, ''],
    ['1h30 Wäsche', 90 * MIN, 'Wäsche'],
    ['1h30', 90 * MIN, ''],
    ['1h 30m', 90 * MIN, ''],
    ['1h 30m Wäsche', 90 * MIN, 'Wäsche'],
    ['1 hour 30 min', 90 * MIN, ''],
    ['1:30h', 90 * MIN, ''],
    ['1:30h Wäsche', 90 * MIN, 'Wäsche'],
    ['0:45 std', 45 * MIN, ''],
    ['90s', 90_000, ''],
    ['90 sec', 90_000, ''],
    ['90 Sek', 90_000, ''],
    ['10 sekunden', 10_000, ''],
    ['10 seconds tea', 10_000, 'tea'],
    ['1m 30s', 90_000, ''],
    ['1m30', 90_000, ''],
    ['45', 45 * MIN, ''],
    ['45 Pizza', 45 * MIN, 'Pizza'],
    ['1,5h', 90 * MIN, ''],
    ['1.5h', 90 * MIN, ''],
    ['0,5 min', 30_000, ''],
    ['2h', 2 * HOUR, ''],
    ['2 Stunden', 2 * HOUR, ''],
    ['2 std Backofen', 2 * HOUR, 'Backofen'],
    ['2 hrs', 2 * HOUR, ''],
    ['24h', 24 * HOUR, ''],
    ['  25m   Pizza backen  ', 25 * MIN, 'Pizza backen'],
    ['25m - Pizza', 25 * MIN, 'Pizza'],
    ['25m: Pizza', 25 * MIN, 'Pizza'],
    ['25m 2 Pizzen', 25 * MIN, '2 Pizzen'],
    ['1h 30 Wäsche', HOUR, '30 Wäsche'],
  ];

  it.each(cases)('"%s"', (args, durationMs, label) => {
    expect(parseTimer(args, now)).toEqual({ kind: 'countdown', durationMs, label });
  });
});

describe('parseTimer alarms', () => {
  // [args, hour, minute, day offset, label]
  const cases: [string, number, number, number, string][] = [
    ['18:30 Meeting', 18, 30, 0, 'Meeting'],
    ['18:30', 18, 30, 0, ''],
    ['7:05', 7, 5, 1, ''], // 07:05 has passed at noon: tomorrow
    ['07:05 Wecker', 7, 5, 1, 'Wecker'],
    ['12:00', 12, 0, 1, ''], // exactly now has passed
    ['12:01', 12, 1, 0, ''],
    ['0:00', 0, 0, 1, ''],
    ['23:59 Ende', 23, 59, 0, 'Ende'],
    ['6pm Call', 18, 0, 0, 'Call'],
    ['6 PM Call', 18, 0, 0, 'Call'],
    ['6:30 pm', 18, 30, 0, ''],
    ['6:30pm', 18, 30, 0, ''],
    ['6am', 6, 0, 1, ''],
    ['6:30 am Gym', 6, 30, 1, 'Gym'],
    ['12am', 0, 0, 1, ''],
    ['12pm', 12, 0, 1, ''],
    ['11:59 pm', 23, 59, 0, ''],
  ];

  it.each(cases)('"%s"', (args, hour, minute, dayOffset, label) => {
    const expected = new Date(2026, 10, 13 + dayOffset, hour, minute, 0, 0);
    expect(parseTimer(args, now)).toEqual({ kind: 'alarm', at: expected, label });
  });

  it('rolls over month and year ends', () => {
    const lateNow = new Date(2026, 11, 31, 23, 0, 0);
    expect(parseTimer('7:00', lateNow)).toEqual({
      kind: 'alarm',
      at: new Date(2027, 0, 1, 7, 0, 0),
      label: '',
    });
  });
});

describe('parseTimer rejects', () => {
  const rejected: [string, string][] = [
    ['empty', ''],
    ['blank', '   '],
    ['only a word', 'Pizza'],
    ['dotted time', '18.30'],
    ['dotted time with label', '18.30 Meeting'],
    ['zero', '0'],
    ['zero minutes', '0m'],
    ['more than 24 hours', '25h'],
    ['just over 24 hours', '24h 1m'],
    ['1441 minutes', '1441'],
    ['hour 24', '24:00'],
    ['hour 25', '25:30'],
    ['invalid minutes', '12:60'],
    ['13 pm', '13pm'],
    ['0 am', '0am'],
    ['seconds only, zero', '0 sek'],
    ['a unit alone', 'min'],
    ['negative', '-5m'],
    ['clock with seconds', '1:30:00'],
    ['decimal without unit', '1,5'],
    ['unit before number', 'm25'],
  ];

  it.each(rejected)('%s', (_name, args) => {
    expect(parseTimer(args, now)).toBeNull();
  });

  it('does not take "1:30 hotel" for hours', () => {
    expect(parseTimer('1:30 hotel', now)).toEqual({
      kind: 'alarm',
      at: new Date(2026, 10, 14, 1, 30, 0),
      label: 'hotel',
    });
  });
});
