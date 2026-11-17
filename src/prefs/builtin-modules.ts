// The modules Visor ships, as the settings window needs to know them. The
// window runs in its own process and cannot load the modules themselves
// (they import the shell), so this table repeats id, slot and icon.
// tests/prefs-table.test.ts keeps it in sync with src/modules/.
import type { Slot } from '../api.js';

/** Marks a text for translation; the window translates it when it shows it. */
export const N_ = (text: string): string => text;

export interface ModuleInfo {
  id: string;
  slot: Slot;
  icon: string;
  name: string;
}

export const BUILTIN_MODULES: readonly ModuleInfo[] = [
  { id: 'media', slot: 'now', icon: 'emblem-music-symbolic', name: N_('Media') },
  { id: 'timers', slot: 'now', icon: 'alarm-symbolic', name: N_('Timers') },
  { id: 'downloads', slot: 'now', icon: 'folder-download-symbolic', name: N_('Downloads') },
  { id: 't3', slot: 'now', icon: 'utilities-terminal-symbolic', name: N_('T3 Code') },
  { id: 'upcoming', slot: 'ahead', icon: 'x-office-calendar-symbolic', name: N_('Up Next') },
  {
    id: 'notifications',
    slot: 'ahead',
    icon: 'preferences-system-notifications-symbolic',
    name: N_('Notifications'),
  },
];

/** The slots in the order the sheet shows them, with the name of their group. */
export const SLOTS: readonly { slot: Slot; title: string }[] = [
  { slot: 'now', title: N_('Now') },
  { slot: 'ahead', title: N_('Up Next') },
  { slot: 'dock', title: N_('Dock') },
];
