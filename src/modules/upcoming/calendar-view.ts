// The calendar above "Up Next": the current week as one band, and behind its
// title the month as a grid with the numbers of the weeks. A day can be picked;
// what that means is up to the module. Today has the accent, days with events a dot.
import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {
  addDays,
  addMonths,
  dayKey,
  isoWeek,
  monthWeeks,
  sameDay,
  startOfDay,
  weekDays,
} from './calendar.js';

type Gettext = (s: string) => string;

export interface CalendarViewProps {
  t: Gettext;
  /** 0 Sunday, 1 Monday. */
  firstDay: number;
  /** A day was clicked. */
  onPick(day: Date): void;
  /** The days on screen changed: the band and the grid, from midnight to midnight. */
  onShownChanged(): void;
}

/** What the module tells the calendar each time it draws. */
export interface CalendarState {
  today: Date;
  /** The picked day; today when none is. */
  picked: Date;
  /** Keys of the days with events, see dayKey(). */
  busy: ReadonlySet<string>;
}

const monthName = (date: Date): string => date.toLocaleDateString(undefined, { month: 'long' });
const weekdayName = (date: Date): string =>
  date.toLocaleDateString(undefined, { weekday: 'short' }).replace(/\.$/, '');
const longDate = (date: Date): string =>
  date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

export class CalendarView {
  readonly actor: St.BoxLayout;
  private titleLabel: St.Label;
  private titleIcon: St.Icon;
  private titleButton: St.Button;
  private nav: St.BoxLayout;
  private body: St.Bin;
  /** The month is open; else the week shows. */
  private expanded = false;
  /** The first of the month the grid shows. */
  private month = addMonths(new Date(), 0);
  private state: CalendarState | null = null;
  /** A click on a day, handed on once the button is done with it. */
  private pickSource = 0;

  constructor(private props: CalendarViewProps) {
    const { t: _ } = props;
    this.actor = new St.BoxLayout({
      style_class: 'visor-calendar',
      orientation: Clutter.Orientation.VERTICAL,
      x_expand: true,
    });

    const header = new St.BoxLayout({ style_class: 'visor-calendar-header', x_expand: true });
    const titleBox = new St.BoxLayout({ style_class: 'visor-calendar-title-box' });
    this.titleLabel = new St.Label({
      style_class: 'visor-calendar-title',
      y_align: Clutter.ActorAlign.CENTER,
    });
    this.titleIcon = new St.Icon({
      style_class: 'visor-calendar-chevron',
      icon_name: 'pan-down-symbolic',
      y_align: Clutter.ActorAlign.CENTER,
    });
    titleBox.add_child(this.titleLabel);
    titleBox.add_child(this.titleIcon);
    this.titleButton = new St.Button({
      style_class: 'visor-calendar-title-button',
      child: titleBox,
      can_focus: true,
      y_align: Clutter.ActorAlign.CENTER,
    });
    this.titleButton.connect('clicked', () => this.setExpanded(!this.expanded));
    header.add_child(this.titleButton);
    header.add_child(new St.Widget({ x_expand: true }));

    this.nav = new St.BoxLayout({ style_class: 'visor-calendar-nav', visible: false });
    this.nav.add_child(this.navButton('go-previous-symbolic', _('Previous month'), -1));
    const today = new St.Button({
      style_class: 'visor-calendar-nav-button today',
      label: _('Today'),
      can_focus: true,
    });
    today.connect('clicked', () => {
      this.month = addMonths(new Date(), 0);
      this.props.onPick(startOfDay(new Date()));
      this.props.onShownChanged();
    });
    this.nav.add_child(today);
    this.nav.add_child(this.navButton('go-next-symbolic', _('Next month'), 1));
    header.add_child(this.nav);
    this.actor.add_child(header);

    this.body = new St.Bin({ x_expand: true, x_align: Clutter.ActorAlign.FILL });
    this.actor.add_child(this.body);
    this.actor.connect('destroy', () => {
      if (this.pickSource) GLib.source_remove(this.pickSource);
      this.pickSource = 0;
    });
  }

  /** The first and the day after the last day on screen. */
  shown(today: Date): { from: Date; until: Date } {
    const days = this.expanded
      ? monthWeeks(this.month, this.props.firstDay).flat()
      : weekDays(today, this.props.firstDay);
    return { from: days[0]!, until: addDays(days.at(-1)!, 1) };
  }

  /** Back to the week of today, as after the panel closed. */
  reset(): void {
    this.expanded = false;
    this.month = addMonths(new Date(), 0);
  }

  render(state: CalendarState): void {
    this.state = state;
    const { t: _ } = this.props;
    const { today } = state;
    this.titleLabel.text = this.expanded
      ? `${monthName(this.month)} ${this.month.getFullYear()}`
      : `${monthName(today)} · ${_('Week %d').replace('%d', String(isoWeek(today)))}`;
    this.titleIcon.icon_name = this.expanded ? 'pan-up-symbolic' : 'pan-down-symbolic';
    this.titleButton.accessible_name = `${this.titleLabel.text}, ${
      this.expanded ? _('Show the week') : _('Show the month')
    }`;
    this.nav.visible = this.expanded;
    this.body.child?.destroy();
    this.body.set_child(this.expanded ? this.buildMonth(state) : this.buildWeek(state));
  }

  private setExpanded(expanded: boolean): void {
    this.expanded = expanded;
    if (expanded && this.state) this.month = addMonths(this.state.picked, 0);
    this.props.onShownChanged();
  }

  private navButton(icon: string, name: string, months: number): St.Button {
    const button = new St.Button({
      style_class: 'visor-calendar-nav-button',
      child: new St.Icon({ icon_name: icon, style_class: 'visor-calendar-nav-icon' }),
      can_focus: true,
      accessible_name: name,
    });
    button.connect('clicked', () => {
      this.month = addMonths(this.month, months);
      this.props.onShownChanged();
    });
    return button;
  }

  private buildWeek(state: CalendarState): St.Widget {
    const strip = new St.BoxLayout({ style_class: 'visor-calendar-week', x_expand: true });
    (strip.layout_manager as Clutter.BoxLayout).homogeneous = true;
    for (const day of weekDays(state.today, this.props.firstDay)) {
      const box = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        x_align: Clutter.ActorAlign.CENTER,
      });
      const center = { x_align: Clutter.ActorAlign.CENTER };
      box.add_child(
        new St.Label({ style_class: 'visor-calendar-weekday', text: weekdayName(day), ...center }),
      );
      box.add_child(
        new St.Label({
          style_class: 'visor-calendar-number',
          text: String(day.getDate()),
          ...center,
        }),
      );
      box.add_child(this.dot(state, day));
      const button = this.dayButton(day, box, state, true);
      button.x_expand = true;
      strip.add_child(button);
    }
    return strip;
  }

  private buildMonth(state: CalendarState): St.Widget {
    const layout = new Clutter.GridLayout({ column_homogeneous: false });
    const grid = new St.Widget({
      style_class: 'visor-calendar-month',
      layout_manager: layout,
      x_expand: true,
    });
    const weeks = monthWeeks(this.month, this.props.firstDay);
    layout.attach(new St.Widget(), 0, 0, 1, 1);
    weeks[0]!.forEach((day, i) =>
      layout.attach(
        new St.Label({
          style_class: 'visor-calendar-weekday',
          text: weekdayName(day),
          x_align: Clutter.ActorAlign.CENTER,
          x_expand: true,
        }),
        i + 1,
        0,
        1,
        1,
      ),
    );
    weeks.forEach((week, row) => {
      layout.attach(
        new St.Label({
          style_class: 'visor-calendar-week-number',
          // The week of its Monday: with Sunday first, the Sunday still belongs to the week before.
          text: String(isoWeek(week.find(day => day.getDay() === 1)!)),
          y_align: Clutter.ActorAlign.CENTER,
        }),
        0,
        row + 1,
        1,
        1,
      );
      week.forEach((day, i) => {
        const box = new St.BoxLayout({
          orientation: Clutter.Orientation.VERTICAL,
          x_align: Clutter.ActorAlign.CENTER,
        });
        box.add_child(
          new St.Label({
            style_class: 'visor-calendar-number',
            text: String(day.getDate()),
            x_align: Clutter.ActorAlign.CENTER,
          }),
        );
        box.add_child(this.dot(state, day));
        const button = this.dayButton(day, box, state, day.getMonth() === this.month.getMonth());
        button.x_expand = true;
        layout.attach(button, i + 1, row + 1, 1, 1);
      });
    });
    return grid;
  }

  /** Always there, so every day is as tall; seen only on a day with events. */
  private dot(state: CalendarState, day: Date): St.Widget {
    return new St.Widget({
      style_class: 'visor-calendar-dot',
      x_align: Clutter.ActorAlign.CENTER,
      opacity: state.busy.has(dayKey(day)) ? 255 : 0,
    });
  }

  private dayButton(
    day: Date,
    child: St.Widget,
    state: CalendarState,
    inMonth: boolean,
  ): St.Button {
    const { t: _ } = this.props;
    const classes = ['visor-calendar-day'];
    if (sameDay(day, state.today)) classes.push('today');
    else if (sameDay(day, state.picked)) classes.push('picked');
    if (!inMonth) classes.push('outside');
    if (day.getDay() === 0 || day.getDay() === 6) classes.push('weekend');
    const busy = state.busy.has(dayKey(day));
    const button = new St.Button({
      style_class: classes.join(' '),
      child,
      can_focus: true,
      accessible_role: Atk.Role.PUSH_BUTTON,
      accessible_name: busy ? `${longDate(day)}, ${_('with events')}` : longDate(day),
    });
    // Picking draws the days anew, this button too; not while it still handles its click.
    button.connect('clicked', () => {
      if (this.pickSource) GLib.source_remove(this.pickSource);
      this.pickSource = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        this.pickSource = 0;
        this.props.onPick(day);
        return GLib.SOURCE_REMOVE;
      });
    });
    return button;
  }
}
