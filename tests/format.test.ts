import { describe, expect, it } from 'vitest';
import { formatDuration } from '../src/lib/format.js';

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
