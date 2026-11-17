/** The timers and what happens to them over time. Pure logic: every function gets `now` (ms since the epoch). */

export type TimerKind = 'countdown' | 'alarm' | 'stopwatch';

export interface Timer {
  id: string;
  kind: TimerKind;
  label: string;
  /** Countdown: what the user asked for, used by restart. 0 for the other kinds. */
  durationMs: number;
  /** Countdown and alarm: the whole span the progress line stands for. */
  totalMs: number;
  /** Running countdown or alarm: when it ends. */
  endsAt?: number;
  /** Running stopwatch: when it would have started had it never paused. */
  startedAt?: number;
  /** Paused: what is left (countdown, alarm) or what has passed (stopwatch). */
  pausedMs?: number;
  /** Ended at this time; the row says so for a while. */
  doneAt?: number;
}

/** How long a finished timer stays in the list. */
export const DONE_MS = 120_000;

export function createCountdown(id: string, durationMs: number, label: string, now: number): Timer {
  return {
    id,
    kind: 'countdown',
    label,
    durationMs,
    totalMs: durationMs,
    endsAt: now + durationMs,
  };
}

export function createAlarm(id: string, at: number, label: string, now: number): Timer {
  return { id, kind: 'alarm', label, durationMs: 0, totalMs: Math.max(0, at - now), endsAt: at };
}

export function createStopwatch(id: string, label: string, now: number): Timer {
  return { id, kind: 'stopwatch', label, durationMs: 0, totalMs: 0, startedAt: now };
}

export const isDone = (timer: Timer): boolean => timer.doneAt !== undefined;
export const isPaused = (timer: Timer): boolean => !isDone(timer) && timer.pausedMs !== undefined;
/** The time on its row changes every second. */
export const isRunning = (timer: Timer): boolean => !isDone(timer) && !isPaused(timer);

/** What is left of a countdown or alarm, or what has passed on a stopwatch. */
export function timeOf(timer: Timer, now: number): number {
  if (isDone(timer)) return 0;
  if (timer.pausedMs !== undefined) return timer.pausedMs;
  if (timer.kind === 'stopwatch') return Math.max(0, now - (timer.startedAt ?? now));
  return Math.max(0, (timer.endsAt ?? now) - now);
}

/** 0..1 for the progress line of a countdown or alarm, null where there is none. */
export function progressOf(timer: Timer, now: number): number | null {
  if (timer.kind === 'stopwatch' || isDone(timer) || !(timer.totalMs > 0)) return null;
  return Math.min(1, Math.max(0, 1 - timeOf(timer, now) / timer.totalMs));
}

export function pause(timer: Timer, now: number): Timer {
  if (!isRunning(timer)) return timer;
  const paused = { ...timer, pausedMs: timeOf(timer, now) };
  delete paused.endsAt;
  delete paused.startedAt;
  return paused;
}

export function resume(timer: Timer, now: number): Timer {
  if (!isPaused(timer)) return timer;
  const { pausedMs = 0, ...rest } = timer;
  return timer.kind === 'stopwatch'
    ? { ...rest, startedAt: now - pausedMs }
    : { ...rest, endsAt: now + pausedMs };
}

/** Gives a countdown or alarm more time. */
export function addTime(timer: Timer, ms: number): Timer {
  if (timer.kind === 'stopwatch' || isDone(timer)) return timer;
  const totalMs = timer.totalMs + ms;
  if (timer.pausedMs !== undefined) return { ...timer, totalMs, pausedMs: timer.pausedMs + ms };
  return { ...timer, totalMs, endsAt: (timer.endsAt ?? 0) + ms };
}

/** A countdown starts over with its first duration; an alarm rings again at the same time on the next day. */
export function restart(timer: Timer, now: number): Timer {
  if (timer.kind === 'stopwatch') return createStopwatch(timer.id, timer.label, now);
  if (timer.kind === 'countdown')
    return createCountdown(timer.id, timer.durationMs, timer.label, now);
  const at = new Date(timer.doneAt ?? timer.endsAt ?? now);
  do at.setDate(at.getDate() + 1);
  while (at.getTime() <= now);
  return createAlarm(timer.id, at.getTime(), timer.label, now);
}

export interface Step {
  timers: Timer[];
  /** Ended in this step: these ring. */
  finished: Timer[];
  /** False when nothing happened and `timers` is the list that came in. */
  changed: boolean;
}

/** Marks what has ended as done and drops what has been done for long enough. */
export function step(timers: readonly Timer[], now: number): Step {
  const finished: Timer[] = [];
  const next: Timer[] = [];
  let changed = false;
  for (const timer of timers) {
    if (timer.doneAt !== undefined) {
      if (timer.doneAt + DONE_MS <= now) changed = true;
      else next.push(timer);
    } else if (timer.kind !== 'stopwatch' && timer.endsAt !== undefined && timer.endsAt <= now) {
      changed = true;
      // Ended long ago while nobody watched: not worth a word any more.
      if (timer.endsAt + DONE_MS <= now) continue;
      const { endsAt, ...rest } = timer;
      const done = { ...rest, doneAt: endsAt };
      finished.push(done);
      next.push(done);
    } else {
      next.push(timer);
    }
  }
  return { timers: changed ? next : (timers as Timer[]), finished, changed };
}

/** The next moment step() has something to do, null when there is none. */
export function nextDeadline(timers: readonly Timer[]): number | null {
  let nearest: number | null = null;
  for (const timer of timers) {
    const at = timer.doneAt !== undefined ? timer.doneAt + DONE_MS : timer.endsAt;
    if (at !== undefined && (nearest === null || at < nearest)) nearest = at;
  }
  return nearest;
}

/** The timer the peek chip is about: one that just ended, else the countdown that ends next, else a stopwatch. */
export function chipTimer(timers: readonly Timer[]): Timer | null {
  let done: Timer | null = null;
  let ending: Timer | null = null;
  let watch: Timer | null = null;
  for (const timer of timers) {
    if (isDone(timer)) {
      if (!done || timer.doneAt! > done.doneAt!) done = timer;
    } else if (!isRunning(timer)) {
      continue;
    } else if (timer.kind === 'stopwatch') {
      watch ??= timer;
    } else if (!ending || timer.endsAt! < ending.endsAt!) {
      ending = timer;
    }
  }
  return done ?? ending ?? watch;
}

const KINDS: readonly unknown[] = ['countdown', 'alarm', 'stopwatch'];
const time = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;

/** Reads the saved list. Whatever is not a timer is left out; a broken list is an empty one. */
export function parseTimers(json: string): Timer[] {
  let list: unknown;
  try {
    list = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  const timers: Timer[] = [];
  const seen = new Set<string>();
  for (const item of list as Record<string, unknown>[]) {
    if (typeof item !== 'object' || item === null) continue;
    const { id, kind, label } = item;
    if (typeof id !== 'string' || id === '' || seen.has(id) || !KINDS.includes(kind)) continue;
    const timer: Timer = {
      id,
      kind: kind as TimerKind,
      label: typeof label === 'string' ? label : '',
      durationMs: time(item.durationMs) ?? 0,
      totalMs: time(item.totalMs) ?? 0,
    };
    const doneAt = time(item.doneAt);
    const pausedMs = time(item.pausedMs);
    const endsAt = time(item.endsAt);
    const startedAt = time(item.startedAt);
    if (doneAt !== undefined) timer.doneAt = doneAt;
    else if (pausedMs !== undefined) timer.pausedMs = pausedMs;
    else if (timer.kind === 'stopwatch' && startedAt !== undefined) timer.startedAt = startedAt;
    else if (timer.kind !== 'stopwatch' && endsAt !== undefined) timer.endsAt = endsAt;
    else continue;
    seen.add(id);
    timers.push(timer);
  }
  return timers;
}

export const serializeTimers = (timers: readonly Timer[]): string => JSON.stringify(timers);
