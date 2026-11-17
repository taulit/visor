// Pure logic of the module registry: ids, order, API version, attention.
// No gi:// imports here, so Vitest can load it.
import type { Attention } from '../core/types.js';

const MODULE_ID = /^[a-z0-9-]+$/;

export function isValidModuleId(id: unknown): id is string {
  return typeof id === 'string' && MODULE_ID.test(id);
}

/**
 * Order of the registered ids: first the ones named in `order`, in that order,
 * then the rest in the order they were registered. Ids in `order` that are not
 * registered and repeated ids are skipped.
 */
export function orderIds(registered: readonly string[], order: readonly string[]): string[] {
  const known = new Set(registered);
  const result = new Set<string>();
  for (const id of order) if (known.has(id)) result.add(id);
  for (const id of registered) result.add(id);
  return [...result];
}

/**
 * The API version an extension says its modules were built for, from
 * `"visor": {"api": N}` in its metadata.json. Null when it says nothing.
 */
export function declaredApi(metadata: unknown): number | null {
  if (typeof metadata !== 'object' || metadata === null) return null;
  const visor = (metadata as Record<string, unknown>)['visor'];
  if (typeof visor !== 'object' || visor === null) return null;
  const api = (visor as Record<string, unknown>)['api'];
  if (api === undefined || api === null) return null;
  return typeof api === 'number' ? api : Number.NaN;
}

/** One dot for all modules: 'waiting' beats 'unread'. */
export function aggregateAttention(kinds: Iterable<Attention | undefined>): Attention {
  let result: Attention = null;
  for (const kind of kinds) {
    if (kind === 'waiting') return 'waiting';
    if (kind === 'unread') result = 'unread';
  }
  return result;
}

/** Number shown on a dock icon: whole and positive, '99+' from 100 on. Null shows nothing. */
export function badgeText(count: number | null | undefined): string | null {
  if (typeof count !== 'number' || !Number.isFinite(count)) return null;
  const n = Math.floor(count);
  if (n <= 0) return null;
  return n > 99 ? '99+' : String(n);
}
