// The page with the modules: switch them off, put them in order, reach the
// settings of modules that come with other extensions.
import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import type { Slot } from '../api.js';
import { moveWithin, orderIds } from '../lib/modules.js';
import { BUILTIN_MODULES, SLOTS, type ModuleInfo } from './builtin-modules.js';
import { buildDiscover } from './discover.js';
import type { ForeignModule } from './foreign.js';
import { openExtensionPrefs } from './shell-extensions.js';
import { t3Group } from './t3.js';

/** A module the window can switch off and put in order: it knows its id. */
interface Managed {
  id: string;
  slot: Slot;
  builtin?: ModuleInfo;
  foreign?: ForeignModule;
}

/** Where the modules of one slot are, in display order, and what to do with them. */
interface SlotGroup {
  slot: Slot;
  group: Adw.PreferencesGroup;
  rows: Adw.ActionRow[];
}

export function modulesPage(
  settings: Gio.Settings,
  foreign: readonly ForeignModule[],
  window: Adw.PreferencesWindow,
): Adw.PreferencesPage {
  const page = new Adw.PreferencesPage({
    name: 'modules',
    title: _('Modules'),
    icon_name: 'view-grid-symbolic',
  });
  const groups: SlotGroup[] = SLOTS.map(({ slot, title }) => {
    const group = new Adw.PreferencesGroup({ title: _(title) });
    page.add(group);
    return { slot, group, rows: [] };
  });
  const switches = new Map<string, Gtk.Switch>();

  // Built-in modules, then those of other extensions that name their id
  // (`visor.id` in metadata.json), as the registry in the shell has them.
  const managed = new Map<string, Managed>(
    BUILTIN_MODULES.map(builtin => [builtin.id, { id: builtin.id, slot: builtin.slot, builtin }]),
  );
  for (const module of foreign) {
    if (module.id === null || module.incompatible || managed.has(module.id)) continue;
    managed.set(module.id, { id: module.id, slot: module.slot, foreign: module });
  }
  const knownIds = [...managed.keys()];
  const unmanaged = foreign.filter(module => managed.get(module.id ?? '')?.foreign !== module);

  /** The managed modules of a slot in display order. */
  const ofSlot = (slot: Slot): Managed[] =>
    orderIds(knownIds, settings.get_strv('module-order'))
      .map(id => managed.get(id)!)
      .filter(module => module.slot === slot);

  /** The row the keyboard focus returns to after the rows were built anew. */
  let refocus: { slot: Slot; index: number } | null = null;

  const move = (slot: Slot, from: number, to: number): void => {
    const ids = ofSlot(slot).map(module => module.id);
    if (from === to || !ids[from] || to < 0 || to >= ids.length) return;
    // The row is rebuilt; the focus goes to the row that takes its place.
    refocus = { slot, index: to };
    settings.set_strv(
      'module-order',
      moveWithin(knownIds, settings.get_strv('module-order'), ids, from, to),
    );
  };
  const setEnabled = (id: string, enabled: boolean): void => {
    const disabled = settings.get_strv('disabled-modules');
    if (disabled.includes(id) !== enabled) return; // the switch only follows the setting
    settings.set_strv(
      'disabled-modules',
      enabled ? disabled.filter(other => other !== id) : [...disabled, id],
    );
  };

  const fill = (): void => {
    const disabled = settings.get_strv('disabled-modules');
    const actions: RowActions = { move, setEnabled, switches };
    switches.clear();
    for (const entry of groups) {
      for (const row of entry.rows) entry.group.remove(row);
      const modules = ofSlot(entry.slot);
      entry.rows = [
        ...modules.map((module, index) => {
          const row = module.builtin
            ? builtinRow(module.builtin)
            : foreignRow(module.foreign!, window);
          const place = { slot: module.slot, index, count: modules.length };
          addControls(row, module.id, place, !disabled.includes(module.id), actions);
          return row;
        }),
        ...unmanaged
          .filter(other => other.slot === entry.slot)
          .map(other => foreignRow(other, window)),
      ];
      for (const row of entry.rows) entry.group.add(row);
      entry.group.visible = entry.rows.length > 0;
      if (refocus?.slot === entry.slot) entry.rows[refocus.index]?.grab_focus();
    }
    refocus = null;
  };
  fill();

  const syncSwitches = (): void => {
    const disabled = settings.get_strv('disabled-modules');
    for (const [id, toggle] of switches) toggle.active = !disabled.includes(id);
  };
  settings.connect('changed::disabled-modules', syncSwitches);
  // Rebuilding inside a drop handler would remove the row that is still being handled.
  settings.connect('changed::module-order', () =>
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => (fill(), GLib.SOURCE_REMOVE)),
  );

  page.add(t3Group(settings, window));

  const discover = new Adw.PreferencesGroup({ title: _('Discover') });
  buildDiscover(discover);
  page.add(discover);
  return page;
}

interface RowActions {
  move: (slot: Slot, from: number, to: number) => void;
  setEnabled: (id: string, enabled: boolean) => void;
  /** Filled with the switch of every row, by module id. */
  switches: Map<string, Gtk.Switch>;
}

/** Where a row is among the rows of its slot. */
interface Place {
  slot: Slot;
  index: number;
  count: number;
}

function builtinRow(module: ModuleInfo): Adw.ActionRow {
  const row = new Adw.ActionRow({ title: _(module.name) });
  row.add_prefix(new Gtk.Image({ icon_name: module.icon }));
  return row;
}

/** The switch, the menu and the drag handle of a module whose id the window knows. */
function addControls(
  row: Adw.ActionRow,
  id: string,
  place: Place,
  enabled: boolean,
  actions: RowActions,
): void {
  const toggle = new Gtk.Switch({ active: enabled, valign: Gtk.Align.CENTER });
  toggle.connect('notify::active', () => actions.setEnabled(id, toggle.active));
  actions.switches.set(id, toggle);
  row.add_suffix(toggle);
  row.activatable_widget = toggle;

  row.add_suffix(reorderMenu(row, place.index, place.count, place.slot, actions.move));
  addDragAndDrop(row, place.index, place.slot, actions.move);
}

/** A menu with "Move up" and "Move down" for people who do not drag. */
function reorderMenu(
  row: Adw.ActionRow,
  index: number,
  count: number,
  slot: Slot,
  move: (slot: Slot, from: number, to: number) => void,
): Gtk.MenuButton {
  const actions = new Gio.SimpleActionGroup();
  for (const [name, step] of [
    ['up', -1],
    ['down', 1],
  ] as const) {
    const action = new Gio.SimpleAction({
      name,
      enabled: index + step >= 0 && index + step < count,
    });
    action.connect('activate', () => move(slot, index, index + step));
    actions.add_action(action);
  }
  row.insert_action_group('module', actions);

  const menu = new Gio.Menu();
  menu.append(_('Move up'), 'module.up');
  menu.append(_('Move down'), 'module.down');
  return new Gtk.MenuButton({
    icon_name: 'view-more-symbolic',
    tooltip_text: _('Change the order'),
    menu_model: menu,
    valign: Gtk.Align.CENTER,
    css_classes: ['flat'],
  });
}

/** The handle drags the module, any row of the same slot takes it. */
function addDragAndDrop(
  row: Adw.ActionRow,
  index: number,
  slot: Slot,
  move: (slot: Slot, from: number, to: number) => void,
): void {
  const handle = new Gtk.Image({
    icon_name: 'list-drag-handle-symbolic',
    tooltip_text: _('Drag to change the order'),
  });
  row.add_prefix(handle);

  const source = new Gtk.DragSource({ actions: Gdk.DragAction.MOVE });
  source.connect('prepare', () => {
    const value = new GObject.Value();
    value.init(GObject.TYPE_STRING);
    value.set_string(`${slot}:${index}`);
    return Gdk.ContentProvider.new_for_value(value);
  });
  source.connect('drag-begin', () => source.set_icon(Gtk.WidgetPaintable.new(row), 0, 0));
  handle.add_controller(source);

  const target = new Gtk.DropTarget({ actions: Gdk.DragAction.MOVE });
  target.set_gtypes([GObject.TYPE_STRING]);
  target.connect('drop', (_target, value: string) => {
    const [dragSlot, from] = value.split(':');
    if (dragSlot !== slot) return false;
    move(slot, Number(from), index);
    return true;
  });
  row.add_controller(target);
}

/** A module of another extension: its own settings can be reached; more when it names its id. */
function foreignRow(module: ForeignModule, window: Adw.PreferencesWindow): Adw.ActionRow {
  let subtitle = module.description;
  if (module.incompatible) subtitle = _('Built for another version of Visor');
  else if (!module.enabled) subtitle = _('Turned off in the extensions');

  const row = new Adw.ActionRow({
    title: module.name,
    subtitle,
    subtitle_lines: 2,
  });
  row.add_prefix(new Gtk.Image({ icon_name: 'application-x-addon-symbolic' }));
  if (module.hasPrefs) {
    const gear = new Gtk.Button({
      icon_name: 'emblem-system-symbolic',
      tooltip_text: _('Settings of the module'),
      valign: Gtk.Align.CENTER,
      css_classes: ['flat'],
    });
    gear.connect('clicked', () => {
      // The shell shows the settings of one extension at a time and refuses a
      // second window ("Already showing a prefs dialog"), so this one goes first.
      window.close();
      openExtensionPrefs(module.uuid);
    });
    row.add_suffix(gear);
  }
  return row;
}
