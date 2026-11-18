// The settings window. It runs in its own process, so nothing here may import
// the shell (St, Clutter, Shell, resource:///org/gnome/shell/ui/).
import type Adw from 'gi://Adw';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { aboutPage } from './prefs/about.js';
import { generalPage } from './prefs/general.js';
import { modulesPage } from './prefs/modules.js';
import { listForeignModules } from './prefs/shell-extensions.js';

export default class VisorPreferences extends ExtensionPreferences {
  override async fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
    const settings = this.getSettings();
    window.set_default_size(640, 820);
    window.add(generalPage(settings, window));
    window.add(modulesPage(settings, await listForeignModules(), window, this.path));
    window.add(aboutPage(this.metadata, window));
  }
}
