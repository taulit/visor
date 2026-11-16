// The neck: the part of the notch that sits in the panel where the date menu
// was. It shows the clock and, right of it, the attention dot.
import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import GnomeDesktop from 'gi://GnomeDesktop?version=4.0';
import Pango from 'gi://Pango';
import St from 'gi://St';

import type { Attention } from './types.js';

export class Clock {
  /**
   * Goes into the centre box of the panel. The classes of the stock clock
   * button give it the font and the colour of the panel in every theme,
   * also in the overview.
   */
  readonly actor: St.Bin;

  private label: St.Label;
  private dot: St.Widget;
  private wallClock: GnomeDesktop.WallClock;

  constructor() {
    this.label = new St.Label({
      style_class: 'visor-clock',
      y_align: Clutter.ActorAlign.CENTER,
    });
    this.label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;

    this.dot = new St.Widget({
      style_class: 'visor-dot',
      y_align: Clutter.ActorAlign.CENTER,
      visible: false,
    });

    const pill = new St.BoxLayout({ style_class: 'visor-neck-pill' });
    pill.add_child(this.label);
    pill.add_child(this.dot);

    this.actor = new St.Bin({
      style_class: 'panel-button clock-display visor-neck',
      child: pill,
      reactive: true,
      can_focus: true,
      track_hover: true,
      y_expand: true,
      accessible_role: Atk.Role.PUSH_BUTTON,
    });

    // The same source and text as the stock clock, so it follows the clock settings.
    this.wallClock = new GnomeDesktop.WallClock();
    this.wallClock.connectObject('notify::clock', () => this.sync(), this);
    this.sync();
  }

  private sync(): void {
    const text = this.wallClock.clock;
    this.label.text = text;
    this.actor.accessible_name = text;
  }

  setAttention(attention: Attention): void {
    this.dot.remove_style_class_name('unread');
    this.dot.remove_style_class_name('waiting');
    if (attention) this.dot.add_style_class_name(attention);
    this.dot.visible = attention !== null;
  }

  destroy(): void {
    this.wallClock.disconnectObject(this);
    this.wallClock.run_dispose();
    this.actor.destroy();
  }
}
