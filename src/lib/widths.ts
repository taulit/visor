// Pure logic: sizes of the open panel in CSS pixels.

export type WidthSetting = 'compact' | 'normal' | 'wide';

const WIDTHS: Record<WidthSetting, number> = { compact: 800, normal: 960, wide: 1120 };

/** Width of the panel when only one of the two columns has content. */
export const ONE_COLUMN_WIDTH = 600;
/** Padding of the sheet on the left and on the right. */
export const SHEET_PADDING = 24;

/**
 * Panel width: the setting when both columns have content or a module view is
 * shown, else the narrow one-column width.
 */
export function sheetWidth(setting: string, twoColumns: boolean, inView = false): number {
  if (!twoColumns && !inView) return ONE_COLUMN_WIDTH;
  return WIDTHS[setting as WidthSetting] ?? WIDTHS.normal;
}

/**
 * Width of the left column for a panel width, as in a grid of `1.2fr 1fr`
 * whose second cell holds the gap, the hairline and the gap again.
 */
export function leftColumnWidth(panelWidth: number): number {
  return Math.round(((panelWidth - 2 * SHEET_PADDING) * 1.2) / 2.2);
}
