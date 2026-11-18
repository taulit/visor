// What the shell can do to the session, as lines of the search: lock, suspend,
// log out, restart, power off, screenshot, and the switches for the dark
// style, Do Not Disturb and Night Light.
import Gio from 'gi://Gio';

import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';

import { normalize } from './quick/match.js';
import type { Item } from './results.js';

export const MAX_SYSTEM = 3;

interface Action {
  id: string;
  title: string;
  /** More words it is found by, in English and German. */
  keywords: string;
  icon: string;
  run: () => void;
}

export class SystemCommands {
  private desktop = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
  private notifications = new Gio.Settings({ schema_id: 'org.gnome.desktop.notifications' });
  private color: Gio.Settings | null;

  constructor(private gettext: (s: string) => string) {
    // The schema belongs to gnome-settings-daemon.
    const schema = Gio.SettingsSchemaSource.get_default()?.lookup(
      'org.gnome.settings-daemon.plugins.color',
      true,
    );
    this.color = schema ? new Gio.Settings({ settings_schema: schema }) : null;
  }

  /** The actions every word of the query is found in. */
  search(query: string): Item[] {
    const _ = this.gettext;
    const words = normalize(query).split(/\s+/).filter(Boolean);
    // One or two letters begin too many of them.
    if (words.join('').length < 3) return [];
    return this.actions()
      .filter(action => {
        const text = normalize(`${action.title} ${action.keywords}`);
        return words.every(word => text.split(/\s+/).some(part => part.startsWith(word)));
      })
      .slice(0, MAX_SYSTEM)
      .map(action => ({
        id: `system:${action.id}`,
        title: action.title,
        subtitle: _('System'),
        icon: action.icon,
        activate: action.run,
      }));
  }

  destroy(): void {
    this.color = null;
  }

  private actions(): Action[] {
    const _ = this.gettext;
    const system = SystemActions.getDefault() as unknown as { activateAction(id: string): void };
    const act = (id: string) => () => system.activateAction(id);
    const dark = this.desktop.get_string('color-scheme') === 'prefer-dark';
    const quiet = !this.notifications.get_boolean('show-banners');
    const color = this.color;
    const night = color?.get_boolean('night-light-enabled') ?? false;

    const actions: Action[] = [
      {
        id: 'lock',
        title: _('Lock Screen'),
        keywords: 'lock screen sperren bildschirm',
        icon: 'system-lock-screen-symbolic',
        run: act('lock-screen'),
      },
      {
        id: 'suspend',
        title: _('Suspend'),
        keywords: 'suspend sleep standby bereitschaft ruhezustand',
        icon: 'weather-clear-night-symbolic',
        run: act('suspend'),
      },
      {
        id: 'logout',
        title: _('Log Out'),
        keywords: 'log out logout sign out abmelden',
        icon: 'system-log-out-symbolic',
        run: act('logout'),
      },
      {
        id: 'restart',
        title: _('Restart'),
        keywords: 'restart reboot neustart neu starten',
        icon: 'system-reboot-symbolic',
        run: act('restart'),
      },
      {
        id: 'power-off',
        title: _('Power Off'),
        keywords: 'power off shutdown shut down ausschalten herunterfahren',
        icon: 'system-shutdown-symbolic',
        run: act('power-off'),
      },
      {
        id: 'screenshot',
        title: _('Take Screenshot'),
        keywords: 'take screenshot capture bildschirmfoto',
        icon: 'camera-photo-symbolic',
        run: act('open-screenshot-ui'),
      },
      {
        id: 'dark',
        title: dark ? _('Turn Off Dark Style') : _('Turn On Dark Style'),
        keywords: 'dark mode style light theme dunkel hell modus',
        icon: 'weather-clear-night-symbolic',
        run: () => this.desktop.set_string('color-scheme', dark ? 'default' : 'prefer-dark'),
      },
      {
        id: 'dnd',
        title: quiet ? _('Turn Off Do Not Disturb') : _('Turn On Do Not Disturb'),
        keywords: 'do not disturb dnd notifications nicht stören benachrichtigungen',
        icon: 'notifications-disabled-symbolic',
        run: () => this.notifications.set_boolean('show-banners', quiet),
      },
    ];
    if (color)
      actions.push({
        id: 'night-light',
        title: night ? _('Turn Off Night Light') : _('Turn On Night Light'),
        keywords: 'night light nachtlicht blue light',
        icon: 'night-light-symbolic',
        run: () => color.set_boolean('night-light-enabled', !night),
      });
    return actions;
  }
}
