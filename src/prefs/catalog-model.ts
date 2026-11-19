// The module catalog as the settings window uses it: reading catalog.json
// (the snapshot that ships with Visor, or one fetched from the network, which
// is not trusted), picking the text for the language of the user and saying
// what the button of a module does. No gi:// imports, so Vitest can load it.
import { API_VERSION, type Slot } from '../api.js';
import { buildIndex, type Searchable, type SearchIndex } from '../lib/catalog-search.js';
import { githubRepo } from '../lib/github-install.js';

/** A text by language: `en` always, others such as `de` or `pt_BR` when the author wrote them. */
export type Text = Record<string, string>;

export interface CatalogModule extends Searchable {
  summary: Text;
  description: Text;
  shows: Text | null;
  appears: Text | null;
  author: { name: string; url: string | null };
  repo: string;
  /** Number of the extension in the GNOME store, null while it is not released there. */
  egoId: number | null;
  license: string;
  /** Paths below `modules/` of the catalog. */
  screenshots: string[];
}

/** More than the catalog will hold for a long time; a larger file is not read. */
export const MAX_CATALOG_BYTES = 1024 * 1024;
const MAX_MODULES = 500;

const UUID = /^[A-Za-z0-9._-]{1,120}@[A-Za-z0-9._-]{1,120}$/;
const LANGUAGE = /^[a-z]{2}(_[A-Z]{2})?$/;
const SCREENSHOT = /^[A-Za-z0-9._@-]{1,250}\/screenshot-[1-4]\.png$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const SLOTS: readonly Slot[] = ['now', 'ahead', 'dock'];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A string of at most `max` characters without control characters, or null. */
function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const clean = value.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f‪-‮⁦-⁩]/g, '').trim();
  return clean && clean.length <= max ? clean : null;
}

/** A text by language with at least `en`, or null. */
function texts(value: unknown, max: number): Text | null {
  if (!isObject(value)) return null;
  const out: Text = {};
  for (const [language, raw] of Object.entries(value)) {
    const clean = text(raw, max);
    if (LANGUAGE.test(language) && clean) out[language] = clean;
  }
  return out['en'] ? out : null;
}

/** An https address, or null. */
function link(value: unknown): string | null {
  const clean = text(value, 300);
  return clean && /^https:\/\/[^\s<>"']+$/.test(clean) ? clean : null;
}

function words(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 200) return null;
  const out = value.filter((word): word is string => typeof word === 'string' && word.length <= 60);
  return out.length === value.length ? out : null;
}

function index(value: unknown): SearchIndex | null {
  if (!isObject(value)) return null;
  const name = words(value['name']);
  const tags = words(value['tags']);
  const summary = words(value['summary']);
  const author = words(value['author']);
  return name && tags && summary && author ? { name, tags, summary, author } : null;
}

function module(value: unknown): CatalogModule | null {
  if (!isObject(value)) return null;
  const uuid = text(value['uuid'], 250);
  const name = text(value['name'], 40);
  const summary = texts(value['summary'], 120);
  const description = texts(value['description'], 1200);
  const author = isObject(value['author']) ? text(value['author']['name'], 60) : null;
  const repo = link(value['repo']);
  const license = text(value['license'], 40);
  const slot = SLOTS.find(known => known === value['slot']);
  const status = value['status'] === 'featured' ? 'featured' : 'listed';
  const added = text(value['added'], 10);
  const screenshots = Array.isArray(value['screenshots'])
    ? value['screenshots'].filter(
        (path): path is string => typeof path === 'string' && SCREENSHOT.test(path),
      )
    : [];
  if (!uuid || !UUID.test(uuid) || !name || !summary || !description || !author) return null;
  if (!repo || !license || !slot || !added || !DAY.test(added)) return null;
  // A module for another API would be refused by this Visor; it is not offered.
  if (value['api'] !== API_VERSION) return null;
  // Pictures of a module live in its own folder.
  const own = screenshots.filter(path => path.startsWith(`${uuid}/`)).slice(0, 4);
  const tags = (Array.isArray(value['tags']) ? value['tags'] : [])
    .filter((tag): tag is string => typeof tag === 'string' && /^[a-z]{1,20}$/.test(tag))
    .slice(0, 3);
  const egoId = value['ego_id'];
  return {
    uuid,
    name,
    slot,
    tags,
    status,
    verified: value['verified'] === true,
    added,
    index:
      index(value['index']) ??
      buildIndex({ name: [name], tags, summary: Object.values(summary), author: [author] }),
    summary,
    description,
    shows: texts(value['shows'], 1200),
    appears: texts(value['appears'], 1200),
    author: { name: author, url: isObject(value['author']) ? link(value['author']['url']) : null },
    repo,
    egoId: typeof egoId === 'number' && Number.isInteger(egoId) && egoId > 0 ? egoId : null,
    license,
    screenshots: own,
  };
}

/**
 * The modules of a catalog.json. Null when the text is no catalog of a
 * version this Visor reads; an entry that is not sound is left out, and of
 * two with the same UUID the first stays.
 */
export function parseCatalog(json: string): CatalogModule[] | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isObject(data) || data['version'] !== 1 || !Array.isArray(data['modules'])) return null;
  const seen = new Set<string>();
  const out: CatalogModule[] = [];
  for (const raw of data['modules'].slice(0, MAX_MODULES)) {
    const entry = module(raw);
    if (!entry || seen.has(entry.uuid)) continue;
    seen.add(entry.uuid);
    out.push(entry);
  }
  return out;
}

/**
 * The text in the first language of the user that it has. `languages` is the
 * list of GLib.get_language_names(): 'de_DE.UTF-8', 'de_DE', 'de', 'C'.
 */
export function localized(value: Text, languages: readonly string[]): string {
  for (const language of languages) {
    const plain = language.split(/[.@]/)[0] ?? '';
    const found = value[plain] ?? value[plain.split('_')[0] ?? ''];
    if (found) return found;
  }
  return value['en'] ?? '';
}

/**
 * The address the catalog is fetched from, without a slash at its end. Null
 * unless it is https, or http for this machine (the tests).
 */
export function catalogBase(setting: string): string | null {
  const match =
    /^(https:\/\/[^\s/?#]+|http:\/\/(127\.0\.0\.1|localhost)(:\d+)?)(\/[^\s?#]*)?$/.exec(
      setting.trim(),
    );
  return match ? match[0].replace(/\/+$/, '') : null;
}

export const catalogUrl = (base: string): string => `${base}/catalog.json`;
/** `path` is a screenshot path of a parsed module, so it is safe to append. */
export const pictureUrl = (base: string, path: string): string =>
  `${base}/modules/${path.split('/').map(encodeURIComponent).join('/')}`;

/**
 * What the button of a module does: nothing when it is installed, nothing
 * when it is not in the GNOME store yet, otherwise it installs.
 */
export function installState(
  entry: CatalogModule,
  installed: ReadonlySet<string>,
): 'installed' | 'available' | 'unreleased' {
  if (installed.has(entry.uuid)) return 'installed';
  return entry.egoId !== null || githubRepo(entry.repo) !== null ? 'available' : 'unreleased';
}
