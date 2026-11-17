/** What MPRIS players say, made safe, and which of them get a row. Pure logic. */

export type Status = 'Playing' | 'Paused' | 'Stopped';

export interface Track {
  title: string;
  artists: string[];
  artUrl: string;
  /** Microseconds, null when the player does not say. */
  lengthUs: number | null;
  /** Changes when another track starts. */
  key: string;
}

export const NO_TRACK: Track = { title: '', artists: [], artUrl: '', lengthUs: null, key: '' };

/** How long a paused player keeps its row. */
export const PAUSED_MS = 600_000;
export const MAX_ROWS = 2;

export function parseStatus(value: unknown): Status {
  return value === 'Playing' || value === 'Paused' ? value : 'Stopped';
}

/**
 * The fields of the `Metadata` property that Visor shows. Players send values
 * of the wrong type (a string for the artists, a float for the length); what
 * cannot be used counts as absent.
 */
export function parseMetadata(raw: unknown): Track {
  if (typeof raw !== 'object' || raw === null) return NO_TRACK;
  const data = raw as Record<string, unknown>;
  const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

  const artist = data['xesam:artist'];
  const artists = (Array.isArray(artist) ? artist : [artist]).map(text).filter(Boolean);
  const length = data['mpris:length'];
  const lengthUs =
    typeof length === 'number' && Number.isFinite(length) && length > 0 ? length : null;
  const title = text(data['xesam:title']);
  const key = `${text(data['mpris:trackid'])}\u0000${title}\u0000${lengthUs ?? ''}`;
  return { title, artists, artUrl: text(data['mpris:artUrl']), lengthUs, key };
}

/** Title and subtitle of the row: `Midnight City` and `M83 · Spotify`. */
export function describeTrack(track: Track, player: string): { title: string; subtitle: string } {
  const artists = track.artists.join(', ');
  if (!track.title) return { title: player, subtitle: artists };
  return { title: track.title, subtitle: [artists, player].filter(Boolean).join(' · ') };
}

/** 0..1 when position and length are both known, else undefined: no line at all. */
export function trackProgress(
  positionUs: number | null,
  lengthUs: number | null,
): number | undefined {
  if (positionUs === null || lengthUs === null || !(lengthUs > 0) || !(positionUs >= 0))
    return undefined;
  return Math.min(1, positionUs / lengthUs);
}

export interface PlayerState {
  status: Status;
  /** When it started to play or was paused, on a clock that only grows (ms). */
  activeAt: number;
}

const shown = (player: PlayerState, now: number): boolean =>
  player.status === 'Playing' || (player.status === 'Paused' && now - player.activeAt < PAUSED_MS);

/** The players with a row: playing ones first, the most recently active first, at most two. */
export function visiblePlayers<T extends PlayerState>(players: readonly T[], now: number): T[] {
  return players
    .filter(player => shown(player, now))
    .sort(
      (a, b) =>
        Number(b.status === 'Playing') - Number(a.status === 'Playing') || b.activeAt - a.activeAt,
    )
    .slice(0, MAX_ROWS);
}

/** Milliseconds until the first paused player loses its row, null when none is paused. */
export function nextPauseEnd(players: readonly PlayerState[], now: number): number | null {
  let nearest: number | null = null;
  for (const player of players) {
    if (player.status !== 'Paused' || !shown(player, now)) continue;
    const left = player.activeAt + PAUSED_MS - now;
    if (nearest === null || left < nearest) nearest = left;
  }
  return nearest;
}

/** A short name for a cached file, made from an address. Not a checksum; a clash only shows another cover. */
export function hashName(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x1b873593;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b + code, 0x85ebca6b) ^ (b >>> 13);
  }
  const hex = (n: number): string => (n >>> 0).toString(16).padStart(8, '0');
  return hex(a) + hex(b);
}
