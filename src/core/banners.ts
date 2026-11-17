// The banners of the shell come down top-centre right below the panel, which
// is where the hint and the peek state are drawn; the tray is stacked above
// the notch, so a banner would cover the chips (docs/verified.md, "Decisions").
// While the body shows, the whole tray is moved down by the height of the body,
// so a banner slides out below it and both can be seen and clicked.
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const SHIFT_MS = 200;

export class BannerShift {
  /** What the tray had before Visor, normally 0. */
  private readonly original = Main.messageTray.translation_y;
  private offset = 0;

  /** Moves the banners down by `offset` stage pixels; 0 puts them back. */
  set(offset: number): void {
    if (offset === this.offset) return;
    this.offset = offset;
    const tray = Main.messageTray;
    const y = this.original + offset;
    tray.remove_transition('translation-y');
    // A banner on screen follows the body; without one there is nothing to animate.
    if (tray.visible) {
      tray.ease_property('translation-y', y, {
        duration: SHIFT_MS,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
      });
    } else {
      tray.translation_y = y;
    }
  }

  destroy(): void {
    const tray = Main.messageTray;
    tray.remove_transition('translation-y');
    tray.translation_y = this.original;
    this.offset = 0;
  }
}
