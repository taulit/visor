// The peek state: one row of chips, the most important things at a glance.
import GLib from 'gi://GLib';
import St from 'gi://St';

import type { PeekChip } from '../api.js';
import { pickChips, type ChipCandidate } from '../lib/chips.js';
import { Chip } from './kit.js';
import type { ModuleEntry, Registry } from './registry.js';

const FLASH_MS = 3000;

interface Flash {
  chip: PeekChip;
  /** Grows with every flash, so the newest one comes first. */
  order: number;
  timeout: number;
}

export interface PeekCallbacks {
  /** A chip was clicked. */
  activate(): void;
  /** The chips changed: their number, their order or what they say. */
  changed(): void;
}

export class Peek {
  private actor: St.BoxLayout | null = null;
  private chips = new Map<string, Chip>();
  private flashes = new Map<string, Flash>();
  private flashCount = 0;
  private shown = '';

  constructor(
    private registry: Registry,
    private callbacks: PeekCallbacks,
  ) {}

  hasChips(): boolean {
    return this.candidates().length > 0;
  }

  getActor(): St.Widget {
    if (!this.actor) {
      this.actor = new St.BoxLayout({ style_class: 'visor-peek' });
      this.render(this.pick());
    }
    return this.actor;
  }

  /** Chips or modules changed: bring the row up to date. */
  sync(): void {
    for (const [id, flash] of this.flashes) {
      if (this.registry.get(id)?.active) continue;
      GLib.source_remove(flash.timeout);
      this.flashes.delete(id);
    }
    const picked = this.pick();
    const shown = picked
      .map(
        ({ id, chip }) =>
          `${id}\u0000${chip.text}\u0000${chip.tone ?? ''}\u0000${String(chip.icon)}`,
      )
      .join('\u0001');
    if (this.actor) this.render(picked);
    if (shown === this.shown) return;
    this.shown = shown;
    this.callbacks.changed();
  }

  /** Shows the chip first and in the accent colour for three seconds; a waiting chip keeps its amber. */
  flash(entry: ModuleEntry, chip: PeekChip): void {
    const { id } = entry.module;
    const running = this.flashes.get(id);
    if (running) GLib.source_remove(running.timeout);
    const timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, FLASH_MS, () => {
      this.flashes.delete(id);
      this.sync();
      return GLib.SOURCE_REMOVE;
    });
    this.flashes.set(id, { chip, order: ++this.flashCount, timeout });
    this.sync();
  }

  destroy(): void {
    for (const flash of this.flashes.values()) GLib.source_remove(flash.timeout);
    this.flashes.clear();
    this.chips.clear();
    this.actor?.destroy();
    this.actor = null;
  }

  private candidates(): ChipCandidate<PeekChip>[] {
    const result: ChipCandidate<PeekChip>[] = [];
    for (const entry of this.registry.all()) {
      if (!entry.active) continue;
      const flash = this.flashes.get(entry.module.id);
      if (flash)
        result.push({
          id: entry.module.id,
          // Amber stays amber: a chip that waits for the user is not just news.
          chip: { ...flash.chip, tone: flash.chip.tone === 'waiting' ? 'waiting' : 'accent' },
          flash: flash.order,
        });
      else if (entry.chip) result.push({ id: entry.module.id, chip: entry.chip });
    }
    return result;
  }

  private pick(): ChipCandidate<PeekChip>[] {
    return pickChips(this.candidates());
  }

  private render(picked: ChipCandidate<PeekChip>[]): void {
    const actor = this.actor!;
    const wanted = new Set(picked.map(candidate => candidate.id));
    for (const [id, chip] of this.chips) {
      if (wanted.has(id)) continue;
      chip.actor.destroy();
      this.chips.delete(id);
    }
    let index = 0;
    for (const { id, chip } of picked) {
      let widget = this.chips.get(id);
      try {
        if (widget) {
          widget.update(chip);
        } else {
          widget = new Chip(chip, true);
          widget.actor.connect('clicked', () => this.callbacks.activate());
          this.chips.set(id, widget);
          actor.add_child(widget.actor);
        }
        if (actor.get_child_at_index(index) !== widget.actor)
          actor.set_child_at_index(widget.actor, index);
        index++;
      } catch (e) {
        // A chip with broken data must not take the others with it.
        this.registry.get(id)?.guard.call(() => {
          throw e;
        });
      }
    }
  }
}
