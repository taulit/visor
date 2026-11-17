// The list of results below the search row. The search entry keeps the
// keyboard focus; the list only shows which line Enter would choose.
import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import type Gio from 'gi://Gio';
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

export interface ResultsCallbacks {
  /** A line was clicked. */
  activate(item: Item): void;
}

interface Line {
  key: string;
  item: Item;
  actor: St.BoxLayout;
  hint: St.Label;
}

interface Section {
  box: St.BoxLayout;
  label: string;
  /** The list the lines were built from. */
  items: Item[] | null;
  lines: Line[];
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

  constructor(private callbacks: ResultsCallbacks) {
    this.box = new St.BoxLayout({
      style_class: 'visor-results',
      vertical: true,
      x_expand: true,
      accessible_role: Atk.Role.LIST,
    });
    this.actor = new St.ScrollView({
      style_class: 'visor-results-scroll',
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
   * line is selected again and the list scrolls back to the top.
   */
  set(groups: readonly Group[], fresh: boolean): void {
    const wanted = new Set(groups.map(group => group.id));
    for (const [id, section] of this.sections) {
      if (wanted.has(id)) continue;
      section.box.destroy();
      this.sections.delete(id);
    }
    this.order = groups.map(group => group.id);
    groups.forEach((group, index) => {
      let section = this.sections.get(group.id);
      if (!section) {
        section = {
          box: new St.BoxLayout({ vertical: true, x_expand: true }),
          label: '',
          items: null,
          lines: [],
        };
        this.sections.set(group.id, section);
        this.box.add_child(section.box);
      }
      if (this.box.get_child_at_index(index) !== section.box)
        this.box.set_child_at_index(section.box, index);
      if (section.items !== group.items || section.label !== group.label) this.fill(section, group);
    });

    if (fresh) {
      this.picked = false;
      this.actor.vadjustment.value = 0;
    }
    this.select(keepSelection(this.keys(), this.selectedKey, this.picked), false);
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
    this.sections.clear();
    this.order = [];
    this.actor.destroy();
  }

  private keys(): string[] {
    const keys: string[] = [];
    for (const id of this.order) {
      for (const line of this.sections.get(id)?.lines ?? [])
        if (line.item.activate) keys.push(line.key);
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
    if (previous && previous !== next) this.mark(previous, false);
    if (next) {
      this.mark(next, true);
      if (reveal && this.actor.mapped) ensureActorVisibleInScrollView(this.actor, next.actor);
    }
  }

  private mark(line: Line, selected: boolean): void {
    if (selected) line.actor.add_style_class_name('selected');
    else line.actor.remove_style_class_name('selected');
    // The selected line says what Enter does, or at least that Enter does something.
    const hint = line.item.hint ?? (selected ? '↵' : '');
    if (line.hint.text !== hint) line.hint.text = hint;
    line.hint.visible = hint !== '';
  }

  private fill(section: Section, group: Group): void {
    section.box.destroy_all_children();
    section.items = group.items;
    section.label = group.label;
    section.lines = [];
    section.box.visible = group.items.length > 0;
    if (group.items.length === 0) return;
    if (group.label !== '') {
      section.box.add_child(
        new St.Label({
          style_class: 'visor-result-group',
          text: group.label.toLocaleUpperCase(),
          accessible_role: Atk.Role.HEADING,
        }),
      );
    }
    for (const item of group.items) {
      const line = this.buildLine(`${group.id}\u0000${item.id}`, item);
      section.lines.push(line);
      section.box.add_child(line.actor);
    }
  }

  private buildLine(key: string, item: Item): Line {
    const actor = new St.BoxLayout({
      style_class: item.activate ? 'visor-result' : 'visor-result quiet',
      x_expand: true,
      reactive: true,
      accessible_role: Atk.Role.LIST_ITEM,
      accessible_name: [item.title, item.subtitle].filter(Boolean).join(', '),
    });

    const icon = this.buildIcon(item);
    if (icon) {
      actor.add_child(
        new St.Bin({
          style_class: 'visor-result-tile',
          y_align: Clutter.ActorAlign.CENTER,
          child: icon,
        }),
      );
    }

    const text = new St.BoxLayout({
      vertical: true,
      x_expand: true,
      y_align: Clutter.ActorAlign.CENTER,
    });
    actor.add_child(text);
    text.add_child(
      new St.Label({
        style_class: item.large ? 'visor-result-title large' : 'visor-result-title',
        text: item.title,
      }),
    );
    if (item.subtitle)
      text.add_child(new St.Label({ style_class: 'visor-result-subtitle', text: item.subtitle }));

    const hint = new St.Label({
      style_class: 'visor-result-hint',
      text: item.hint ?? '',
      visible: Boolean(item.hint),
      y_align: Clutter.ActorAlign.CENTER,
    });
    actor.add_child(hint);

    const line: Line = { key, item, actor, hint };
    if (item.activate) {
      // Motion, not hover: a list that changes below a resting pointer must
      // not move the selection.
      actor.connect('motion-event', () => {
        if (this.selectedKey !== key) {
          this.picked = true;
          this.select(key, false);
        }
        return Clutter.EVENT_PROPAGATE;
      });
      const click = new Clutter.ClickGesture();
      click.connect('recognize', () => this.callbacks.activate(item));
      actor.add_action(click);
    }
    return line;
  }

  private buildIcon(item: Item): Clutter.Actor | null {
    const app = item.iconStyle === 'app';
    const size = app ? APP_ICON_SIZE : ICON_SIZE;
    if (item.createIcon) {
      let icon: Clutter.Actor | null = null;
      try {
        icon = item.createIcon(size);
      } catch {
        // A provider with a broken icon still has a result.
      }
      if (icon) return icon;
    }
    if (item.icon === undefined) return null;
    const style_class = app ? 'visor-result-icon app' : 'visor-result-icon';
    return typeof item.icon === 'string'
      ? new St.Icon({ style_class, icon_name: item.icon })
      : new St.Icon({ style_class, gicon: item.icon });
  }
}
