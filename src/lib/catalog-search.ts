// Copy of src/catalog-search.ts of https://github.com/taulit/visor-modules.
// Do not edit; update it with scripts/catalog-sync.sh.
// The search of the Visor module catalog. Pure TypeScript without imports, so
// the website and the settings window of Visor (GJS) use the same file, and
// the script that writes catalog.json builds the index with it.

export type Slot = 'now' | 'ahead' | 'dock';
export type Tag = 'media' | 'productivity' | 'development' | 'ai' | 'system';

/** Normalized words of one module, by the field they come from. */
export interface SearchIndex {
  name: string[];
  tags: string[];
  summary: string[];
  author: string[];
}

/** What the search needs of an entry of catalog.json. */
export interface Searchable {
  uuid: string;
  name: string;
  slot: Slot;
  tags: readonly string[];
  status: 'listed' | 'featured';
  verified: boolean;
  /** Day of the approval, YYYY-MM-DD. */
  added: string;
  index: SearchIndex;
}

export interface Filter {
  slot?: Slot;
  /** Every one of them. */
  tags?: readonly string[];
  /** Only modules of the makers of Visor. */
  verified?: boolean;
}

export type Sort = 'recommended' | 'new' | 'name';

/** Lower case, without accents, `ß` as `ss`. */
export function normalize(text: string): string {
  return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ß/g, 'ss');
}

/** The words of a text: runs of letters and digits of any script, normalized, each one once. */
export function tokenize(text: string): string[] {
  const words = normalize(text).match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...new Set(words)];
}

/** The index of one module. `texts` are its name, summary and so on in every language it has. */
export function buildIndex(fields: {
  name: readonly string[];
  tags: readonly string[];
  summary: readonly string[];
  author: readonly string[];
}): SearchIndex {
  const words = (texts: readonly string[]): string[] => tokenize(texts.join(' '));
  return {
    name: words(fields.name),
    tags: words(fields.tags),
    summary: words(fields.summary),
    author: words(fields.author),
  };
}

/** True when `a` becomes `b` with at most `max` single-character edits (also a swap of neighbours). */
export function within(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  // Damerau-Levenshtein (optimal string alignment) with three rows.
  let before: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        value = Math.min(value, before[j - 2]! + 1);
      current.push(value);
      best = Math.min(best, value);
    }
    if (best > max) return false;
    before = previous;
    previous = current;
  }
  return previous[b.length]! <= max;
}

/** How many typos a word of that length may have. */
const typos = (word: string): number => (word.length >= 8 ? 2 : word.length >= 4 ? 1 : 0);

/** How well one typed word fits one indexed word: 1 the same, less for a beginning or a typo, 0 not at all. */
function fit(typed: string, word: string): number {
  if (word === typed) return 1;
  if (word.startsWith(typed)) return 0.8;
  const allowed = typos(typed);
  if (allowed === 0) return 0;
  if (within(typed, word, allowed)) return 0.5;
  // A typo in the beginning of a longer word: "calender" finds "calendars".
  if (word.length > typed.length && within(typed, word.slice(0, typed.length), allowed)) return 0.4;
  return 0;
}

const WEIGHTS: readonly (readonly [keyof SearchIndex, number])[] = [
  ['name', 4],
  ['tags', 3],
  ['summary', 2],
  ['author', 1],
];

/**
 * How well a module fits the query: 0 when one of the typed words fits
 * nothing, otherwise higher is better. An empty query fits everything with 1.
 */
export function score(index: SearchIndex, query: string): number {
  const typed = tokenize(query);
  if (typed.length === 0) return 1;
  let total = 0;
  for (const word of typed) {
    let best = 0;
    for (const [field, weight] of WEIGHTS)
      for (const indexed of index[field]) best = Math.max(best, fit(word, indexed) * weight);
    if (best === 0) return 0;
    total += best;
  }
  return total;
}

const matches = (module: Searchable, filter: Filter): boolean =>
  (!filter.slot || module.slot === filter.slot) &&
  (!filter.verified || module.verified) &&
  (filter.tags ?? []).every(tag => module.tags.includes(tag));

function compare(sort: Sort): (a: Searchable, b: Searchable) => number {
  const byName = (a: Searchable, b: Searchable): number =>
    normalize(a.name).localeCompare(normalize(b.name)) || a.uuid.localeCompare(b.uuid);
  if (sort === 'name') return byName;
  if (sort === 'new') return (a, b) => b.added.localeCompare(a.added) || byName(a, b);
  const rank = (m: Searchable): number => (m.status === 'featured' ? 0 : m.verified ? 1 : 2);
  return (a, b) => rank(a) - rank(b) || byName(a, b);
}

/**
 * The modules that fit the query and the filter. With a query the best fit
 * comes first and `sort` decides between equal fits; without one `sort`
 * alone gives the order ('recommended': featured, then by the makers of
 * Visor, then by name).
 */
export function searchCatalog<T extends Searchable>(
  modules: readonly T[],
  query = '',
  filter: Filter = {},
  sort: Sort = 'recommended',
): T[] {
  const order = compare(sort);
  return modules
    .filter(module => matches(module, filter))
    .map(module => ({ module, fit: score(module.index, query) }))
    .filter(entry => entry.fit > 0)
    .sort((a, b) => b.fit - a.fit || order(a.module, b.module))
    .map(entry => entry.module);
}
