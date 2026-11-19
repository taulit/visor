import { describe, expect, it } from 'vitest';

import { githubRepo, isUuid, metadataProblem, releaseZipUrl } from '../src/lib/github-install.js';

describe('githubRepo', () => {
  it.each([
    ['https://github.com/taulit/visor-weather', 'https://github.com/taulit/visor-weather'],
    ['https://github.com/taulit/visor-weather/', 'https://github.com/taulit/visor-weather'],
    ['https://github.com/a-b/c.d_e', 'https://github.com/a-b/c.d_e'],
  ])('takes %s', (url, repo) => {
    expect(githubRepo(url)).toBe(repo);
  });

  it.each([
    'http://github.com/taulit/visor-weather',
    'https://github.com.evil.org/taulit/visor',
    'https://evil.org/github.com/taulit/visor',
    'https://github.com/taulit',
    'https://github.com/taulit/visor/releases',
    'https://github.com/taulit/..',
    'https://user@github.com/taulit/visor',
    null,
    42,
  ])('refuses %s', url => {
    expect(githubRepo(url)).toBeNull();
  });
});

describe('isUuid', () => {
  it('takes the UUID of a module', () => {
    expect(isUuid('visor-weather@taulit.github.io')).toBe(true);
  });

  it.each(['../evil@x', 'a/b@c', 'no-at-sign', '@x', 'a@..', '', 'a@b c'])('refuses %s', uuid => {
    expect(isUuid(uuid)).toBe(false);
  });
});

describe('releaseZipUrl', () => {
  it('points at the asset of the latest release', () => {
    expect(releaseZipUrl('https://github.com/taulit/visor-weather', 'w@t')).toBe(
      'https://github.com/taulit/visor-weather/releases/latest/download/w@t.shell-extension.zip',
    );
  });
});

describe('metadataProblem', () => {
  const meta = (value: object) => JSON.stringify(value);

  it('accepts the module asked for', () => {
    expect(metadataProblem(meta({ uuid: 'w@t', visor: { api: 1 } }), 'w@t')).toBeNull();
  });

  it('refuses another extension, one without visor, and no JSON', () => {
    expect(metadataProblem(meta({ uuid: 'x@t', visor: {} }), 'w@t')).toMatch(/not w@t/);
    expect(metadataProblem(meta({ uuid: 'w@t' }), 'w@t')).toMatch(/no module/);
    expect(metadataProblem('{', 'w@t')).toMatch(/not JSON/);
  });
});
