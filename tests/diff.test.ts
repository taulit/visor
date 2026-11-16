import { describe, expect, it } from 'vitest';
import { diffIds, uniqueById } from '../src/lib/diff.js';

describe('diffIds', () => {
  it('reports no change for the same ids in the same order', () => {
    const diff = diffIds(['a', 'b'], ['a', 'b']);
    expect(diff.changed).toBe(false);
    expect(diff.kept).toEqual(['a', 'b']);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  it('finds added and removed ids', () => {
    const diff = diffIds(['a', 'b', 'c'], ['b', 'd']);
    expect(diff.ids).toEqual(['b', 'd']);
    expect(diff.added).toEqual(['d']);
    expect(diff.removed).toEqual(['a', 'c']);
    expect(diff.kept).toEqual(['b']);
    expect(diff.changed).toBe(true);
  });

  it('reports a change when only the order differs', () => {
    const diff = diffIds(['a', 'b'], ['b', 'a']);
    expect(diff.changed).toBe(true);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  it('handles empty lists', () => {
    expect(diffIds([], []).changed).toBe(false);
    expect(diffIds([], ['a']).added).toEqual(['a']);
    expect(diffIds(['a'], []).removed).toEqual(['a']);
  });

  it('counts a repeated id once, at its first place', () => {
    const diff = diffIds(['a'], ['b', 'a', 'b']);
    expect(diff.ids).toEqual(['b', 'a']);
    expect(diff.added).toEqual(['b']);
  });
});

describe('uniqueById', () => {
  it('keeps the first item of each id and the order', () => {
    const items = [
      { id: 'a', n: 1 },
      { id: 'b', n: 2 },
      { id: 'a', n: 3 },
    ];
    expect(uniqueById(items)).toEqual([
      { id: 'a', n: 1 },
      { id: 'b', n: 2 },
    ]);
  });
});
