// The rowboat we sit in, which is also the camera. Rowing eases the boat up to speed and the water
// slowly takes it back; steering turns the bow; left alone, the boat glides on and gently follows
// the channel so it never runs aground. It sits steady: a glide, not a bob.
import { clamp, lerp } from '../core/math';
import type { River } from './river';

/** Eye height above the water, in metres: low, sitting in a boat. */
export const EYE = 0.62;

export interface Controls {
  /** -1 back-paddle .. 1 row forward. */
  row: number;
  /** -1 left .. 1 right. */
  steer: number;
  /** Where the eye wanders, -1 .. 1, from the pointer. */
  look: number;
}

export class Boat {
  z = 0;
  x = 0;
  yaw = 0;
  v = 0;
  turn = 0;
  look = 0;
  /** Time since the last oar stroke, and a counter the ripples watch for new strokes. */
  sinceStroke = 99;
  strokes = 0;
  t = 0;
  drifting = true;

  constructor(private river: River, z = 0) {
    this.z = z;
    this.x = river.center(z);
  }

  /** Cruising speed when no one is rowing, in m/s. */
  static DRIFT = 0.9;

  update(dt: number, c: Controls) {
    const r = this.river;
    this.t += dt;
    this.sinceStroke += dt;

    // Rowing eases toward a steady pace rather than jolting; the oars still dip in a rhythm,
    // which the ripples follow.
    if (c.row !== 0 && this.sinceStroke > 1.3) {
      this.sinceStroke = 0;
      this.strokes++;
    }
    const target = c.row !== 0 ? c.row * (c.row > 0 ? 3 : 1.2) : this.drifting ? Boat.DRIFT : 0;
    this.v += (target - this.v) * (1 - Math.exp(-(c.row !== 0 ? 0.7 : 0.3) * dt));
    this.v = clamp(this.v, -1.6, 4);

    // Steering turns the bow; without it, the channel's own direction slowly takes over.
    this.turn = lerp(this.turn, c.steer * 0.55, 1 - Math.exp(-3 * dt));
    this.yaw += this.turn * dt;
    if (c.steer === 0) {
      const ahead = r.heading(this.z + 6), toward = (r.center(this.z + 8) - this.x) * 0.04;
      this.yaw = lerp(this.yaw, ahead + toward, 1 - Math.exp(-0.5 * dt));
    }
    this.yaw = clamp(this.yaw, -1.3, 1.3);

    this.x += Math.sin(this.yaw) * this.v * dt;
    this.z += Math.cos(this.yaw) * this.v * dt;

    // The banks are soft: lean the boat back toward open water before it touches them.
    const off = this.x - r.center(this.z), room = r.half(this.z) - 1.4;
    if (Math.abs(off) > room) {
      this.x = r.center(this.z) + Math.sign(off) * room;
      this.yaw = lerp(this.yaw, r.heading(this.z), 1 - Math.exp(-2.5 * dt));
    }

    this.look = lerp(this.look, c.look * 0.32, 1 - Math.exp(-3 * dt));
  }

  /** The faintest swell, just enough that the water feels like water. */
  get heave() {
    return Math.sin(this.t * 0.45) * 0.004;
  }

  get viewYaw() {
    return this.yaw + this.look;
  }
}
