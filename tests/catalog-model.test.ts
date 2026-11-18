import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  catalogBase,
  catalogUrl,
  installState,
  localized,
  parseCatalog,
  pictureUrl,
} from '../src/prefs/catalog-model.js';

const shipped = readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8');
const entry = (): Record<string, unknown> => ({
  uuid: 'visor-weather@example.org',
  name: 'Weather',
  summary: { en: 'The weather of the next hours.', de: 'Das Wetter der nächsten Stunden.' },
  description: { en: 'Shows the weather of the next hours at your place.' },
  slot: 'ahead',
  author: { name: 'Someone', url: 'https://example.org/someone' },
  repo: 'https://example.org/visor-weather',
  ego_id: 1234,
  license: 'MIT',
  api: 1,
  tags: ['system'],
  icon: 'visor-weather@example.org/icon.svg',
  screenshots: ['visor-weather@example.org/screenshot-1.png'],
  status: 'listed',
  verified: false,
  added: '2026-11-18',
});
const catalog = (...modules: unknown[]): string => JSON.stringify({ version: 1, modules });
const only = (change: (e: Record<string, unknown>) => void) => {
  const e = entry();
  change(e);
  return parseCatalog(catalog(e));
};

describe('parseCatalog', () => {
  it('reads the snapshot that ships with Visor', () => {
    const modules = parseCatalog(shipped);
    expect(modules?.length).toBeGreaterThan(0);
    expect(modules?.[0]).toMatchObject({ uuid: 'visor-t3@taulit.github.io', slot: 'now' });
  });
  it('reads an entry', () => {
    expect(parseCatalog(catalog(entry()))?.[0]).toMatchObject({
      name: 'Weather',
      egoId: 1234,
      verified: false,
      shows: null,
      author: { name: 'Someone', url: 'https://example.org/someone' },
      screenshots: ['visor-weather@example.org/screenshot-1.png'],
    });
  });
  it('builds the index when the catalog has none', () => {
    expect(parseCatalog(catalog(entry()))?.[0]?.index.name).toEqual(['weather']);
  });
  it('refuses what is no catalog of version 1', () => {
    expect(parseCatalog('')).toBeNull();
    expect(parseCatalog('<html>')).toBeNull();
    expect(parseCatalog('[]')).toBeNull();
    expect(parseCatalog(JSON.stringify({ version: 2, modules: [] }))).toBeNull();
    expect(parseCatalog(JSON.stringify({ version: 1 }))).toBeNull();
  });
  it('leaves out an entry that is not sound and keeps the others', () => {
    const broken = { ...entry(), uuid: 'no uuid' };
    expect(parseCatalog(catalog(broken, 5, null, entry()))?.map(m => m.name)).toEqual(['Weather']);
  });
  it('leaves out a module for another API', () => {
    expect(only(e => (e.api = 2))).toEqual([]);
  });
  it('keeps the first of two with the same UUID', () => {
    const twin = { ...entry(), name: 'Twin' };
    expect(parseCatalog(catalog(entry(), twin))?.map(m => m.name)).toEqual(['Weather']);
  });
  it('wants https for links', () => {
    expect(only(e => (e.repo = 'javascript:alert(1)'))).toEqual([]);
    expect(only(e => (e.repo = 'http://example.org'))).toEqual([]);
    expect(only(e => (e.author = { name: 'A', url: 'file:///etc/passwd' }))?.[0]?.author.url).toBe(
      null,
    );
  });
  it('takes only pictures in the folder of the module', () => {
    const modules = only(
      e =>
        (e.screenshots = [
          '../../etc/passwd',
          'visor-other@example.org/screenshot-1.png',
          'visor-weather@example.org/screenshot-2.png',
          'visor-weather@example.org/screenshot-9.png',
          'https://evil.example/screenshot-1.png',
          7,
        ]),
    );
    expect(modules?.[0]?.screenshots).toEqual(['visor-weather@example.org/screenshot-2.png']);
  });
  it('drops control characters and text that turns the direction', () => {
    expect(only(e => (e.name = 'Wea‮ther\u0007'))?.[0]?.name).toBe('Weather');
  });
  it('refuses a text that is too long', () => {
    expect(only(e => (e.name = 'x'.repeat(41)))).toEqual([]);
  });
  it('treats a store number that is none as not released', () => {
    expect(only(e => (e.ego_id = '12'))?.[0]?.egoId).toBeNull();
    expect(only(e => (e.ego_id = -1))?.[0]?.egoId).toBeNull();
    expect(only(e => (e.ego_id = null))?.[0]?.egoId).toBeNull();
  });
  it('reads at most 500 modules', () => {
    const many = Array.from({ length: 600 }, (_, i) => ({ ...entry(), uuid: `m${i}@example.org` }));
    expect(parseCatalog(catalog(...many))?.length).toBe(500);
  });
});

describe('localized', () => {
  const text = { en: 'Hello', de: 'Hallo', pt_BR: 'Olá' };
  it('takes the language of the user', () => {
    expect(localized(text, ['de_DE.UTF-8', 'de_DE', 'de', 'C'])).toBe('Hallo');
    expect(localized(text, ['pt_BR.UTF-8', 'pt_BR', 'pt', 'C'])).toBe('Olá');
  });
  it('falls back to the next language, then to English', () => {
    expect(localized(text, ['fr_FR.UTF-8', 'fr', 'de', 'C'])).toBe('Hallo');
    expect(localized(text, ['ja_JP.UTF-8', 'ja', 'C'])).toBe('Hello');
    expect(localized(text, [])).toBe('Hello');
  });
});

describe('addresses', () => {
  it('accepts https and this machine', () => {
    expect(catalogBase('https://visor.taulit.com/catalog/')).toBe(
      'https://visor.taulit.com/catalog',
    );
    expect(catalogBase(' https://example.org ')).toBe('https://example.org');
    expect(catalogBase('http://127.0.0.1:8080/x')).toBe('http://127.0.0.1:8080/x');
  });
  it('refuses everything else', () => {
    for (const bad of ['', 'http://example.org', 'ftp://x', 'file:///tmp', 'https://x/?q=1', 'x'])
      expect(catalogBase(bad)).toBeNull();
  });
  it('builds the addresses of the catalog and of a picture', () => {
    expect(catalogUrl('https://x.org/c')).toBe('https://x.org/c/catalog.json');
    expect(pictureUrl('https://x.org/c', 'visor-t3@taulit.github.io/screenshot-1.png')).toBe(
      'https://x.org/c/modules/visor-t3%40taulit.github.io/screenshot-1.png',
    );
  });
});

describe('installState', () => {
  const [module] = parseCatalog(catalog(entry()))!;
  it('says installed, available or not released', () => {
    expect(installState(module!, new Set(['visor-weather@example.org']))).toBe('installed');
    expect(installState(module!, new Set())).toBe('available');
    expect(installState({ ...module!, egoId: null }, new Set())).toBe('unreleased');
  });
});
