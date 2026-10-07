// Water lilies: each pad an ellipse of a few flat touches with a shadow on the water and a lit
// upper edge, and here and there a flower of white, pink or red.
import { css, darken, lighten, mix, type RGB } from '../core/color';
import { dab, ramp, type Ctx } from '../core/dab';
import type { Rng } from '../core/rng';
import type { Pad } from '../world/garden';
import type { Series } from '../world/series';
import { L, near, push, type TilePlan } from './plan';

export function planLilies(p: TilePlan) {
  const g = p.g;
  g.pads.forEach((pad, k) => {
    if (!near(p, pad.x, pad.y, pad.w, pad.h + (pad.flower >= 0 ? pad.w * 0.3 : 0))) return;
    const rng = g.rng(L.PAD, k);
    push(p, L.PAD, pad.key, (ctx) => drawPad(ctx, rng, pad, g.series));
    if (pad.flower >= 0) push(p, L.FLOWER, pad.key, (ctx) => drawFlower(ctx, rng, pad, g.series));
  });
}

export function drawPad(ctx: Ctx, rng: Rng, pad: Pad, s: Series) {
  const { x, y, w, h, rot } = pad, body = ramp(s.pad, 0.2 + pad.tone * 0.55);
  dab(ctx, x + w * 0.05, y + h * 0.32, w * 1.05, h * 0.9, rot, darken(s.water[0], 0.2), 0.35);
  ctx.fillStyle = css(darken(body, 0.08), 0.92);
  ctx.beginPath();
  ctx.ellipse(x, y, w / 2, h / 2, rot, 0, Math.PI * 2);
  ctx.fill();
  const n = w > 30 ? 5 : 3;
  for (let i = 0; i < n; i++) {
    const col: RGB = ramp(s.pad, 0.2 + pad.tone * 0.55 + rng.range(-0.12, 0.15));
    dab(ctx, x + rng.range(-0.25, 0.25) * w, y + rng.range(-0.2, 0.2) * h, w * rng.range(0.4, 0.65), h * rng.range(0.4, 0.65), rot + rng.range(-0.2, 0.2), col, 0.85);
  }
  dab(ctx, x - w * 0.1, y - h * 0.22, w * 0.55, Math.max(1.2, h * 0.22), rot, lighten(ramp(s.pad, 0.85), 0.1), 0.7);
  // The notch: a sliver of water showing through the cleft in the leaf.
  const nx = Math.cos(pad.notch), ny = Math.sin(pad.notch);
  dab(ctx, x + nx * w * 0.22, y + ny * h * 0.22, w * 0.32, Math.max(1, h * 0.1), Math.atan2(ny * h, nx * w), mix(s.water[1], body, 0.3), 0.75);
}

export function drawFlower(ctx: Ctx, rng: Rng, pad: Pad, s: Series) {
  const f = Math.max(2.2, pad.w * 0.15), col = s.flower[pad.flower];
  const fx = pad.x + rng.range(-0.15, 0.15) * pad.w, fy = pad.y - pad.h * 0.25;
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + rng.range(-1.3, 1.3);
    dab(ctx, fx + Math.cos(a) * f * 0.4, fy + Math.sin(a) * f * 0.3, f * rng.range(0.9, 1.3), f * 0.55, a, i < 3 ? darken(col, 0.12) : lighten(col, 0.2), 0.95);
  }
  dab(ctx, fx, fy - f * 0.1, f * 0.4, f * 0.35, 0, [244, 214, 110], 0.9);
}
