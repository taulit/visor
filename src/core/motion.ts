// Drives one animation at a time from a Clutter.Timeline. The curve is
// computed in the `new-frame` handler because Clutter.Timeline.set_progress_func
// is unusable from GJS (docs/verified.md, section 2).
import Clutter from 'gi://Clutter';
import St from 'gi://St';

import { easeOutQuint, springValue } from './spring.js';

export interface MotionRun {
  /** Nominal length in milliseconds, before the slow-down factor. */
  duration: number;
  /** `spring` may pass 1 on the way, `quint` eases out without overshoot. */
  curve: 'spring' | 'quint';
  /** Called with the progress of each frame, and with exactly 1 at the end. */
  frame: (progress: number) => void;
  /** Called once after the last frame. Not called when the run is replaced or stopped. */
  done: () => void;
}

export class Motion {
  private timeline: Clutter.Timeline | null = null;

  /** `clockActor` lends its frame clock; the timeline only advances while it is mapped. */
  constructor(private clockActor: Clutter.Actor) {}

  get running(): boolean {
    return this.timeline !== null;
  }

  /**
   * Starts a run and drops the one in flight. With animations off, or while
   * the clock actor is not on screen, it jumps to the end at once.
   */
  start(run: MotionRun, animate = true): void {
    this.stop();

    const settings = St.Settings.get();
    if (!animate || !settings.enable_animations || !this.clockActor.mapped) {
      run.frame(1);
      run.done();
      return;
    }

    const slowDown = settings.slow_down_factor > 0 ? settings.slow_down_factor : 1;
    const timeline = new Clutter.Timeline({
      actor: this.clockActor,
      duration: Math.max(1, Math.round(run.duration * slowDown)),
    });
    timeline.connect('new-frame', (_timeline, elapsed) => {
      const ms = elapsed / slowDown;
      run.frame(run.curve === 'spring' ? springValue(ms / 1000) : easeOutQuint(ms / run.duration));
    });
    timeline.connect('stopped', () => {
      // stop() forgets the timeline first, so this is the regular end.
      if (this.timeline !== timeline) return;
      this.timeline = null;
      run.frame(1);
      run.done();
    });
    this.timeline = timeline;
    timeline.start();
  }

  /** Stops where it is, without the last frame and without `done`. */
  stop(): void {
    const timeline = this.timeline;
    if (!timeline) return;
    this.timeline = null;
    timeline.stop();
  }

  destroy(): void {
    this.stop();
  }
}
