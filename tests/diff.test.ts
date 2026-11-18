import { describe, expect, it } from 'vitest';
import { diffIds, uniqueById } from '../src/lib/diff.js';

describe('diffIds', () => {
  it('reports no change for the same ids in the same order', () => {
    expect(diffIds(['a', 'b'], ['a', 'b'])).toEqual({ removed: [], changed: false });
  });

  it('finds removed ids', () => {
    expect(diffIds(['a', 'b', 'c'], ['b', 'd'])).toEqual({ removed: ['a', 'c'], changed: true });
  });

  it('reports a change when only the order differs', () => {
    expect(diffIds(['a', 'b'], ['b', 'a'])).toEqual({ removed: [], changed: true });
  });

  it('handles empty lists', () => {
    expect(diffIds([], [])).toEqual({ removed: [], changed: false });
    expect(diffIds([], ['a'])).toEqual({ removed: [], changed: true });
    expect(diffIds(['a'], [])).toEqual({ removed: ['a'], changed: true });
  });

  it('counts a repeated id once, at its first place', () => {
    expect(diffIds(['b', 'a'], ['b', 'a', 'b'])).toEqual({ removed: [], changed: false });
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
