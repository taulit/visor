import { describe, expect, it } from 'vitest';
import {
  FLASH_DURATION_MS,
  LEAVE_DELAY_MS,
  initialModel,
  reduce,
  type NotchContext,
  type NotchEvent,
  type NotchModel,
  type TimerName,
} from '../src/core/state.js';
import type { NotchState } from '../src/core/types.js';

const defaults: NotchContext = {
  hoverPreview: true,
  peekDelay: 380,
  hasPeek: true,
  flashAllowed: true,
};

/** Runs the machine against a fake clock, the way core/notch.ts runs it against GLib timeouts. */
class Harness {
  model: NotchModel;
  ctx: NotchContext;
  now = 0;
  history: NotchState[] = [];
  private due = new Map<TimerName, number>();

  constructor(ctx: Partial<NotchContext> = {}, overview = false) {
    this.ctx = { ...defaults, ...ctx };
    this.model = initialModel(overview);
  }

  get state(): NotchState {
    return this.model.state;
  }

  get running(): TimerName[] {
    return [...this.due.keys()].sort();
  }

  send(event: NotchEvent | NotchEvent['type']): this {
    const previous = this.model.state;
    const result = reduce(
      this.model,
      typeof event === 'string' ? ({ type: event } as NotchEvent) : event,
      this.ctx,
    );
    this.model = result.model;
    for (const intent of result.timers) {
      if (intent.action === 'start') this.due.set(intent.timer, this.now + intent.ms);
      else this.due.delete(intent.timer);
    }
    if (this.model.state !== previous) this.history.push(this.model.state);
    return this;
  }

  /** Lets time pass and fires the timers that come due, earliest first. */
  wait(ms: number): this {
    const end = this.now + ms;
    for (;;) {
      const next = [...this.due.entries()]
        .filter(([, at]) => at <= end)
        .sort((a, b) => a[1] - b[1])[0];
      if (!next) break;
      this.now = next[1];
      this.due.delete(next[0]);
      this.send({ type: 'timer', timer: next[0] });
    }
    this.now = end;
    return this;
  }
}

describe('start', () => {
  it('is idle without timers', () => {
    const h = new Harness();
    expect(h.state).toBe('idle');
    expect(h.running).toEqual([]);
  });
});

describe('hover', () => {
  it('goes from idle to hint when the pointer comes over the neck', () => {
    expect(new Harness().send('enter').state).toBe('hint');
  });

  it('goes from hint to peek after the peek delay', () => {
    const h = new Harness().send('enter');
    expect(h.wait(379).state).toBe('hint');
    expect(h.wait(1).state).toBe('peek');
    expect(h.running).toEqual([]);
  });

  it('uses the configured peek delay', () => {
    const h = new Harness({ peekDelay: 1000 }).send('enter');
    expect(h.wait(999).state).toBe('hint');
    expect(h.wait(1).state).toBe('peek');
  });

  it('stays in hint when hover preview is off', () => {
    const h = new Harness({ hoverPreview: false }).send('enter');
    expect(h.running).toEqual([]);
    expect(h.wait(5000).state).toBe('hint');
  });

  it('stays in hint without chips', () => {
    const h = new Harness({ hasPeek: false }).send('enter');
    expect(h.running).toEqual([]);
    expect(h.wait(5000).state).toBe('hint');
  });

  it('does not peek when the chips went away during the delay', () => {
    const h = new Harness().send('enter').wait(200);
    h.ctx = { ...h.ctx, hasPeek: false };
    expect(h.wait(1000).state).toBe('hint');
  });

  it('returns from hint to idle 250 ms after the pointer left', () => {
    const h = new Harness().send('enter').wait(100).send('leave');
    expect(h.wait(LEAVE_DELAY_MS - 1).state).toBe('hint');
    expect(h.wait(1).state).toBe('idle');
    expect(h.running).toEqual([]);
  });

  it('returns from peek to idle 250 ms after the pointer left', () => {
    const h = new Harness().send('enter').wait(380).send('leave');
    expect(h.wait(249).state).toBe('peek');
    expect(h.wait(1).state).toBe('idle');
    expect(h.running).toEqual([]);
  });

  it('cancels the leave timer when the pointer comes back', () => {
    const h = new Harness().send('enter').wait(380).send('leave').wait(200).send('enter');
    expect(h.running).toEqual([]);
    expect(h.wait(5000).state).toBe('peek');
  });

  it('does not peek while the pointer is away', () => {
    const h = new Harness().send('enter').wait(300).send('leave');
    expect(h.running).toEqual(['leave']);
    expect(h.wait(100).state).toBe('hint');
  });

  it('starts the peek delay again when the pointer comes back to the hint', () => {
    const h = new Harness().send('enter').wait(300).send('leave').wait(200).send('enter');
    expect(h.wait(379).state).toBe('hint');
    expect(h.wait(1).state).toBe('peek');
  });

  it('ignores a stale leave timer', () => {
    const h = new Harness().send('enter').send('leave').send('enter');
    expect(h.send({ type: 'timer', timer: 'leave' }).state).toBe('hint');
  });

  it('ignores a stale peek timer', () => {
    const h = new Harness();
    expect(h.send({ type: 'timer', timer: 'peek' }).state).toBe('idle');
    h.send('open');
    expect(h.send({ type: 'timer', timer: 'peek' }).state).toBe('open');
  });
});

describe('click and shortcut', () => {
  it('opens from idle with the shortcut and closes with it again', () => {
    const h = new Harness().send('toggle');
    expect(h.state).toBe('open');
    expect(h.send('toggle').state).toBe('idle');
  });

  it('opens from hint with a click on the neck, without leftover timers', () => {
    const h = new Harness().send('enter').send('toggle');
    expect(h.state).toBe('open');
    expect(h.running).toEqual([]);
    expect(h.wait(5000).state).toBe('open');
  });

  it('opens from peek with a click on the neck and closes with the next', () => {
    const h = new Harness().send('enter').wait(380).send('toggle');
    expect(h.state).toBe('open');
    expect(h.send('toggle').state).toBe('idle');
  });

  it('opens with a click on the hint or peek area', () => {
    expect(new Harness().send('enter').send('activate').state).toBe('open');
    expect(new Harness().send('enter').wait(380).send('activate').state).toBe('open');
  });

  it('ignores a click on the body in idle and open', () => {
    expect(new Harness().send('activate').state).toBe('idle');
    expect(new Harness().send('open').send('activate').state).toBe('open');
  });

  it('opens with open() from every state and stays open when repeated', () => {
    expect(new Harness().send('open').state).toBe('open');
    expect(new Harness().send('enter').send('open').state).toBe('open');
    expect(new Harness().send('enter').wait(380).send('open').state).toBe('open');
    const h = new Harness().send('open').send('open');
    expect(h.history).toEqual(['open']);
  });
});

describe('open', () => {
  it('does not close when the pointer leaves', () => {
    const h = new Harness().send('enter').send('toggle').send('leave');
    expect(h.running).toEqual([]);
    expect(h.wait(10_000).state).toBe('open');
    expect(h.send('enter').send('leave').wait(10_000).state).toBe('open');
  });

  it('closes with Escape or a click outside', () => {
    expect(new Harness().send('open').send('close').state).toBe('idle');
  });

  it('stays idle after closing although the pointer still rests on the neck', () => {
    const h = new Harness().send('enter').send('toggle').send('toggle');
    expect(h.state).toBe('idle');
    expect(h.running).toEqual([]);
    expect(h.wait(5000).state).toBe('idle');
  });

  it('hints again once the pointer left and came back', () => {
    const h = new Harness().send('enter').send('toggle').send('toggle');
    expect(h.send('leave').send('enter').state).toBe('hint');
  });
});

describe('close', () => {
  it('goes to idle from hint and peek and stops the timers', () => {
    const hint = new Harness().send('enter').send('close');
    expect(hint.state).toBe('idle');
    expect(hint.running).toEqual([]);
    const peek = new Harness().send('enter').wait(380).send('leave').send('close');
    expect(peek.state).toBe('idle');
    expect(peek.running).toEqual([]);
  });

  it('does nothing in idle', () => {
    const h = new Harness().send('close');
    expect(h.history).toEqual([]);
  });
});

describe('flash', () => {
  it('shows the peek for three seconds and returns to idle', () => {
    const h = new Harness().send('flash');
    expect(h.state).toBe('peek');
    expect(h.wait(FLASH_DURATION_MS - 1).state).toBe('peek');
    expect(h.wait(1).state).toBe('idle');
    expect(h.running).toEqual([]);
  });

  it('is ignored while open', () => {
    const h = new Harness().send('open').send('flash');
    expect(h.state).toBe('open');
    expect(h.running).toEqual([]);
    expect(h.model.flashing).toBe(false);
  });

  it('is ignored when not allowed (fullscreen, Do Not Disturb, setting)', () => {
    const h = new Harness({ flashAllowed: false }).send('flash');
    expect(h.state).toBe('idle');
    expect(h.running).toEqual([]);
  });

  it('is ignored without chips', () => {
    expect(new Harness({ hasPeek: false }).send('flash').state).toBe('idle');
  });

  it('is ignored in the overview', () => {
    expect(new Harness({}, true).send('flash').state).toBe('idle');
  });

  it('works with hover preview off', () => {
    expect(new Harness({ hoverPreview: false }).send('flash').state).toBe('peek');
  });

  it('starts over when flashed again', () => {
    const h = new Harness().send('flash').wait(2000).send('flash');
    expect(h.wait(2999).state).toBe('peek');
    expect(h.wait(1).state).toBe('idle');
  });

  it('is not cut short by the pointer leaving', () => {
    const h = new Harness().send('flash').wait(500).send('enter').wait(500).send('leave');
    expect(h.running).toEqual(['flash']);
    expect(h.wait(1999).state).toBe('peek');
    expect(h.wait(1).state).toBe('idle');
  });

  it('keeps the peek when the pointer rests on it at the end', () => {
    const h = new Harness().send('flash').wait(1000).send('enter').wait(2000);
    expect(h.state).toBe('peek');
    expect(h.model.flashing).toBe(false);
    expect(h.send('leave').wait(250).state).toBe('idle');
  });

  it('falls back to hint at the end when the pointer rests on it and hover preview is off', () => {
    const h = new Harness({ hoverPreview: false }).send('enter').send('flash').wait(3000);
    expect(h.state).toBe('hint');
    expect(h.send('leave').wait(250).state).toBe('idle');
  });

  it('takes over a hint and its timers', () => {
    const h = new Harness().send('enter').wait(100).send('flash');
    expect(h.state).toBe('peek');
    expect(h.running).toEqual(['flash']);
  });

  it('ends when the notch is opened and does not close it later', () => {
    const h = new Harness().send('flash').wait(1000).send('toggle');
    expect(h.state).toBe('open');
    expect(h.running).toEqual([]);
    expect(h.send({ type: 'timer', timer: 'flash' }).state).toBe('open');
  });
});

describe('overview', () => {
  it('forces idle from every state and stops the timers', () => {
    for (const prepare of [
      (h: Harness) => h.send('enter'),
      (h: Harness) => h.send('enter').wait(380),
      (h: Harness) => h.send('open'),
      (h: Harness) => h.send('flash'),
    ]) {
      const h = prepare(new Harness()).send({ type: 'overview', visible: true });
      expect(h.state).toBe('idle');
      expect(h.running).toEqual([]);
      expect(h.model.flashing).toBe(false);
    }
  });

  it('stays idle while the pointer moves over the neck', () => {
    const h = new Harness({}, true).send('enter');
    expect(h.state).toBe('idle');
    expect(h.running).toEqual([]);
    expect(h.send('leave').send('enter').wait(5000).state).toBe('idle');
  });

  it('hints again after the overview is gone', () => {
    const h = new Harness({}, true).send({ type: 'overview', visible: false });
    expect(h.send('enter').state).toBe('hint');
  });

  it('still opens on request (the notch hides the overview first)', () => {
    expect(new Harness({}, true).send('toggle').state).toBe('open');
    expect(new Harness({}, true).send('open').state).toBe('open');
  });
});

describe('content changes', () => {
  it('leaves peek for hint when the chips are gone and the pointer rests on it', () => {
    const h = new Harness().send('enter').wait(380);
    h.ctx = { ...h.ctx, hasPeek: false };
    expect(h.send('content-changed').state).toBe('hint');
    expect(h.send('leave').wait(250).state).toBe('idle');
  });

  it('leaves peek for idle when the chips are gone and the pointer is away', () => {
    const h = new Harness().send('flash');
    h.ctx = { ...h.ctx, hasPeek: false };
    expect(h.send('content-changed').state).toBe('idle');
    expect(h.running).toEqual([]);
  });

  it('ends a flash over the pointer when the chips are gone', () => {
    const h = new Harness().send('enter').send('flash');
    h.ctx = { ...h.ctx, hasPeek: false };
    expect(h.send('content-changed').state).toBe('hint');
    expect(h.model.flashing).toBe(false);
    expect(h.running).toEqual([]);
  });

  it('peeks after the delay when chips appear under the resting pointer', () => {
    const h = new Harness({ hasPeek: false }).send('enter').wait(1000);
    h.ctx = { ...h.ctx, hasPeek: true };
    h.send('content-changed');
    expect(h.wait(379).state).toBe('hint');
    expect(h.wait(1).state).toBe('peek');
  });

  it('does not push the peek back when the content changes during the delay', () => {
    const h = new Harness().send('enter').wait(300).send('content-changed');
    expect(h.wait(80).state).toBe('peek');
  });

  it('changes nothing in idle, open, or a peek that still has chips', () => {
    expect(new Harness().send('content-changed').history).toEqual([]);
    expect(new Harness().send('open').send('content-changed').state).toBe('open');
    expect(new Harness().send('enter').wait(380).send('content-changed').state).toBe('peek');
  });
});

describe('quiet when idle', () => {
  it('leaves no timer running after any path back to idle', () => {
    const paths: ((h: Harness) => Harness)[] = [
      h => h.send('enter').send('leave').wait(250),
      h => h.send('enter').wait(380).send('leave').wait(250),
      h => h.send('enter').wait(380).send('activate').send('close'),
      h => h.send('flash').wait(3000),
      h => h.send('enter').send('flash').send('leave').wait(3000),
      h => h.send('enter').send({ type: 'overview', visible: true }),
    ];
    for (const path of paths) {
      const h = path(new Harness());
      expect(h.state).toBe('idle');
      expect(h.running).toEqual([]);
    }
  });
});
