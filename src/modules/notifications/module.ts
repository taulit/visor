// "Notifications": what is in the message tray of the shell, newest first.
// The shell keeps its banners; this module only lists, counts and announces.
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

import { gettext } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import type { KitRow, KitSection, ModuleContext, RowProps, VisorModule } from '../../api.js';
import { formatRelativeTime, type TimeOptions } from '../upcoming/when.js';
import {
  arrange,
  COLLAPSED_ROWS,
  flashText,
  needsExpand,
  plainBody,
  subtitleText,
} from './list.js';

type Notification = MessageTray.Notification;
type Source = MessageTray.Source;

const ICON = 'preferences-system-notifications-symbolic';
const CHIP_PRIORITY = 10;
/** While the panel is open, `now` turns into `1 min ago` by itself. */
const TICK_SECONDS = 30;

interface Entry {
  notification: Notification;
  source: Source;
  /** Order of arrival, for notifications of the same second. */
  order: number;
  /** Builds what an expanded row shows. Replaced when the notification changes. */
  expand?: () => St.Widget;
}

class Notifications implements VisorModule {
  readonly id = 'notifications';
  // Needed before enable(), for the list of modules: there is no context yet.
  readonly name = gettext('Notifications');
  readonly icon = ICON;
  readonly slot = 'ahead' as const;

  private ctx: ModuleContext | null = null;
  private settings: Gio.Settings | null = null;
  private clock: Gio.Settings | null = null;
  private removeOpenHandler: (() => void) | null = null;

  private sources = new Set<Source>();
  private entries = new Map<Notification, Entry>();
  private arrivals = 0;
  /**
   * Arrived since the panel was last open. Not the same as `!acknowledged`:
   * the shell acknowledges a notification the moment its banner shows.
   */
  private unread = new Set<Notification>();

  private section: KitSection | null = null;
  private list: St.BoxLayout | null = null;
  private empty: St.Widget | null = null;
  private rows = new Map<Notification, KitRow>();
  private more: St.Widget | null = null;
  private moreLabel = '';
  private hasClear = false;
  /** "Show all" was clicked; goes back when the panel closes. */
  private expanded = false;

  private renderLater = 0;
  private reported = false;
  private tick = 0;

  enable(ctx: ModuleContext): void {
    this.ctx = ctx;
    this.settings = new Gio.Settings({ schema_id: 'org.gnome.desktop.notifications' });
    this.settings.connectObject('changed::show-banners', () => this.syncDoNotDisturb(), this);
    this.clock = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
    this.clock.connectObject('changed::clock-format', () => this.queueRender(), this);

    Main.messageTray.connectObject(
      'source-added',
      (_tray: unknown, source: Source) => this.track(source),
      'source-removed',
      (_tray: unknown, source: Source) => this.untrack(source),
      this,
    );
    for (const source of Main.messageTray.getSources()) this.track(source);

    this.removeOpenHandler = ctx.onOpenChanged(open => this.openChanged(open));
    this.syncUnread();
  }

  disable(): void {
    this.removeOpenHandler?.();
    this.removeOpenHandler = null;
    if (this.renderLater) GLib.source_remove(this.renderLater);
    this.renderLater = 0;
    this.stopTick();

    Main.messageTray.disconnectObject(this);
    for (const source of this.sources) source.disconnectObject(this);
    this.sources.clear();
    for (const notification of this.entries.keys()) notification.disconnectObject(this);
    this.entries.clear();
    this.unread.clear();

    this.settings?.disconnectObject(this);
    this.settings = null;
    this.clock?.disconnectObject(this);
    this.clock = null;

    // Visor destroys the section and with it the rows.
    this.section = null;
    this.list = null;
    this.empty = null;
    this.more = null;
    this.moreLabel = '';
    this.hasClear = false;
    this.rows.clear();
    this.expanded = false;
    this.ctx = null;
  }

  buildSection(): St.Widget {
    const ctx = this.ctx!;
    const _ = ctx.t;
    this.section = ctx.kit.section({
      title: _('Notifications'),
      toggle: {
        label: _('Do Not Disturb'),
        active: !this.settings!.get_boolean('show-banners'),
        onChange: active => this.settings?.set_boolean('show-banners', !active),
      },
    });
    this.list = new St.BoxLayout({ orientation: Clutter.Orientation.VERTICAL, x_expand: true });
    this.section.body.add_child(this.list);
    this.empty = ctx.kit.empty(_('No new notifications'));
    this.section.body.add_child(this.empty);
    this.render();
    return this.section.actor;
  }

  // ------------------------------------------------------------------- tray

  private track(source: Source): void {
    if (this.sources.has(source)) return;
    this.sources.add(source);
    source.connectObject(
      'notification-added',
      (_source: Source, notification: Notification) => this.add(source, notification, true),
      'notification-removed',
      (_source: Source, notification: Notification) => this.remove(notification),
      this,
    );
    for (const notification of source.notifications) this.add(source, notification, false);
  }

  private untrack(source: Source): void {
    if (!this.sources.delete(source)) return;
    source.disconnectObject(this);
    // A source that was turned off in the settings leaves the tray with its notifications.
    for (const entry of [...this.entries.values()])
      if (entry.source === source) this.remove(entry.notification);
  }

  private add(source: Source, notification: Notification, fresh: boolean): void {
    if (this.entries.has(notification)) return;
    this.entries.set(notification, { notification, source, order: ++this.arrivals });
    notification.connectObject(
      'notify',
      (_n: Notification, pspec: { get_name(): string }) =>
        this.changed(notification, pspec.get_name()),
      'action-added',
      () => this.contentChanged(notification),
      'action-removed',
      () => this.contentChanged(notification),
      this,
    );
    this.arrived(notification, fresh);
    this.queueRender();
  }

  private remove(notification: Notification): void {
    if (!this.entries.delete(notification)) return;
    notification.disconnectObject(this);
    this.unread.delete(notification);
    this.syncUnread();
    // The row goes with the next render: this may run inside a click on it.
    this.queueRender();
  }

  /** A notification is new, or the app changed it and wants it seen again. */
  private arrived(notification: Notification, announce: boolean): void {
    const ctx = this.ctx;
    if (!ctx || notification.acknowledged) return;
    if (ctx.isOpen) {
      // It appears in the list in front of the user; no banner after closing.
      notification.acknowledged = true;
      return;
    }
    this.unread.add(notification);
    this.syncUnread();
    if (!announce) return;
    if (!this.settings?.get_boolean('show-banners')) return;
    if (notification.urgency === MessageTray.Urgency.LOW) return;
    const app = this.entries.get(notification)?.source.title ?? '';
    ctx.peek.flash({
      icon: ICON,
      text: flashText(app, notification.title ?? ''),
      priority: CHIP_PRIORITY,
    });
  }

  private changed(notification: Notification, property: string): void {
    if (property === 'acknowledged') {
      // True is the banner of the shell or this module; neither means "read in the panel".
      if (!notification.acknowledged) this.arrived(notification, true);
      return;
    }
    if (property === 'datetime') this.queueRender();
    else this.contentChanged(notification);
  }

  private contentChanged(notification: Notification): void {
    const entry = this.entries.get(notification);
    if (entry) entry.expand = undefined;
    this.queueRender();
  }

  // ----------------------------------------------------------------- state

  private openChanged(open: boolean): void {
    if (open) {
      for (const notification of this.entries.keys())
        if (!notification.acknowledged) notification.acknowledged = true;
      this.unread.clear();
      this.syncUnread();
      this.startTick();
    } else {
      this.stopTick();
      this.expanded = false;
    }
    this.render();
  }

  /** The dot next to the clock and the chip with the count. */
  private syncUnread(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const count = this.unread.size;
    ctx.attention(count > 0 ? 'unread' : null);
    ctx.peek.set(count > 0 ? { icon: ICON, text: String(count), priority: CHIP_PRIORITY } : null);
  }

  private syncDoNotDisturb(): void {
    const toggle = this.section?.toggle;
    if (toggle && this.settings) toggle.active = !this.settings.get_boolean('show-banners');
  }

  private startTick(): void {
    if (this.tick) return;
    this.tick = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, TICK_SECONDS, () => {
      this.render();
      return GLib.SOURCE_CONTINUE;
    });
  }

  private stopTick(): void {
    if (this.tick) GLib.source_remove(this.tick);
    this.tick = 0;
  }

  // ------------------------------------------------------------------ rows

  /** Several changes of one notification in a row end in one render. */
  private queueRender(): void {
    if (this.renderLater || !this.section) return;
    this.renderLater = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
      this.renderLater = 0;
      this.render();
      return GLib.SOURCE_REMOVE;
    });
  }

  private render(): void {
    const ctx = this.ctx;
    const list = this.list;
    if (!ctx || !this.section || !list) return;
    const _ = ctx.t;
    const now = new Date();
    const opts: TimeOptions = { hour12: this.clock?.get_string('clock-format') === '12h' };

    const all = [...this.entries.values()]
      .sort((a, b) => a.order - b.order)
      .map(entry => ({
        entry,
        app: entry.source.title ?? '',
        time: entry.notification.datetime.to_unix() * 1000,
      }));
    const visible = arrange(all, this.expanded);
    const wanted = new Set(visible.map(item => item.entry.notification));

    // A row that goes while it has the keyboard focus hands it to its neighbour.
    const focus = global.stage.get_key_focus();
    let focusIndex = -1;
    for (const [notification, row] of this.rows) {
      if (wanted.has(notification)) continue;
      if (focus && row.actor.contains(focus)) focusIndex = list.get_children().indexOf(row.actor);
      row.actor.destroy();
      this.rows.delete(notification);
    }

    visible.forEach(({ entry, app }, index) => {
      let props: RowProps;
      try {
        props = this.rowProps(entry, app, now, opts);
      } catch (e) {
        // One notification that cannot be read does not take the list down.
        if (!this.reported) {
          this.reported = true;
          logError(e as Error, 'Visor: notifications');
        }
        props = {
          icon: ICON,
          title: app,
          actions: [],
          activate: () => this.activate(() => entry.notification.activate()),
        };
      }
      let row = this.rows.get(entry.notification);
      if (row) {
        row.update(props);
      } else {
        row = ctx.kit.row(props);
        this.rows.set(entry.notification, row);
        list.add_child(row.actor);
      }
      if (list.get_child_at_index(index) !== row.actor) list.set_child_at_index(row.actor, index);
    });

    let label = '';
    if (this.expanded && all.length > 0) label = _('Show less');
    else if (all.length > COLLAPSED_ROWS)
      label = _('Show all %d').replace('%d', String(all.length));
    if (label !== this.moreLabel) {
      const hadFocus = this.more?.has_key_focus() ?? false;
      this.more?.destroy();
      this.more = null;
      this.moreLabel = label;
      if (label) {
        this.more = ctx.kit.button({ label, style: 'link', run: () => this.toggleExpanded() });
        list.add_child(this.more);
        if (hadFocus) this.more.grab_key_focus();
      }
    }
    if (this.more) list.set_child_at_index(this.more, visible.length);

    if (focusIndex >= 0) {
      const next = list.get_child_at_index(Math.min(focusIndex, visible.length - 1));
      (next as St.Widget | null)?.navigate_focus(null, St.DirectionType.TAB_FORWARD, false);
    }

    this.empty!.visible = all.length === 0;
    const hasClear = all.length > 0;
    if (hasClear !== this.hasClear) {
      this.hasClear = hasClear;
      this.section.setLinks(
        hasClear ? [{ label: _('Clear all'), run: () => this.clearAll() }] : [],
      );
    }
  }

  private rowProps(entry: Entry, app: string, now: Date, opts: TimeOptions): RowProps {
    const ctx = this.ctx!;
    const _ = ctx.t;
    const { notification, source } = entry;
    const body = plainBody(notification.body, notification.useBodyMarkup);
    if (!needsExpand(app, body, notification.actions.length)) entry.expand = undefined;
    else entry.expand ??= () => this.buildDetails(notification, body);
    return {
      icon: notification.gicon ?? source.icon ?? ICON,
      iconStyle: 'app',
      title: notification.title ?? '',
      subtitle: subtitleText(app, body),
      meta: formatRelativeTime(
        new Date(notification.datetime.to_unix() * 1000),
        now,
        _,
        // Both forms of the message are the same text, so the singular finds the translation.
        singular => _(singular),
        undefined,
        opts,
      ),
      actions: [
        {
          label: _('Dismiss'),
          icon: 'window-close-symbolic',
          run: () => notification.destroy(MessageTray.NotificationDestroyedReason.DISMISSED),
        },
      ],
      activate: () => this.activate(() => notification.activate()),
      expand: entry.expand,
    };
  }

  /** The whole body and the actions of a notification, below its row. */
  private buildDetails(notification: Notification, body: string): St.Widget {
    const kit = this.ctx!.kit;
    // Inline styles are scaled by St like the stylesheet.
    const box = new St.BoxLayout({
      orientation: Clutter.Orientation.VERTICAL,
      x_expand: true,
      style: 'spacing: 8px;',
    });
    if (body) {
      // The class of the second line of a row: the same quiet text, here on several lines.
      const label = new St.Label({ style_class: 'visor-row-subtitle', text: body, x_expand: true });
      label.clutter_text.line_wrap = true;
      label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
      box.add_child(label);
    }
    if (notification.actions.length > 0) {
      const buttons = new St.BoxLayout({ x_expand: true, style: 'spacing: 6px;' });
      for (const action of notification.actions) {
        buttons.add_child(
          kit.button({
            label: action.label ?? '',
            run: () => this.activate(() => action.activate()),
          }),
        );
      }
      box.add_child(buttons);
    }
    return box;
  }

  /** Runs the default action or a button of a notification; the app takes over, so the panel closes. */
  private activate(run: () => void): void {
    try {
      run();
    } finally {
      this.ctx?.close();
    }
  }

  private toggleExpanded(): void {
    this.expanded = !this.expanded;
    this.render();
  }

  private clearAll(): void {
    for (const notification of [...this.entries.keys()])
      notification.destroy(MessageTray.NotificationDestroyedReason.DISMISSED);
  }
}

export function notificationsModule(): VisorModule {
  return new Notifications();
}
