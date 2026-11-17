import type Clutter from 'gi://Clutter';
import type St from 'gi://St';

export type NotchState = 'idle' | 'hint' | 'peek' | 'open';

/** Dot next to the clock: accent for unread notifications, amber when something waits for the user. */
export type Attention = 'unread' | 'waiting' | null;

/**
 * What the notch shows. Implemented by core/content.ts, consumed by core/notch.ts.
 *
 * Both widgets are built on first use, never in enable(). All sizes passed
 * through this interface are stage pixels, that is CSS pixels multiplied by
 * the scale factor of the theme context.
 */
export interface NotchContent {
  /** True while at least one chip exists. Without chips the notch never enters peek. */
  hasPeek(): boolean;
  /** One row of chips at its natural size. */
  getPeek(): St.Widget;
  /** The open panel. The notch allocates it sheetWidth() wide and as high as it asks for, up to its limit. */
  getSheet(): St.Widget;
  /** Width of the open panel. Depends on the width setting and on whether the left column has rows. */
  sheetWidth(): number;
  /** Called after every state change, for focus, resetting views and starting or stopping live updates. */
  stateChanged(state: NotchState, previous: NotchState): void;
  /**
   * A press on the peek row is about to open the panel. `target` is the actor
   * below the pointer; a chip opens the panel on what it is about.
   */
  pressed(target: Clutter.Actor | null): void;
  /** Escape while open. Returns true when it was used up (search cleared, module view left). */
  handleEscape(): boolean;
  destroy(): void;
}

/** What the content may ask of the notch. Implemented by core/notch.ts. */
export interface NotchHost {
  readonly state: NotchState;
  open(): void;
  close(): void;
  toggle(): void;
  /**
   * Shows the peek state for three seconds because something happened.
   * Does nothing while open, in fullscreen, with Do Not Disturb on, or when
   * the user turned this off.
   */
  flash(): void;
  /** Chips or the size of the sheet changed: measure again and animate to the new size. */
  contentChanged(): void;
  setAttention(attention: Attention): void;
}
