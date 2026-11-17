import { describe, expect, it } from 'vitest';
import { calc, formatResult, readNumber, separatorsFor } from '../src/core/search/calc.js';

const value = (input: string, locale: string): number | null => {
  const result = calc(input, locale);
  return result.ok ? result.value : null;
};

describe('calc', () => {
  // [input, locale, expected]
  const cases: [string, string, number][] = [
    // arithmetic and precedence
    ['1+2', 'en-US', 3],
    ['2 + 3 * 4', 'en-US', 14],
    ['(2 + 3) * 4', 'en-US', 20],
    ['10 - 3 - 2', 'en-US', 5],
    ['100 / 5 / 2', 'en-US', 10],
    ['2 ^ 3 ^ 2', 'en-US', 512],
    ['-2 ^ 2', 'en-US', -4],
    ['2 * -3', 'en-US', -6],
    ['2 ^ -1', 'en-US', 0.5],
    ['--5', 'en-US', 5],
    ['+5', 'en-US', 5],
    ['((1+2)*(3+4))', 'en-US', 21],
    ['0.1 + 0.2', 'en-US', 0.1 + 0.2],
    // typographic operators
    ['6 × 7', 'en-US', 42],
    ['6 · 7', 'de-DE', 42],
    ['84 ÷ 2', 'en-US', 42],
    ['10 − 4', 'en-US', 6],
    // functions and constants
    ['sqrt(16)', 'en-US', 4],
    ['SQRT(16)', 'en-US', 4],
    ['abs(-3.5)', 'en-US', 3.5],
    ['round(2.5)', 'en-US', 3],
    ['log(1000)', 'en-US', 3],
    ['ln(e)', 'en-US', 1],
    ['sin(0)', 'en-US', 0],
    ['cos(0)', 'en-US', 1],
    ['sin(pi)', 'en-US', 0],
    ['cos(pi / 2)', 'en-US', 0],
    ['tan(0)', 'en-US', 0],
    ['pi * 2', 'en-US', Math.PI * 2],
    ['π * 2', 'en-US', Math.PI * 2],
    ['e ^ 2', 'en-US', Math.E ** 2],
    ['sqrt(2) * sqrt(2)', 'en-US', 2.0000000000000004],
    // locale notation
    ['1,234.5 + 1', 'en-US', 1235.5],
    ['1.234,5 + 1', 'de-DE', 1235.5],
    ['2,5 * 2', 'de-DE', 5],
    ['2.5 * 2', 'en-US', 5],
    ['1,234 + 1', 'en-US', 1235],
    ['1.234 + 1', 'de-DE', 1235],
    ['1.234.567 + 1', 'de-DE', 1234568],
    ['1,234,567 + 1', 'en-US', 1234568],
    ['.5 + .5', 'en-US', 1],
    [',5 + ,5', 'de-DE', 1],
    // lenient: the other mark when it is unambiguous
    ['2.5 * 2', 'de-DE', 5],
    ['1.2345 + 0', 'de-DE', 1.2345],
    ['0.123 + 0', 'de-DE', 0.123],
    ['1,5 * 2', 'en-US', 3],
    ['1,234.5 + 1', 'de-DE', 1235.5],
    ['1.234,5 + 1', 'en-US', 1235.5],
    // spaces as group separators
    ['1 234 + 1', 'de-DE', 1235],
    ['1 234,5 + 1', 'de-DE', 1235.5],
    ['1 234,5 + 1', 'fr-FR', 1235.5],
    ['1 234 567 - 1', 'en-US', 1234566],
    // percent
    ['50%', 'en-US', 0.5],
    ['200 + 10%', 'en-US', 220],
    ['200 - 10%', 'en-US', 180],
    ['200 * 10%', 'en-US', 20],
    ['200 / 50%', 'en-US', 400],
    ['20% of 80', 'en-US', 16],
    ['20 % von 80', 'de-DE', 16],
    ['20% OF 80 + 4', 'en-US', 20],
    ['10% + 5%', 'en-US', 0.15000000000000002],
    ['(100 + 100) + 10%', 'en-US', 220],
    ['12,5% of 200', 'de-DE', 25],
  ];

  it.each(cases)('%s (%s) = %d', (input, locale, expected) => {
    const result = value(input, locale);
    expect(result).not.toBeNull();
    expect(result as number).toBeCloseTo(expected, 12);
  });

  // [input, locale]
  const failures: [string, string][] = [
    ['', 'en-US'],
    ['   ', 'en-US'],
    ['abc', 'en-US'],
    ['1 / 0', 'en-US'],
    ['0 / 0', 'en-US'],
    ['1 / (2 - 2)', 'en-US'],
    ['2 ^ 5000', 'en-US'],
    ['sqrt(-1)', 'en-US'],
    ['ln(0)', 'en-US'],
    ['log(-5)', 'en-US'],
    ['1 +', 'en-US'],
    ['* 2', 'en-US'],
    ['(1 + 2', 'en-US'],
    ['1 + 2)', 'en-US'],
    ['2 3', 'en-US'],
    ['2(3)', 'en-US'],
    ['2 pi', 'en-US'],
    ['sqrt 16', 'en-US'],
    ['sqrt()', 'en-US'],
    ['foo(2)', 'en-US'],
    ['5 of 80', 'en-US'],
    ['1,2,3', 'en-US'],
    ['1.234,567.8', 'de-DE'],
    ['$5', 'en-US'],
    ['1e5', 'en-US'],
    ['2 +* 3', 'en-US'],
  ];

  it.each(failures)('rejects "%s" (%s)', (input, locale) => {
    expect(calc(input, locale)).toEqual({ ok: false });
  });

  it('returns the shape { ok: true, value }', () => {
    expect(calc('1+1', 'en-US')).toEqual({ ok: true, value: 2 });
  });

  it('snaps floating-point noise of trig functions to zero', () => {
    expect(calc('sin(pi)', 'en-US')).toEqual({ ok: true, value: 0 });
  });
});

describe('formatResult', () => {
  // [value, locale, expected]
  const cases: [number, string, string][] = [
    [0, 'en-US', '0'],
    [-0, 'en-US', '0'],
    [42, 'en-US', '42'],
    [1234.5, 'en-US', '1,234.5'],
    [1234.5, 'de-DE', '1.234,5'],
    [0.1 + 0.2, 'en-US', '0.3'],
    [0.1 + 0.2, 'de-DE', '0,3'],
    [1 / 3, 'en-US', '0.3333333333'],
    [2 / 3, 'de-DE', '0,6666666667'],
    [-2.5, 'en-US', '-2.5'],
    [Math.PI, 'en-US', '3.141592654'],
    [123456789012, 'en-US', '123,456,789,012'],
    [999999999999999, 'en-US', '999,999,999,999,999'],
    [0.000001234, 'en-US', '0.000001234'],
    [1e15, 'en-US', '1E15'],
    [1.5e20, 'de-DE', '1,5E20'],
  ];

  it.each(cases)('%d in %s is "%s"', (input, locale, expected) => {
    expect(formatResult(input, locale)).toBe(expected);
  });
});

describe('separatorsFor and readNumber', () => {
  it('derives the separators from Intl', () => {
    expect(separatorsFor('de-DE')).toEqual({ decimal: ',', group: '.' });
    expect(separatorsFor('en-US')).toEqual({ decimal: '.', group: ',' });
  });

  it('reads a number in the middle of a text and reports where it ends', () => {
    const seps = separatorsFor('de-DE');
    expect(readNumber('x 12,50 € in usd', 2, seps)).toEqual({ value: 12.5, end: 7 });
    expect(readNumber('abc', 0, seps)).toBeNull();
  });

  it('does not take a trailing mark or a lone space as part of the number', () => {
    const seps = separatorsFor('en-US');
    expect(readNumber('5. ', 0, seps)).toEqual({ value: 5, end: 1 });
    expect(readNumber('1 2345', 0, seps)).toEqual({ value: 1, end: 1 });
  });
});
