// Impressionist brush: short, loaded strokes of a flat brush laid side by side in broken colour.
//
// Monet builds a surface from many small touches rather than long flowing strokes. Each touch is
// the mark of a flat hog-hair brush: a body with squarish, ragged ends, the streaks of individual
// bristles dragged through it, and a ridge of paint catching the light along one edge. Neighbouring
// touches vary in colour, so the colour reads as broken up close and blends at a distance.
import { css, darken, jitter, lighten, mix, type RGB } from './color';
import type { Rng } from './rng';

export type Ctx = CanvasRenderingContext2D;
export type Pt = [number, number];

/**
 * One comma-shaped touch centred on (x, y), `len` long and `w` wide, pointing along `ang`.
 * `bend` curves it sideways as a fraction of its length. Used for petals and other small, round marks.
 */
export function dab(ctx: Ctx, x: number, y: number, len: number, w: number, ang: number, col: RGB, alpha = 1, bend = 0) {
  const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
  const h = len / 2, ax = x - dx * h, ay = y - dy * h, bx = x + dx * h, by = y + dy * h;
  const cx = x + nx * bend * len, cy = y + ny * bend * len, r = w / 2;
  ctx.fillStyle = css(col, alpha);
  ctx.beginPath();
  ctx.moveTo(ax + nx * r * 0.6, ay + ny * r * 0.6);
  ctx.quadraticCurveTo(cx + nx * r * 1.6, cy + ny * r * 1.6, bx, by);
  ctx.quadraticCurveTo(cx - nx * r * 1.6, cy - ny * r * 1.6, ax - nx * r * 0.6, ay - ny * r * 0.6);
  ctx.arc(ax, ay, r * 0.6, ang + Math.PI / 2, ang - Math.PI / 2);
  ctx.fill();
}

/**
 * The mark of a flat brush: long sides that bow with `bend`, and ends that are cut square but
 * ragged, one corner dragged a little longer than the other.
 */
export function flat(ctx: Ctx, rng: Rng, x: number, y: number, len: number, w: number, ang: number, col: RGB, alpha = 1, bend = 0) {
  const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx, h = len / 2, r = w / 2;
  const p = (along: number, across: number): Pt => [x + dx * along + nx * across, y + dy * along + ny * across];
  // Each corner pulled along the stroke by its own amount: the ragged, dry ends of the stroke.
  const s0 = rng.range(-0.12, 0.08) * len, s1 = rng.range(-0.12, 0.08) * len, e0 = rng.range(-0.1, 0.12) * len, e1 = rng.range(-0.1, 0.12) * len;
  // Long sides that bow with the bend, swell a little in the middle and wander as the brush does.
  const N = 4, side: Pt[] = [], other: Pt[] = [];
  for (let k = 0; k <= N; k++) {
    const t = k / N, along = lerpN(-h - s0, h + e0, t), along2 = lerpN(-h - s1, h + e1, t);
    const bow = bend * len * 4 * t * (1 - t), swell = 1 + 0.18 * Math.sin(t * Math.PI) - (t > 0.75 ? (t - 0.75) * 0.6 : 0);
    side.push(p(along, -r * swell * rng.range(0.85, 1.12) + bow));
    other.push(p(along2, r * swell * rng.range(0.85, 1.12) + bow));
  }
  ctx.fillStyle = css(col, alpha);
  ctx.beginPath();
  ctx.moveTo(side[0][0], side[0][1]);
  for (let k = 1; k <= N; k++) ctx.lineTo(side[k][0], side[k][1]);
  const tip = p(h + Math.max(e0, e1) + r * 0.2, bend * len * 0.2);
  ctx.quadraticCurveTo(tip[0], tip[1], other[N][0], other[N][1]);
  for (let k = N - 1; k >= 0; k--) ctx.lineTo(other[k][0], other[k][1]);
  const tail = p(-h - Math.max(s0, s1) - r * 0.1, 0);
  ctx.quadraticCurveTo(tail[0], tail[1], side[0][0], side[0][1]);
  ctx.fill();
}

const lerpN = (a: number, b: number, t: number) => a + (b - a) * t;

/** Thin streaks of single bristles dragged along a stroke, lighter or darker than its body. */
function bristles(ctx: Ctx, rng: Rng, x: number, y: number, len: number, w: number, ang: number, col: RGB, alpha: number, bend: number, n: number) {
  const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
  ctx.lineCap = 'round';
  for (let k = 0; k < n; k++) {
    const off = rng.range(-0.42, 0.42) * w, t0 = rng.range(-0.5, -0.2) * len, t1 = rng.range(0.15, 0.5) * len;
    const light = rng.chance(0.5);
    ctx.strokeStyle = css(light ? lighten(col, rng.range(0.06, 0.18)) : darken(col, rng.range(0.06, 0.16)), alpha * rng.range(0.3, 0.6));
    ctx.lineWidth = Math.max(0.5, w * rng.range(0.07, 0.16));
    const bow = bend * len * (1 - (off / w) * 0.4);
    ctx.beginPath();
    ctx.moveTo(x + dx * t0 + nx * off, y + dy * t0 + ny * off);
    ctx.quadraticCurveTo(x + nx * (off + bow), y + ny * (off + bow), x + dx * t1 + nx * off, y + dy * t1 + ny * off);
    ctx.stroke();
  }
}

/**
 * A loaded touch: sometimes a thin scumble of the same colour beneath, then the flat stroke in a
 * jittered colour, bristle streaks through it, and a ridge of light along the edge facing the
 * sun (upper left), as thick paint catches it.
 */
export function touch(ctx: Ctx, rng: Rng, x: number, y: number, len: number, w: number, ang: number, col: RGB, alpha = 0.9) {
  const bend = rng.range(-0.15, 0.15);
  if (w > 4 && rng.chance(0.45)) flat(ctx, rng, x, y, len * 1.2, w * 1.6, ang, col, alpha * 0.2, bend);
  const body = jitter(col, rng, 18);
  flat(ctx, rng, x, y, len, w, ang, body, alpha * rng.range(0.8, 1), bend);
  if (w > 2.5) bristles(ctx, rng, x, y, len, w, ang, body, alpha, bend, w > 9 ? 4 : w > 5 ? 3 : 2);
  // Which side of the stroke faces the light?
  const nx = -Math.sin(ang), ny = Math.cos(ang), side = nx * -0.7 + ny * -0.7 > 0 ? 1 : -1;
  if (w > 3 && rng.chance(0.55)) {
    const off = w * 0.36 * side;
    ctx.strokeStyle = css(lighten(body, rng.range(0.15, 0.32)), alpha * 0.45);
    ctx.lineWidth = Math.max(0.6, w * 0.1);
    const h = len * rng.range(0.25, 0.42);
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(ang) * h + nx * off, y - Math.sin(ang) * h + ny * off);
    ctx.lineTo(x + Math.cos(ang) * h + nx * off, y + Math.sin(ang) * h + ny * off);
    ctx.stroke();
  }
}

/** A run of flat strokes along a polyline, each following the local direction, like a rail or a frond. */
export function dabLine(ctx: Ctx, rng: Rng, pts: Pt[], w: number, col: RGB, alpha = 0.9, step = w * 1.4) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const n = Math.max(1, Math.round(seg / step));
    for (let k = 0; k < n; k++) {
      const t = (k + rng.random() * 0.5) / n;
      const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
      flat(ctx, rng, x, y, step * rng.range(1.2, 1.7), w * rng.range(0.75, 1.15), ang + rng.range(-0.12, 0.12), jitter(col, rng, 16), alpha, rng.range(-0.1, 0.1));
    }
  }
}

/** Pick along a light ramp: t = 0 the darkest swatch, 1 the lightest, blending neighbours. */
export function ramp(cols: readonly RGB[], t: number): RGB {
  const v = Math.max(0, Math.min(0.9999, t)) * (cols.length - 1), i = Math.floor(v);
  return i >= cols.length - 1 ? cols[cols.length - 1] : mix(cols[i], cols[i + 1], v - i);
}
