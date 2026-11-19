// A small label below a button while the pointer rests on it. St has none of
// its own; the label sits in the uiGroup of the shell, above the panel.
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const SHOW_AFTER_MS = 400;
const GAP_PX = 6;

export class Tooltip {
  private label: St.Label | null = null;
  private timeout = 0;

  constructor(
    private button: St.Widget,
    private text: () => string,
  ) {
    button.track_hover = true;
    button.connectObject(
      'notify::hover',
      () => (button.hover ? this.schedule() : this.hide()),
      'clicked',
      () => this.hide(),
      'destroy',
      () => this.hide(),
      this,
    );
  }

  hide(): void {
    if (this.timeout) GLib.source_remove(this.timeout);
    this.timeout = 0;
    this.label?.destroy();
    this.label = null;
  }

  private schedule(): void {
    if (this.timeout || this.label) return;
    this.timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SHOW_AFTER_MS, () => {
      this.timeout = 0;
      this.show();
      return GLib.SOURCE_REMOVE;
    });
  }

  private show(): void {
    if (!this.button.mapped || !this.button.hover) return;
    const label = (this.label = new St.Label({
      style_class: 'visor-tooltip',
      text: this.text(),
      opacity: 0,
    }));
    Main.layoutManager.uiGroup.add_child(label);
    const [x, y] = this.button.get_transformed_position();
    const [, natural] = label.get_preferred_width(-1);
    const monitor = Main.layoutManager.findMonitorForActor(this.button);
    const right = monitor ? monitor.x + monitor.width : global.stage.width;
    // Centred below the button, and kept on the monitor at the right edge.
    const left = Math.min(x + this.button.width / 2 - natural / 2, right - natural - GAP_PX);
    label.set_position(Math.round(left), Math.round(y + this.button.height + GAP_PX));
    label.ease({ opacity: 255, duration: 120, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
  }
}
