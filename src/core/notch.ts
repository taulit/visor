// The notch: a neck in the panel where the date menu was, and a body that
// grows out below the panel. It knows the panel, the monitor, the pointer,
// the modal grab and the animation, but not what it shows (see types.ts).
//
// Actors:
//
//   Main.panel._centerBox
//   └─ neck                  clock and attention dot (core/clock.ts)
//   Main.uiGroup             chrome, just above the panel
//   └─ root                  0 × 0 at the centre of the panel's lower edge
//      ├─ shadow             shown once the size has settled
//      ├─ ear, ear           concave corners in the colour of the panel
//      ├─ seam               covers the line some themes draw along the panel's lower edge
//      ├─ body               the background; the only actor that is resized per frame
//      └─ clip               has the final size at once, only its clip rectangle grows
//         └─ peek, sheet     from the content, laid out once
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Clock } from './clock.js';
import { Keybindings } from './keybindings.js';
import { Motion } from './motion.js';
import { mix } from './spring.js';
import {
  initialModel,
  reduce,
  type NotchContext,
  type NotchEvent,
  type NotchModel,
  type TimerIntent,
  type TimerName,
} from './state.js';
import {
  CLASS_DARK,
  CLASS_HIGH_CONTRAST,
  CLASS_LIGHT,
  opaqueCss,
  themeClasses,
  type Rgb,
} from './theme.js';
import type { Attention, NotchContent, NotchHost, NotchState } from './types.js';
import { Ear } from '../lib/ear.js';
import { PanelMenuProxy } from '../lib/panelMenu.js';

/** Lengths in CSS pixels; multiplied by the scale factor where they are used. */
const HINT_EXTRA_WIDTH = 40;
const HINT_HEIGHT = 8;
const PEEK_PADDING = 28;
const PEEK_HEIGHT = 56;
const SHEET_MAX_HEIGHT = 820;
const SHEET_SCREEN_MARGIN = 120;
const EAR = 16;
const EAR_HINT = 7;
/** Content comes in from 6 px above at 97 % of its size. */
const REVEAL_LIFT = 6;
const REVEAL_SCALE = 0.97;

/** Milliseconds. */
const DURATION: Record<NotchState, number> = { idle: 400, hint: 500, peek: 620, open: 620 };
const CONTENT_IN_DELAY = 80;
const CONTENT_IN = 300;
const CONTENT_OUT = 140;
const SHADOW_IN = 120;

const STATE_CLASSES: NotchState[] = ['hint', 'peek', 'open'];
const THEME_CLASSES = [CLASS_DARK, CLASS_LIGHT, CLASS_HIGH_CONTRAST];

/** What changes per frame. All in stage pixels. */
interface Shape {
  /** The body is centred on the neck, so half of its width is animated. */
  halfWidth: number;
  height: number;
  /** Radius of the ears. */
  ear: number;
  /** 0: the content is lifted and slightly smaller, 1: it rests. */
  reveal: number;
}

const sameShape = (a: Shape, b: Shape): boolean =>
  a.halfWidth === b.halfWidth && a.height === b.height && a.ear === b.ear && a.reveal === b.reveal;

export class Notch implements NotchHost {
  private model: NotchModel;
  private queue: { event: NotchEvent; animate: boolean }[] = [];
  private dispatching = false;
  private destroyed = false;
  private timers = new Map<TimerName, number>();

  private clock: Clock;
  private neck: St.Widget;
  private root: St.Widget;
  private shadow: St.Widget;
  private ears: [Ear, Ear];
  private seam: St.Widget;
  private body: St.Widget;
  private clip: Clutter.Actor;
  /** The content widget that belongs to the current state. */
  private shown: St.Widget | null = null;

  private motion: Motion;
  private menu: PanelMenuProxy;
  private keybindings: Keybindings;
  private notifications: Gio.Settings | null = null;

  private scale = 1;
  private neckWidth = 0;
  private earRadius = 0;
  private current: Shape = { halfWidth: 0, height: 0, ear: 0, reveal: 1 };
  private target: Shape = this.current;
  private clipWidth = 0;
  private overNeck = false;
  private overBody = false;
  private pointerInside = false;
  private syncLater = 0;
  private themeKey = '';
  private bannerWasBlocked = false;

  constructor(
    private settings: Gio.Settings,
    private content: NotchContent,
  ) {
    this.model = initialModel(Main.overview.visible);

    // The neck replaces the date menu in the centre of the panel. The panel
    // shows the date menu again on every session mode update.
    const dateMenu = Main.panel.statusArea.dateMenu;
    dateMenu?.container.hide();
    dateMenu?.container.connectObject(
      'notify::visible',
      (container: Clutter.Actor) => container.hide(),
      this,
    );

    this.clock = new Clock();
    this.neck = this.clock.actor;
    this.centerBox.insert_child_at_index(this.neck, 0);

    this.root = new St.Widget({
      style_class: 'visor-notch',
      layout_manager: new Clutter.FixedLayout(),
      reactive: true,
      width: 0,
      height: 0,
    });
    this.shadow = new St.Widget({ style_class: 'visor-shadow', visible: false });
    this.ears = [new Ear('left'), new Ear('right')];
    this.seam = new St.Widget({ visible: false });
    this.body = new St.Widget({ style_class: 'visor-body', reactive: true, visible: false });
    this.clip = new Clutter.Actor({ layout_manager: new Clutter.FixedLayout() });
    this.root.add_child(this.shadow);
    for (const ear of this.ears) this.root.add_child(ear.actor);
    this.root.add_child(this.seam);
    this.root.add_child(this.body);
    this.root.add_child(this.clip);

    // Chrome at the level of the panel, so modal dialogs and the screenshot
    // UI cover the notch. The layout manager hides it in fullscreen.
    Main.layoutManager.addChrome(this.root, { trackFullscreen: true });
    Main.uiGroup.set_child_above_sibling(this.root, Main.layoutManager.panelBox);
    global.focus_manager.add_group(this.root);

    this.motion = new Motion(this.neck);

    // Escape goes to the content first. This handler has to be connected
    // before the menu manager connects its own, which closes the menu.
    this.root.connectObject(
      'captured-event',
      (_actor: Clutter.Actor, event: Clutter.Event) => this.onCapturedEvent(event),
      'enter-event',
      (_actor: Clutter.Actor, event: Clutter.Event) => this.onCrossing(this.root, event),
      'leave-event',
      (_actor: Clutter.Actor, event: Clutter.Event) => this.onCrossing(this.root, event),
      'button-press-event',
      () => this.onPress('activate'),
      'touch-event',
      (_actor: Clutter.Actor, event: Clutter.Event) => this.onTouch(event, 'activate'),
      'notify::visible',
      () => this.onRootVisible(),
      'destroy',
      () => this.abandon(),
      this,
    );
    this.neck.connectObject(
      'enter-event',
      (_actor: Clutter.Actor, event: Clutter.Event) => this.onCrossing(this.neck, event),
      'leave-event',
      (_actor: Clutter.Actor, event: Clutter.Event) => this.onCrossing(this.neck, event),
      'button-press-event',
      () => this.onPress('toggle'),
      'touch-event',
      (_actor: Clutter.Actor, event: Clutter.Event) => this.onTouch(event, 'toggle'),
      'key-press-event',
      (_actor: Clutter.Actor, event: Clutter.Event) => this.onNeckKey(event),
      'notify::allocation',
      () => this.queueSync(),
      'destroy',
      () => this.abandon(),
      this,
    );

    // The manager connects first and takes or releases the grab; after that
    // the state follows, so the content gets the key focus last.
    this.menu = new PanelMenuProxy(this.neck, this.root);
    Main.panel.menuManager.addMenu(this.menu as never);
    this.menu.connectObject(
      'open-state-changed',
      (_menu: PanelMenuProxy, open: boolean) => this.onMenuOpenState(open),
      this,
    );

    this.keybindings = new Keybindings(settings, {
      toggle: () => this.toggle(),
      close: () => this.close(),
    });

    Main.layoutManager.connectObject('monitors-changed', () => this.queueSync(), this);
    Main.layoutManager.panelBox.connectObject('notify::allocation', () => this.queueSync(), this);
    Main.panel.connectObject('style-changed', () => this.syncTheme(), this);
    Main.overview.connectObject(
      'showing',
      () => this.dispatch({ type: 'overview', visible: true }, false),
      'hidden',
      () => this.dispatch({ type: 'overview', visible: false }),
      this,
    );
    St.Settings.get().connectObject('notify::high-contrast', () => this.syncTheme(), this);
    St.ThemeContext.get_for_stage(global.stage).connectObject(
      'notify::scale-factor',
      () => {
        this.syncScale();
        this.retarget(false);
      },
      this,
    );

    this.syncScale();
    this.syncTheme();
  }

  // ---------------------------------------------------------------- NotchHost

  get state(): NotchState {
    return this.model.state;
  }

  open(): void {
    this.leaveOverview();
    this.dispatch({ type: 'open' });
  }

  close(): void {
    this.dispatch({ type: 'close' });
  }

  toggle(): void {
    if (this.model.state !== 'open') this.leaveOverview();
    this.dispatch({ type: 'toggle' });
  }

  flash(): void {
    this.dispatch({ type: 'flash' });
  }

  contentChanged(): void {
    const before = this.model.state;
    this.dispatch({ type: 'content-changed' });
    // Same state as before: only the size may be different.
    if (this.model.state === before) this.retarget();
  }

  setAttention(attention: Attention): void {
    this.clock.setAttention(attention);
  }

  // -------------------------------------------------------------------- state

  /**
   * The one way into the state machine: pointer, clicks, keys, timers and the
   * methods above all end here. Events sent while one is handled wait for it.
   */
  dispatch(event: NotchEvent, animate = true): void {
    if (this.destroyed) return;
    this.queue.push({ event, animate });
    if (this.dispatching) return;
    this.dispatching = true;
    try {
      for (let next = this.queue.shift(); next; next = this.queue.shift()) this.handle(next);
    } finally {
      this.queue.length = 0;
      this.dispatching = false;
    }
  }

  private handle({ event, animate }: { event: NotchEvent; animate: boolean }): void {
    const previous = this.model.state;
    const result = reduce(this.model, event, this.context(event));
    this.model = result.model;
    for (const intent of result.timers) this.applyTimer(intent);
    if (this.model.state !== previous) this.enter(this.model.state, previous, animate);
  }

  private context(event: NotchEvent): NotchContext {
    return {
      hoverPreview: this.settings.get_boolean('hover-preview'),
      peekDelay: this.settings.get_int('peek-delay'),
      hasPeek: this.content.hasPeek(),
      flashAllowed: event.type === 'flash' && this.flashAllowed(),
    };
  }

  private flashAllowed(): boolean {
    if (!this.settings.get_boolean('flash-on-events')) return false;
    if (Main.layoutManager.primaryMonitor?.inFullscreen) return false;
    // Do Not Disturb.
    this.notifications ??= new Gio.Settings({ schema_id: 'org.gnome.desktop.notifications' });
    return this.notifications.get_boolean('show-banners');
  }

  private applyTimer(intent: TimerIntent): void {
    const running = this.timers.get(intent.timer);
    if (running) {
      GLib.Source.remove(running);
      this.timers.delete(intent.timer);
    }
    if (intent.action !== 'start') return;
    const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, intent.ms, () => {
      this.timers.delete(intent.timer);
      this.dispatch({ type: 'timer', timer: intent.timer });
      return GLib.SOURCE_REMOVE;
    });
    this.timers.set(intent.timer, id);
  }

  private enter(state: NotchState, previous: NotchState, animate: boolean): void {
    this.syncPosition();

    // Built by the content on first use.
    let child: St.Widget | null = null;
    if (state === 'peek') child = this.content.getPeek();
    else if (state === 'open') child = this.content.getSheet();
    this.show(child);

    // The lower corners. Closing keeps the radius it has; it shrinks with the height.
    if (state !== 'idle') {
      for (const actor of [this.body, this.shadow]) {
        for (const name of STATE_CLASSES) actor.remove_style_class_name(name);
        actor.add_style_class_name(state);
      }
    }

    this.retarget(animate);

    if (state === 'open') this.menu.open();
    else this.menu.close();

    this.content.stateChanged(state, previous);
  }

  private leaveOverview(): void {
    if (this.model.overview && Main.overview.visible) Main.overview.hide();
  }

  // ------------------------------------------------------------------ content

  /** Makes `child` the visible content; what was shown before fades out. */
  private show(child: St.Widget | null): void {
    const old = this.shown;
    if (old === child) return;
    this.shown = child;

    if (old) {
      old.ease({
        opacity: 0,
        duration: CONTENT_OUT,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        // Clutter reuses a running transition, so this can also fire at the
        // end of a later fade-in.
        onComplete: () => {
          if (this.shown !== old) old.hide();
        },
      });
    }

    if (child) {
      if (child.get_parent() !== this.clip) this.clip.add_child(child);
      // Still fading out from a moment ago: keep its pose and fade back in.
      const fresh = !child.visible;
      if (fresh) {
        child.opacity = 0;
        child.show();
      }
      child.set_pivot_point(0.5, 0);
      child.ease({
        opacity: 255,
        delay: CONTENT_IN_DELAY,
        duration: CONTENT_IN,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
      });
      this.current = { ...this.current, reveal: fresh ? 0 : 1 };
    }
  }

  // ----------------------------------------------------------------- geometry

  /** Width of the neck, as allocated or, before the first layout, as it asks for. */
  private measureNeck(): number {
    return this.neck.has_allocation() ? this.neck.width : this.neck.get_preferred_width(-1)[1];
  }

  /**
   * The size the current state asks for. For peek and open this also lays
   * out the content, once, at that size.
   */
  private measure(): Shape {
    const s = this.scale;
    const neck = this.neckWidth || this.measureNeck();
    // Even widths keep the body and the ears on whole pixels around the centre.
    const half = (width: number): number => Math.ceil(width / 2);

    switch (this.model.state) {
      case 'idle':
        return { halfWidth: half(neck), height: 0, ear: 0, reveal: 1 };

      case 'hint':
        return {
          halfWidth: half(neck + HINT_EXTRA_WIDTH * s),
          height: HINT_HEIGHT * s,
          ear: EAR_HINT * s,
          reveal: 1,
        };

      case 'peek': {
        // The row of chips keeps its natural size and is centred.
        const peek = this.content.getPeek();
        const [, natural] = peek.get_preferred_width(-1);
        const [, naturalHeight] = peek.get_preferred_height(natural);
        const halfWidth = half(Math.max(natural + PEEK_PADDING * s, neck + HINT_EXTRA_WIDTH * s));
        const height = PEEK_HEIGHT * s;
        this.layout(halfWidth * 2, height);
        peek.set_position(
          Math.floor(halfWidth - natural / 2),
          Math.floor((height - naturalHeight) / 2),
        );
        return { halfWidth, height, ear: EAR * s, reveal: 1 };
      }

      case 'open': {
        const sheet = this.content.getSheet();
        const halfWidth = half(this.content.sheetWidth());
        // Without the height of the last time, to learn what it asks for now.
        sheet.set_size(halfWidth * 2, -1);
        const [, natural] = sheet.get_preferred_height(halfWidth * 2);
        const screen = Main.layoutManager.primaryMonitor?.height ?? global.stage.height;
        const height = Math.round(
          Math.max(0, Math.min(natural, SHEET_MAX_HEIGHT * s, screen - SHEET_SCREEN_MARGIN * s)),
        );
        this.layout(halfWidth * 2, height);
        sheet.set_height(height);
        sheet.set_position(0, 0);
        return { halfWidth, height, ear: EAR * s, reveal: 1 };
      }
    }
    return this.current;
  }

  /** Gives the clip box its final size; content that fades out stays centred. */
  private layout(width: number, height: number): void {
    if (this.clipWidth === width && this.clip.height === height) return;
    this.clipWidth = width;
    this.clip.set_size(width, height);
    this.clip.set_position(-width / 2, 0);
    for (const child of this.clip.get_children()) {
      if (child !== this.shown) child.set_x(Math.floor((width - child.width) / 2));
    }
  }

  /** Measures the current state and animates to its size from wherever the body is now. */
  private retarget(animate = true): void {
    const state = this.model.state;
    const hidden = !this.body.visible;
    const target = this.measure();

    if (state === 'idle' && hidden) {
      // Nothing on screen: just remember where a hint starts from.
      this.target = this.current = target;
      return;
    }
    if (sameShape(target, this.target) && (this.motion.running || sameShape(target, this.current)))
      return;

    // A hint grows out of the neck as it is now.
    const from = hidden
      ? { ...this.current, halfWidth: Math.ceil((this.neckWidth || this.measureNeck()) / 2) }
      : this.current;
    this.target = target;

    this.drawEars(Math.max(from.ear, target.ear));
    this.place(from);

    // The shadow never follows a moving edge.
    this.shadow.remove_all_transitions();
    this.shadow.hide();
    this.body.show();
    this.seam.show();
    for (const ear of this.ears) ear.actor.show();

    this.motion.start(
      {
        duration: DURATION[state],
        curve: state === 'idle' ? 'quint' : 'spring',
        frame: (progress: number) => {
          this.place({
            halfWidth: mix(from.halfWidth, target.halfWidth, progress),
            height: mix(from.height, target.height, progress),
            ear: mix(from.ear, target.ear, progress),
            reveal: mix(from.reveal, target.reveal, progress),
          });
        },
        done: () => this.settled(),
      },
      animate,
    );
  }

  /** Per frame: sizes the background, moves the clip and the ears. No content is laid out. */
  private place(shape: Shape): void {
    this.current = shape;
    const halfWidth = Math.max(0, Math.round(shape.halfWidth));
    const height = Math.max(0, Math.round(shape.height));

    this.body.set_position(-halfWidth, 0);
    this.body.set_size(halfWidth * 2, height);
    this.clip.set_clip(this.clipWidth / 2 - halfWidth, 0, halfWidth * 2, height);

    // Scaled from the size they were drawn at; an ear is never higher than the body.
    const size = this.earRadius || 1;
    const factor = Math.max(0, Math.min(shape.ear, height)) / size;
    const [left, right] = this.ears;
    left.actor.set_position(-halfWidth - size, 0);
    left.actor.set_scale(factor, factor);
    right.actor.set_position(halfWidth - 1, 0);
    right.actor.set_scale(factor, factor);

    // One row of the panel, from ear tip to ear tip: the light stock theme
    // draws a hairline there that would cut the notch off from the panel.
    const reach = halfWidth + Math.round(factor * size);
    this.seam.set_position(-reach, -1);
    this.seam.set_size(reach * 2, 1);

    if (this.shown) {
      const scale = mix(REVEAL_SCALE, 1, shape.reveal);
      this.shown.translation_y = mix(-REVEAL_LIFT * this.scale, 0, shape.reveal);
      this.shown.set_scale(scale, scale);
    }
  }

  /** The animation reached its target. */
  private settled(): void {
    const state = this.model.state;
    if (state === 'idle') {
      this.hideAll();
      return;
    }
    // At rest the ears are drawn at their own size, not scaled.
    this.drawEars(this.target.ear);
    this.place(this.target);
    if (state === 'hint') return;

    const halfWidth = Math.round(this.target.halfWidth);
    this.shadow.set_position(-halfWidth, 0);
    this.shadow.set_size(halfWidth * 2, Math.round(this.target.height));
    // It falls on what is below the panel, never on the panel itself.
    const spread = 200 * this.scale;
    this.shadow.set_clip(-spread, 0, halfWidth * 2 + spread * 2, this.target.height + spread);
    this.shadow.opacity = 0;
    this.shadow.show();
    this.shadow.ease({
      opacity: 255,
      duration: SHADOW_IN,
      mode: Clutter.AnimationMode.LINEAR,
    });
  }

  /** Idle: nothing of the body is painted or can be picked, and nothing runs. */
  private hideAll(): void {
    this.shadow.remove_all_transitions();
    this.shadow.hide();
    this.body.hide();
    this.seam.hide();
    for (const ear of this.ears) ear.actor.hide();
    for (const child of this.clip.get_children()) {
      child.remove_all_transitions();
      child.hide();
    }
  }

  // ----------------------------------------------------------------- position

  /** Follows the neck and the panel, one frame later and outside of their layout pass. */
  private queueSync(): void {
    // `destroyed` is also set when the shell takes the actors away at shutdown.
    if (this.syncLater || this.destroyed) return;
    this.syncLater = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
      this.syncLater = 0;
      this.syncPosition();
      return GLib.SOURCE_REMOVE;
    });
  }

  /** Puts the root below the panel, centred on the neck. */
  private syncPosition(): void {
    if (!this.neck.has_allocation()) return;

    const [x] = this.neck.get_transformed_position();
    const width = this.neck.width;
    const panelBox = Main.layoutManager.panelBox;
    this.root.set_position(Math.round(x + width / 2), Math.round(panelBox.y + panelBox.height));

    if (width !== this.neckWidth) {
      this.neckWidth = width;
      // The clock or the dot changed the width the body is derived from.
      if (this.model.state !== 'open') this.retarget();
    }
  }

  private syncScale(): void {
    this.scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
  }

  /**
   * The ears are drawn at `radius` and scaled down from there while they
   * move. Redrawn when a state begins and when it has settled, never per frame.
   */
  private drawEars(radius: number): void {
    if (radius <= 0 || radius === this.earRadius) return;
    this.earRadius = radius;
    for (const ear of this.ears) ear.setRadius(radius);
  }

  // -------------------------------------------------------------------- theme

  /** Body and ears take the colour of the panel; the classes follow its luminance. */
  private syncTheme(): void {
    // In the overview the panel is transparent. The body is idle there; keep the last colour.
    const transparent = Main.panel.has_style_pseudo_class('overview');
    if (transparent && this.themeKey) return;

    const color: Rgb = transparent
      ? { red: 0, green: 0, blue: 0 }
      : Main.panel.get_theme_node().get_background_color();
    const css = opaqueCss(color);
    const classes = themeClasses(color, St.Settings.get().high_contrast);
    const key = `${css} ${classes.join(' ')}`;
    if (key === this.themeKey) return;
    // A colour made up for the overview is replaced as soon as the panel has one.
    this.themeKey = transparent ? '' : key;

    for (const actor of [this.root, this.neck]) {
      for (const name of THEME_CLASSES) actor.remove_style_class_name(name);
      for (const name of classes) actor.add_style_class_name(name);
    }
    this.body.set_style(`background-color: ${css};`);
    this.seam.set_style(`background-color: ${css};`);
    // The shadow is cast by a box of its own that hides behind the body.
    this.shadow.set_style(`background-color: ${css};`);
    for (const ear of this.ears) ear.setColor(color);
  }

  // ------------------------------------------------------------------- events

  private onCrossing(actor: Clutter.Actor, event: Clutter.Event): boolean {
    let inside: boolean;
    if (event.type() === Clutter.EventType.ENTER) {
      // The grab of the open notch ends and Clutter reports the pointer anew.
      // It did not come back; after closing, the notch stays quiet until it does.
      const grabNotify = (event.get_flags() & Clutter.EventFlags.FLAG_GRAB_NOTIFY) !== 0;
      if (grabNotify && this.menu.changing) return Clutter.EVENT_PROPAGATE;
      // While it holds the grab, the root is also told about actors outside of it.
      const source = global.stage.get_event_actor(event);
      inside = source !== null && actor.contains(source);
    } else {
      const related = event.get_related();
      if (related && actor.contains(related)) return Clutter.EVENT_PROPAGATE;
      inside = false;
    }

    if (actor === this.neck) this.overNeck = inside;
    else this.overBody = inside;

    const pointerInside = this.overNeck || this.overBody;
    if (pointerInside !== this.pointerInside) {
      this.pointerInside = pointerInside;
      this.dispatch({ type: pointerInside ? 'enter' : 'leave' });
    }
    return Clutter.EVENT_PROPAGATE;
  }

  /** A press on the neck toggles; a press on the hint or peek area opens. */
  private onPress(type: 'toggle' | 'activate'): boolean {
    if (type === 'activate' && this.model.state === 'open') return Clutter.EVENT_PROPAGATE;
    if (type === 'toggle') this.toggle();
    else this.dispatch({ type });
    return Clutter.EVENT_STOP;
  }

  private onTouch(event: Clutter.Event, type: 'toggle' | 'activate'): boolean {
    if (event.type() !== Clutter.EventType.TOUCH_BEGIN) return Clutter.EVENT_PROPAGATE;
    return this.onPress(type);
  }

  private onNeckKey(event: Clutter.Event): boolean {
    switch (event.get_key_symbol()) {
      case Clutter.KEY_Return:
      case Clutter.KEY_KP_Enter:
      case Clutter.KEY_space:
        this.toggle();
        return Clutter.EVENT_STOP;
      case Clutter.KEY_Escape:
        if (this.model.state === 'idle') return Clutter.EVENT_PROPAGATE;
        this.close();
        return Clutter.EVENT_STOP;
      default:
        return Clutter.EVENT_PROPAGATE;
    }
  }

  /** While open, before anything inside sees the event. */
  private onCapturedEvent(event: Clutter.Event): boolean {
    if (
      this.model.state === 'open' &&
      event.type() === Clutter.EventType.KEY_PRESS &&
      event.get_key_symbol() === Clutter.KEY_Escape &&
      this.content.handleEscape()
    )
      return Clutter.EVENT_STOP;
    // Otherwise the menu manager closes the notch on Escape and on a press outside.
    return Clutter.EVENT_PROPAGATE;
  }

  /** The menu manager took or released the grab, on our request or on its own. */
  private onMenuOpenState(open: boolean): void {
    const tray = Main.messageTray as unknown as { _bannerBlocked: boolean; bannerBlocked: boolean };
    if (open) {
      // Banners would come down right over the open panel.
      this.bannerWasBlocked = tray._bannerBlocked;
      tray.bannerBlocked = true;
    } else {
      tray.bannerBlocked = this.bannerWasBlocked;
    }
    // Escape, a press outside, or another panel menu took over.
    this.dispatch({ type: open ? 'open' : 'close' });
  }

  /** The layout manager hides the root while the monitor is in fullscreen. */
  private onRootVisible(): void {
    if (!this.root.visible) this.dispatch({ type: 'close' }, false);
  }

  // ------------------------------------------------------------------ destroy

  /** Stops everything that would touch the actors later. */
  private abandon(): void {
    this.destroyed = true;
    for (const id of this.timers.values()) GLib.Source.remove(id);
    this.timers.clear();
    if (this.syncLater) global.compositor.get_laters().remove(this.syncLater);
    this.syncLater = 0;
    this.queue.length = 0;
    this.motion.destroy();
  }

  destroy(): void {
    this.abandon();
    this.keybindings.destroy();

    // Releases the grab and gives the banners back if the notch is open.
    this.menu.close();
    this.menu.disconnectObject(this);
    Main.panel.menuManager.removeMenu(this.menu as never);
    this.menu.destroy();

    Main.layoutManager.disconnectObject(this);
    Main.layoutManager.panelBox.disconnectObject(this);
    Main.panel.disconnectObject(this);
    Main.overview.disconnectObject(this);
    St.Settings.get().disconnectObject(this);
    St.ThemeContext.get_for_stage(global.stage).disconnectObject(this);
    this.notifications = null;

    // Peek and sheet belong to the content, which destroys them itself.
    for (const child of this.clip.get_children()) {
      child.remove_all_transitions();
      this.clip.remove_child(child);
    }
    this.shown = null;

    this.root.disconnectObject(this);
    global.focus_manager.remove_group(this.root);
    Main.layoutManager.removeChrome(this.root);
    this.root.destroy();

    this.neck.disconnectObject(this);
    this.clock.destroy();

    const dateMenu = Main.panel.statusArea.dateMenu;
    dateMenu?.container.disconnectObject(this);
    dateMenu?.container.show();
  }

  private get centerBox(): Clutter.Actor {
    return (Main.panel as unknown as { _centerBox: Clutter.Actor })._centerBox;
  }
}
