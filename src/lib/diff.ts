// Pure logic: how a list of items with ids turns into the next one.

export interface IdDiff {
  /** Ids of the next list, in its order, without repeats. */
  ids: string[];
  /** In the next list but not in the previous one. */
  added: string[];
  /** In the previous list but not in the next one. */
  removed: string[];
  /** In both. */
  kept: string[];
  /** False when the next list has the same ids in the same order as the previous one. */
  changed: boolean;
}

/** Compares two lists of ids. A repeated id counts once, at its first place. */
export function diffIds(previous: readonly string[], next: readonly string[]): IdDiff {
  const before = new Set(previous);
  const ids = [...new Set(next)];
  const after = new Set(ids);
  const added = ids.filter(id => !before.has(id));
  const kept = ids.filter(id => before.has(id));
  const removed = [...before].filter(id => !after.has(id));
  const changed = ids.length !== previous.length || ids.some((id, index) => previous[index] !== id);
  return { ids, added, removed, kept, changed };
}

/** The items with distinct ids, in order; of two items with the same id the first one stays. */
export function uniqueById<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}
