import { describe, expect, it } from 'vitest';
import {
  DONE_MS,
  addTime,
  chipTimer,
  createAlarm,
  createCountdown,
  createStopwatch,
  isDone,
  isPaused,
  isRunning,
  nextDeadline,
  parseTimers,
  pause,
  progressOf,
  restart,
  resume,
  serializeTimers,
  step,
  timeOf,
} from '../src/modules/timers/state.js';

const T0 = Date.UTC(2026, 10, 16, 12, 0, 0);

describe('countdown', () => {
  const timer = createCountdown('a', 60_000, 'Pizza', T0);

  it('counts down to its end', () => {
    expect(timeOf(timer, T0)).toBe(60_000);
    expect(timeOf(timer, T0 + 15_000)).toBe(45_000);
    expect(timeOf(timer, T0 + 90_000)).toBe(0);
    expect(progressOf(timer, T0 + 15_000)).toBeCloseTo(0.25);
    expect(isRunning(timer)).toBe(true);
  });

  it('keeps what is left while paused', () => {
    const paused = pause(timer, T0 + 15_000);
    expect(isPaused(paused)).toBe(true);
    expect(paused.endsAt).toBeUndefined();
    expect(timeOf(paused, T0 + 500_000)).toBe(45_000);
    expect(pause(paused, T0 + 20_000)).toBe(paused);
    const resumed = resume(paused, T0 + 100_000);
    expect(resumed.endsAt).toBe(T0 + 145_000);
    expect(resumed.pausedMs).toBeUndefined();
    expect(resume(resumed, T0)).toBe(resumed);
  });

  it('gets more time, running or paused', () => {
    const more = addTime(timer, 60_000);
    expect(more.endsAt).toBe(T0 + 120_000);
    expect(more.totalMs).toBe(120_000);
    expect(more.durationMs).toBe(60_000);
    expect(addTime(pause(timer, T0), 60_000).pausedMs).toBe(120_000);
  });

  it('restarts with its first duration', () => {
    const again = restart(addTime(timer, 60_000), T0 + 500_000);
    expect(again).toEqual(createCountdown('a', 60_000, 'Pizza', T0 + 500_000));
  });
});

describe('stopwatch', () => {
  const watch = createStopwatch('w', '', T0);

  it('counts up and has no progress', () => {
    expect(timeOf(watch, T0 + 5000)).toBe(5000);
    expect(progressOf(watch, T0 + 5000)).toBeNull();
    expect(addTime(watch, 60_000)).toBe(watch);
  });

  it('goes on where it paused', () => {
    const paused = pause(watch, T0 + 5000);
    expect(timeOf(paused, T0 + 60_000)).toBe(5000);
    expect(timeOf(resume(paused, T0 + 60_000), T0 + 61_000)).toBe(6000);
  });
});

describe('alarm', () => {
  it('rings again at the same time on the next day', () => {
    const at = new Date(2026, 10, 16, 18, 30).getTime();
    const alarm = {
      ...createAlarm('x', at, 'Call', at - 3_600_000),
      endsAt: undefined,
      doneAt: at,
    };
    const again = restart(alarm, at + 30_000);
    expect(new Date(again.endsAt!)).toEqual(new Date(2026, 10, 17, 18, 30));
    expect(again.totalMs).toBe(again.endsAt! - (at + 30_000));
    const late = restart(alarm, at + 3 * 86_400_000);
    expect(late.endsAt! > at + 3 * 86_400_000).toBe(true);
    expect(new Date(late.endsAt!).getHours()).toBe(18);
  });
});

describe('step', () => {
  const timer = createCountdown('a', 60_000, '', T0);
  const watch = createStopwatch('w', '', T0);

  it('leaves the list alone while nothing ends', () => {
    const list = [timer, watch];
    const result = step(list, T0 + 59_999);
    expect(result.changed).toBe(false);
    expect(result.timers).toBe(list);
    expect(result.finished).toEqual([]);
  });

  it('marks an ended timer as done, once', () => {
    const result = step([timer, watch], T0 + 60_500);
    expect(result.finished).toHaveLength(1);
    expect(result.timers[0]).toMatchObject({ id: 'a', doneAt: T0 + 60_000 });
    expect(result.timers[0]!.endsAt).toBeUndefined();
    expect(isDone(result.timers[0]!)).toBe(true);
    expect(step(result.timers, T0 + 61_000).finished).toEqual([]);
  });

  it('drops a done timer after two minutes', () => {
    const { timers } = step([timer], T0 + 60_000);
    expect(step(timers, T0 + 60_000 + DONE_MS - 1).timers).toHaveLength(1);
    expect(step(timers, T0 + 60_000 + DONE_MS).timers).toEqual([]);
  });

  it('drops a timer that ended long ago without a word', () => {
    const result = step([timer, watch], T0 + 60_000 + DONE_MS);
    expect(result.finished).toEqual([]);
    expect(result.timers).toEqual([watch]);
  });

  it('never ends a paused timer', () => {
    const paused = pause(timer, T0 + 1000);
    expect(step([paused], T0 + 999_999).changed).toBe(false);
  });
});

describe('nextDeadline', () => {
  it('is the nearest end or the end of a done row', () => {
    const a = createCountdown('a', 60_000, '', T0);
    const b = createCountdown('b', 30_000, '', T0);
    expect(nextDeadline([a, b, createStopwatch('w', '', T0)])).toBe(T0 + 30_000);
    const { timers } = step([a, b], T0 + 30_000);
    expect(nextDeadline(timers)).toBe(T0 + 60_000);
    expect(nextDeadline(step(timers, T0 + 60_000).timers)).toBe(T0 + 30_000 + DONE_MS);
  });

  it('is null when nothing can end', () => {
    expect(nextDeadline([])).toBeNull();
    expect(nextDeadline([createStopwatch('w', '', T0)])).toBeNull();
    expect(nextDeadline([pause(createCountdown('a', 1000, '', T0), T0)])).toBeNull();
  });
});

describe('chipTimer', () => {
  const soon = createCountdown('soon', 30_000, '', T0);
  const later = createCountdown('later', 60_000, '', T0);
  const watch = createStopwatch('w', '', T0);

  it('prefers a done timer, then the next end, then a stopwatch', () => {
    expect(chipTimer([watch, later, soon])?.id).toBe('soon');
    expect(chipTimer([watch])?.id).toBe('w');
    expect(chipTimer(step([watch, later, soon], T0 + 30_000).timers)?.id).toBe('soon');
  });

  it('has nothing to say about paused timers', () => {
    expect(chipTimer([pause(soon, T0), pause(watch, T0)])).toBeNull();
    expect(chipTimer([])).toBeNull();
  });
});

describe('parseTimers', () => {
  it('reads back what was saved', () => {
    const list = [
      createCountdown('a', 60_000, 'Pizza', T0),
      pause(createStopwatch('w', '', T0), T0 + 5000),
      createAlarm('x', T0 + 3_600_000, '', T0),
      step([createCountdown('d', 1000, '', T0)], T0 + 1000).timers[0]!,
    ];
    expect(parseTimers(serializeTimers(list))).toEqual(list);
  });

  it('survives anything', () => {
    expect(parseTimers('')).toEqual([]);
    expect(parseTimers('{')).toEqual([]);
    expect(parseTimers('{"a":1}')).toEqual([]);
    expect(
      parseTimers(
        JSON.stringify([
          null,
          5,
          { id: 'a', kind: 'bomb', endsAt: 1 },
          { id: '', kind: 'countdown', endsAt: 1 },
          { id: 'b', kind: 'countdown' },
          { id: 'c', kind: 'countdown', endsAt: 'soon' },
          { id: 'd', kind: 'stopwatch', endsAt: 5 },
          { id: 'e', kind: 'countdown', endsAt: 5, label: 7, totalMs: -1 },
          { id: 'e', kind: 'countdown', endsAt: 9 },
        ]),
      ),
    ).toEqual([{ id: 'e', kind: 'countdown', label: '', durationMs: 0, totalMs: 0, endsAt: 5 }]);
  });
});
