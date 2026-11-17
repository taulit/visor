import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('sdk', () => {
  it('index.d.ts and index.js are generated from src/api.ts', () => {
    // Fails when someone changed src/api.ts and did not run `pnpm sdk:gen`.
    expect(() =>
      execFileSync('bash', ['scripts/gen-sdk.sh', '--check'], { stdio: 'pipe' }),
    ).not.toThrow();
  }, 60_000);

  it('the module template carries the same copies of connect.js and the types', () => {
    for (const file of ['connect.js', 'connect.d.ts', 'index.d.ts']) {
      expect(read(`examples/module-template/src/visor/${file}`), file).toBe(read(`sdk/${file}`));
    }
  });

  it('the package version is the module API version', () => {
    const api = /export const API_VERSION = (\d+);/.exec(read('src/api.ts'))?.[1];
    expect(JSON.parse(read('sdk/package.json')).version.split('.')[0]).toBe(api);
  });

  it('the template names the same API version', () => {
    const api = Number(/export const API_VERSION = (\d+);/.exec(read('src/api.ts'))?.[1]);
    expect(JSON.parse(read('examples/module-template/metadata.json')).visor.api).toBe(api);
  });
});
