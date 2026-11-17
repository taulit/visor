import { describe, expect, it } from 'vitest';
import { leftColumnWidth, sheetWidth } from '../src/lib/widths.js';

describe('sheetWidth', () => {
  it('follows the setting with two columns', () => {
    expect(sheetWidth('compact', true)).toBe(800);
    expect(sheetWidth('normal', true)).toBe(960);
    expect(sheetWidth('wide', true)).toBe(1120);
  });

  it('falls back to normal for an unknown setting', () => {
    expect(sheetWidth('huge', true)).toBe(960);
  });

  it('is narrow with one column, whatever the setting', () => {
    expect(sheetWidth('wide', false)).toBe(600);
  });

  it('follows the setting in a module view even with one column', () => {
    expect(sheetWidth('wide', false, true)).toBe(1120);
  });
});

describe('leftColumnWidth', () => {
  it('splits the inner width 1.2 : 1', () => {
    expect(leftColumnWidth(960)).toBe(497);
    expect(leftColumnWidth(800)).toBe(410);
  });
});
