import { describe, expect, it } from 'vitest';
import {
  completions,
  keepSelection,
  localeOf,
  moveSelection,
  parseRatesCache,
  rateLine,
  serializeRatesCache,
} from '../src/core/search/model.js';

describe('localeOf', () => {
  // [language names, locale, region]
  const cases: [string[], string | undefined, string | null][] = [
    [['de_DE.UTF-8', 'de_DE', 'de.UTF-8', 'de', 'C'], 'de-DE', 'DE'],
    [['en_US.UTF-8', 'en_US', 'en', 'C'], 'en-US', 'US'],
    [['de_CH@euro', 'de'], 'de-CH', 'CH'],
    [['C', 'POSIX'], undefined, null],
    [['C.UTF-8', 'fr'], 'fr', null],
    [[], undefined, null],
  ];
  it.each(cases)('%j', (names, locale, region) => {
    expect(localeOf(names)).toEqual({ locale, region });
  });
});

describe('completions', () => {
  const commands = [['timer'], ['stoppuhr', 'stopwatch'], ['notiz', 'note'], ['tim']];
  // [typed, expected]
  const cases: [string, { index: number; keyword: string }[]][] = [
    ['tim', [{ index: 0, keyword: 'timer' }]],
    [
      'TI',
      [
        { index: 0, keyword: 'timer' },
        { index: 3, keyword: 'tim' },
      ],
    ],
    ['sto', [{ index: 1, keyword: 'stoppuhr' }]],
    ['stopw', [{ index: 1, keyword: 'stopwatch' }]],
    ['no', [{ index: 2, keyword: 'notiz' }]],
    ['note', []],
    ['timer', []],
    ['tim 5', []],
    ['x', []],
    ['', []],
    ['  ', []],
  ];
  it.each(cases)('%j', (typed, expected) => {
    expect(completions(typed, commands)).toEqual(expected);
  });
});

describe('rateLine', () => {
  const rates = { date: '2026-11-13', rates: { EUR: 1, USD: 1.0812, JPY: 166.73 } };
  it('shows the rate and the day of the rates in the locale', () => {
    const query = { amount: 100, from: 'USD', to: 'EUR' };
    expect(rateLine(query, rates, 'de-DE')).toBe('1 USD = 0,9249 EUR · 13. Nov.');
    expect(rateLine(query, rates, 'en-GB')).toBe('1 USD = 0.9249 EUR · 13 Nov');
    expect(rateLine({ amount: 5, from: 'EUR', to: 'JPY' }, rates, 'en-US')).toBe(
      '1 EUR = 166.73 JPY · Nov 13',
    );
  });
  it('is null without a rate', () => {
    expect(rateLine({ amount: 1, from: 'USD', to: 'CHF' }, rates, 'en-US')).toBeNull();
  });
});

describe('rates cache', () => {
  const cache = { fetched: 1763300000000, date: '2026-11-13', rates: { EUR: 1, USD: 1.0812 } };
  it('reads back what it wrote', () => {
    expect(parseRatesCache(serializeRatesCache(cache))).toEqual(cache);
  });
  const broken = [
    '',
    'null',
    '[]',
    '{"fetched":"x","date":"2026-11-13","rates":{"EUR":1,"USD":1.1}}',
    '{"fetched":1,"date":"13.11.2026","rates":{"EUR":1,"USD":1.1}}',
    '{"fetched":1,"date":"2026-11-13","rates":{"EUR":1}}',
    '{"fetched":1,"date":"2026-11-13","rates":{"EUR":1,"USD":0}}',
    '{"fetched":1,"date":"2026-11-13","rates":{"EUR":1,"usd":1.1}}',
    '{"fetched":1,"date":"2026-11-13","rates":{"USD":1.1,"GBP":0.8}}',
    '{"fetched":1,"date":"2026-11-13"}',
  ];
  it.each(broken)('refuses %s', json => {
    expect(parseRatesCache(json)).toBeNull();
  });
});

describe('selection', () => {
  const keys = ['a', 'b', 'c'];
  it('selects the first line until the user picked one', () => {
    expect(keepSelection(keys, null, false)).toBe('a');
    expect(keepSelection(keys, 'b', false)).toBe('a');
    expect(keepSelection(keys, 'b', true)).toBe('b');
    expect(keepSelection(keys, 'gone', true)).toBe('a');
    expect(keepSelection([], 'a', true)).toBeNull();
  });
  it('moves without wrapping around', () => {
    expect(moveSelection(keys, 'a', 1)).toBe('b');
    expect(moveSelection(keys, 'c', 1)).toBe('c');
    expect(moveSelection(keys, 'a', -1)).toBe('a');
    expect(moveSelection(keys, 'c', -1)).toBe('b');
    expect(moveSelection(keys, null, 1)).toBe('a');
    expect(moveSelection(keys, 'gone', -1)).toBe('a');
    expect(moveSelection([], 'a', 1)).toBeNull();
  });
});
