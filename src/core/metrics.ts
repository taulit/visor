// Debug metrics: with the GSettings key `debug-metrics` on, Visor writes one
// line per measurement to the journal (`Visor metrics: …`). The key is read
// where a measurement would begin: once in enable(), once per transition and
// once per query. With the key off nothing else of this file runs: no signal
// is connected, no timer started and nothing allocated per frame.
import type Clutter from 'gi://Clutter';
import type Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const KEY = 'debug-metrics';
/** Two frames further apart than one and a half refreshes of a 60 Hz display: one was dropped. */
const DROPPED_FRAME_US = 25000;

export function metricsOn(settings: Gio.Settings): boolean {
  return settings.get_boolean(KEY);
}

/** Monotonic time in microseconds. */
export const now = (): number => GLib.get_monotonic_time();

const ms = (us: number): string => (us / 1000).toFixed(2);

export function reportMetric(line: string): void {
  log(`Visor metrics: ${line}`);
}

export function reportEnable(us: number): void {
  reportMetric(`enable ms=${ms(us)}`);
}

export function reportSearch(localUs: number, totalUs: number): void {
  reportMetric(`search local-ms=${ms(localUs)} total-ms=${ms(totalUs)}`);
}

/**
 * Watches the frames of one transition. `interval` is the time from the
 * begin of one frame to the begin of the next, `update` the time the stage spent in the main loop for one frame
 * (timelines, layout and paint of the whole shell), `visor` the part of it
 * spent in Visor's own frame handler.
 */
export class FrameProbe {
  private frames = 0;
  /** When the frame in work, or the last one, began. */
  private begun = 0;
  private updating = false;
  private intervalSum = 0;
  private intervalMax = 0;
  private dropped = 0;
  private updateSum = 0;
  private updateMax = 0;
  private updates = 0;
  private visorSum = 0;
  private visorMax = 0;
  private ids: number[];

  constructor(
    private stage: Clutter.Stage,
    private label: string,
  ) {
    this.ids = [
      stage.connect('before-update', () => {
        const t = now();
        if (this.begun) {
          const interval = t - this.begun;
          this.frames++;
          this.intervalSum += interval;
          if (interval > this.intervalMax) this.intervalMax = interval;
          if (interval > DROPPED_FRAME_US) this.dropped++;
        }
        this.begun = t;
        this.updating = true;
      }),
      stage.connect('after-update', () => {
        if (!this.updating) return;
        this.updating = false;
        const update = now() - this.begun;
        this.updates++;
        this.updateSum += update;
        if (update > this.updateMax) this.updateMax = update;
      }),
    ];
  }

  /** Visor's frame handler took `us` microseconds. */
  visor(us: number): void {
    this.visorSum += us;
    if (us > this.visorMax) this.visorMax = us;
  }

  /** Ends the watch and writes the line. */
  finish(): void {
    for (const id of this.ids) this.stage.disconnect(id);
    this.ids = [];
    const mean = (sum: number, count: number): string => ms(count ? sum / count : 0);
    reportMetric(
      `transition ${this.label} frames=${this.updates}` +
        ` interval-ms-mean=${mean(this.intervalSum, this.frames)} interval-ms-max=${ms(this.intervalMax)}` +
        ` dropped=${this.dropped}` +
        ` update-ms-mean=${mean(this.updateSum, this.updates)} update-ms-max=${ms(this.updateMax)}` +
        ` visor-ms-mean=${mean(this.visorSum, this.updates)} visor-ms-max=${ms(this.visorMax)}`,
    );
  }
}
