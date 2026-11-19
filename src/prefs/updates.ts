// "Updates" on the About page: asks GitHub for the latest release of Visor
// and, with one click, puts it in place of the installed files. The shell
// keeps running the code it loaded at login, so the new version runs after
// the next login; the row offers to log out.
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Soup from 'gi://Soup?version=3.0';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
  installRelease,
  logOut,
  newerRelease,
  ownInstall,
  type Release,
} from '../lib/self-update-io.js';

/** The group "Updates" for the About page. */
export function updatesGroup(
  settings: Gio.Settings,
  metadata: Record<string, unknown>,
  path: string,
): Adw.PreferencesGroup {
  const uuid = String(metadata['uuid'] ?? '');
  const current = String(metadata['version-name'] ?? '');
  const group = new Adw.PreferencesGroup({ title: _('Updates') });
  const row = new Adw.ActionRow({ title: _('Visor is up to date') });
  const spinner = new Adw.Spinner({ visible: false, valign: Gtk.Align.CENTER });
  const button = new Gtk.Button({ valign: Gtk.Align.CENTER, visible: false });
  row.add_suffix(spinner);
  row.add_suffix(button);
  group.add(row);

  const auto = new Adw.SwitchRow({
    title: _('Look for updates'),
    subtitle: _('When this window opens, Visor asks GitHub for its latest release.'),
  });
  settings.bind('update-check', auto, 'active', Gio.SettingsBindFlags.DEFAULT);
  group.add(auto);

  const http = new Soup.Session({ timeout: 30, user_agent: `Visor/${current}` });
  const cancellable = new Gio.Cancellable();
  group.connect('destroy', () => cancellable.cancel());
  let action: (() => void) | null = null;
  button.connect('clicked', () => action?.());

  const show = (state: {
    title: string;
    subtitle?: string;
    busy?: boolean;
    button?: { label: string; suggested?: boolean; run: () => void };
  }): void => {
    row.title = state.title;
    row.subtitle = state.subtitle ?? '';
    spinner.visible = state.busy ?? false;
    button.visible = state.button !== undefined;
    action = state.button?.run ?? null;
    if (state.button) {
      button.label = state.button.label;
      if (state.button.suggested) button.add_css_class('suggested-action');
      else button.remove_css_class('suggested-action');
    }
  };

  // Installed for everybody (a package): the files are not ours to replace.
  const own = ownInstall(path);

  const check = async (): Promise<void> => {
    if (!own) {
      show({
        title: _('Installed for all users'),
        subtitle: _('Update Visor with the package manager it came from.'),
      });
      return;
    }
    show({ title: _('Looking for updates…'), busy: true });
    try {
      const release = await newerRelease(
        http,
        settings.get_string('update-url'),
        uuid,
        current,
        cancellable,
      );
      if (!release) {
        show({
          title: _('Visor is up to date'),
          subtitle: _('Version %s').replace('%s', current),
          button: { label: _('Look again'), run: () => void check() },
        });
        return;
      }
      show({
        title: _('Visor %s is available').replace('%s', release.version),
        subtitle: _('You have version %s.').replace('%s', current),
        button: { label: _('Update'), suggested: true, run: () => void update(release) },
      });
    } catch (e) {
      if (cancellable.is_cancelled()) return;
      console.warn(`Visor: cannot look for updates: ${e}`);
      show({
        title: _('Could not look for updates'),
        subtitle: _('Check the connection and try again.'),
        button: { label: _('Try again'), run: () => void check() },
      });
    }
  };

  const update = async (release: Release): Promise<void> => {
    show({ title: _('Updating to %s…').replace('%s', release.version), busy: true });
    try {
      await installRelease(http, release, uuid, path, cancellable);
      show({
        title: _('Updated to %s').replace('%s', release.version),
        subtitle: _('Log out and back in to use the new version.'),
        button: { label: _('Log Out'), run: logOut },
      });
    } catch (e) {
      if (cancellable.is_cancelled()) return;
      console.warn(`Visor: the update did not work: ${e}`);
      show({
        title: _('The update did not work'),
        subtitle: _('Visor stays as it is. Try again later.'),
        button: { label: _('Try again'), run: () => void update(release) },
      });
    }
  };

  if (settings.get_boolean('update-check') || !own) void check();
  else
    show({
      title: _('Version %s').replace('%s', current),
      button: { label: _('Look for updates'), run: () => void check() },
    });
  return group;
}
