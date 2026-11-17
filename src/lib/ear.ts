// The ears of the notch: the concave quarter circles that lead from the lower
// edge of the panel into the sides of the body.
import St from 'gi://St';

import type { Rgb } from '../core/theme.js';

export class Ear {
  readonly actor: St.DrawingArea;
  private color: Rgb = { red: 0, green: 0, blue: 0 };

  /** A `left` ear sits left of the body and touches it with its right edge. */
  constructor(private side: 'left' | 'right') {
    this.actor = new St.DrawingArea({ visible: false });
    this.actor.connect('repaint', () => this.paint());
  }

  /**
   * The actor is one pixel wider than the radius. That column is filled and
   * lies under the body, so a scaled ear has no soft edge next to it.
   */
  setRadius(radius: number): void {
    if (this.actor.height === radius) return;
    this.actor.set_size(radius + 1, radius);
    // Scaled towards the corner where panel and body meet.
    const seam = this.side === 'left' ? radius / (radius + 1) : 1 / (radius + 1);
    this.actor.set_pivot_point(seam, 0);
  }

  /** Repaints only when the colour really changed. */
  setColor(color: Rgb): void {
    const { red, green, blue } = this.color;
    if (color.red === red && color.green === green && color.blue === blue) return;
    this.color = { red: color.red, green: color.green, blue: color.blue };
    this.actor.queue_repaint();
  }

  private paint(): void {
    const cr = this.actor.get_context();
    const [width, radius] = this.actor.get_surface_size();
    const { red, green, blue } = this.color;
    cr.setSourceRGBA(red / 255, green / 255, blue / 255, 1);

    // The square minus the quarter disc around its lower outer corner, plus
    // the column under the body.
    const overlap = width - radius;
    if (this.side === 'left') {
      cr.moveTo(0, 0);
      cr.lineTo(width, 0);
      cr.lineTo(width, radius);
      cr.lineTo(radius, radius);
      cr.arcNegative(0, radius, radius, 0, -Math.PI / 2);
    } else {
      cr.moveTo(width, 0);
      cr.lineTo(0, 0);
      cr.lineTo(0, radius);
      cr.lineTo(overlap, radius);
      cr.arc(width, radius, radius, Math.PI, 1.5 * Math.PI);
    }
    cr.closePath();
    cr.fill();
    cr.$dispose();
  }
}
