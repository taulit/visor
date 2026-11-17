import { describe, expect, it } from 'vitest';
import { isDark, opaqueCss, relativeLuminance, themeClasses } from '../src/core/theme.js';

const rgb = (hex: string) => ({
  red: Number.parseInt(hex.slice(1, 3), 16),
  green: Number.parseInt(hex.slice(3, 5), 16),
  blue: Number.parseInt(hex.slice(5, 7), 16),
});

describe('relativeLuminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(relativeLuminance(rgb('#000000'))).toBe(0);
    expect(relativeLuminance(rgb('#ffffff'))).toBeCloseTo(1, 10);
  });

  it('matches the WCAG values of the primaries', () => {
    expect(relativeLuminance(rgb('#ff0000'))).toBeCloseTo(0.2126, 4);
    expect(relativeLuminance(rgb('#00ff00'))).toBeCloseTo(0.7152, 4);
    expect(relativeLuminance(rgb('#0000ff'))).toBeCloseTo(0.0722, 4);
  });

  it('linearises sRGB: mid grey is far below one half', () => {
    expect(relativeLuminance(rgb('#808080'))).toBeCloseTo(0.2159, 3);
  });

  it('clamps channels outside 0 to 255', () => {
    expect(relativeLuminance({ red: -20, green: 300, blue: 0 })).toBeCloseTo(0.7152, 4);
  });
});

describe('isDark', () => {
  it('takes the stock panels as dark and light', () => {
    expect(isDark(rgb('#000000'))).toBe(true);
    expect(isDark(rgb('#fafafb'))).toBe(false);
  });

  it('switches at a luminance of one half', () => {
    expect(isDark(rgb('#bbbbbb'))).toBe(true); // 0.497
    expect(isDark(rgb('#bcbcbc'))).toBe(false); // 0.503
  });

  it('judges coloured panels by luminance, not by brightness of a channel', () => {
    expect(isDark(rgb('#0000ff'))).toBe(true);
    expect(isDark(rgb('#ffff00'))).toBe(false);
    expect(isDark(rgb('#241f31'))).toBe(true);
  });
});

describe('themeClasses', () => {
  it('gives exactly one of dark and light', () => {
    expect(themeClasses(rgb('#000000'), false)).toEqual(['visor-dark']);
    expect(themeClasses(rgb('#fafafb'), false)).toEqual(['visor-light']);
  });

  it('adds the high contrast class', () => {
    expect(themeClasses(rgb('#000000'), true)).toEqual(['visor-dark', 'visor-hc']);
    expect(themeClasses(rgb('#fafafb'), true)).toEqual(['visor-light', 'visor-hc']);
  });
});

describe('opaqueCss', () => {
  it('drops the alpha channel', () => {
    expect(opaqueCss({ red: 250, green: 250, blue: 251, alpha: 0 } as never)).toBe(
      'rgb(250,250,251)',
    );
  });

  it('rounds and clamps', () => {
    expect(opaqueCss({ red: 12.6, green: -3, blue: 999 })).toBe('rgb(13,0,255)');
  });
});
