import Clutter from 'gi://Clutter';

interface KeyController extends Clutter.Action {
  get_key(): [boolean, number, ...unknown[]];
}

/**
 * Hands each key press on `actor` to `onKey` in the capture phase, through a
 * Clutter.KeyController. Since GNOME 51 the shell itself handles keys that
 * way (the menu manager's Escape, the focus manager's Tab and arrows), ahead
 * of captured-event and key-press-event handlers; a controller added before
 * theirs runs first. Returns null before GNOME 51, which has none.
 */
export function addCaptureKeyController(
  actor: Clutter.Actor,
  name: string,
  onKey: (symbol: number) => boolean,
): Clutter.Action | null {
  const clutter = Clutter as unknown as {
    KeyController?: new () => KeyController;
    EventPhase?: { CAPTURE: number };
  };
  if (!clutter.KeyController || !clutter.EventPhase) return null;
  const keys = new clutter.KeyController();
  keys.connect('key-press', () => onKey(keys.get_key()[1]));
  (
    actor as unknown as {
      add_action_full(name: string, phase: number, action: Clutter.Action): void;
    }
  ).add_action_full(name, clutter.EventPhase.CAPTURE, keys);
  return keys;
}
