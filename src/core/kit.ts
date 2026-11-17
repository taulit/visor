// UI building blocks. Modules get them through `ctx.kit`, the sheet and the
// peek chips use the same classes, so everything follows the theme tokens in
// styles/20-kit.css.
import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';

import { Spinner } from 'resource:///org/gnome/shell/ui/animation.js';

import type {
  Action,
  Kit,
  KitProgress,
  KitRow,
  KitSection,
  KitToggle,
  PeekChip,
  RowProps,
  ToggleProps,
} from '../api.js';

/** Runs code of a module so that an exception cannot leave it. */
export interface Guard {
  /** Runs a callback; an exception is logged and swallowed. */
  call(fn: () => void): void;
  /** Runs a builder; returns null when it threw. */
  build<T>(fn: () => T): T | null;
}

/** For widgets of Visor itself: exceptions are logged, nothing else. */
export const ownGuard: Guard = {
  call(fn) {
    try {
      fn();
    } catch (e) {
      logError(e as Error, 'Visor');
    }
  },
  build(fn) {
    try {
      return fn();
    } catch (e) {
      logError(e as Error, 'Visor');
      return null;
    }
  },
};

const FADE_MS = 150;
/** How far a row reaches out of its column on both sides, so its text lines up with the section title. */
const ROW_OUTSET = 8;
const SPINNER_SIZE = 14;
const TOGGLE_TRAVEL = 16;

/**
 * Text from a module, as a string. A value of another type in a string
 * property of an actor ends the running call in a way no `catch` sees.
 */
function str(value: unknown): string {
  if (typeof value === 'string') return value;
  return value === undefined || value === null ? '' : String(value);
}

/** The text fields of a row as strings; everything else as it came. */
function cleanRow(props: RowProps): RowProps {
  return {
    ...props,
    title: str(props.title),
    subtitle: str(props.subtitle),
    detail: str(props.detail),
    meta: str(props.meta),
    value: str(props.value),
    lead: str(props.lead),
  };
}

function scaleFactor(): number {
  return St.ThemeContext.get_for_stage(global.stage).scale_factor;
}

function fade(actor: Clutter.Actor, visible: boolean): void {
  const opacity = visible ? 255 : 0;
  if (!actor.mapped) {
    actor.remove_all_transitions();
    actor.opacity = opacity;
    return;
  }
  actor.ease({ opacity, duration: FADE_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
}

function isActivateKey(symbol: number): boolean {
  return (
    symbol === Clutter.KEY_Return ||
    symbol === Clutter.KEY_KP_Enter ||
    symbol === Clutter.KEY_ISO_Enter
  );
}

/**
 * Lays out the one child of a row wider than the row itself, so the hover
 * area reaches out of the column while the content stays in line with it.
 */
class OutsetLayout extends Clutter.LayoutManager {
  static {
    GObject.registerClass({ GTypeName: 'VisorOutsetLayout' }, this);
  }

  override vfunc_get_preferred_width(
    container: Clutter.Actor,
    forHeight: number,
  ): [number, number] {
    const child = container.get_first_child();
    if (!child) return [0, 0];
    const outset = 2 * ROW_OUTSET * scaleFactor();
    const [min, natural] = child.get_preferred_width(forHeight);
    return [Math.max(0, min - outset), Math.max(0, natural - outset)];
  }

  override vfunc_get_preferred_height(
    container: Clutter.Actor,
    forWidth: number,
  ): [number, number] {
    const child = container.get_first_child();
    if (!child) return [0, 0];
    const outset = 2 * ROW_OUTSET * scaleFactor();
    return child.get_preferred_height(forWidth < 0 ? forWidth : forWidth + outset);
  }

  override vfunc_allocate(container: Clutter.Actor, box: Clutter.ActorBox): void {
    const child = container.get_first_child();
    if (!child) return;
    const outset = ROW_OUTSET * scaleFactor();
    const childBox = new Clutter.ActorBox();
    childBox.set_origin(box.x1 - outset, box.y1);
    childBox.set_size(box.get_width() + 2 * outset, box.get_height());
    child.allocate(childBox);
  }
}

type ButtonKind = 'icon' | 'text';

function buttonKind(action: Action): ButtonKind {
  return action.icon && (!action.style || action.style === 'filled') ? 'icon' : 'text';
}

/** A button for an Action. update() swaps the action in place as long as the kind of button stays. */
class ActionButton {
  readonly actor: St.Button;
  readonly kind: ButtonKind;
  private action: Action;
  private icon: St.Icon | null = null;
  private label: St.Label | null = null;
  private variant = '';

  constructor(
    action: Action,
    guard: Guard,
    private forcedStyle?: Action['style'],
  ) {
    this.action = action;
    this.kind = buttonKind(action);
    this.actor = new St.Button({
      style_class: this.kind === 'icon' ? 'visor-icon-button' : 'visor-button',
      can_focus: true,
      // As wide as its text, also where the container would stretch it.
      x_align: Clutter.ActorAlign.START,
      y_align: Clutter.ActorAlign.CENTER,
      accessible_role: Atk.Role.PUSH_BUTTON,
    });
    if (this.kind === 'icon') {
      this.icon = new St.Icon({ style_class: 'visor-button-icon' });
      this.actor.set_child(this.icon);
    } else {
      const box = new St.BoxLayout({ style_class: 'visor-button-content' });
      this.icon = new St.Icon({ style_class: 'visor-button-icon', visible: false });
      this.label = new St.Label({ y_align: Clutter.ActorAlign.CENTER });
      box.add_child(this.icon);
      box.add_child(this.label);
      this.actor.set_child(box);
      this.actor.label_actor = this.label;
    }
    this.actor.connect('clicked', () => guard.call(() => this.action.run()));
    this.apply();
  }

  /** False when the action needs another kind of button; the caller then builds a new one. */
  update(action: Action): boolean {
    if (buttonKind(action) !== this.kind) return false;
    this.action = action;
    this.apply();
    return true;
  }

  private apply(): void {
    const { action } = this;
    const style = this.forcedStyle ?? action.style ?? 'default';
    const variant = style === 'default' ? '' : style;
    if (variant !== this.variant) {
      if (this.variant) this.actor.remove_style_class_name(this.variant);
      if (variant) this.actor.add_style_class_name(variant);
      this.variant = variant;
    }
    if (this.icon) {
      const icon = str(action.icon);
      if (icon && this.icon.icon_name !== icon) this.icon.icon_name = icon;
      this.icon.visible = icon !== '';
    }
    const label = str(action.label);
    if (this.label && this.label.text !== label) this.label.text = label;
    if (this.kind === 'icon' && this.actor.accessible_name !== label)
      this.actor.accessible_name = label;
  }
}

/**
 * Keeps a row of buttons in step with a list of actions without rebuilding
 * buttons that only got a new callback or text.
 */
class ActionList {
  private buttons: ActionButton[] = [];

  constructor(
    private box: Clutter.Actor,
    private guard: Guard,
    private onButton: (button: St.Button) => void,
    private forcedStyle?: Action['style'],
  ) {}

  get length(): number {
    return this.buttons.length;
  }

  set(actions: readonly Action[]): void {
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i]!;
      const existing = this.buttons[i];
      if (existing?.update(action)) continue;
      const button = new ActionButton(action, this.guard, this.forcedStyle);
      this.onButton(button.actor);
      if (existing) {
        this.box.replace_child(existing.actor, button.actor);
        existing.actor.destroy();
      } else {
        this.box.add_child(button.actor);
      }
      this.buttons[i] = button;
    }
    for (const button of this.buttons.splice(actions.length)) button.actor.destroy();
  }
}

/** A spinner that only runs while it is on screen. */
function buildSpinner(): St.Widget {
  const spinner = new Spinner(SPINNER_SIZE, { animate: false, hideOnStop: false });
  spinner.y_align = Clutter.ActorAlign.CENTER;
  spinner.connect('notify::mapped', () => {
    if (spinner.mapped) spinner.play();
    else spinner.stop();
  });
  return spinner;
}

/** The 2 px line. The fill is scaled, not resized, so a change never causes a relayout. */
class Bar {
  readonly actor: St.Widget;
  private fill: St.Widget;
  private accent = false;

  constructor() {
    this.actor = new St.Widget({
      style_class: 'visor-progress',
      layout_manager: new Clutter.BinLayout(),
      x_expand: true,
      y_align: Clutter.ActorAlign.CENTER,
      accessible_role: Atk.Role.PROGRESS_BAR,
    });
    this.fill = new St.Widget({
      style_class: 'visor-progress-fill',
      x_expand: true,
      y_expand: true,
    });
    const rtl = this.actor.get_text_direction() === Clutter.TextDirection.RTL;
    this.fill.set_pivot_point(rtl ? 1 : 0, 0.5);
    this.fill.scale_x = 0;
    this.actor.add_child(this.fill);
  }

  set(value: number, tone: 'muted' | 'accent' = 'muted'): void {
    const fraction = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
    if (this.fill.scale_x !== fraction) this.fill.scale_x = fraction;
    const accent = tone === 'accent';
    if (accent !== this.accent) {
      this.accent = accent;
      if (accent) this.actor.add_style_class_name('accent');
      else this.actor.remove_style_class_name('accent');
    }
  }
}

class Progress implements KitProgress {
  readonly actor: St.Widget;
  private bar: Bar | null = null;
  private spinner: St.Widget | null = null;

  constructor(
    value: number | 'indeterminate',
    private tone: 'muted' | 'accent' = 'muted',
  ) {
    this.actor = new St.BoxLayout({ style_class: 'visor-progress-slot', x_expand: true });
    this.set(value);
  }

  set(value: number | 'indeterminate'): void {
    const indeterminate = value === 'indeterminate';
    if (indeterminate && !this.spinner) {
      this.spinner = buildSpinner();
      this.actor.add_child(this.spinner);
    }
    if (!indeterminate && !this.bar) {
      this.bar = new Bar();
      this.actor.add_child(this.bar.actor);
    }
    if (this.spinner) this.spinner.visible = indeterminate;
    if (this.bar) this.bar.actor.visible = !indeterminate;
    if (!indeterminate) this.bar!.set(value, this.tone);
  }
}

/** 'picture' is cover art from a file, drawn as a background so it gets round corners. */
type LeadKind = 'none' | 'symbolic' | 'app' | 'cover' | 'picture' | 'text';

function leadKind(props: RowProps): LeadKind {
  const { icon } = props;
  if (icon !== undefined && icon !== null) {
    const style = props.iconStyle ?? (typeof icon === 'string' ? 'symbolic' : 'app');
    return style === 'cover' && icon instanceof Gio.FileIcon ? 'picture' : style;
  }
  return props.lead ? 'text' : 'none';
}

function setIcon(icon: St.Icon, value: string | Gio.Icon): void {
  if (typeof value === 'string') {
    if (icon.icon_name !== value) icon.icon_name = value;
  } else if (!(value instanceof Gio.Icon)) {
    throw new TypeError('An icon is a name or a Gio.Icon');
  } else if (icon.gicon !== value && !(icon.gicon?.equal(value) ?? false)) {
    icon.gicon = value;
  }
}

/** Rows by their actor, to find the rows next to one. */
const rowsByActor = new WeakMap<Clutter.Actor, Row>();

/**
 * The `lead` column is as wide as the stylesheet says, or as the longest text
 * in it: 'Tomorrow' is wider than '15:00'. The rows of one container share
 * that width, so their titles line up.
 */
function alignLeads(container: Clutter.Actor | null): void {
  if (!container) return;
  const labels: St.Label[] = [];
  for (const child of container.get_children()) {
    const label = rowsByActor.get(child)?.leadLabel;
    // Off the stage a label has no style yet, so neither its font nor its width is known.
    if (label?.get_stage()) labels.push(label);
  }
  let widest = 0;
  for (const label of labels) {
    widest = Math.max(
      widest,
      label.get_theme_node().get_min_width(),
      Math.ceil(label.clutter_text.get_preferred_width(-1)[1]),
    );
  }
  for (const label of labels) label.set_width(widest);
}

/** Options only Visor itself uses; modules build rows from RowProps alone. */
export interface RowOptions {
  /** A widget at the very end of the row, such as the switch in the list of modules. */
  trailing?: St.Widget;
}

export class Row implements KitRow {
  /** Takes the place in the column. */
  readonly actor: St.Widget;
  /** Background, hover and status; reaches out of the column. */
  private frame: St.BoxLayout;
  private line: St.BoxLayout;
  /** Icon and text: the part that takes the keyboard focus for the row. */
  private main: St.BoxLayout;
  private text: St.BoxLayout;
  private end: St.BoxLayout;

  private lead: St.Widget | null = null;
  private leadIs: LeadKind = 'none';
  private coverUri = '';
  private title: St.Label;
  private subline: St.BoxLayout | null = null;
  private subtitle: St.Label | null = null;
  private detail: St.Label | null = null;
  private bar: Bar | null = null;

  private swap: St.Widget | null = null;
  private meta: St.Label | null = null;
  private actionsBox: St.BoxLayout | null = null;
  private actions: ActionList | null = null;
  private spinner: St.Widget | null = null;
  private value: St.Label | null = null;
  private controlsBox: St.BoxLayout | null = null;
  private controls: ActionList | null = null;
  private primary: ActionButton | null = null;
  private chevron: St.Button | null = null;
  private chevronIcon: St.Icon | null = null;
  private more: St.Widget | null = null;
  private moreBuiltFrom: (() => St.Widget) | null = null;

  private props: RowProps;
  private expanded = false;
  private revealed = false;
  /** The part of the row that has the keyboard focus. */
  private focused: Clutter.Actor | null = null;
  private status = 'normal';

  constructor(
    props: RowProps,
    private guard: Guard,
    options: RowOptions = {},
  ) {
    this.props = cleanRow(props);
    this.actor = new St.Widget({ layout_manager: new OutsetLayout(), x_expand: true });
    rowsByActor.set(this.actor, this);
    this.actor.connect('parent-set', (_actor, old: Clutter.Actor | null) => {
      if (this.leadIs !== 'text') return;
      alignLeads(old);
      alignLeads(this.actor.get_parent());
    });
    this.frame = new St.BoxLayout({
      style_class: 'visor-row',
      vertical: true,
      reactive: true,
      track_hover: true,
    });
    this.actor.add_child(this.frame);

    this.line = new St.BoxLayout({ style_class: 'visor-row-line' });
    this.frame.add_child(this.line);

    this.main = new St.BoxLayout({
      style_class: 'visor-row-main',
      x_expand: true,
      can_focus: true,
      // Only reactive actors get key events, also when they have the focus.
      reactive: true,
      accessible_role: Atk.Role.LIST_ITEM,
    });
    this.line.add_child(this.main);

    this.text = new St.BoxLayout({
      style_class: 'visor-row-text',
      vertical: true,
      x_expand: true,
      y_align: Clutter.ActorAlign.CENTER,
    });
    this.main.add_child(this.text);
    this.title = new St.Label({ style_class: 'visor-row-title' });
    this.text.add_child(this.title);

    this.end = new St.BoxLayout({
      style_class: 'visor-row-end',
      y_align: Clutter.ActorAlign.CENTER,
    });
    this.line.add_child(this.end);
    if (options.trailing) {
      options.trailing.y_align = Clutter.ActorAlign.CENTER;
      this.end.add_child(options.trailing);
    }

    const click = new Clutter.ClickGesture();
    click.connect('recognize', () => this.click());
    this.frame.add_action(click);
    this.frame.connect('notify::hover', () => this.syncReveal());
    this.main.connect('key-press-event', (_actor, event) => this.onKeyPress(event));
    this.watchFocus(this.main);

    this.apply();
  }

  update(props: RowProps): void {
    this.props = cleanRow(props);
    this.apply();
  }

  /** The label of the `lead` text, null for a row with an icon or nothing in front. */
  get leadLabel(): St.Label | null {
    return this.lead instanceof St.Label ? this.lead : null;
  }

  /** The actor that takes the focus when the keyboard moves to this row. */
  get focusTarget(): St.Widget {
    return this.main;
  }

  private apply(): void {
    const { props } = this;
    this.applyLead();

    if (this.title.text !== props.title) this.title.text = props.title;
    this.applySubline();
    this.applyProgress();
    this.applyEnd();
    this.applyExpand();

    const status = props.status ?? 'normal';
    if (status !== this.status) {
      if (this.status !== 'normal') this.frame.remove_style_class_name(this.status);
      if (status !== 'normal') this.frame.add_style_class_name(status);
      this.status = status;
    }

    const name = [props.lead, props.title, props.subtitle, props.detail, props.meta, props.value]
      .filter(Boolean)
      .join(', ');
    if (this.main.accessible_name !== name) this.main.accessible_name = name;
  }

  private applyLead(): void {
    const { props } = this;
    const kind = leadKind(props);
    if (kind !== this.leadIs) {
      const wasText = this.leadIs === 'text';
      this.lead?.destroy();
      this.lead = null;
      this.coverUri = '';
      this.leadIs = kind;
      if (wasText) alignLeads(this.actor.get_parent());
      if (kind === 'text') {
        this.lead = new St.Label({
          style_class: 'visor-row-lead',
          y_align: Clutter.ActorAlign.CENTER,
        });
        // The font is known once the label has its style, and may change with it.
        this.lead.connect('style-changed', () => alignLeads(this.actor.get_parent()));
      } else if (kind === 'picture') {
        this.lead = new St.Widget({
          style_class: 'visor-row-cover',
          y_align: Clutter.ActorAlign.CENTER,
        });
      } else if (kind !== 'none') {
        this.lead = new St.Icon({
          style_class: `visor-row-icon ${kind}`,
          y_align: Clutter.ActorAlign.CENTER,
        });
      }
      if (this.lead) this.main.insert_child_at_index(this.lead, 0);
    }
    if (!this.lead) return;
    if (this.lead instanceof St.Label) {
      const lead = props.lead ?? '';
      if (this.lead.text !== lead) {
        this.lead.text = lead;
        alignLeads(this.actor.get_parent());
      }
    } else if (this.lead instanceof St.Icon) {
      setIcon(this.lead, props.icon!);
    } else {
      const uri = (props.icon as Gio.FileIcon).get_file().get_uri();
      if (uri !== this.coverUri) {
        this.coverUri = uri;
        this.lead.style = `background-image: url("${uri.replace(/["\\\n]/g, c => encodeURIComponent(c))}");`;
      }
    }
  }

  private applySubline(): void {
    const { subtitle, detail } = this.props;
    if (!subtitle && !detail) {
      if (this.subline) this.subline.visible = false;
      return;
    }
    if (!this.subline) {
      this.subline = new St.BoxLayout({ style_class: 'visor-row-subline' });
      this.text.insert_child_above(this.subline, this.title);
    }
    this.subline.visible = true;
    if (subtitle) {
      if (!this.subtitle) {
        this.subtitle = new St.Label({
          style_class: 'visor-row-subtitle',
          y_align: Clutter.ActorAlign.CENTER,
        });
        this.subline.insert_child_at_index(this.subtitle, 0);
      }
      if (this.subtitle.text !== subtitle) this.subtitle.text = subtitle;
    }
    if (this.subtitle) this.subtitle.visible = Boolean(subtitle);
    if (detail) {
      if (!this.detail) {
        this.detail = new St.Label({
          style_class: 'visor-row-detail',
          y_align: Clutter.ActorAlign.CENTER,
        });
        this.subline.add_child(this.detail);
      }
      if (this.detail.text !== detail) this.detail.text = detail;
    }
    if (this.detail) this.detail.visible = Boolean(detail);
  }

  private applyProgress(): void {
    const { progress, progressTone } = this.props;
    const hasBar = typeof progress === 'number';
    if (hasBar) {
      if (!this.bar) {
        this.bar = new Bar();
        this.bar.actor.add_style_class_name('in-row');
        this.text.add_child(this.bar.actor);
      }
      this.bar.set(progress, progressTone);
    }
    if (this.bar) this.bar.actor.visible = hasBar;

    const spins = progress === 'indeterminate';
    if (spins && !this.spinner) {
      this.spinner = buildSpinner();
      this.placeInEnd(this.spinner, 1);
    }
    if (this.spinner) this.spinner.visible = spins;
  }

  /**
   * The end of the row, from left to right: actions and meta (in one place),
   * spinner, value, controls, primary button, arrow, trailing widget.
   */
  private placeInEnd(child: Clutter.Actor, rank: number): void {
    const order = [
      this.swap,
      this.spinner,
      this.value,
      this.controlsBox,
      this.primary?.actor,
      this.chevron,
    ];
    let index = 0;
    for (let i = 0; i < rank; i++) if (order[i]) index++;
    this.end.insert_child_at_index(child, index);
  }

  private applyEnd(): void {
    const { props } = this;

    const actions = props.actions ?? [];
    if ((actions.length > 0 || props.meta) && !this.swap) {
      this.swap = new St.Widget({
        layout_manager: new Clutter.BinLayout(),
        y_align: Clutter.ActorAlign.CENTER,
      });
      this.placeInEnd(this.swap, 0);
    }
    if (actions.length > 0 && !this.actionsBox) {
      this.actionsBox = new St.BoxLayout({
        style_class: 'visor-row-actions',
        x_align: Clutter.ActorAlign.END,
        x_expand: true,
        opacity: this.revealed ? 255 : 0,
      });
      this.swap!.add_child(this.actionsBox);
      this.actions = new ActionList(this.actionsBox, this.guard, button => this.watchFocus(button));
    }
    this.actions?.set(actions);
    if (this.actionsBox) this.actionsBox.visible = actions.length > 0;
    if (props.meta) {
      if (!this.meta) {
        this.meta = new St.Label({
          style_class: 'visor-row-meta',
          x_align: Clutter.ActorAlign.END,
          x_expand: true,
          y_align: Clutter.ActorAlign.CENTER,
        });
        this.swap!.insert_child_at_index(this.meta, 0);
      }
      if (this.meta.text !== props.meta) this.meta.text = props.meta;
    }
    if (this.meta) {
      this.meta.visible = Boolean(props.meta);
      this.meta.opacity = this.revealed && actions.length > 0 ? 0 : 255;
    }
    if (this.swap) this.swap.visible = actions.length > 0 || Boolean(props.meta);

    if (props.value) {
      if (!this.value) {
        this.value = new St.Label({
          style_class: 'visor-row-value',
          y_align: Clutter.ActorAlign.CENTER,
        });
        this.placeInEnd(this.value, 2);
      }
      if (this.value.text !== props.value) this.value.text = props.value;
    }
    if (this.value) this.value.visible = Boolean(props.value);

    const controls = props.controls ?? [];
    if (controls.length > 0 && !this.controlsBox) {
      this.controlsBox = new St.BoxLayout({ style_class: 'visor-row-controls' });
      this.placeInEnd(this.controlsBox, 3);
      this.controls = new ActionList(this.controlsBox, this.guard, button =>
        this.watchFocus(button),
      );
    }
    this.controls?.set(controls);
    if (this.controlsBox) this.controlsBox.visible = controls.length > 0;

    if (props.primary) {
      if (!this.primary?.update(props.primary)) {
        const hadFocus = this.primary?.actor.has_key_focus() ?? false;
        this.primary?.actor.destroy();
        this.primary = null;
        const primary = new ActionButton(props.primary, this.guard);
        this.watchFocus(primary.actor);
        this.placeInEnd(primary.actor, 4);
        this.primary = primary;
        if (hadFocus) primary.actor.grab_key_focus();
      }
    } else if (this.primary) {
      if (this.primary.actor.has_key_focus()) this.main.grab_key_focus();
      this.primary.actor.destroy();
      this.primary = null;
    }
  }

  private applyExpand(): void {
    const { expand } = this.props;
    if (expand && !this.chevron) {
      this.chevronIcon = new St.Icon({ style_class: 'visor-button-icon' });
      this.chevron = new St.Button({
        style_class: 'visor-icon-button visor-row-chevron',
        can_focus: true,
        y_align: Clutter.ActorAlign.CENTER,
        accessible_role: Atk.Role.TOGGLE_BUTTON,
        child: this.chevronIcon,
        opacity: this.revealed ? 255 : 0,
      });
      this.chevron.connect('clicked', () => this.setExpanded(!this.expanded));
      this.watchFocus(this.chevron);
      this.placeInEnd(this.chevron, 5);
    }
    if (this.chevron) this.chevron.visible = Boolean(expand);
    if (!expand && this.expanded) this.setExpanded(false);
    // Another builder means other content: drop what the old one built.
    if (this.more && expand !== this.moreBuiltFrom) {
      this.more.destroy();
      this.more = null;
      this.moreBuiltFrom = null;
      if (this.expanded && expand) this.buildMore();
    }
    this.syncChevron();
  }

  private buildMore(): void {
    const { expand } = this.props;
    if (!expand || this.more) return;
    const content = this.guard.build(expand);
    this.moreBuiltFrom = expand;
    if (!content) return;
    this.more = new St.BoxLayout({ style_class: 'visor-row-more', vertical: true });
    this.more.add_child(content);
    this.frame.add_child(this.more);
  }

  private setExpanded(expanded: boolean): void {
    if (expanded === this.expanded) return;
    this.expanded = expanded;
    if (expanded) this.buildMore();
    if (this.more) this.more.visible = expanded;
    this.syncChevron();
    this.syncReveal();
  }

  private syncChevron(): void {
    if (!this.chevron || !this.chevronIcon) return;
    const icon = this.expanded ? 'pan-down-symbolic' : 'pan-end-symbolic';
    if (this.chevronIcon.icon_name !== icon) this.chevronIcon.icon_name = icon;
    this.chevron.accessible_name = this.props.title;
    if (this.expanded) this.chevron.add_accessible_state(Atk.StateType.EXPANDED);
    else this.chevron.remove_accessible_state(Atk.StateType.EXPANDED);
  }

  /**
   * Remembers which part of the row has the keyboard focus. Asking the stage
   * does not work here: while an actor is told that it lost the focus, the
   * stage still names it.
   */
  private watchFocus(actor: Clutter.Actor): void {
    actor.connect('key-focus-in', () => {
      this.focused = actor;
      this.syncReveal();
    });
    actor.connect('key-focus-out', () => {
      if (this.focused === actor) this.focused = null;
      this.syncReveal();
    });
  }

  /** Shows the secondary actions while the pointer is on the row or the keyboard focus is in it. */
  private syncReveal(): void {
    if (this.focused === this.main) this.frame.add_style_pseudo_class('focus');
    else this.frame.remove_style_pseudo_class('focus');

    const revealed = this.frame.hover || this.focused !== null;
    if (revealed === this.revealed && !this.chevron) return;
    this.revealed = revealed;
    if (this.actionsBox) fade(this.actionsBox, revealed);
    if (this.meta && this.actions && this.actions.length > 0) fade(this.meta, !revealed);
    if (this.chevron) fade(this.chevron, revealed || this.expanded);
  }

  private click(): void {
    const { activate, expand } = this.props;
    if (activate) this.guard.call(activate);
    else if (expand) this.setExpanded(!this.expanded);
  }

  private onKeyPress(event: Clutter.Event): boolean {
    const modifiers =
      event.get_state() &
      (Clutter.ModifierType.SHIFT_MASK |
        Clutter.ModifierType.CONTROL_MASK |
        Clutter.ModifierType.MOD1_MASK |
        Clutter.ModifierType.SUPER_MASK);
    if (modifiers) return Clutter.EVENT_PROPAGATE;
    const symbol = event.get_key_symbol();
    const { activate, primary, expand } = this.props;
    if (isActivateKey(symbol)) {
      if (activate) this.guard.call(activate);
      else if (primary) this.guard.call(() => primary.run());
      else if (expand) this.setExpanded(!this.expanded);
      else return Clutter.EVENT_PROPAGATE;
      return Clutter.EVENT_STOP;
    }
    if (symbol === Clutter.KEY_space && expand) {
      this.setExpanded(!this.expanded);
      return Clutter.EVENT_STOP;
    }
    return Clutter.EVENT_PROPAGATE;
  }
}

class Section implements KitSection {
  readonly actor: St.Widget;
  readonly body: St.Widget;
  readonly toggle: KitToggle | null = null;
  private title: St.Label;
  private linksBox: St.BoxLayout;
  private links: ActionList;
  /** The link that has the keyboard focus. */
  private focused: Clutter.Actor | null = null;

  constructor(props: { title: string; links?: Action[]; toggle?: ToggleProps }, guard: Guard) {
    this.actor = new St.BoxLayout({
      style_class: 'visor-section',
      vertical: true,
      x_expand: true,
      reactive: true,
      track_hover: true,
      accessible_role: Atk.Role.PANEL,
      accessible_name: str(props.title),
    });
    const header = new St.BoxLayout({ style_class: 'visor-section-header' });
    this.title = new St.Label({
      style_class: 'visor-section-title',
      text: str(props.title),
      x_expand: true,
      y_align: Clutter.ActorAlign.CENTER,
    });
    header.add_child(this.title);
    this.linksBox = new St.BoxLayout({
      style_class: 'visor-section-links',
      y_align: Clutter.ActorAlign.CENTER,
      opacity: 0,
    });
    header.add_child(this.linksBox);
    if (props.toggle) {
      // Always visible, with its name next to it: a bare switch says nothing.
      const box = new St.BoxLayout({
        style_class: 'visor-section-toggle',
        y_align: Clutter.ActorAlign.CENTER,
      });
      const label = new St.Label({
        style_class: 'visor-section-toggle-label',
        text: str(props.toggle.label),
        y_align: Clutter.ActorAlign.CENTER,
      });
      const toggle = new Toggle(props.toggle, guard);
      toggle.actor.label_actor = label;
      box.add_child(label);
      box.add_child(toggle.actor);
      header.add_child(box);
      this.toggle = toggle;
    }
    this.actor.add_child(header);
    this.body = new St.BoxLayout({
      style_class: 'visor-section-body',
      vertical: true,
      x_expand: true,
    });
    this.actor.add_child(this.body);

    this.links = new ActionList(
      this.linksBox,
      guard,
      button => {
        button.connect('key-focus-in', () => {
          this.focused = button;
          this.syncLinks();
        });
        button.connect('key-focus-out', () => {
          if (this.focused === button) this.focused = null;
          this.syncLinks();
        });
      },
      'link',
    );
    this.actor.connect('notify::hover', () => this.syncLinks());
    this.setLinks(props.links ?? []);
  }

  setLinks(links: Action[]): void {
    this.links.set(links);
    this.linksBox.visible = links.length > 0;
  }

  private syncLinks(): void {
    fade(this.linksBox, this.actor.hover || this.focused !== null);
  }
}

class Toggle implements KitToggle {
  readonly actor: St.Button;
  private knob: St.Widget;

  constructor(props: ToggleProps, guard: Guard) {
    this.knob = new St.Widget({ style_class: 'visor-toggle-knob' });
    // The track has the size of the inside of the switch and a fixed layout,
    // so the knob starts at its edge whatever the button does with its child.
    const track = new St.Widget({
      style_class: 'visor-toggle-track',
      layout_manager: new Clutter.FixedLayout(),
    });
    track.add_child(this.knob);
    this.actor = new St.Button({
      style_class: 'visor-toggle',
      toggle_mode: true,
      can_focus: true,
      checked: props.active,
      y_align: Clutter.ActorAlign.CENTER,
      x_align: Clutter.ActorAlign.END,
      accessible_role: Atk.Role.CHECK_BOX,
      accessible_name: str(props.label),
      child: track,
    });
    this.place(false);
    this.actor.connect('clicked', () => {
      this.place(true);
      const active = this.actor.checked;
      guard.call(() => props.onChange(active));
    });
  }

  get active(): boolean {
    return this.actor.checked;
  }

  set active(active: boolean) {
    if (active === this.actor.checked) return;
    this.actor.checked = active;
    this.place(true);
  }

  private place(animate: boolean): void {
    const rtl = this.actor.get_text_direction() === Clutter.TextDirection.RTL;
    const x = this.actor.checked ? TOGGLE_TRAVEL * scaleFactor() * (rtl ? -1 : 1) : 0;
    if (!animate || !this.actor.mapped) {
      this.knob.remove_all_transitions();
      this.knob.translation_x = x;
      return;
    }
    // Overshoots a little, like the spring of the notch.
    this.knob.ease_property('translation-x', x, {
      duration: 280,
      mode: Clutter.AnimationMode.EASE_OUT_BACK,
    });
  }
}

/** A chip. In the peek row it is a button, from `kit.chip()` it only shows something. */
export class Chip {
  readonly actor: St.Button;
  private icon: St.Icon;
  private label: St.Label;
  private tone = 'normal';

  constructor(chip: PeekChip, interactive: boolean) {
    const box = new St.BoxLayout({ style_class: 'visor-chip-content' });
    this.icon = new St.Icon({ style_class: 'visor-chip-icon', y_align: Clutter.ActorAlign.CENTER });
    this.label = new St.Label({ y_align: Clutter.ActorAlign.CENTER });
    box.add_child(this.icon);
    box.add_child(this.label);
    this.actor = new St.Button({
      style_class: 'visor-chip',
      reactive: interactive,
      can_focus: interactive,
      track_hover: interactive,
      y_align: Clutter.ActorAlign.CENTER,
      accessible_role: interactive ? Atk.Role.PUSH_BUTTON : Atk.Role.LABEL,
      child: box,
    });
    this.actor.label_actor = this.label;
    this.update(chip);
  }

  update(chip: PeekChip, tone: PeekChip['tone'] = chip.tone): void {
    setIcon(this.icon, chip.icon);
    const text = str(chip.text);
    if (this.label.text !== text) this.label.text = text;
    this.label.visible = text !== '';
    const next = tone ?? 'normal';
    if (next !== this.tone) {
      if (this.tone !== 'normal') this.actor.remove_style_class_name(this.tone);
      if (next !== 'normal') this.actor.add_style_class_name(next);
      this.tone = next;
    }
  }
}

/** The building blocks for one module. `guard` keeps the callbacks of the module from breaking Visor. */
export function createKit(guard: Guard): Kit {
  return {
    section: props => new Section(props, guard),
    row: props => new Row(props, guard),
    button: action => new ActionButton(action, guard).actor,
    iconButton: action =>
      new ActionButton(
        { ...action, style: action.style === 'filled' ? 'filled' : undefined },
        guard,
      ).actor,
    toggle: props => new Toggle(props, guard),
    progress: props => new Progress(props.value, props.tone),
    empty: text => new St.Label({ style_class: 'visor-empty', text: str(text), x_expand: true }),
    chip: chip => new Chip(chip, false).actor,
  };
}
