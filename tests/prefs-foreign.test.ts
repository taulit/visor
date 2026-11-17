import { describe, expect, it } from 'vitest';
import { foreignModule } from '../src/prefs/foreign.js';

const info = { name: 'Notes', description: 'Quick notes', enabled: true, hasPrefs: true };

describe('foreignModule', () => {
  it('reads a module of another extension', () => {
    const metadata = { visor: { api: 1, slot: 'now' } };
    expect(foreignModule('notes@x', info, metadata)).toEqual({
      uuid: 'notes@x',
      name: 'Notes',
      description: 'Quick notes',
      slot: 'now',
      enabled: true,
      hasPrefs: true,
      incompatible: false,
    });
  });

  it('ignores extensions without a visor object', () => {
    expect(foreignModule('a@x', info, {})).toBeNull();
    expect(foreignModule('a@x', info, { visor: 'yes' })).toBeNull();
    expect(foreignModule('a@x', info, null)).toBeNull();
  });

  it('puts modules without a known slot in the dock', () => {
    expect(foreignModule('a@x', info, { visor: {} })?.slot).toBe('dock');
    expect(foreignModule('a@x', info, { visor: { slot: 'left' } })?.slot).toBe('dock');
  });

  it('marks another module API as incompatible', () => {
    expect(foreignModule('a@x', info, { visor: { api: 2 } })?.incompatible).toBe(true);
    expect(foreignModule('a@x', info, { visor: { api: 'one' } })?.incompatible).toBe(true);
    expect(foreignModule('a@x', info, { visor: { api: 1 } })?.incompatible).toBe(false);
    expect(foreignModule('a@x', info, { visor: {} })?.incompatible).toBe(false);
  });

  it('copes with a thin answer of the shell', () => {
    expect(foreignModule('a@x', {}, { visor: {} })).toMatchObject({
      name: 'a@x',
      description: '',
      enabled: false,
      hasPrefs: false,
    });
  });
});
