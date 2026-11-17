import { describe, expect, it } from 'vitest';
import { pickChips } from '../src/lib/chips.js';

const chip = (id: string, priority: number, flash?: number) => ({ id, chip: { priority }, flash });
const ids = (list: { id: string }[]) => list.map(c => c.id);

describe('pickChips', () => {
  it('returns nothing without chips', () => {
    expect(pickChips([])).toEqual([]);
  });

  it('sorts by priority, highest first', () => {
    expect(ids(pickChips([chip('a', 1), chip('b', 30), chip('c', 20)]))).toEqual(['b', 'c', 'a']);
  });

  it('keeps the module order for equal priorities', () => {
    expect(ids(pickChips([chip('a', 5), chip('b', 5), chip('c', 5)]))).toEqual(['a', 'b', 'c']);
  });

  it('shows at most four chips and drops the lowest priorities', () => {
    const picked = pickChips([
      chip('a', 1),
      chip('b', 2),
      chip('c', 3),
      chip('d', 4),
      chip('e', 5),
    ]);
    expect(ids(picked)).toEqual(['e', 'd', 'c', 'b']);
  });

  it('puts a flashing chip first, whatever its priority', () => {
    expect(ids(pickChips([chip('a', 90), chip('b', 1, 1), chip('c', 50)]))).toEqual([
      'b',
      'a',
      'c',
    ]);
  });

  it('puts the newest flash first', () => {
    expect(ids(pickChips([chip('a', 1, 1), chip('b', 1, 2), chip('c', 99)]))).toEqual([
      'b',
      'a',
      'c',
    ]);
  });

  it('never drops a flashing chip in favour of resting ones', () => {
    const picked = pickChips([
      chip('a', 9),
      chip('b', 8),
      chip('c', 7),
      chip('d', 6),
      chip('e', 0, 1),
    ]);
    expect(ids(picked)).toEqual(['e', 'a', 'b', 'c']);
  });

  it('treats an invalid priority as zero', () => {
    expect(ids(pickChips([chip('a', NaN), chip('b', 1), chip('c', -1)]))).toEqual(['b', 'a', 'c']);
  });
});
