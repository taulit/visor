// Light or dark, decided by the colour of the panel and not by the colour
// scheme. Pure, no gi:// imports; core/notch.ts reads the colour and sets the classes.

/** A colour as Cogl.Color gives it: channels from 0 to 255. */
export interface Rgb {
  red: number;
  green: number;
  blue: number;
}

export const CLASS_DARK = 'visor-dark';
export const CLASS_LIGHT = 'visor-light';
export const CLASS_HIGH_CONTRAST = 'visor-hc';

function linear(channel: number): number {
  const c = Math.min(255, Math.max(0, channel)) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance as in WCAG 2: 0 is black, 1 is white. */
export function relativeLuminance({ red, green, blue }: Rgb): number {
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

/** A dark background takes the light token set. */
export function isDark(color: Rgb): boolean {
  return relativeLuminance(color) < 0.5;
}

/** Style classes for the notch root and the neck. */
export function themeClasses(panel: Rgb, highContrast: boolean): string[] {
  const classes = [isDark(panel) ? CLASS_DARK : CLASS_LIGHT];
  if (highContrast) classes.push(CLASS_HIGH_CONTRAST);
  return classes;
}

/** The colour as CSS, with the alpha channel dropped: the body is never translucent. */
export function opaqueCss({ red, green, blue }: Rgb): string {
  const channel = (value: number): number => Math.min(255, Math.max(0, Math.round(value)));
  return `rgb(${channel(red)},${channel(green)},${channel(blue)})`;
}
