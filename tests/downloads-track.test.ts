import { describe, expect, it } from 'vitest';
import {
  DONE_MS,
  STALE_MS,
  current,
  displayName,
  isDone,
  ending,
  nextLeave,
  type Download,
} from '../src/modules/downloads/track.js';

const active = (name: string, seenAt: number): Download => ({ name, size: null, seenAt });
const done = (name: string, doneAt: number): Download => ({
  name: `${name}.part`,
  size: 5,
  seenAt: 0,
  doneName: name,
  doneAt,
});

describe('displayName', () => {
  it('is the name the file will have', () => {
    expect(displayName(active('fedora.iso.part', 0))).toBe('fedora.iso');
    expect(displayName(active('movie.mp4.crdownload', 0))).toBe('movie.mp4');
  });

  it('falls back to the partial name while Chrome has no name yet', () => {
    expect(displayName(active('Unconfirmed 123456.crdownload', 0))).toBe(
      'Unconfirmed 123456.crdownload',
    );
  });

  it('is the final name once the download is done', () => {
    const download = { ...active('Unconfirmed 1.crdownload', 0), doneName: 'movie.mp4', doneAt: 1 };
    expect(displayName(download)).toBe('movie.mp4');
    expect(isDone(download)).toBe(true);
    expect(isDone(active('a.part', 0))).toBe(false);
  });
});

describe('ending', () => {
  it('is cancelled without the final file, at either look', () => {
    expect(ending(null, 500, false)).toBe('cancelled');
    expect(ending(null, null, false)).toBe('cancelled');
    expect(ending(null, 0, true)).toBe('cancelled');
  });

  it('is finished with a final file that has bytes', () => {
    expect(ending(500, 400, false)).toBe('finished');
    expect(ending(500, null, false)).toBe('finished');
    expect(ending(500, 0, true)).toBe('finished');
  });

  it('takes an empty final file for the placeholder of Firefox when the partial one had bytes', () => {
    expect(ending(0, 400, false)).toBe('cancelled');
    expect(ending(0, 400, true)).toBe('cancelled');
  });

  it('does not decide at once when the partial file was empty or never measured', () => {
    expect(ending(0, 0, false)).toBe('unsure');
    expect(ending(0, null, false)).toBe('unsure');
  });

  it('takes an empty file that is still there a moment later for a download of no bytes', () => {
    expect(ending(0, 0, true)).toBe('finished');
    expect(ending(0, null, true)).toBe('finished');
  });
});

describe('current', () => {
  it('keeps the list as it is while everything belongs in it', () => {
    const list = [active('a.part', 1000), done('b', 1000)];
    expect(current(list, 1000 + DONE_MS - 1)).toBe(list);
  });

  it('drops finished downloads after two minutes', () => {
    const list = [active('a.part', 1000), done('b', 1000)];
    expect(current(list, 1000 + DONE_MS)).toEqual([list[0]]);
  });

  it('drops partial files that stopped changing', () => {
    const list = [active('a.part', 1000), active('b.part', 5000)];
    expect(current(list, 1000 + STALE_MS)).toEqual([list[1]]);
    expect(current(list, 5000 + STALE_MS)).toEqual([]);
  });
});

describe('nextLeave', () => {
  it('is the time until the first one leaves', () => {
    expect(nextLeave([active('a.part', 1000), done('b', 2000)], 3000)).toBe(DONE_MS - 1000);
    expect(nextLeave([active('a.part', 1000)], 3000)).toBe(STALE_MS - 2000);
    expect(nextLeave([done('b', 0)], DONE_MS + 50)).toBe(0);
  });

  it('is null for an empty list', () => {
    expect(nextLeave([], 0)).toBeNull();
  });
});
