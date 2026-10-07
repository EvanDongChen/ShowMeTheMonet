// Impressionist brush: short, loaded dabs laid side by side in broken colour.
//
// Monet builds a surface from many small touches rather than long flowing strokes. A dab is a
// tapered comma (a round head that thins into a tail), optionally bent, and is usually laid
// over a softer, wider scumble so neighbouring dabs melt into each other at a distance.
import { css, darken, jitter, lighten, mix, type RGB } from './color';
import type { Rng } from './rng';

export type Ctx = CanvasRenderingContext2D;
export type Pt = [number, number];

/**
 * One comma-shaped touch centred on (x, y), `len` long and `w` wide, pointing along `ang`.
 * `bend` curves it sideways as a fraction of its length.
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
 * A loaded touch: a soft scumble underneath, the dab itself, and a thin sliver of a neighbouring
 * colour dragged along one side, which is what makes the colour read as "broken" up close.
 */
export function touch(ctx: Ctx, rng: Rng, x: number, y: number, len: number, w: number, ang: number, col: RGB, alpha = 0.9) {
  const bend = rng.range(-0.18, 0.18);
  if (w > 3) dab(ctx, x, y, len * 1.15, w * 1.7, ang, col, alpha * 0.22, bend);
  dab(ctx, x, y, len, w, ang, jitter(col, rng, 16), alpha, bend);
  const side = rng.chance(0.5) ? 1 : -1, off = w * rng.range(0.15, 0.35) * side;
  const sliver = rng.chance(0.55) ? lighten(col, rng.range(0.06, 0.2)) : darken(col, rng.range(0.06, 0.18));
  dab(ctx, x - Math.sin(ang) * off, y + Math.cos(ang) * off, len * rng.range(0.5, 0.85), w * rng.range(0.25, 0.45), ang, sliver, alpha * 0.6, bend);
}

/** A run of dabs along a polyline, each following the local direction, like a rail or a frond. */
export function dabLine(ctx: Ctx, rng: Rng, pts: Pt[], w: number, col: RGB, alpha = 0.9, step = w * 1.4) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const n = Math.max(1, Math.round(seg / step));
    for (let k = 0; k < n; k++) {
      const t = (k + rng.random() * 0.5) / n;
      const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
      dab(ctx, x, y, step * rng.range(1.2, 1.7), w * rng.range(0.8, 1.15), ang + rng.range(-0.12, 0.12), jitter(col, rng, 14), alpha, rng.range(-0.1, 0.1));
    }
  }
}

/** Pick along a light ramp: t = 0 the darkest swatch, 1 the lightest, blending neighbours. */
export function ramp(cols: readonly RGB[], t: number): RGB {
  const v = Math.max(0, Math.min(0.9999, t)) * (cols.length - 1), i = Math.floor(v);
  return i >= cols.length - 1 ? cols[cols.length - 1] : mix(cols[i], cols[i + 1], v - i);
}
