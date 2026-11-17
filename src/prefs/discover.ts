// The "Discover" group of the modules page. The catalog of modules replaces
// the body of buildDiscover(); the modules page only calls it with an empty group.
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export function buildDiscover(group: Adw.PreferencesGroup): void {
  const row = new Adw.ActionRow({
    title: _('The catalog of modules arrives with a later version.'),
    title_lines: 0,
  });
  row.add_suffix(
    new Gtk.LinkButton({
      uri: 'https://taulit.github.io/visor/',
      label: _('Website'),
      valign: Gtk.Align.CENTER,
    }),
  );
  group.add(row);
}
