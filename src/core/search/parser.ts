/** Work out what the user typed into the search field. Pure logic. */

import { evaluate } from './calc.js';
import { evaluateQuick, type QuickContext, type QuickResult } from './quick/index.js';
import { parseCurrencyQuery } from './rates.js';

export interface Query {
  /** The input, trimmed. */
  text: string;
  /** Lower-cased words, for app and provider search. */
  terms: string[];
  /** The registered command the first word names, with the rest as arguments. */
  command: { index: number; keyword: string; args: string } | null;
  calc: { value: number } | null;
  currency: { amount: number; from: string; to: string } | null;
  /** A date, a time zone, units, a percentage: whatever the two above did not answer. */
  quick: QuickResult | null;
}

interface ParseOptions {
  /** The keywords of every registered command, e.g. `[['timer'], ['stoppuhr', 'stopwatch']]`. */
  commands: string[][];
  locale?: string;
  homeCurrency: string;
  /** The moment, the time zone and the words the quick answers are given in. */
  quick?: QuickContext;
}

function findCommand(text: string, commands: string[][]): Query['command'] {
  const [first = '', ...rest] = text.split(/\s+/);
  const word = first.toLowerCase();
  for (const [index, keywords] of commands.entries()) {
    const keyword = keywords.find((k: string) => k.toLowerCase() === word);
    if (keyword !== undefined) return { index, keyword, args: rest.join(' ') };
  }
  return null;
}

export function parseQuery(input: string, opts: ParseOptions): Query {
  const text = input.trim();
  if (text === '')
    return { text, terms: [], command: null, calc: null, currency: null, quick: null };

  const currency = parseCurrencyQuery(text, opts.homeCurrency, opts.locale);
  const result = currency ? null : evaluate(text, opts.locale);
  const calc = result?.meaningful ? { value: result.value } : null;
  return {
    text,
    terms: text.toLowerCase().split(/\s+/),
    command: findCommand(text, opts.commands),
    calc,
    currency,
    quick: currency || calc ? null : evaluateQuick(text, { locale: opts.locale, ...opts.quick }),
  };
}
