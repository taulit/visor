// Easing curves of the notch as closed-form functions of time. Pure, no gi:// imports.

export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass: number;
}

/** The spring of the prototype: damping ratio 0.75, one overshoot of about 3 %. */
export const NOTCH_SPRING: SpringConfig = { stiffness: 300, damping: 26, mass: 1 };

/**
 * Position of a damped spring released at 0 towards 1, `seconds` after the
 * release and starting at rest. Underdamped springs overshoot 1.
 */
export function springValue(seconds: number, config: SpringConfig = NOTCH_SPRING): number {
  if (!(seconds > 0)) return 0;
  const { stiffness, damping, mass } = config;
  const omega = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));

  if (zeta < 1) {
    const damped = omega * Math.sqrt(1 - zeta * zeta);
    const decay = Math.exp(-zeta * omega * seconds);
    return (
      1 -
      decay * (Math.cos(damped * seconds) + ((zeta * omega) / damped) * Math.sin(damped * seconds))
    );
  }
  if (zeta === 1) return 1 - Math.exp(-omega * seconds) * (1 + omega * seconds);

  const root = omega * Math.sqrt(zeta * zeta - 1);
  const slow = -zeta * omega + root;
  const fast = -zeta * omega - root;
  return 1 - (fast * Math.exp(slow * seconds) - slow * Math.exp(fast * seconds)) / (fast - slow);
}

/** Ease-out quint over the unit interval, used for closing. */
export function easeOutQuint(t: number): number {
  if (!(t > 0)) return 0;
  if (t >= 1) return 1;
  return 1 - (1 - t) ** 5;
}

/** Linear interpolation that is exact at both ends; `progress` may leave [0, 1]. */
export function mix(from: number, to: number, progress: number): number {
  if (progress === 1) return to;
  return from + (to - from) * progress;
}
