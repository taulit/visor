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

const KNOWN_IDS = BUILTIN_MODULES.map(module => module.id);

/** Where the modules of one slot are, in display order, and what to do with them. */
interface SlotGroup {
  slot: Slot;
  group: Adw.PreferencesGroup;
  rows: Adw.ActionRow[];
}

export function modulesPage(
  settings: Gio.Settings,
  foreign: readonly ForeignModule[],
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

  /** The built-in modules of a slot in display order. */
  const ofSlot = (slot: Slot): ModuleInfo[] => {
    const info = new Map(BUILTIN_MODULES.map(module => [module.id, module]));
    return orderIds(KNOWN_IDS, settings.get_strv('module-order'))
      .map(id => info.get(id)!)
      .filter(module => module.slot === slot);
  };

  const move = (slot: Slot, from: number, to: number): void => {
    const ids = ofSlot(slot).map(module => module.id);
    if (from === to || !ids[from] || to < 0 || to >= ids.length) return;
    settings.set_strv(
      'module-order',
      moveWithin(KNOWN_IDS, settings.get_strv('module-order'), ids, from, to),
    );
  };

  const setEnabled = (id: string, enabled: boolean): void => {
    const disabled = settings.get_strv('disabled-modules').filter(other => other !== id);
    if (!enabled) disabled.push(id);
    settings.set_strv('disabled-modules', disabled);
  };

  const fill = (): void => {
    switches.clear();
    for (const entry of groups) {
      for (const row of entry.rows) entry.group.remove(row);
      const modules = ofSlot(entry.slot);
      entry.rows = [
        ...modules.map((module, index) =>
          builtinRow(module, index, modules.length, { move, setEnabled, switches }),
        ),
        ...foreign.filter(other => other.slot === entry.slot).map(foreignRow),
      ];
      for (const row of entry.rows) entry.group.add(row);
      entry.group.visible = entry.rows.length > 0;
    }
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
  syncSwitches();

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

function builtinRow(
  module: ModuleInfo,
  index: number,
  count: number,
  actions: RowActions,
): Adw.ActionRow {
  const row = new Adw.ActionRow({ title: _(module.name) });
  row.add_prefix(new Gtk.Image({ icon_name: module.icon }));

  const toggle = new Gtk.Switch({ valign: Gtk.Align.CENTER });
  toggle.connect('notify::active', () => actions.setEnabled(module.id, toggle.active));
  actions.switches.set(module.id, toggle);
  row.add_suffix(toggle);
  row.activatable_widget = toggle;

  row.add_suffix(reorderMenu(row, index, count, module.slot, actions.move));
  addDragAndDrop(row, index, module.slot, actions.move);
  return row;
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

/** A module of another extension: only its own settings can be reached. */
function foreignRow(module: ForeignModule): Adw.ActionRow {
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
    gear.connect('clicked', () => openExtensionPrefs(module.uuid));
    row.add_suffix(gear);
  }
  return row;
}
