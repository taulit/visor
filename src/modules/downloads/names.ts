/** File names and sizes of running downloads. Pure logic. */

export const PARTIAL_SUFFIXES = ['.part', '.crdownload', '.download', '.partial'];

const suffixOf = (name: string): string | undefined => {
  const lower = name.toLowerCase();
  return PARTIAL_SUFFIXES.find((suffix: string) => lower.endsWith(suffix));
};

/** Whether the file is an unfinished download of Firefox, Chrome, Safari or similar. */
export const isPartial = (name: string): boolean => suffixOf(name) !== undefined;

/**
 * The name the download will have when it is done: the partial suffix removed. Empty when that is
 * not known: Chrome calls the file `Unconfirmed 123456.crdownload` until the real name is set.
 * (Firefox also creates an empty `name.ext` next to `name.ext.part`; callers have to skip that
 * file, since it cannot be told from a finished one by its name.)
 */
export function finalName(name: string): string {
  const suffix = suffixOf(name);
  if (suffix === undefined) return name;
  const base = name.slice(0, name.length - suffix.length);
  return base === '' || /^Unconfirmed \d+$/i.test(base) ? '' : base;
}

// --- Sizes (decimal units, as GNOME Files shows them) ------------------------------------------

const UNITS = ['kB', 'MB', 'GB', 'TB'];

/** The unit index (0 for kB) a size is shown in, after rounding: 999.7 kB is 1.0 MB. */
function unitIndex(bytes: number): number {
  let value = bytes / 1000;
  let index = 0;
  while (index < UNITS.length - 1 && Math.round(value) >= 1000) {
    value /= 1000;
    index++;
  }
  return index;
}

/** One decimal below 10, none from 10 up, and a plain 0. */
function formatScaled(value: number, locale?: string): string {
  const decimals = Math.round(value * 10) / 10 < 10 && value !== 0 ? 1 : 0;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

const clean = (bytes: number): number => (Number.isFinite(bytes) ? Math.max(0, bytes) : 0);

/** `0 kB`, `1.2 GB`, `14 MB`; the decimal separator follows the locale. */
export function formatBytes(bytes: number, locale?: string): string {
  const size = clean(bytes);
  const index = unitIndex(size);
  return `${formatScaled(size / 1000 ** (index + 1), locale)} ${UNITS[index]}`;
}
