// The hour of the day as a function of how far down the river we are, so a long row passes through
// a morning, a golden afternoon, a violet dusk with fireflies and a pink dawn mist, and back again.
// It depends only on distance, never on a clock or a random number, so the same stretch of river is
// always lit the same way, in either direction.
import { smoothstep } from '../core/math';

/** Metres rowed for a full day. */
export const DAY = 800;

export interface Daylight {
  /** Low golden sun, 0..1. */
  warm: number;
  /** Violet dusk with fireflies, 0..1. */
  dusk: number;
  /** Pink morning mist, 0..1. */
  dawn: number;
}

/** A smooth bump on the circle of the day: 1 at `centre`, 0 at `width` either side. */
const bump = (p: number, centre: number, width: number) => {
  let d = Math.abs(p - centre);
  d = Math.min(d, 1 - d);
  return smoothstep(width, 0, d);
};

export function daylight(z: number): Daylight {
  // The first stretch, where every drift begins, is a bright morning.
  const p = (((0.2 + z / DAY) % 1) + 1) % 1;
  return { warm: bump(p, 0.5, 0.2), dusk: bump(p, 0.78, 0.13), dawn: bump(p, 0.02, 0.09) };
}
