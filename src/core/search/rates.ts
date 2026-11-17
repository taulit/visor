/**
 * Currency conversion for the search field, pure logic: no network and no files.
 * The rates come from the European Central Bank's `eurofxref-daily.xml`.
 */

import { readNumber, separatorsFor } from './calc.js';

export interface Rates {
  date: string;
  /** Units of the currency per 1 EUR, `EUR` itself included. */
  rates: Record<string, number>;
}

export interface CurrencyQuery {
  amount: number;
  from: string;
  to: string;
}

/** The currencies the ECB publishes a reference rate for (BGN left in 2026 with the euro). */
// prettier-ignore
const ECB_CURRENCIES = [
  'EUR', 'USD', 'JPY', 'CZK', 'DKK', 'GBP', 'HUF', 'PLN', 'RON', 'SEK',
  'CHF', 'ISK', 'NOK', 'TRY', 'AUD', 'BRL', 'CAD', 'CNY', 'HKD', 'IDR',
  'ILS', 'INR', 'KRW', 'MXN', 'MYR', 'NZD', 'PHP', 'SGD', 'THB', 'ZAR',
];

const SYMBOLS: Record<string, string> = {
  $: 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'JPY',
  '₺': 'TRY',
  '₹': 'INR',
  '₩': 'KRW',
  zł: 'PLN',
  'fr.': 'CHF',
  fr: 'CHF',
};

// `kr` (SEK, NOK, DKK, ISK) is ambiguous and deliberately missing.

// --- ECB file ----------------------------------------------------------------------------------

/** Read the attributes of one tag, both `a='x'` and `a="x"`. */
function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [, name, , value] of tag.matchAll(/([\w:-]+)\s*=\s*(['"])(.*?)\2/g)) {
    result[name as string] = value as string;
  }
  return result;
}

/** Parse the daily ECB file. Returns null for anything malformed or empty. */
export function parseRatesXml(xml: string): Rates | null {
  let date: string | null = null;
  const rates: Record<string, number> = { EUR: 1 };
  let count = 0;

  for (const [, tag] of xml.matchAll(/<Cube\b([^>]*?)\/?>/g)) {
    const attrs = attributes(tag as string);
    if (attrs.time !== undefined) {
      if (date !== null || !/^\d{4}-\d{2}-\d{2}$/.test(attrs.time)) return null;
      date = attrs.time;
    } else if (attrs.currency !== undefined || attrs.rate !== undefined) {
      const { currency, rate } = attrs;
      if (!currency || !/^[A-Z]{3}$/.test(currency) || !rate || !/^\d+(\.\d+)?$/.test(rate)) {
        return null;
      }
      const value = Number(rate);
      if (!(value > 0) || !Number.isFinite(value)) return null;
      rates[currency] = value;
      count++;
    }
  }
  return date !== null && count > 0 ? { date, rates } : null;
}

/** Convert through EUR. Null when either currency has no rate. */
export function convert(
  amount: number,
  from: string,
  to: string,
  rates: Record<string, number>,
): number | null {
  const source = rates[from.toUpperCase()];
  const target = rates[to.toUpperCase()];
  if (!source || !target || !Number.isFinite(amount)) return null;
  return (amount / source) * target;
}

// --- Query -------------------------------------------------------------------------------------

/** Read a currency symbol or ISO code at `pos`; returns the code and the end index. */
function readCurrency(text: string, pos: number): { code: string; end: number } | null {
  const rest = text.slice(pos);
  const lower = rest.toLowerCase();
  for (const symbol of Object.keys(SYMBOLS)) {
    if (!lower.startsWith(symbol)) continue;
    // Letter symbols (`zł`, `Fr`) must stand alone, or `fr` would match inside `friday`.
    if (/\p{L}$/u.test(symbol) && /^\p{L}/u.test(lower.slice(symbol.length))) continue;
    return { code: SYMBOLS[symbol] as string, end: pos + symbol.length };
  }
  const word = /^[a-z]{3}(?![\p{L}\d])/iu.exec(rest)?.[0];
  const code = word?.toUpperCase();
  if (word && code && ECB_CURRENCIES.includes(code)) return { code, end: pos + word.length };
  return null;
}

const CONNECTOR = /^\s*(?:->|→|=|(?:in|into|to|nach)(?![\p{L}\d]))/iu;

/**
 * Parse `100 usd in eur`, `100 usd eur`, `100$ €`, `€100 in usd`, `12,50 € in usd`, `50 chf`.
 * Without a target the home currency is used (USD, or EUR if the home currency is USD, when the
 * source already is the home currency). The number follows the locale's notation.
 */
export function parseCurrencyQuery(
  input: string,
  homeCurrency: string,
  locale?: string,
): CurrencyQuery | null {
  const text = input.trim();
  const skipSpace = (pos: number): number => pos + (/^\s*/.exec(text.slice(pos))?.[0].length ?? 0);
  const seps = separatorsFor(locale);

  // Either `€100` / `usd 100` or `100 €` / `100 usd`.
  let from: string;
  let amount: number;
  let pos: number;
  const leading = readCurrency(text, 0);
  if (leading) {
    const number = readNumber(text, skipSpace(leading.end), seps);
    if (!number) return null;
    amount = number.value;
    from = leading.code;
    pos = number.end;
  } else {
    const number = readNumber(text, 0, seps);
    const currency = number && readCurrency(text, skipSpace(number.end));
    if (!number || !currency) return null;
    amount = number.value;
    from = currency.code;
    pos = currency.end;
  }

  const connector = CONNECTOR.exec(text.slice(pos))?.[0].length ?? 0;
  pos = skipSpace(pos + connector);
  let to: string;
  if (pos === text.length) {
    if (connector > 0) return null; // `100 usd in` with nothing after it
    const home = homeCurrency.toUpperCase();
    to = from !== home ? home : home === 'USD' ? 'EUR' : 'USD';
  } else {
    const target = readCurrency(text, pos);
    if (!target || target.end !== text.length) return null;
    to = target.code;
  }
  return from === to ? null : { amount, from, to };
}

// --- Home currency, refresh, formatting --------------------------------------------------------

// Only the ECB currencies; every other region, the euro-area countries included, falls back to EUR.
// prettier-ignore
const REGION_CURRENCY: Record<string, string> = {
  US: 'USD', JP: 'JPY', CZ: 'CZK', DK: 'DKK', GB: 'GBP', GG: 'GBP', JE: 'GBP', IM: 'GBP',
  HU: 'HUF', PL: 'PLN', RO: 'RON', SE: 'SEK', CH: 'CHF', LI: 'CHF', IS: 'ISK', NO: 'NOK',
  TR: 'TRY', AU: 'AUD', BR: 'BRL', CA: 'CAD', CN: 'CNY', HK: 'HKD', ID: 'IDR', IL: 'ILS',
  IN: 'INR', KR: 'KRW', MX: 'MXN', MY: 'MYR', NZ: 'NZD', PH: 'PHP', SG: 'SGD', TH: 'THB',
  ZA: 'ZAR',
};

/** The currency for an ISO 3166 region such as `DE`, `US` or `CH`; EUR if it is not an ECB one. */
export function homeCurrencyForRegion(region: string): string {
  return REGION_CURRENCY[region.toUpperCase()] ?? 'EUR';
}

const DAY_MS = 86_400_000;

/** At most one fetch per UTC day: true if there was none yet or the last one was on another day. */
export function shouldRefresh(lastFetchMs: number | null, nowMs: number): boolean {
  if (lastFetchMs === null) return true;
  return Math.floor(lastFetchMs / DAY_MS) !== Math.floor(nowMs / DAY_MS);
}

export function formatMoney(value: number, currency: string, locale?: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
}
