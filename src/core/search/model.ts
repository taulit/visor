/**
 * Small pure pieces of the search: the locale, completing a command keyword, the line below a
 * converted amount, the cache file of the rates, and moving the selection. No gi:// imports.
 */

import { convert, type CurrencyQuery, type Rates } from './rates.js';

// --- Locale ------------------------------------------------------------------------------------

export interface LocaleInfo {
  /** BCP-47 tag for `Intl`, such as `de-DE`. Undefined leaves the choice to the runtime. */
  locale: string | undefined;
  /** ISO 3166 region such as `DE`, or null when the locale names none. */
  region: string | null;
}

/** Reads the first usable entry of `GLib.get_language_names()`, e.g. `de_DE.UTF-8`. */
export function localeOf(names: readonly string[]): LocaleInfo {
  for (const name of names) {
    const match = /^([a-z]{2,3})(?:_([A-Z]{2}))?(?:[.@]|$)/.exec(name);
    if (!match) continue;
    const [, language, region] = match;
    return { locale: region ? `${language}-${region}` : language, region: region ?? null };
  }
  return { locale: undefined, region: null };
}

// --- Commands ----------------------------------------------------------------------------------

export interface Completion {
  /** Index into the list of commands. */
  index: number;
  /** The keyword the typed text is the beginning of. */
  keyword: string;
}

/**
 * The commands a single typed word is the beginning of: `tim` offers `timer`. A complete keyword
 * is not a completion, and neither is anything with a space in it.
 */
export function completions(text: string, commands: readonly (readonly string[])[]): Completion[] {
  const word = text.trim().toLowerCase();
  if (word === '' || /\s/.test(word)) return [];
  const result: Completion[] = [];
  for (const [index, keywords] of commands.entries()) {
    const keyword = keywords.find(k => k.length > word.length && k.toLowerCase().startsWith(word));
    if (keyword !== undefined) result.push({ index, keyword });
  }
  return result;
}

// --- Currency ----------------------------------------------------------------------------------

/** `1 USD = 0,9249 EUR · 13 Nov`: the rate behind a conversion and the day the rates are from. */
export function rateLine(query: CurrencyQuery, rates: Rates, locale?: string): string | null {
  const rate = convert(1, query.from, query.to, rates.rates);
  if (rate === null) return null;
  const number = new Intl.NumberFormat(locale, { maximumSignificantDigits: 5 }).format(rate);
  const day = new Date(`${rates.date}T00:00:00Z`);
  const date = Number.isNaN(day.getTime())
    ? rates.date
    : new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
        day,
      );
  return `1 ${query.from} = ${number} ${query.to} · ${date}`;
}

export interface RatesCache extends Rates {
  /** When the file was downloaded, in milliseconds since the epoch. */
  fetched: number;
}

/** Reads the cache file. Null for anything that is not what serializeRatesCache() writes. */
export function parseRatesCache(json: string): RatesCache | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const { fetched, date, rates } = data as Record<string, unknown>;
  if (typeof fetched !== 'number' || !Number.isFinite(fetched)) return null;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (typeof rates !== 'object' || rates === null) return null;
  const clean: Record<string, number> = {};
  for (const [code, value] of Object.entries(rates)) {
    if (!/^[A-Z]{3}$/.test(code) || typeof value !== 'number' || !(value > 0)) return null;
    if (!Number.isFinite(value)) return null;
    clean[code] = value;
  }
  if (clean.EUR !== 1 || Object.keys(clean).length < 2) return null;
  return { fetched, date, rates: clean };
}

export function serializeRatesCache(cache: RatesCache): string {
  return JSON.stringify({ fetched: cache.fetched, date: cache.date, rates: cache.rates });
}

// --- Selection ---------------------------------------------------------------------------------

/**
 * The key of the line that is selected after the list changed. `keys` are the lines that can be
 * chosen, in order. The first one is selected until the user picked another one; a line the user
 * picked stays selected as long as it exists.
 */
export function keepSelection(
  keys: readonly string[],
  current: string | null,
  picked: boolean,
): string | null {
  if (picked && current !== null && keys.includes(current)) return current;
  return keys[0] ?? null;
}

/** The key one step up or down from `current`. The ends do not wrap around. */
export function moveSelection(
  keys: readonly string[],
  current: string | null,
  step: 1 | -1,
): string | null {
  if (keys.length === 0) return null;
  const index = current === null ? -1 : keys.indexOf(current);
  if (index < 0) return keys[0] ?? null;
  return keys[Math.min(keys.length - 1, Math.max(0, index + step))] ?? null;
}
