import { describe, expect, it } from 'vitest';
import { formatDuration, truncate } from '../src/lib/format.js';

describe('formatDuration', () => {
  it('formats under a minute', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(5_000)).toBe('0:05');
  });

  it('formats minutes', () => {
    expect(formatDuration(65_000)).toBe('1:05');
    expect(formatDuration(59 * 60_000 + 59_999)).toBe('59:59');
  });

  it('switches to hours at one hour', () => {
    expect(formatDuration(3_600_000)).toBe('1:00:00');
    expect(formatDuration(3_600_000 + 2 * 60_000 + 3_000)).toBe('1:02:03');
  });

  it('never returns a negative or invalid value', () => {
    expect(formatDuration(-5_000)).toBe('0:00');
    expect(formatDuration(NaN)).toBe('0:00');
  });
});

describe('truncate', () => {
  it.each([
    ['short', 10, 'short'],
    ['exactly ten', 11, 'exactly ten'],
    ['a longer sentence', 8, 'a longe…'],
    ['abc', 3, 'abc'],
    ['abcd', 3, 'ab…'],
    ['abcd', 1, '…'],
    ['abcd', 0, ''],
    ['', 5, ''],
    ['Ünïcödé text', 6, 'Ünïcö…'],
    ['a😀b😀c', 4, 'a😀b…'],
    ['😀😀😀😀', 3, '😀😀…'],
    ['😀😀', 2, '😀😀'],
  ])('truncate(%j, %d) is %j', (text, max, expected) => {
    expect(truncate(text, max)).toBe(expected);
  });

  it('never leaves half a surrogate pair', () => {
    for (let max = 0; max < 8; max++) {
      expect(truncate('😀😀😀😀😀', max)).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
    }
  });
});
