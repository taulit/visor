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
    // Scaled towards the corner where panel and body meet.
    this.actor.set_pivot_point(side === 'left' ? 1 : 0, 0);
    this.actor.connect('repaint', () => this.paint());
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
    const [width, height] = this.actor.get_surface_size();
    const radius = Math.min(width, height);
    const { red, green, blue } = this.color;
    cr.setSourceRGBA(red / 255, green / 255, blue / 255, 1);

    // The square minus the quarter disc around its lower outer corner.
    if (this.side === 'left') {
      cr.moveTo(0, 0);
      cr.lineTo(width, 0);
      cr.lineTo(width, radius);
      cr.arcNegative(width - radius, radius, radius, 0, -Math.PI / 2);
    } else {
      cr.moveTo(width, 0);
      cr.lineTo(0, 0);
      cr.lineTo(0, radius);
      cr.arc(radius, radius, radius, Math.PI, 1.5 * Math.PI);
    }
    cr.closePath();
    cr.fill();
    cr.$dispose();
  }
}
