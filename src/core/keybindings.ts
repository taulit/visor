// Shortcuts. The shell's own shortcut for the notification list ends in
// Main.panel.toggleCalendar(); Visor takes that method over while enabled, so
// it follows whatever the user has bound, without touching foreign settings
// (docs/verified.md, section 5). On top comes an optional shortcut of its own.
import type Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

/** Key in the Visor schema, and the name of the keybinding. */
const OWN_SHORTCUT = 'open-shortcut';

type Method = 'toggleCalendar' | 'closeCalendar';
type Overridable = Record<Method, (() => void) | undefined>;

export class Keybindings {
  private panel = Main.panel as unknown as Overridable;
  private previous = new Map<Method, PropertyDescriptor | undefined>();

  constructor(settings: Gio.Settings, actions: { toggle(): void; close(): void }) {
    this.override('toggleCalendar', () => actions.toggle());
    this.override('closeCalendar', () => actions.close());

    Main.wm.addKeybinding(
      OWN_SHORTCUT,
      settings,
      Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
      Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW | Shell.ActionMode.POPUP,
      () => actions.toggle(),
    );
  }

  /** Shadows the method of the prototype with a property of the instance. */
  private override(method: Method, replacement: () => void): void {
    this.previous.set(method, Object.getOwnPropertyDescriptor(this.panel, method));
    this.panel[method] = replacement;
  }

  destroy(): void {
    Main.wm.removeKeybinding(OWN_SHORTCUT);

    for (const [method, descriptor] of this.previous) {
      delete this.panel[method];
      // Somebody else had shadowed it before Visor: hand it back.
      if (descriptor) Object.defineProperty(this.panel, method, descriptor);
    }
    this.previous.clear();
  }
}
