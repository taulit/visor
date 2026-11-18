// Entry point of the quick answers of the search field: dates and time zones
// first, then math with units. The evaluators come from Quick Launcher
// (https://github.com/julianullrich99/quick-launcher, MIT); phrases.ts adds the
// other languages. No GNOME imports: unit tested with Node.
import { evaluateDate, type DateContext } from './dates.js';
import { calculate, type CalcContext, type CalcResult } from './math.js';
import { normalizePhrase } from './phrases.js';

export type QuickResult = CalcResult;
export type QuickContext = CalcContext & DateContext;

function attempt(text: string, context: QuickContext): QuickResult | null {
  try {
    return evaluateDate(text, context) ?? calculate(text, context);
  } catch {
    return null;
  }
}

/** The answer to a date, time zone, unit or percentage question; null when the text is none. */
export function evaluateQuick(query: string, context: QuickContext = {}): QuickResult | null {
  const text = query.trim();
  if (!text || text.length > 200) return null;
  const direct = attempt(text, context);
  if (direct) return direct;

  const phrase = normalizePhrase(text);
  const result = phrase === null ? null : attempt(phrase, context);
  // What is shown as the question is what was typed, not what it was read as.
  return result && phrase !== null
    ? { ...result, expression: result.expression.replace(phrase, text.toLowerCase()) }
    : result;
}
