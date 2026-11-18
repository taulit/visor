// The list of results below the search row. The search entry keeps the
// keyboard focus; the list only shows which line Enter would choose.
import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import type Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import { ensureActorVisibleInScrollView } from 'resource:///org/gnome/shell/misc/animationUtils.js';

import { keepSelection, moveSelection } from './model.js';

const ICON_SIZE = 16;
const APP_ICON_SIZE = 22;

/** One line of the list. */
export interface Item {
  id: string;
  title: string;
  subtitle?: string;
  icon?: string | Gio.Icon;
  /** Builds the icon instead of `icon`, as GNOME search providers do. */
  createIcon?: (size: number) => Clutter.Actor | null;
  /** 'app' draws the icon in its colours and larger. */
  iconStyle?: 'symbolic' | 'app';
  /** Short text on the right. */
  hint?: string;
  /** Larger title, for the result of a calculation. */
  large?: boolean;
  /** Enter or a click. Without it the line only says something and cannot be selected. */
  activate?: () => void;
  /** Ctrl+Enter. */
  alternate?: () => void;
  /** Choosing the line leaves the panel open, as completing a keyword does. */
  keepOpen?: boolean;
}

export interface Group {
  id: string;
  /** Shown above the lines; empty for a group without a label. */
  label: string;
  items: Item[];
}

interface ResultsCallbacks {
  /** A line was clicked. */
  activate(item: Item): void;
}

/**
 * One line of the list. Its actors are kept and filled again when the list
 * changes: new actors would have to be styled first, and that is what takes
 * time while typing.
 */
class Line {
  readonly actor: St.BoxLayout;
  key = '';
  item: Item | null = null;
  private tile: St.Bin;
  private icon: St.Icon | null = null;
  private title: St.Label;
  private subtitle: St.Label;
  private hint: St.Label;
  private selected = false;
  /** The icon the line gets as soon as there is time for it. */
  private late: Gio.Icon | null = null;

  constructor(owner: { pick(line: Line): void; activate(item: Item): void }) {
    this.actor = new St.BoxLayout({
      style_class: 'visor-result',
      x_expand: true,
      reactive: true,
      accessible_role: Atk.Role.LIST_ITEM,
    });
    this.tile = new St.Bin({
      style_class: 'visor-result-tile',
      y_align: Clutter.ActorAlign.CENTER,
    });
    this.actor.add_child(this.tile);
    const text = new St.BoxLayout({
      vertical: true,
      x_expand: true,
      y_align: Clutter.ActorAlign.CENTER,
    });
    this.actor.add_child(text);
    this.title = new St.Label({ style_class: 'visor-result-title' });
    this.subtitle = new St.Label({ style_class: 'visor-result-subtitle' });
    text.add_child(this.title);
    text.add_child(this.subtitle);
    this.hint = new St.Label({
      style_class: 'visor-result-hint',
      y_align: Clutter.ActorAlign.CENTER,
    });
    this.actor.add_child(this.hint);

    // Motion, not hover: a list that changes below a resting pointer must
    // not move the selection.
    this.actor.connect('motion-event', () => {
      if (this.item?.activate) owner.pick(this);
      return Clutter.EVENT_PROPAGATE;
    });
    const click = new Clutter.ClickGesture();
    click.connect('recognize', () => {
      if (this.item?.activate) owner.activate(this.item);
    });
    this.actor.add_action(click);
  }

  /** After `deadline` (monotonic time) a new icon is not looked up but left to showLateIcon(). */
  fill(key: string, item: Item, deadline: number): void {
    // A line that is filled with another result is not the selected one any more.
    const selected = this.selected && key === this.key;
    this.key = key;
    this.item = item;
    this.actor.visible = true;
    setClass(this.actor, 'quiet', !item.activate);
    const name = item.subtitle ? `${item.title}, ${item.subtitle}` : item.title;
    if (this.actor.accessible_name !== name) this.actor.accessible_name = name;
    if (this.title.text !== item.title) this.title.text = item.title;
    setClass(this.title, 'large', item.large === true);
    const subtitle = item.subtitle ?? '';
    if (this.subtitle.text !== subtitle) this.subtitle.text = subtitle;
    this.subtitle.visible = subtitle !== '';
    this.fillIcon(item, deadline);
    this.select(selected);
  }

  /** The pool keeps the line for the next list. */
  clear(): void {
    this.key = '';
    this.item = null;
    this.late = null;
    this.actor.visible = false;
    this.select(false);
  }

  select(selected: boolean): void {
    if (selected !== this.selected) {
      // The keyboard focus stays in the entry; the state is what a screen reader can follow.
      if (selected) this.actor.add_accessible_state(Atk.StateType.SELECTED);
      else this.actor.remove_accessible_state(Atk.StateType.SELECTED);
    }
    this.selected = selected;
    setClass(this.actor, 'selected', selected);
    // The selected line says what Enter does, or at least that Enter does something.
    const hint = this.item?.hint ?? (selected ? '↵' : '');
    if (this.hint.text !== hint) this.hint.text = hint;
    this.hint.visible = hint !== '';
  }

  /** True when the line still waits for its icon. */
  get waits(): boolean {
    return this.late !== null;
  }

  showLateIcon(): void {
    if (this.late && this.icon) this.icon.gicon = this.late;
    this.late = null;
  }

  private fillIcon(item: Item, deadline: number): void {
    this.late = null;
    const app = item.iconStyle === 'app';
    let custom: Clutter.Actor | null = null;
    if (item.createIcon) {
      try {
        custom = item.createIcon(app ? APP_ICON_SIZE : ICON_SIZE);
      } catch {
        // A provider with a broken icon still has a result.
      }
    }
    if (custom) {
      // The tile destroys the icon it showed before.
      this.icon = null;
      this.tile.set_child(custom);
    } else if (item.icon !== undefined) {
      if (!this.icon) {
        this.icon = new St.Icon({ style_class: 'visor-result-icon' });
        this.tile.set_child(this.icon);
      }
      setClass(this.icon, 'app', app);
      if (typeof item.icon === 'string') {
        if (this.icon.icon_name !== item.icon) this.icon.icon_name = item.icon;
      } else if (this.icon.gicon !== item.icon && !(this.icon.gicon?.equal(item.icon) ?? false)) {
        // Finding an icon in the theme takes a millisecond or two. A list full
        // of new ones would hold up its own text, so the rest follows a moment later.
        if (GLib.get_monotonic_time() > deadline) {
          this.late = item.icon;
          this.icon.set_gicon(null as unknown as Gio.Icon);
        } else {
          this.icon.gicon = item.icon;
        }
      }
    }
    this.tile.visible = custom !== null || item.icon !== undefined;
  }
}

function setClass(actor: St.Widget, name: string, on: boolean): void {
  if (on === actor.has_style_class_name(name)) return;
  if (on) actor.add_style_class_name(name);
  else actor.remove_style_class_name(name);
}

interface Section {
  box: St.BoxLayout;
  label: St.Label;
  /** The list the lines were filled from. */
  items: Item[] | null;
  /** The lines that show something, in order. */
  lines: Line[];
  /** Lines that wait for a longer list. */
  spare: Line[];
  /** Stays, empty and hidden, while its group is not in the list. */
  reserved: boolean;
}

export class Results {
  /** What goes into the overlay of the sheet. */
  readonly actor: St.ScrollView;
  private box: St.BoxLayout;
  private sections = new Map<string, Section>();
  private order: string[] = [];
  private selectedKey: string | null = null;
  /** The user moved the selection since the query changed. */
  private picked = false;
  /** Idle source that gives lines the icons there was no time for. */
  private later = 0;

  constructor(private callbacks: ResultsCallbacks) {
    this.box = new St.BoxLayout({
      style_class: 'visor-results',
      vertical: true,
      x_expand: true,
      accessible_role: Atk.Role.LIST,
    });
    this.actor = new St.ScrollView({
      style_class: 'visor-results-scroll',
      accessible_role: Atk.Role.SCROLL_PANE,
      hscrollbar_policy: St.PolicyType.NEVER,
      vscrollbar_policy: St.PolicyType.AUTOMATIC,
      overlay_scrollbars: true,
      x_expand: true,
      // A press between two lines must not reach the rows below the overlay.
      reactive: true,
      child: this.box,
    });
  }

  /**
   * Shows the groups in this order. A group whose `items` is the list it
   * already shows is left alone. `fresh` is true for a new query: the first
   * line is selected again and the list scrolls back to the top. Icons that
   * are not in place by `deadline` (monotonic time) follow when the shell is idle.
   */
  set(groups: readonly Group[], fresh: boolean, deadline = Infinity): void {
    const wanted = new Set(groups.map(group => group.id));
    for (const [id, section] of this.sections) {
      if (wanted.has(id)) continue;
      if (section.reserved) {
        if (section.items?.length !== 0) this.fill(section, { id, label: '', items: [] }, deadline);
      } else {
        section.box.destroy();
        this.sections.delete(id);
      }
    }
    this.order = groups.map(group => group.id);
    groups.forEach((group, index) => {
      const section = this.section(group.id);
      if (this.box.get_child_at_index(index) !== section.box)
        this.box.set_child_at_index(section.box, index);
      if (section.items !== group.items) this.fill(section, group, deadline);
    });
    this.scheduleIcons();

    if (fresh) {
      this.picked = false;
      this.actor.vadjustment.value = 0;
    }
    this.select(keepSelection(this.keys(), this.selectedKey, this.picked), false);
  }

  /**
   * Builds the lines of a group ahead of the first list, so that showing it
   * only has to fill them.
   */
  reserve(id: string, lines: number): void {
    const section = this.section(id);
    section.reserved = true;
    while (section.lines.length + section.spare.length < lines) {
      const line = this.buildLine();
      line.clear();
      section.spare.push(line);
      section.box.add_child(line.actor);
    }
  }

  /** The line Enter would choose. */
  get selected(): Item | null {
    return this.find(this.selectedKey)?.item ?? null;
  }

  /** Down (1) or Up (-1). */
  move(step: 1 | -1): void {
    this.picked = true;
    this.select(moveSelection(this.keys(), this.selectedKey, step), true);
  }

  destroy(): void {
    if (this.later) GLib.source_remove(this.later);
    this.later = 0;
    this.sections.clear();
    this.order = [];
    this.actor.destroy();
  }

  private section(id: string): Section {
    let section = this.sections.get(id);
    if (!section) {
      section = {
        box: new St.BoxLayout({ vertical: true, x_expand: true, visible: false }),
        label: new St.Label({
          style_class: 'visor-result-group',
          accessible_role: Atk.Role.HEADING,
        }),
        items: null,
        lines: [],
        spare: [],
        reserved: false,
      };
      section.box.add_child(section.label);
      this.sections.set(id, section);
      this.box.add_child(section.box);
    }
    return section;
  }

  private buildLine(): Line {
    return new Line({
      pick: picked => {
        if (this.selectedKey === picked.key) return;
        this.picked = true;
        this.select(picked.key, false);
      },
      activate: chosen => this.callbacks.activate(chosen),
    });
  }

  private keys(): string[] {
    const keys: string[] = [];
    for (const id of this.order) {
      for (const line of this.sections.get(id)?.lines ?? [])
        if (line.item?.activate) keys.push(line.key);
    }
    return keys;
  }

  private find(key: string | null): Line | null {
    if (key === null) return null;
    for (const section of this.sections.values()) {
      const line = section.lines.find(other => other.key === key);
      if (line) return line;
    }
    return null;
  }

  private select(key: string | null, reveal: boolean): void {
    const previous = this.find(this.selectedKey);
    const next = this.find(key);
    this.selectedKey = next ? key : null;
    if (previous && previous !== next) previous.select(false);
    if (next) {
      next.select(true);
      if (reveal && this.actor.mapped) ensureActorVisibleInScrollView(this.actor, next.actor);
    }
  }

  private scheduleIcons(): void {
    const waiting = [...this.sections.values()].some(section =>
      section.lines.some(line => line.waits),
    );
    if (!waiting && this.later) {
      GLib.source_remove(this.later);
      this.later = 0;
    } else if (waiting && !this.later) {
      this.later = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        this.later = 0;
        for (const section of this.sections.values())
          for (const line of section.lines) line.showLateIcon();
        return GLib.SOURCE_REMOVE;
      });
    }
  }

  private fill(section: Section, group: Group, deadline: number): void {
    const { items } = group;
    section.items = items;
    section.box.visible = items.length > 0;
    const label = group.label.toLocaleUpperCase();
    if (section.label.text !== label) section.label.text = label;
    section.label.visible = label !== '';
    for (const line of section.lines.splice(items.length)) {
      line.clear();
      section.spare.push(line);
    }
    items.forEach((item, index) => {
      let line = section.lines[index];
      if (!line) {
        line = section.spare.pop();
        if (!line) {
          line = this.buildLine();
          section.box.add_child(line.actor);
        }
        section.lines.push(line);
      }
      // Below the label, in the order of the list; a line from the reserve may sit elsewhere.
      if (section.box.get_child_at_index(index + 1) !== line.actor)
        section.box.set_child_at_index(line.actor, index + 1);
      line.fill(`${group.id}\u0000${item.id}`, item, deadline);
    });
  }
}
