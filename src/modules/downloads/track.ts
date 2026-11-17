/** The downloads Visor knows about and when they leave the list. Pure logic; times are ms on a clock that only grows. */
import { finalName } from './names.js';

export interface Download {
  /** Name of the partial file; a finished download keeps it as its key. */
  name: string;
  /** Bytes at the last look, null before the first one. */
  size: number | null;
  /** The last sign of life of the partial file. */
  seenAt: number;
  /** Finished: the name of the file it became, and when. */
  doneName?: string;
  doneAt?: number;
}

/** How long a finished download stays in the list. */
export const DONE_MS = 120_000;
/** A partial file that did not change for this long is no running download: paused, or left behind. */
export const STALE_MS = 600_000;

export const isDone = (download: Download): boolean => download.doneAt !== undefined;

/** What the row is called: the name the file will have, as far as it is known. */
export const displayName = (download: Download): string =>
  download.doneName ?? (finalName(download.name) || download.name);

/** How long after the partial file went an empty final file is looked at again. */
export const RECHECK_MS = 2000;

type Ending = 'finished' | 'cancelled' | 'unsure';

/**
 * What became of a download whose partial file is gone. `finalSize` is null
 * when the final file does not exist. Firefox keeps an empty file under the
 * final name while it downloads and removes it right after the partial one
 * when the download is cancelled. So an empty final file is that placeholder
 * when the partial file had bytes, and says nothing at the first look when it
 * had none or was never measured ('unsure'). At the second look, RECHECK_MS
 * later, a placeholder is gone, and an empty file that is still there is a
 * download of no bytes.
 */
export function ending(
  finalSize: number | null,
  partialSize: number | null,
  secondLook: boolean,
): Ending {
  if (finalSize === null) return 'cancelled';
  if (finalSize > 0) return 'finished';
  if (partialSize !== null && partialSize > 0) return 'cancelled';
  return secondLook ? 'finished' : 'unsure';
}

const leavesAt = (download: Download): number =>
  download.doneAt !== undefined ? download.doneAt + DONE_MS : download.seenAt + STALE_MS;

/** The downloads that still belong in the list. The same array when all of them do. */
export function current(downloads: readonly Download[], now: number): readonly Download[] {
  const kept = downloads.filter(download => leavesAt(download) > now);
  return kept.length === downloads.length ? downloads : kept;
}

/** Milliseconds until the first download leaves the list, null for an empty list. */
export function nextLeave(downloads: readonly Download[], now: number): number | null {
  let nearest: number | null = null;
  for (const download of downloads) {
    const left = Math.max(0, leavesAt(download) - now);
    if (nearest === null || left < nearest) nearest = left;
  }
  return nearest;
}
