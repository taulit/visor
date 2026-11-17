// Test fixture: the settings window of the notes extension.
import Adw from 'gi://Adw';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class Fixture extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const page = new Adw.PreferencesPage();
    page.add(new Adw.PreferencesGroup({ title: 'Settings of Notes' }));
    window.add(page);
  }
}
