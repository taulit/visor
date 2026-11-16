import { describe, expect, it } from 'vitest';
import { GROUP_ORDER, parseQuery } from '../src/core/search/parser.js';

const commands = [['timer'], ['stoppuhr', 'stopwatch'], ['notiz', 'note']];
const parse = (input: string, locale = 'en-US') =>
  parseQuery(input, { commands, locale, homeCurrency: 'EUR' });

describe('parseQuery', () => {
  it('returns everything empty for empty or blank input', () => {
    for (const input of ['', '   ', '\t\n']) {
      expect(parse(input)).toEqual({
        text: '',
        terms: [],
        command: null,
        calc: null,
        currency: null,
      });
    }
  });

  it('trims the text and lower-cases the terms', () => {
    const query = parse('  Fire   Fox  ');
    expect(query.text).toBe('Fire   Fox');
    expect(query.terms).toEqual(['fire', 'fox']);
    expect(query.command).toBeNull();
    expect(query.calc).toBeNull();
    expect(query.currency).toBeNull();
  });

  // [input, expected command]
  const commandCases: [string, { index: number; keyword: string; args: string } | null][] = [
    ['timer 25m Pizza', { index: 0, keyword: 'timer', args: '25m Pizza' }],
    ['timer', { index: 0, keyword: 'timer', args: '' }],
    ['timer   ', { index: 0, keyword: 'timer', args: '' }],
    ['TIMER 5', { index: 0, keyword: 'timer', args: '5' }],
    ['  timer   25m   Pizza  ', { index: 0, keyword: 'timer', args: '25m Pizza' }],
    ['stopwatch', { index: 1, keyword: 'stopwatch', args: '' }],
    ['Stoppuhr start', { index: 1, keyword: 'stoppuhr', args: 'start' }],
    ['note buy milk', { index: 2, keyword: 'note', args: 'buy milk' }],
    ['timers', null],
    ['timer5', null],
    ['my timer', null],
    ['time', null],
  ];

  it.each(commandCases)('command for "%s"', (input, expected) => {
    expect(parse(input).command).toEqual(expected);
  });

  it('detects a calculation', () => {
    expect(parse('2+3*4').calc).toEqual({ value: 14 });
    expect(parse('20% of 80').calc).toEqual({ value: 16 });
  });

  it('reads calculations in the locale', () => {
    expect(parse('2,5 * 2', 'de-DE').calc).toEqual({ value: 5 });
    expect(parse('1.234,5 + 1', 'de-DE').calc).toEqual({ value: 1235.5 });
  });

  it.each(['2024', 'pi', 'e', 'log', 'firefox', '3 apples'])('"%s" is no calculation', (input) => {
    expect(parse(input).calc).toBeNull();
  });

  it('detects a currency query and then has no calculation', () => {
    const query = parse('100 usd in chf');
    expect(query.currency).toEqual({ amount: 100, from: 'USD', to: 'CHF' });
    expect(query.calc).toBeNull();
  });

  it('uses the home currency as target', () => {
    const query = parseQuery('50 chf', { commands, locale: 'de-DE', homeCurrency: 'USD' });
    expect(query.currency).toEqual({ amount: 50, from: 'CHF', to: 'USD' });
  });

  it('reads the currency amount in the locale', () => {
    expect(parse('12,50 € in usd', 'de-DE').currency).toEqual({
      amount: 12.5,
      from: 'EUR',
      to: 'USD',
    });
  });

  it('does not take a plain word for a currency query', () => {
    expect(parse('100 cat in hat').currency).toBeNull();
  });

  it('can be a command and a calculation of its own at the same time', () => {
    const query = parse('note 1+1');
    expect(query.command?.keyword).toBe('note');
    expect(query.calc).toBeNull();
  });

  it('handles an empty list of commands', () => {
    expect(parseQuery('timer 5', { commands: [], homeCurrency: 'EUR' }).command).toBeNull();
  });
});

describe('GROUP_ORDER', () => {
  it('lists the groups in display order', () => {
    expect(GROUP_ORDER).toEqual(['command', 'calc', 'apps', 'modules', 'providers']);
  });
});
