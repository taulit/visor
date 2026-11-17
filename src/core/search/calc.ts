/**
 * The calculator behind the search field: a small Pratt parser, no eval.
 * Pure logic. Uses only `Intl`, which exists both in GJS and in Node.
 */

export type CalcResult = { ok: true; value: number } | { ok: false };

export interface Separators {
  decimal: string;
  group: string;
}

/** The decimal and group separators of a BCP-47 locale (default: the runtime's). */
export function separatorsFor(locale?: string): Separators {
  const parts = new Intl.NumberFormat(locale).formatToParts(1234567.5);
  const decimal = parts.find((p: Intl.NumberFormatPart) => p.type === 'decimal')?.value ?? '.';
  const group =
    parts.find((p: Intl.NumberFormatPart) => p.type === 'group')?.value ??
    (decimal === '.' ? ',' : '.');
  return { decimal, group };
}

// --- Reading numbers ---------------------------------------------------------------------------

// `1 234`, `1 234 567`: a space, no-break space, thin space or narrow no-break space groups.
const SPACE_GROUPED = /^\d{1,3}(?:[\u00a0\u202f\u2009 ]\d{3}(?!\d))+/;

const isDigit = (ch: string | undefined): boolean => ch !== undefined && ch >= '0' && ch <= '9';

const isGrouped = (digits: string, mark: string): boolean =>
  new RegExp(`^[1-9]\\d{0,2}(?:[${mark}]\\d{3})+$`).test(digits);

/**
 * Turn digits with `.` and `,` into a number. The locale decides when a lone mark is ambiguous:
 *  - both marks present: the last one is the decimal separator (`1.234,5`, `1,234.5`);
 *  - one mark repeated: it is a group separator and must group by three (`1.234.567`);
 *  - one mark once: a decimal separator, except when it is the locale's group separator and
 *    separates exactly three digits from a 1-3 digit head without a leading zero.
 *    So in German `1.234` is 1234, but `2.5`, `1.2345` and `0.123` are decimals,
 *    and in English `1,234` is 1234 while `1,5` is 1.5.
 */
function interpretNumber(raw: string, { group }: Separators): number | null {
  const marks = raw.match(/[.,]/g) ?? [];
  if (marks.length === 0) return Number(raw);

  if (new Set(marks).size === 2) {
    const decimal = raw[Math.max(raw.lastIndexOf('.'), raw.lastIndexOf(','))] as string;
    const grouping = decimal === '.' ? ',' : '.';
    const [head, fraction, ...extra] = raw.split(decimal) as [string, string, ...string[]];
    if (extra.length > 0 || !isGrouped(head, grouping)) return null;
    return Number(`${head.replaceAll(grouping, '')}.${fraction}`);
  }

  const mark = marks[0] as string;
  if (marks.length > 1) return isGrouped(raw, mark) ? Number(raw.replaceAll(mark, '')) : null;

  const [head, fraction] = raw.split(mark) as [string, string];
  const isGroup = mark === group && /^[1-9]\d{0,2}$/.test(head) && fraction.length === 3;
  return Number(isGroup ? head + fraction : `${head}.${fraction}`);
}

/** Read a number in the notation of `seps` starting at `start`; `end` is the index after it. */
export function readNumber(
  text: string,
  start: number,
  seps: Separators,
): { value: number; end: number } | null {
  const spaced = SPACE_GROUPED.exec(text.slice(start))?.[0] ?? '';
  let raw = spaced.replace(/\D/g, '');
  let end = start + spaced.length;
  for (;;) {
    const ch = text[end];
    if (isDigit(ch) || ((ch === '.' || ch === ',') && isDigit(text[end + 1]))) {
      raw += ch;
      end++;
    } else break;
  }
  if (!/\d/.test(raw)) return null;
  const value = interpretNumber(raw, seps);
  return value !== null && Number.isFinite(value) ? { value, end } : null;
}

// --- Tokens ------------------------------------------------------------------------------------

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'op'; value: '+' | '-' | '*' | '/' | '^' | '%' }
  | { kind: 'paren'; value: '(' | ')' }
  | { kind: 'word'; value: string };

const OPERATORS: Record<string, '+' | '-' | '*' | '/' | '^' | '%'> = {
  '+': '+',
  '-': '-',
  '−': '-',
  '–': '-',
  '*': '*',
  '×': '*',
  '·': '*',
  '/': '/',
  '÷': '/',
  '^': '^',
  '%': '%',
};

function tokenize(input: string, seps: Separators): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i] as string;
    if (/\s/.test(ch)) {
      i++;
    } else if (isDigit(ch) || ((ch === '.' || ch === ',') && isDigit(input[i + 1]))) {
      const number = readNumber(input, i, seps);
      if (!number) return null;
      tokens.push({ kind: 'num', value: number.value });
      i = number.end;
    } else if (ch in OPERATORS) {
      tokens.push({ kind: 'op', value: OPERATORS[ch] as '+' });
      i++;
    } else if (ch === '(' || ch === ')') {
      tokens.push({ kind: 'paren', value: ch });
      i++;
    } else {
      const word = /^\p{L}+/u.exec(input.slice(i))?.[0];
      if (!word) return null;
      tokens.push({ kind: 'word', value: word.toLowerCase() });
      i += word.length;
    }
  }
  return tokens;
}

// --- Parsing and evaluating --------------------------------------------------------------------

/** A value, remembering that it was written as a percentage (`5%` is 0.05, flagged). */
interface Val {
  v: number;
  pct: boolean;
}

class CalcError extends Error {}

const CONSTANTS: Record<string, number> = { pi: Math.PI, π: Math.PI, e: Math.E };

// Trig results this close to zero are floating-point noise (`sin(pi)` is 1.2e-16).
const noiseless = (x: number): number => (Math.abs(x) < 1e-14 ? 0 : x);

const FUNCTIONS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt,
  sin: (x: number) => noiseless(Math.sin(x)),
  cos: (x: number) => noiseless(Math.cos(x)),
  tan: (x: number) => noiseless(Math.tan(x)),
  log: Math.log10,
  ln: Math.log,
  abs: Math.abs,
  round: Math.round,
};

// Binding powers. Unary minus sits between `*` and `^`, so `-2^2` is -4 and `2*-3` works.
const BP_ADD = 10;
const BP_MUL = 20;
const BP_NEG = 30;
const BP_POW = 40;
const BP_PERCENT = 50;

function infixPower(token: Token | undefined): number | null {
  if (token?.kind === 'op') {
    switch (token.value) {
      case '+':
      case '-':
        return BP_ADD;
      case '*':
      case '/':
        return BP_MUL;
      case '^':
        return BP_POW;
      case '%':
        return BP_PERCENT;
    }
  }
  if (token?.kind === 'word' && (token.value === 'of' || token.value === 'von')) return BP_MUL;
  return null;
}

function check(v: number): number {
  if (!Number.isFinite(v)) throw new CalcError();
  return v;
}

/** Evaluate `tokens`; `meaningful` tells whether more than a single value was written. */
function run(tokens: Token[]): { value: number; meaningful: boolean } {
  let pos = 0;
  let meaningful = false;

  const peek = (): Token | undefined => tokens[pos];
  const expectParen = (paren: '(' | ')'): void => {
    const token = tokens[pos++];
    if (token?.kind !== 'paren' || token.value !== paren) throw new CalcError();
  };

  function prefix(): Val {
    const token = tokens[pos++];
    if (token?.kind === 'num') return { v: token.value, pct: false };
    if (token?.kind === 'paren' && token.value === '(') {
      const inner = expression(0);
      expectParen(')');
      return inner;
    }
    if (token?.kind === 'op' && (token.value === '-' || token.value === '+')) {
      const operand = expression(BP_NEG);
      return { v: token.value === '-' ? -operand.v : operand.v, pct: false };
    }
    if (token?.kind === 'word') {
      const constant = CONSTANTS[token.value];
      if (constant !== undefined) return { v: constant, pct: false };
      const fn = FUNCTIONS[token.value];
      if (fn) {
        meaningful = true;
        expectParen('(');
        const argument = expression(0);
        expectParen(')');
        return { v: check(fn(argument.v)), pct: false };
      }
    }
    throw new CalcError();
  }

  function expression(rbp: number): Val {
    let left = prefix();
    for (;;) {
      const token = peek();
      const power = infixPower(token);
      if (power === null || power <= rbp) return left;
      pos++;
      meaningful = true;
      const op = token?.kind === 'op' ? token.value : 'of';
      if (op === '%') {
        left = { v: left.v / 100, pct: true };
        continue;
      }
      // `^` is right-associative: parse its right side one level lower.
      const right = expression(op === '^' ? power - 1 : power);
      left = binary(op, left, right);
    }
  }

  function binary(op: string, left: Val, right: Val): Val {
    switch (op) {
      case '+':
        // `a + b%` adds b percent of a.
        return {
          v: check(right.pct && !left.pct ? left.v * (1 + right.v) : left.v + right.v),
          pct: false,
        };
      case '-':
        return {
          v: check(right.pct && !left.pct ? left.v * (1 - right.v) : left.v - right.v),
          pct: false,
        };
      case '*':
        return { v: check(left.v * right.v), pct: false };
      case '/':
        if (right.v === 0) throw new CalcError();
        return { v: check(left.v / right.v), pct: false };
      case '^':
        return { v: check(left.v ** right.v), pct: false };
      default: // `20% of 80`: only a percentage may stand left of `of`
        if (!left.pct) throw new CalcError();
        return { v: check(left.v * right.v), pct: false };
    }
  }

  const result = expression(0);
  if (pos !== tokens.length) throw new CalcError();
  return { value: check(result.v), meaningful };
}

/** Parse and evaluate. `meaningful` is false for a lone number or constant. */
export function evaluate(
  input: string,
  locale?: string,
): { value: number; meaningful: boolean } | null {
  const tokens = tokenize(input, separatorsFor(locale));
  if (!tokens || tokens.length === 0) return null;
  try {
    return run(tokens);
  } catch (error) {
    if (error instanceof CalcError) return null;
    throw error;
  }
}

/** Evaluate an expression. Numbers are read in the notation of `locale`. */
export function calc(input: string, locale?: string): CalcResult {
  const result = evaluate(input, locale);
  return result ? { ok: true, value: result.value } : { ok: false };
}

/**
 * Locale number format with at most 10 significant digits (more for integers with more digits,
 * which stay exact), no trailing zeros, and scientific notation only from 1e15 on.
 */
export function formatResult(value: number, locale?: string): string {
  if (!Number.isFinite(value)) return String(value);
  const abs = Math.abs(value);
  if (abs >= 1e15) {
    return new Intl.NumberFormat(locale, {
      notation: 'scientific',
      maximumSignificantDigits: 10,
    }).format(value);
  }
  const integerDigits = abs >= 1 ? Math.floor(Math.log10(abs)) + 1 : 1;
  return new Intl.NumberFormat(locale, {
    maximumSignificantDigits: Math.max(10, integerDigits),
  }).format(value === 0 ? 0 : value);
}
