// Development stand-in: shows the content below the panel without animation,
// hover or modal handling. The real notch replaces this file.
import type Gio from 'gi://Gio';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import type { Attention, NotchContent, NotchHost, NotchState } from './types.js';

export class Notch implements NotchHost {
  state: NotchState = 'idle';
  private root: St.Widget;

  constructor(
    _settings: Gio.Settings,
    private content: NotchContent,
  ) {
    const bg = Main.panel.get_theme_node().get_background_color();
    const dark = 0.2126 * bg.red + 0.7152 * bg.green + 0.0722 * bg.blue < 128;
    this.root = new St.Widget({
      style_class: dark ? 'visor-dark' : 'visor-light',
      style: `background-color: rgb(${bg.red},${bg.green},${bg.blue}); border-radius: 0 0 30px 30px;`,
      reactive: true,
      visible: false,
    });
    Main.layoutManager.addChrome(this.root, { trackFullscreen: true });
  }

  setState(state: NotchState): void {
    const previous = this.state;
    this.state = state;
    this.root.remove_all_children();
    const child =
      state === 'open' ? this.content.getSheet() : state === 'peek' ? this.content.getPeek() : null;
    this.root.visible = child !== null;
    if (child) {
      this.root.add_child(child);
      this.place();
    }
    this.content.stateChanged(state, previous);
  }

  private place(): void {
    const monitor = Main.layoutManager.primaryMonitor;
    if (!monitor || this.state === 'idle' || this.state === 'hint') return;
    const child = this.root.get_first_child();
    if (!child) return;
    const width =
      this.state === 'open' ? this.content.sheetWidth() : child.get_preferred_width(-1)[1];
    const height = child.get_preferred_height(width)[1];
    child.set_size(width, height);
    this.root.set_size(width, height);
    this.root.set_position(
      monitor.x + Math.round((monitor.width - width) / 2),
      monitor.y + Main.panel.height,
    );
  }

  open(): void {
    this.setState('open');
  }

  close(): void {
    this.setState('idle');
  }

  toggle(): void {
    this.setState(this.state === 'open' ? 'idle' : 'open');
  }

  flash(): void {}

  contentChanged(): void {
    this.place();
  }

  setAttention(_attention: Attention): void {}

  destroy(): void {
    this.root.remove_all_children();
    Main.layoutManager.removeChrome(this.root);
    this.root.destroy();
  }
}
