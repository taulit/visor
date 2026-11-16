// The smallest object Main.panel.menuManager accepts as a menu, modelled on
// PopupDummyMenu in ui/popupMenu.js. Registered there, the notch gets what
// the stock panel menus have: a modal grab while open, Escape and a click
// outside close it, and moving the pointer onto another panel button switches
// to that menu (docs/verified.md, section 6).
import type Clutter from 'gi://Clutter';

import * as Signals from 'resource:///org/gnome/shell/misc/signals.js';

type WithDelegate = Clutter.Actor & { _delegate?: unknown };

export class PanelMenuProxy extends Signals.EventEmitter {
  isOpen = false;
  /** True while the menu manager takes or releases the grab. */
  changing = false;

  /**
   * @param sourceActor the actor in the panel that stands for this menu
   * @param actor the root of the grab; contains everything that can be clicked while open
   */
  constructor(
    readonly sourceActor: Clutter.Actor,
    readonly actor: Clutter.Actor,
  ) {
    super();
    (actor as WithDelegate)._delegate = this;
  }

  // The manager passes a BoxPointer.PopupAnimation to open() and close(); it is not needed.
  open(): void {
    this.set(true);
  }

  close(): void {
    this.set(false);
  }

  toggle(): void {
    this.set(!this.isOpen);
  }

  private set(open: boolean): void {
    if (this.isOpen === open) return;
    this.isOpen = open;
    this.changing = true;
    try {
      this.emit('open-state-changed', open);
    } finally {
      this.changing = false;
    }
  }

  destroy(): void {
    this.close();
    this.emit('destroy');
    delete (this.actor as WithDelegate)._delegate;
  }
}
