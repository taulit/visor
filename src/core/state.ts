// The state machine of the notch: events in, new state plus timer intents out.
// Pure logic without gi:// imports, so it runs under Vitest. core/notch.ts
// feeds it with events and owns the real timers.
import type { NotchState } from './types.js';

/** Pointer left neck and body: time until the notch goes back to idle. */
export const LEAVE_DELAY_MS = 250;
/** How long flash() keeps the peek state up. */
export const FLASH_DURATION_MS = 3000;

export type TimerName = 'peek' | 'leave' | 'flash';

export interface NotchModel {
  readonly state: NotchState;
  /** The pointer is over the neck or the visible body. */
  readonly pointer: boolean;
  /** The peek state is held up by flash(), not by the pointer. */
  readonly flashing: boolean;
  /** The timer from hint to peek runs. */
  readonly peekPending: boolean;
  /** The overview is visible; the notch stays idle there. */
  readonly overview: boolean;
}

/** What the machine needs to know about the world at the time of an event. */
export interface NotchContext {
  /** Setting `hover-preview`. */
  readonly hoverPreview: boolean;
  /** Setting `peek-delay` in milliseconds. */
  readonly peekDelay: number;
  /** `content.hasPeek()`. */
  readonly hasPeek: boolean;
  /** Flashing is on, Do Not Disturb is off and the monitor is not in fullscreen. */
  readonly flashAllowed: boolean;
}

export type NotchEvent =
  /** The pointer came onto the neck or the body. */
  | { type: 'enter' }
  /** The pointer left both the neck and the body. */
  | { type: 'leave' }
  | { type: 'timer'; timer: TimerName }
  /** Click on the neck, or the shortcut. */
  | { type: 'toggle' }
  /** Click on the hint or peek area. */
  | { type: 'activate' }
  | { type: 'open' }
  /** Escape, click outside, or close() from the content. */
  | { type: 'close' }
  | { type: 'flash' }
  | { type: 'overview'; visible: boolean }
  /** Chips may have appeared or gone. */
  | { type: 'content-changed' };

export type TimerIntent =
  { timer: TimerName; action: 'start'; ms: number } | { timer: TimerName; action: 'cancel' };

export interface Transition {
  model: NotchModel;
  /** Applied in order. Starting a running timer restarts it. */
  timers: TimerIntent[];
}

export function initialModel(overview = false): NotchModel {
  return { state: 'idle', pointer: false, flashing: false, peekPending: false, overview };
}

const start = (timer: TimerName, ms: number): TimerIntent => ({ timer, action: 'start', ms });
const cancel = (timer: TimerName): TimerIntent => ({ timer, action: 'cancel' });
const cancelAll = (): TimerIntent[] => [cancel('peek'), cancel('leave'), cancel('flash')];

const canPeek = (ctx: NotchContext): boolean => ctx.hoverPreview && ctx.hasPeek;

const stay = (model: NotchModel, timers: TimerIntent[] = []): Transition => ({ model, timers });

function toIdle(model: NotchModel, patch: Partial<NotchModel> = {}): Transition {
  return {
    model: { ...model, flashing: false, peekPending: false, ...patch, state: 'idle' },
    timers: cancelAll(),
  };
}

function toOpen(model: NotchModel): Transition {
  return {
    model: { ...model, flashing: false, peekPending: false, state: 'open' },
    timers: cancelAll(),
  };
}

/**
 * Leaves a peek that is no longer held up (the flash ended, the chips went)
 * for the state the pointer alone gives.
 */
function settle(model: NotchModel, ctx: NotchContext, keepPeek: boolean): Transition {
  if (!model.pointer) return toIdle(model);
  const state = keepPeek && canPeek(ctx) ? 'peek' : 'hint';
  return { model: { ...model, flashing: false, state }, timers: [cancel('flash')] };
}

function onTimer(model: NotchModel, timer: TimerName, ctx: NotchContext): Transition {
  if (timer === 'leave') {
    if (model.pointer || model.flashing) return stay(model);
    return model.state === 'hint' || model.state === 'peek' ? toIdle(model) : stay(model);
  }
  if (timer === 'peek') {
    const fired = { ...model, peekPending: false };
    if (model.state === 'hint' && model.pointer && canPeek(ctx))
      return stay({ ...fired, state: 'peek' });
    return stay(fired);
  }
  return model.flashing ? settle(model, ctx, true) : stay(model);
}

export function reduce(model: NotchModel, event: NotchEvent, ctx: NotchContext): Transition {
  switch (event.type) {
    case 'enter': {
      const entered = { ...model, pointer: true };
      if (model.overview || model.state === 'open' || model.flashing)
        return stay(entered, [cancel('leave')]);
      const state = model.state === 'idle' ? 'hint' : model.state;
      if (state === 'hint' && canPeek(ctx)) {
        return stay({ ...entered, state, peekPending: true }, [
          cancel('leave'),
          start('peek', ctx.peekDelay),
        ]);
      }
      return stay({ ...entered, state }, [cancel('leave')]);
    }

    case 'leave': {
      const left = { ...model, pointer: false, peekPending: false };
      // Open ignores the pointer, and a flash runs for its full time.
      if ((model.state === 'hint' || model.state === 'peek') && !model.flashing)
        return stay(left, [cancel('peek'), start('leave', LEAVE_DELAY_MS)]);
      return stay(left, [cancel('peek')]);
    }

    case 'timer':
      return onTimer(model, event.timer, ctx);

    case 'toggle':
      return model.state === 'open' ? toIdle(model) : toOpen(model);

    case 'activate':
      return model.state === 'hint' || model.state === 'peek' ? toOpen(model) : stay(model);

    case 'open':
      return model.state === 'open' ? stay(model) : toOpen(model);

    case 'close':
      return model.state === 'idle' ? stay(model) : toIdle(model);

    case 'flash':
      if (model.state === 'open' || model.overview || !ctx.flashAllowed || !ctx.hasPeek)
        return stay(model);
      return stay({ ...model, state: 'peek', flashing: true, peekPending: false }, [
        cancel('peek'),
        cancel('leave'),
        start('flash', FLASH_DURATION_MS),
      ]);

    case 'overview':
      if (event.visible) return toIdle(model, { overview: true });
      return stay({ ...model, overview: false });

    case 'content-changed':
      break;
  }

  if (model.state === 'peek' && !ctx.hasPeek) return settle(model, ctx, false);
  // Chips appeared while the pointer rests on the hint.
  if (model.state === 'hint' && model.pointer && !model.peekPending && canPeek(ctx))
    return stay({ ...model, peekPending: true }, [start('peek', ctx.peekDelay)]);
  return stay(model);
}
