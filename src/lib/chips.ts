// Pure logic: which chips the peek state shows, and in which order.

export const MAX_CHIPS = 4;

export interface ChipCandidate<C extends { priority: number }> {
  /** Id of the module the chip belongs to. */
  id: string;
  chip: C;
  /**
   * Set while the chip announces a new event: a counter that grows with every
   * flash, so the newest one comes first. Undefined for a resting chip.
   */
  flash?: number;
}

/**
 * Chips to show: flashing ones first (newest first), then by priority, highest
 * first. Chips of equal priority keep the order of the candidates, which is the
 * order of the modules. At most `max` chips.
 */
export function pickChips<C extends { priority: number }>(
  candidates: readonly ChipCandidate<C>[],
  max = MAX_CHIPS,
): ChipCandidate<C>[] {
  const priority = (c: ChipCandidate<C>) =>
    Number.isFinite(c.chip.priority) ? c.chip.priority : 0;
  return candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) => {
      const flashA = a.candidate.flash ?? -1;
      const flashB = b.candidate.flash ?? -1;
      if (flashA !== flashB) return flashB - flashA;
      return priority(b.candidate) - priority(a.candidate) || a.index - b.index;
    })
    .slice(0, Math.max(0, max))
    .map(entry => entry.candidate);
}
