// Water lilies, painted as Monet paints them: not drawn leaves but a few flat, horizontal strokes
// of broken green laid side by side, a cool shadow on the water beneath, a pale stroke where the
// sky catches the leaf, and here and there a flower in thick white, pink or red.
import { darken, lighten, mix, type RGB } from '../core/color';
import { dab, flat, ramp, type Ctx } from '../core/dab';
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
  const { x, y, w, h, rot } = pad, tone = 0.2 + pad.tone * 0.55;
  flat(ctx, rng, x + w * 0.05, y + h * 0.36, w * 1.05, Math.max(1.5, h * 0.55), rot, darken(mix(s.water[0], s.accent[0], 0.3), 0.1), 0.4);
  // The leaf, built up in horizontal strokes that narrow toward its near and far edges.
  const rows = h > 14 ? 4 : h > 7 ? 3 : 2;
  for (let r = 0; r < rows; r++) {
    const u = (r / (rows - 1)) * 2 - 1, across = Math.sqrt(Math.max(0.15, 1 - u * u * 0.8));
    const shift = rng.random(), hue = shift < 0.15 ? s.accent[4] : shift < 0.3 ? s.accent[3] : null;
    const green = ramp(s.pad, tone + rng.range(-0.2, 0.18) + (u < 0 ? 0.06 : -0.06));
    const col: RGB = hue ? mix(hue, green, 0.6) : green;
    flat(ctx, rng, x + rng.range(-0.14, 0.14) * w, y + u * h * 0.3, w * across * rng.range(0.7, 1.05), Math.max(1.6, h * rng.range(0.45, 0.62)), rot + rng.range(-0.1, 0.1), col, 0.86, rng.range(-0.08, 0.08));
  }
  // Broken colour: a warmer or cooler stroke laid into the green.
  const odd = rng.chance(0.5) ? mix(s.accent[3], ramp(s.pad, tone), 0.55) : mix(s.accent[4], ramp(s.pad, tone), 0.5);
  flat(ctx, rng, x + rng.range(-0.2, 0.2) * w, y + rng.range(-0.15, 0.15) * h, w * rng.range(0.25, 0.45), Math.max(1, h * 0.25), rot, odd, 0.75);
  // Sky on the leaf.
  const sky = rng.chance(0.6), sx = x + rng.range(-0.25, 0.1) * w;
  if (sky) flat(ctx, rng, sx, y - h * 0.22, w * rng.range(0.25, 0.5), Math.max(1, h * 0.16), rot + rng.range(-0.1, 0.1), lighten(mix(ramp(s.pad, 0.85), s.glint[0], 0.3), 0.03), 0.45);
  // The cleft, a sliver of water showing through.
  const nx = Math.cos(pad.notch), ny = Math.sin(pad.notch);
  dab(ctx, x + nx * w * 0.22, y + ny * h * 0.22, w * 0.28, Math.max(1, h * 0.1), Math.atan2(ny * h, nx * w), mix(s.water[1], s.accent[0], 0.25), 0.7);
}

export function drawFlower(ctx: Ctx, rng: Rng, pad: Pad, s: Series) {
  const f = Math.max(2.4, pad.w * 0.15), col = s.flower[pad.flower];
  const fx = pad.x + rng.range(-0.15, 0.15) * pad.w, fy = pad.y - pad.h * 0.25;
  // Thick paint: a shadowed base, then petals, then a highlight on top.
  dab(ctx, fx, fy + f * 0.25, f * 1.6, f * 0.6, 0, darken(col, 0.35), 0.6);
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + rng.range(-1.35, 1.35);
    dab(ctx, fx + Math.cos(a) * f * 0.4, fy + Math.sin(a) * f * 0.3, f * rng.range(0.9, 1.35), f * 0.55, a, i < 3 ? darken(col, 0.15) : lighten(col, 0.18), 0.95);
  }
  dab(ctx, fx - f * 0.15, fy - f * 0.35, f * 0.6, f * 0.25, -0.2, lighten(col, 0.5), 0.85);
  dab(ctx, fx, fy - f * 0.05, f * 0.4, f * 0.32, 0, [244, 214, 110], 0.9);
}
