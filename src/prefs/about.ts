// The page about Visor: version, links, license.
import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const WEBSITE = 'https://taulit.github.io/visor';
const SOURCE = 'https://github.com/taulit/visor';

function linkRow(window: Adw.PreferencesWindow, title: string, uri: string): Adw.ActionRow {
  const row = new Adw.ActionRow({ title, subtitle: uri, activatable: true });
  row.add_suffix(new Gtk.Image({ icon_name: 'adw-external-link-symbolic' }));
  row.connect('activated', () => Gtk.show_uri(window, uri, Gdk.CURRENT_TIME));
  return row;
}

export function aboutPage(
  metadata: Record<string, unknown>,
  window: Adw.PreferencesWindow,
): Adw.PreferencesPage {
  const page = new Adw.PreferencesPage({
    name: 'about',
    title: _('About'),
    icon_name: 'help-about-symbolic',
  });

  const about = new Adw.PreferencesGroup();
  about.add(
    new Adw.ActionRow({
      title: String(metadata['name'] ?? 'Visor'),
      subtitle: GLib.markup_escape_text(String(metadata['description'] ?? ''), -1),
    }),
  );
  about.add(
    new Adw.ActionRow({ title: _('Version'), subtitle: String(metadata['version-name'] ?? '') }),
  );
  about.add(new Adw.ActionRow({ title: _('License'), subtitle: 'GPL-2.0-or-later' }));
  page.add(about);

  const links = new Adw.PreferencesGroup({ title: _('Links') });
  links.add(linkRow(window, _('Website'), WEBSITE));
  links.add(linkRow(window, _('Source code'), SOURCE));
  links.add(linkRow(window, _('Report an issue'), `${SOURCE}/issues`));
  page.add(links);
  return page;
}
