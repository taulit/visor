// The agent sessions of the local T3 Code server as rows in "Now": what
// works, what finished, and above all what waits for an approval, which is
// given right in the row. The protocol is in docs/t3-protocol.md.
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

import { gettext } from 'resource:///org/gnome/shell/extensions/extension.js';

import type { Command, ModuleContext, NowRow, PeekChip, Result, VisorModule } from '../../api.js';
import { formatDuration, truncate } from '../../lib/format.js';
import { T3Client } from './client.js';
import {
  METHODS,
  MAX_REPLY,
  approvalPrompt,
  isWaiting,
  lastActive,
  launchPayload,
  replyCommand,
  respondCommand,
  sessionsOf,
  stopCommand,
  visibleSessions,
  type Session,
} from './protocol.js';

const ICON = 'utilities-terminal-symbolic';
const FLASH_KEY = 'flash-on-waiting-agents';
const MORE_ID = 't3:more';

const ICONS: Record<Session['phase'], string> = {
  starting: 'content-loading-symbolic',
  working: 'content-loading-symbolic',
  approval: 'dialog-question-symbolic',
  question: 'dialog-question-symbolic',
  done: 'object-select-symbolic',
  error: 'dialog-warning-symbolic',
};

/** What an expanded row shows. Built once per thread and updated in place. */
interface Details {
  expand: () => St.Widget;
  message: St.Label | null;
  stop: St.Widget | null;
}

class T3Module implements VisorModule {
  readonly id = 't3';
  readonly name = gettext('T3 Code');
  readonly icon = ICON;
  readonly slot = 'now';
  readonly commands: Command[] = [
    {
      keyword: ['t3'],
      hint: gettext('t3 Fix the failing test'),
      resolve: args => this.resolve(args),
    },
  ];

  private ctx: ModuleContext | null = null;
  private client: T3Client | null = null;
  private sessions: Session[] = [];
  /** What an approval asks, by request id; null while it is asked for. */
  private prompts = new Map<string, string | null>();
  /** Requests the user answered and the server has not confirmed yet. */
  private answered = new Set<string>();
  /** Threads the user stopped and the server has not confirmed yet. */
  private stopped = new Set<string>();
  /** What went wrong with the last action, by thread id. */
  private errors = new Map<string, string>();
  private details = new Map<string, Details>();
  /** Requests that already flashed. */
  private announced = new Set<string>();
  private showAll = false;
  /** Ticks once per second while the panel is open and something runs. */
  private tickSource = 0;
  /** Waits for the next finished session to lose its row. */
  private expirySource = 0;
  private reported = false;

  enable(ctx: ModuleContext): void {
    this.ctx = ctx;
    this.client = new T3Client(ctx.http, ctx.settings, () => this.safely(() => this.render()));
    ctx.onOpenChanged(open =>
      this.safely(() => {
        if (!open) this.showAll = false;
        this.render();
      }),
    );
    this.client.start();
  }

  disable(): void {
    this.client?.stop();
    this.client = null;
    if (this.tickSource) GLib.source_remove(this.tickSource);
    if (this.expirySource) GLib.source_remove(this.expirySource);
    this.tickSource = this.expirySource = 0;
    this.sessions = [];
    this.prompts.clear();
    this.answered.clear();
    this.stopped.clear();
    this.errors.clear();
    this.details.clear();
    this.announced.clear();
    this.showAll = false;
    this.ctx = null;
  }

  // --- the command `t3 <text>` ---

  private resolve(args: string): Result[] {
    const ctx = this.ctx;
    const client = this.client;
    const text = args.trim().slice(0, MAX_REPLY);
    if (!ctx || !client?.connected || !text) return [];
    const _ = ctx.t;
    const target = lastActive(client.shell);
    if (!target) return [];
    const name = truncate(target.title, 32) || _('Untitled thread');
    const results: Result[] = [
      {
        id: 't3:send',
        icon: ICON,
        title: _('Send to %s').replace('%s', name),
        subtitle: truncate(text, 80),
        activate: () => this.reply(target.id, text),
      },
    ];
    if (target.launch) {
      results.push({
        id: 't3:new',
        icon: ICON,
        title: _('Start a new thread'),
        subtitle: [target.project, truncate(text, 80)].filter(Boolean).join(' · '),
        activate: () => this.launch(target, text),
      });
    }
    return results;
  }

  // --- actions ---

  /** Sends a command; a failure shows in the subtitle of the row. */
  private send(threadId: string, promise: Promise<unknown>, undo?: () => void): void {
    this.errors.delete(threadId);
    promise.then(
      () => undefined,
      (error: unknown) =>
        this.safely(() => {
          if (!this.ctx) return;
          undo?.();
          this.errors.set(threadId, truncate(error instanceof Error ? error.message : '', 80));
          this.render();
        }),
    );
  }

  private answer(session: Session, decision: 'accept' | 'decline'): void {
    const client = this.client;
    const request = session.request;
    if (!client || !request) return;
    // Optimistic: the row runs again until the server says otherwise.
    this.answered.add(request.id);
    this.send(
      session.id,
      client.command(
        respondCommand(GLib.uuid_string_random(), request.threadId, request.id, decision),
      ),
      () => this.answered.delete(request.id),
    );
    this.render();
  }

  private reply(threadId: string, text: string): void {
    const client = this.client;
    if (!client || !text.trim()) return;
    const command = replyCommand(
      GLib.uuid_string_random(),
      GLib.uuid_string_random(),
      threadId,
      text,
    );
    this.send(threadId, client.command(command));
    this.render();
  }

  private stop(session: Session): void {
    const client = this.client;
    if (!client?.descriptor) return;
    const command = stopCommand(GLib.uuid_string_random(), session, client.descriptor);
    if (!command) return;
    this.stopped.add(session.id);
    this.send(session.id, client.command(command), () => this.stopped.delete(session.id));
    this.render();
  }

  private launch(like: Session, text: string): void {
    const client = this.client;
    if (!client) return;
    const payload = launchPayload(
      {
        commandId: GLib.uuid_string_random(),
        threadId: GLib.uuid_string_random(),
        messageId: GLib.uuid_string_random(),
      },
      like,
      text,
    );
    if (payload) this.send(like.id, client.request(METHODS.launchThread, payload));
  }

  private openInApp(threadId: string): void {
    const link = this.client?.link(threadId);
    this.ctx?.close();
    if (!link) return;
    try {
      Gio.AppInfo.launch_default_for_uri(link, global.create_app_launch_context(0, -1));
    } catch {
      // No application for http links; nothing to open then.
    }
  }

  /** Asks once per request what it is about. */
  private fetchPrompt(session: Session): void {
    const client = this.client;
    const request = session.request;
    if (!client || !request || this.prompts.has(request.id)) return;
    this.prompts.set(request.id, null);
    client.request(METHODS.getThreadProjection, { threadId: request.threadId }).then(
      projection =>
        this.safely(() => {
          if (!this.ctx) return;
          this.prompts.set(request.id, approvalPrompt(projection, request.id));
          this.render();
        }),
      // The row says what kind of request it is; that has to do.
      () => this.prompts.set(request.id, ''),
    );
  }

  // --- what is shown ---

  private render(): void {
    const ctx = this.ctx;
    const client = this.client;
    if (!ctx || !client) return;
    const now = Date.now();
    this.sessions = sessionsOf(client.shell, now)
      .filter(session => !this.stopped.has(session.id) || !session.runId)
      .map(session =>
        // An answered request: the session runs again, as far as Visor knows.
        session.request && this.answered.has(session.request.id)
          ? { ...session, phase: 'working' as const, request: null }
          : session,
      );
    this.forget(client);

    const waiting = this.sessions.filter(isWaiting);
    for (const session of waiting) if (session.phase === 'approval') this.fetchPrompt(session);

    if (this.sessions.length === 0) {
      ctx.now.clear();
    } else {
      const { shown, more } = visibleSessions(this.sessions, this.showAll);
      const rows = shown.map(session => this.row(session, now));
      if (more > 0) {
        rows.push({
          id: MORE_ID,
          icon: 'view-more-symbolic',
          title: ctx.t('+ %d more').replace('%d', String(more)),
          status: 'done',
          activate: () => {
            this.showAll = true;
            this.render();
          },
        });
      }
      ctx.now.set(rows);
    }

    const first = waiting[0];
    const chip = first ? this.chip(first) : null;
    ctx.peek.set(chip);
    ctx.attention(first ? 'waiting' : null);
    const flash = ctx.settings?.get_boolean(FLASH_KEY) ?? true;
    for (const session of waiting) {
      const requestId = session.request!.id;
      if (this.announced.has(requestId)) continue;
      this.announced.add(requestId);
      if (flash) ctx.peek.flash(this.chip(session));
    }

    this.schedule(now);
  }

  /** Drops what belongs to requests and threads the server no longer has. */
  private forget(client: T3Client): void {
    const requests = new Set<string>();
    for (const session of sessionsOf(client.shell, 0))
      if (session.request) requests.add(session.request.id);
    for (const map of [this.prompts, this.answered, this.announced])
      for (const requestId of [...map.keys()]) if (!requests.has(requestId)) map.delete(requestId);
    const shown = new Set(this.sessions.map(session => session.id));
    for (const threadId of [...this.details.keys()])
      if (!shown.has(threadId)) this.details.delete(threadId);
    for (const threadId of [...this.errors.keys()])
      if (!client.shell.threads.has(threadId)) this.errors.delete(threadId);
    for (const threadId of [...this.stopped])
      if (!sessionsOf(client.shell, 0).some(s => s.id === threadId && s.runId))
        this.stopped.delete(threadId);
  }

  private chip(session: Session): PeekChip {
    const name = truncate(session.title, 20) || this.ctx!.t('Agent');
    return {
      icon: ICONS.approval,
      text: this.ctx!.t('%s is waiting').replace('%s', name),
      tone: 'waiting',
      priority: 100,
    };
  }

  private state(session: Session, now: number): string {
    const _ = this.ctx!.t;
    switch (session.phase) {
      case 'starting':
        return _('Starting');
      case 'working':
        return session.startedAt === null
          ? _('Working')
          : `${_('Working')} · ${formatDuration(Math.max(0, now - session.startedAt))}`;
      case 'approval':
        if (session.request?.kind === 'command') return _('Wants to run');
        return session.request?.kind === 'file'
          ? _('Wants to use a file')
          : _('Asks for permission');
      case 'question':
        return _('Has a question');
      case 'done':
        return _('Done');
      default:
        return session.error ? `${_('Failed')} · ${session.error}` : _('Failed');
    }
  }

  private row(session: Session, now: number): NowRow {
    const _ = this.ctx!.t;
    const error = this.errors.get(session.id);
    const state = error ? `${_('Could not send')} · ${error}` : this.state(session, now);
    const row: NowRow = {
      id: `t3:${session.id}`,
      icon: ICONS[session.phase],
      title: session.title || _('Untitled thread'),
      subtitle: [session.project, state].filter(Boolean).join(' · '),
      expand: this.detailsOf(session).expand,
    };
    if (session.phase === 'approval') {
      const prompt = this.prompts.get(session.request!.id);
      return {
        ...row,
        status: 'waiting',
        detail: prompt || undefined,
        controls: [
          { label: _('Deny'), style: 'ghost', run: () => this.answer(session, 'decline') },
        ],
        primary: { label: _('Allow'), style: 'primary', run: () => this.answer(session, 'accept') },
      };
    }
    if (session.phase === 'question') {
      return {
        ...row,
        status: 'waiting',
        primary: { label: _('Answer'), style: 'primary', run: () => this.openInApp(session.id) },
      };
    }
    return session.phase === 'done' ? { ...row, status: 'done' } : row;
  }

  /** The function that builds the expanded part; the same one for the life of the row. */
  private detailsOf(session: Session): Details {
    const threadId = session.id;
    let details = this.details.get(threadId);
    if (!details) {
      const created: Details = {
        message: null,
        stop: null,
        expand: () => this.buildDetails(threadId, created),
      };
      this.details.set(threadId, (details = created));
    }
    if (details.message) {
      details.message.text = session.lastMessage;
      details.message.visible = session.lastMessage !== '';
    }
    if (details.stop) details.stop.visible = session.runId !== null;
    return details;
  }

  private buildDetails(threadId: string, details: Details): St.Widget {
    const ctx = this.ctx!;
    const _ = ctx.t;
    const session = this.sessions.find(s => s.id === threadId);
    const box = new St.BoxLayout({
      style_class: 'visor-t3-details',
      orientation: Clutter.Orientation.VERTICAL,
      x_expand: true,
    });

    // Plain text: what an agent wrote is never markup.
    const message = new St.Label({
      style_class: 'visor-t3-message',
      text: session?.lastMessage ?? '',
      visible: Boolean(session?.lastMessage),
      x_expand: true,
    });
    message.clutter_text.line_wrap = true;
    message.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
    message.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    box.add_child(message);

    const name = truncate(session?.title ?? '', 24);
    const entry = new St.Entry({
      style_class: 'visor-t3-reply',
      hint_text: name ? _('Reply to %s …').replace('%s', name) : _('Reply'),
      accessible_name: _('Reply'),
      can_focus: true,
      x_expand: true,
    });
    entry.clutter_text.max_length = MAX_REPLY;
    entry.clutter_text.connect('activate', () =>
      this.safely(() => {
        const text = entry.get_text().trim();
        if (!text) return;
        entry.set_text('');
        this.reply(threadId, text);
      }),
    );
    box.add_child(entry);

    const buttons = new St.BoxLayout({ style_class: 'visor-t3-buttons' });
    const stop = ctx.kit.button({
      label: _('Stop'),
      style: 'ghost',
      run: () => {
        const current = this.sessions.find(s => s.id === threadId);
        if (current) this.stop(current);
      },
    });
    stop.visible = Boolean(session?.runId);
    buttons.add_child(stop);
    buttons.add_child(
      ctx.kit.button({
        label: _('Open in T3 Code'),
        style: 'ghost',
        run: () => this.openInApp(threadId),
      }),
    );
    box.add_child(buttons);

    details.message = message;
    details.stop = stop;
    box.connect('destroy', () => {
      if (details.message === message) details.message = details.stop = null;
    });
    return box;
  }

  // --- time ---

  private schedule(now: number): void {
    const ctx = this.ctx!;
    const ticking =
      ctx.isOpen && this.sessions.some(s => s.phase === 'working' && s.startedAt !== null);
    if (ticking && !this.tickSource) {
      this.tickSource = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
        this.safely(() => this.render());
        return this.tickSource ? GLib.SOURCE_CONTINUE : GLib.SOURCE_REMOVE;
      });
    } else if (!ticking && this.tickSource) {
      GLib.source_remove(this.tickSource);
      this.tickSource = 0;
    }

    if (this.expirySource) GLib.source_remove(this.expirySource);
    this.expirySource = 0;
    const next = Math.min(...this.sessions.map(s => s.until ?? Infinity));
    if (next === Infinity) return;
    this.expirySource = GLib.timeout_add(
      GLib.PRIORITY_DEFAULT,
      Math.max(50, next - now + 20),
      () => {
        this.expirySource = 0;
        this.safely(() => this.render());
        return GLib.SOURCE_REMOVE;
      },
    );
  }

  /** For callbacks nobody else guards: an exception is logged once and goes no further. */
  private safely(fn: () => void): void {
    try {
      fn();
    } catch (e) {
      if (this.reported) return;
      this.reported = true;
      logError(e as Error, 'Visor: t3');
    }
  }
}

export function t3Module(): VisorModule {
  return new T3Module();
}
