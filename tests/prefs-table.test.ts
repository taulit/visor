import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BUILTIN_MODULES } from '../src/prefs/builtin-modules.js';

const modules = new URL('../src/modules/', import.meta.url);

/** id and slot as the module files declare them. */
function declared(): Map<string, string> {
  const found = new Map<string, string>();
  for (const entry of readdirSync(modules, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const source = readFileSync(new URL(`${entry.name}/module.ts`, modules), 'utf8');
    const id = /readonly id = '([a-z0-9-]+)'/.exec(source)?.[1];
    const slot = /readonly slot = '([a-z]+)'/.exec(source)?.[1];
    if (id && slot) found.set(id, slot);
  }
  return found;
}

describe('table of built-in modules for the settings window', () => {
  it('lists every module of src/modules with its slot', () => {
    const table = new Map(BUILTIN_MODULES.map(module => [module.id, module.slot]));
    expect(table).toEqual(declared());
  });

  it('has an id, an icon and a name for each module, once', () => {
    const ids = BUILTIN_MODULES.map(module => module.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const module of BUILTIN_MODULES) {
      expect(module.icon).toMatch(/-symbolic$/);
      expect(module.name).not.toBe('');
    }
  });
});
