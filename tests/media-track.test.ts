import { describe, expect, it } from 'vitest';
import {
  MAX_ROWS,
  NO_TRACK,
  PAUSED_MS,
  coverBody,
  describeTrack,
  hashName,
  nextPauseEnd,
  parseMetadata,
  parseStatus,
  trackProgress,
  visiblePlayers,
  type PlayerState,
} from '../src/modules/media/track.js';

describe('parseStatus', () => {
  it('knows three states and takes everything else as stopped', () => {
    expect(parseStatus('Playing')).toBe('Playing');
    expect(parseStatus('Paused')).toBe('Paused');
    for (const value of ['Stopped', 'playing', '', undefined, null, 3])
      expect(parseStatus(value)).toBe('Stopped');
  });
});

describe('parseMetadata', () => {
  it('reads the fields of a well-behaved player', () => {
    expect(
      parseMetadata({
        'mpris:trackid': '/track/1',
        'xesam:title': 'Midnight City',
        'xesam:artist': ['M83'],
        'mpris:artUrl': 'file:///tmp/cover.png',
        'mpris:length': 243_000_000,
      }),
    ).toEqual({
      title: 'Midnight City',
      artists: ['M83'],
      artUrl: 'file:///tmp/cover.png',
      lengthUs: 243_000_000,
      key: '/track/1\u0000Midnight City\u0000243000000',
    });
  });

  it('treats values of the wrong type as absent', () => {
    const track = parseMetadata({
      'xesam:title': 5,
      'xesam:artist': [3, 'A', '', null, ' B '],
      'mpris:artUrl': ['x'],
      'mpris:length': '9',
    });
    expect(track).toMatchObject({ title: '', artists: ['A', 'B'], artUrl: '', lengthUs: null });
    expect(parseMetadata({ 'xesam:artist': 'Solo' }).artists).toEqual(['Solo']);
    for (const length of [0, -5, NaN, Infinity])
      expect(parseMetadata({ 'mpris:length': length }).lengthUs).toBeNull();
    expect(parseMetadata({ 'mpris:length': 1.5e6 }).lengthUs).toBe(1.5e6);
  });

  it('survives no metadata at all', () => {
    for (const raw of [undefined, null, 'x', 7, {}])
      expect(parseMetadata(raw)).toMatchObject({ title: '', artists: [], lengthUs: null });
    expect(parseMetadata(undefined)).toBe(NO_TRACK);
  });

  it('has another key for another track', () => {
    const a = parseMetadata({ 'mpris:trackid': '/1', 'xesam:title': 'A' });
    expect(parseMetadata({ 'mpris:trackid': '/1', 'xesam:title': 'A' }).key).toBe(a.key);
    expect(parseMetadata({ 'mpris:trackid': '/2', 'xesam:title': 'A' }).key).not.toBe(a.key);
    expect(parseMetadata({ 'xesam:title': 'B' }).key).not.toBe(parseMetadata({}).key);
  });
});

describe('describeTrack', () => {
  const track = parseMetadata({ 'xesam:title': 'Song', 'xesam:artist': ['A', 'B'] });

  it('puts artists and player below the title', () => {
    expect(describeTrack(track, 'Spotify')).toEqual({ title: 'Song', subtitle: 'A, B · Spotify' });
    expect(describeTrack({ ...track, artists: [] }, 'Spotify')).toEqual({
      title: 'Song',
      subtitle: 'Spotify',
    });
  });

  it('shows the player where a title is missing', () => {
    expect(describeTrack(NO_TRACK, 'Spotify')).toEqual({ title: 'Spotify', subtitle: '' });
    expect(describeTrack({ ...track, title: '' }, 'Spotify').subtitle).toBe('A, B');
  });
});

describe('trackProgress', () => {
  it('needs position and length', () => {
    expect(trackProgress(60, 240)).toBe(0.25);
    expect(trackProgress(0, 240)).toBe(0);
    expect(trackProgress(500, 240)).toBe(1);
    expect(trackProgress(null, 240)).toBeUndefined();
    expect(trackProgress(60, null)).toBeUndefined();
    expect(trackProgress(60, 0)).toBeUndefined();
  });
});

describe('visiblePlayers', () => {
  const player = (id: string, status: PlayerState['status'], activeAt: number) => ({
    id,
    status,
    activeAt,
  });
  const ids = (players: { id: string }[]) => players.map(p => p.id);
  const now = 1_000_000;

  it('shows playing players, the most recently started first', () => {
    const players = [player('a', 'Playing', 100), player('b', 'Playing', 200)];
    expect(ids(visiblePlayers(players, now))).toEqual(['b', 'a']);
  });

  it('puts playing before paused and leaves out stopped ones', () => {
    const players = [
      player('paused', 'Paused', now - 1000),
      player('stopped', 'Stopped', now),
      player('playing', 'Playing', 5),
    ];
    expect(ids(visiblePlayers(players, now))).toEqual(['playing', 'paused']);
  });

  it('drops a player that is paused for ten minutes', () => {
    expect(visiblePlayers([player('a', 'Paused', now - PAUSED_MS + 1)], now)).toHaveLength(1);
    expect(visiblePlayers([player('a', 'Paused', now - PAUSED_MS)], now)).toEqual([]);
  });

  it('shows at most two', () => {
    const players = [1, 2, 3, 4].map(n => player(`p${n}`, 'Playing', n));
    expect(ids(visiblePlayers(players, now))).toEqual(['p4', 'p3']);
    expect(MAX_ROWS).toBe(2);
    expect(ids(players)).toEqual(['p1', 'p2', 'p3', 'p4']);
  });
});

describe('nextPauseEnd', () => {
  const now = 1_000_000;

  it('is the time until the first paused player goes', () => {
    const players: PlayerState[] = [
      { status: 'Paused', activeAt: now - 1000 },
      { status: 'Paused', activeAt: now - 5000 },
      { status: 'Playing', activeAt: now - 900_000 },
    ];
    expect(nextPauseEnd(players, now)).toBe(PAUSED_MS - 5000);
  });

  it('is null when nothing paused has a row', () => {
    expect(nextPauseEnd([], now)).toBeNull();
    expect(nextPauseEnd([{ status: 'Playing', activeAt: now }], now)).toBeNull();
    expect(nextPauseEnd([{ status: 'Paused', activeAt: now - PAUSED_MS }], now)).toBeNull();
  });
});

describe('coverBody', () => {
  const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values);

  it('joins the pieces', () => {
    expect(coverBody([bytes(1, 2), bytes(), bytes(3)], 3)).toEqual(bytes(1, 2, 3));
  });

  it('is nothing for an empty body and for one past the limit', () => {
    expect(coverBody([], 3)).toBeNull();
    expect(coverBody([bytes()], 3)).toBeNull();
    expect(coverBody([bytes(1, 2), bytes(3, 4)], 3)).toBeNull();
  });
});

describe('hashName', () => {
  it('is stable, short and differs between addresses', () => {
    const a = hashName('https://example.org/a.jpg');
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(hashName('https://example.org/a.jpg')).toBe(a);
    expect(hashName('https://example.org/b.jpg')).not.toBe(a);
    expect(hashName('')).toMatch(/^[0-9a-f]{16}$/);
  });
});
