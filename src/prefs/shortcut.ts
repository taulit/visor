// The row for the additional shortcut and the dialog that captures it.
import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const KEY = 'open-shortcut';
/** A shortcut needs one of these; Shift alone would break typing. */
const REAL_MODIFIERS =
  Gdk.ModifierType.CONTROL_MASK |
  Gdk.ModifierType.ALT_MASK |
  Gdk.ModifierType.SUPER_MASK |
  Gdk.ModifierType.META_MASK;

export function shortcutRow(settings: Gio.Settings, window: Adw.PreferencesWindow): Adw.ActionRow {
  const row = new Adw.ActionRow({
    title: _('Additional shortcut'),
    subtitle: _('Opens Visor as well.'),
    activatable: true,
  });
  const label = new Gtk.ShortcutLabel({
    accelerator: '',
    disabled_text: _('None'),
    valign: Gtk.Align.CENTER,
  });
  const clear = new Gtk.Button({
    icon_name: 'edit-clear-symbolic',
    tooltip_text: _('Remove the shortcut'),
    valign: Gtk.Align.CENTER,
    css_classes: ['flat'],
  });
  clear.connect('clicked', () => settings.set_strv(KEY, []));
  row.add_suffix(label);
  row.add_suffix(clear);
  row.connect('activated', () => captureShortcut(settings, window));

  const show = (): void => {
    const [shortcut = ''] = settings.get_strv(KEY);
    label.accelerator = shortcut;
    clear.visible = shortcut !== '';
  };
  settings.connect(`changed::${KEY}`, show);
  show();
  return row;
}

/** Asks for a shortcut: keys set it, Esc cancels, Backspace removes it. */
function captureShortcut(settings: Gio.Settings, window: Adw.PreferencesWindow): void {
  const dialog = new Adw.AlertDialog({
    heading: _('Additional shortcut'),
    body: _('Press the keys you want to use. Esc cancels, Backspace removes the shortcut.'),
  });
  dialog.add_response('cancel', _('Cancel'));

  const keys = new Gtk.EventControllerKey({ propagation_phase: Gtk.PropagationPhase.CAPTURE });
  keys.connect('key-pressed', (_controller, keyval, _keycode, state) => {
    const modifiers = state & Gtk.accelerator_get_default_mod_mask();
    if (modifiers === 0 && keyval === Gdk.KEY_Escape) return Gdk.EVENT_PROPAGATE;
    if (modifiers === 0 && keyval === Gdk.KEY_BackSpace) {
      settings.set_strv(KEY, []);
      dialog.close();
      return Gdk.EVENT_STOP;
    }
    const key = Gdk.keyval_to_lower(keyval);
    if (!(modifiers & REAL_MODIFIERS) || !Gtk.accelerator_valid(key, modifiers))
      return Gdk.EVENT_STOP;
    settings.set_strv(KEY, [Gtk.accelerator_name(key, modifiers)]);
    dialog.close();
    return Gdk.EVENT_STOP;
  });
  dialog.add_controller(keys);
  dialog.present(window);
}
