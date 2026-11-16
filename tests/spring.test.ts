import { describe, expect, it } from 'vitest';
import { NOTCH_SPRING, easeOutQuint, mix, springValue } from '../src/core/spring.js';

/** Numerical derivative, to check the curve against the equation of motion. */
function derivatives(f: (t: number) => number, t: number, h = 1e-4): [number, number] {
  const velocity = (f(t + h) - f(t - h)) / (2 * h);
  const acceleration = (f(t + h) - 2 * f(t) + f(t - h)) / (h * h);
  return [velocity, acceleration];
}

describe('springValue', () => {
  it('starts at 0 and is at rest there', () => {
    expect(springValue(0)).toBe(0);
    expect(springValue(-1)).toBe(0);
    expect(springValue(Number.NaN)).toBe(0);
    expect(springValue(1e-4)).toBeLessThan(1e-5);
  });

  it('solves m·x″ + c·x′ + k·(x − 1) = 0', () => {
    const { stiffness, damping, mass } = NOTCH_SPRING;
    for (const t of [0.02, 0.1, 0.2, 0.35, 0.5]) {
      const [v, a] = derivatives((s) => springValue(s), t);
      const residual = mass * a + damping * v + stiffness * (springValue(t) - 1);
      expect(Math.abs(residual)).toBeLessThan(1e-3);
    }
  });

  it('overshoots once, by about 3 %, near 275 ms', () => {
    let peak = 0;
    let peakAt = 0;
    for (let ms = 0; ms <= 1000; ms++) {
      const value = springValue(ms / 1000);
      if (value > peak) [peak, peakAt] = [value, ms];
    }
    expect(peak).toBeGreaterThan(1.02);
    expect(peak).toBeLessThan(1.035);
    expect(peakAt).toBeGreaterThan(260);
    expect(peakAt).toBeLessThan(290);
  });

  it('has settled within 1 % after 390 ms and within 0.1 % after 480 ms', () => {
    for (let ms = 390; ms <= 2000; ms += 5)
      expect(Math.abs(springValue(ms / 1000) - 1)).toBeLessThan(0.01);
    for (let ms = 480; ms <= 2000; ms += 5)
      expect(Math.abs(springValue(ms / 1000) - 1)).toBeLessThan(0.001);
  });

  it('is half way after roughly 85 ms', () => {
    expect(springValue(0.08)).toBeLessThan(0.5);
    expect(springValue(0.09)).toBeGreaterThan(0.5);
  });

  it('does not overshoot when critically damped or overdamped', () => {
    const critical = { stiffness: 100, damping: 20, mass: 1 };
    const over = { stiffness: 100, damping: 40, mass: 1 };
    for (const config of [critical, over]) {
      let previous = 0;
      for (let ms = 1; ms <= 3000; ms += 3) {
        const value = springValue(ms / 1000, config);
        expect(value).toBeGreaterThanOrEqual(previous);
        expect(value).toBeLessThanOrEqual(1);
        previous = value;
      }
      expect(previous).toBeGreaterThan(0.999);
    }
  });

  it('is continuous across the three damping regimes', () => {
    const at = (damping: number) => springValue(0.2, { stiffness: 100, damping, mass: 1 });
    expect(at(19.999)).toBeCloseTo(at(20), 4);
    expect(at(20.001)).toBeCloseTo(at(20), 4);
  });
});

describe('easeOutQuint', () => {
  it('runs from 0 to 1 and clamps outside', () => {
    expect(easeOutQuint(0)).toBe(0);
    expect(easeOutQuint(1)).toBe(1);
    expect(easeOutQuint(-0.5)).toBe(0);
    expect(easeOutQuint(2)).toBe(1);
    expect(easeOutQuint(Number.NaN)).toBe(0);
  });

  it('is fast at the start and never goes back', () => {
    expect(easeOutQuint(0.2)).toBeGreaterThan(0.6);
    let previous = 0;
    for (let i = 1; i <= 100; i++) {
      const value = easeOutQuint(i / 100);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});

describe('mix', () => {
  it('interpolates and extrapolates', () => {
    expect(mix(10, 20, 0)).toBe(10);
    expect(mix(10, 20, 0.5)).toBe(15);
    expect(mix(10, 20, 1.1)).toBeCloseTo(21);
    expect(mix(20, 10, 1.1)).toBeCloseTo(9);
  });

  it('is exact at the end', () => {
    expect(mix(0.1, 0.7, 1)).toBe(0.7);
  });
});
