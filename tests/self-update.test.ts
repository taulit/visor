import { describe, expect, it } from 'vitest';

import {
  DEFAULT_UPDATE_URL,
  isNewer,
  metadataProblem,
  parseRelease,
  parseVersion,
} from '../src/lib/self-update.js';

const UUID = 'visor@taulit.github.io';
const answer = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    tag_name: 'v0.2.0',
    draft: false,
    prerelease: false,
    html_url: 'https://github.com/taulit/visor/releases/tag/v0.2.0',
    assets: [
      {
        name: `${UUID}.shell-extension.zip`,
        browser_download_url: `https://github.com/taulit/visor/releases/download/v0.2.0/${UUID}.shell-extension.zip`,
      },
    ],
    ...over,
  });

describe('versions', () => {
  it('reads plain versions with or without v', () => {
    expect(parseVersion('v1.2.3')).toEqual([1, 2, 3]);
    expect(parseVersion('0.10.0')).toEqual([0, 10, 0]);
    expect(parseVersion('1.0.0-rc.1')).toBeNull();
    expect(parseVersion(null)).toBeNull();
  });

  it('compares by number, not by text', () => {
    expect(isNewer('0.10.0', '0.9.9')).toBe(true);
    expect(isNewer('v1.0.0', '0.99.0')).toBe(true);
    expect(isNewer('0.2.0', '0.2.0')).toBe(false);
    expect(isNewer('0.1.9', '0.2.0')).toBe(false);
    expect(isNewer('nonsense', '0.1.0')).toBe(false);
  });
});

describe('parseRelease', () => {
  it('finds the version and the ZIP of the latest release', () => {
    expect(parseRelease(answer(), UUID, DEFAULT_UPDATE_URL)).toEqual({
      version: '0.2.0',
      zipUrl: `https://github.com/taulit/visor/releases/download/v0.2.0/${UUID}.shell-extension.zip`,
      page: 'https://github.com/taulit/visor/releases/tag/v0.2.0',
    });
  });

  it('skips drafts, pre-releases, releases without the ZIP and answers that are no JSON', () => {
    expect(parseRelease(answer({ draft: true }), UUID, DEFAULT_UPDATE_URL)).toBeNull();
    expect(parseRelease(answer({ prerelease: true }), UUID, DEFAULT_UPDATE_URL)).toBeNull();
    expect(parseRelease(answer({ assets: [] }), UUID, DEFAULT_UPDATE_URL)).toBeNull();
    expect(parseRelease(answer({ tag_name: 'nightly' }), UUID, DEFAULT_UPDATE_URL)).toBeNull();
    expect(parseRelease('<html>', UUID, DEFAULT_UPDATE_URL)).toBeNull();
  });

  it('takes the ZIP only from the releases of Visor', () => {
    const elsewhere = answer({
      assets: [
        { name: `${UUID}.shell-extension.zip`, browser_download_url: 'https://evil.org/x.zip' },
      ],
    });
    expect(parseRelease(elsewhere, UUID, DEFAULT_UPDATE_URL)).toBeNull();
    const fork = answer({
      assets: [
        {
          name: `${UUID}.shell-extension.zip`,
          browser_download_url: 'https://github.com/someone/visor/releases/download/v9/x.zip',
        },
      ],
    });
    expect(parseRelease(fork, UUID, DEFAULT_UPDATE_URL)).toBeNull();
  });

  it('with another address, from the same origin as that address', () => {
    const local = answer({
      assets: [
        {
          name: `${UUID}.shell-extension.zip`,
          browser_download_url: 'http://127.0.0.1:8000/v.zip',
        },
      ],
    });
    expect(parseRelease(local, UUID, 'http://127.0.0.1:8000/latest')?.zipUrl).toBe(
      'http://127.0.0.1:8000/v.zip',
    );
    expect(parseRelease(local, UUID, 'http://127.0.0.1:9000/latest')).toBeNull();
  });
});

describe('metadataProblem', () => {
  it('accepts the release and refuses anything else', () => {
    const meta = (value: object) => JSON.stringify(value);
    expect(
      metadataProblem(meta({ uuid: UUID, 'version-name': '0.2.0' }), UUID, '0.2.0'),
    ).toBeNull();
    expect(metadataProblem(meta({ uuid: 'x@y', 'version-name': '0.2.0' }), UUID, '0.2.0')).toMatch(
      /not visor/,
    );
    expect(metadataProblem(meta({ uuid: UUID, 'version-name': '0.1.0' }), UUID, '0.2.0')).toMatch(
      /version 0.1.0/,
    );
    expect(metadataProblem('{', UUID, '0.2.0')).toMatch(/not JSON/);
  });
});
