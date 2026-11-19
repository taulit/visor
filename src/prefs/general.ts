// The page with the behaviour of the island.
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { N_ } from './builtin-modules.js';
import { shortcutRow } from './shortcut.js';

/** The values of the setting `width`, in the order of the choices. */
const WIDTHS = [
  { value: 'compact', title: N_('Compact') },
  { value: 'normal', title: N_('Normal') },
  { value: 'wide', title: N_('Wide') },
];

function switchRow(
  settings: Gio.Settings,
  key: string,
  title: string,
  subtitle?: string,
): Adw.SwitchRow {
  const row = new Adw.SwitchRow({ title, subtitle: subtitle ?? '' });
  settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
  return row;
}

function delayRow(settings: Gio.Settings): Adw.SpinRow {
  const row = new Adw.SpinRow({
    title: _('Delay before the preview'),
    subtitle: _('In milliseconds'),
    adjustment: new Gtk.Adjustment({
      lower: 100,
      upper: 2000,
      step_increment: 20,
      page_increment: 100,
    }),
  });
  settings.bind('peek-delay', row, 'value', Gio.SettingsBindFlags.DEFAULT);
  settings.bind('hover-preview', row, 'sensitive', Gio.SettingsBindFlags.GET);
  return row;
}

function widthRow(settings: Gio.Settings): Adw.ComboRow {
  const row = new Adw.ComboRow({
    title: _('Width'),
    subtitle: _('Of the open panel'),
    model: Gtk.StringList.new(WIDTHS.map(width => _(width.title))),
  });
  const show = (): void => {
    const index = WIDTHS.findIndex(width => width.value === settings.get_string('width'));
    row.selected = Math.max(index, 0);
  };
  show();
  settings.connect('changed::width', show);
  row.connect('notify::selected', () => {
    const width = WIDTHS[row.selected];
    if (width) settings.set_string('width', width.value);
  });
  return row;
}

export function generalPage(
  settings: Gio.Settings,
  window: Adw.PreferencesWindow,
): Adw.PreferencesPage {
  const page = new Adw.PreferencesPage({
    name: 'general',
    title: _('General'),
    icon_name: 'preferences-system-symbolic',
  });

  const shortcut = new Adw.PreferencesGroup({ title: _('Shortcut') });
  shortcut.add(
    new Adw.ActionRow({
      title: _('Notification list'),
      subtitle: _(
        'The shortcut of the shell for the notification list, Super+V by default, always opens Visor. Change it in the keyboard settings.',
      ),
    }),
  );
  shortcut.add(shortcutRow(settings, window));
  page.add(shortcut);

  const behavior = new Adw.PreferencesGroup({ title: _('Behavior') });
  behavior.add(switchRow(settings, 'hover-preview', _('Preview on hover')));
  behavior.add(delayRow(settings));
  behavior.add(switchRow(settings, 'flash-on-events', _('Show briefly on events')));
  page.add(behavior);

  const appearance = new Adw.PreferencesGroup({ title: _('Appearance') });
  appearance.add(widthRow(settings));
  page.add(appearance);

  const upcoming = new Adw.PreferencesGroup({ title: _('Up Next') });
  upcoming.add(
    switchRow(
      settings,
      'upcoming-calendar',
      _('Show a calendar'),
      _(
        'The current week above the next events. Its title opens the month; a day shows its events.',
      ),
    ),
  );
  page.add(upcoming);

  const search = new Adw.PreferencesGroup({ title: _('Search') });
  search.add(
    switchRow(
      settings,
      'currency-rates',
      _('Load currency rates'),
      _('The rates come from the European Central Bank, at most once a day.'),
    ),
  );
  page.add(search);
  return page;
}
