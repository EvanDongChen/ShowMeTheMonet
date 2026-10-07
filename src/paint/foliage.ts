// The far bank: a wall of foliage above the water, weeping willows hanging at the sides, the
// shadowed lip of the bank, the reeds standing at the edges, and the veil of air over it all.
import { css, mix, type RGB } from '../core/color';
import { dab, dabLine, ramp, touch, type Pt } from '../core/dab';
import { lerp } from '../core/math';
import { H } from '../world/garden';
import { cellRng, cells, L, near, push, type TilePlan } from './plan';

/** The underpainting: a soft vertical wash from the foliage down through the water. */
export function planWash(p: TilePlan) {
  const g = p.g, s = g.series;
  push(p, L.WASH, 0, (ctx) => {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, css(s.washTop));
    grad.addColorStop(g.waterTop / H, css(ramp(s.foliage, 0.2)));
    grad.addColorStop(Math.min(1, g.waterTop / H + 0.04), css(ramp(s.water, 0.3)));
    grad.addColorStop(1, css(s.washBottom));
    ctx.fillStyle = grad;
    ctx.fillRect(p.x0 - p.pad, p.y0 - p.pad, p.x1 - p.x0 + p.pad * 2, p.y1 - p.y0 + p.pad * 2);
  });
}

/** Leaves lean: mostly hanging, swayed by a slow field so neighbouring dabs agree. */
function lean(p: TilePlan, x: number, y: number) {
  const g = p.g, w = g.willow(x);
  return Math.PI / 2 + g.noise.noise2(x / 110, y / 110 + 40) * lerp(0.9, 0.25, w);
}

export function planFoliage(p: TilePlan) {
  const g = p.g, s = g.series;
  if (p.y0 - p.pad > g.waterTop + 30) return;

  const big = 26, c0 = cells(p, big);
  for (let i = c0.i0; i <= c0.i1; i++) {
    for (let j = c0.j0; j <= c0.j1; j++) {
      const { rng, key } = cellRng(p, L.FOLIAGE_BASE, i, j);
      const x = (i + rng.random()) * big, y = (j + rng.random()) * big;
      if (y > g.waterLine(x) + 2 || !near(p, x, y, 40)) continue;
      const col = ramp(s.foliage, g.foliageLight(x, y) - 0.2 + rng.range(-0.1, 0.1)), ang = lean(p, x, y) + rng.range(-0.5, 0.5);
      push(p, L.FOLIAGE_BASE, key, (ctx) => touch(ctx, rng, x, y, rng.range(24, 50), rng.range(12, 26), ang, col, 0.85));
    }
  }

  const sm = 13, c1 = cells(p, sm);
  for (let i = c1.i0; i <= c1.i1; i++) {
    for (let j = c1.j0; j <= c1.j1; j++) {
      const { rng, key } = cellRng(p, L.FOLIAGE, i, j);
      const x = (i + rng.random()) * sm, y = (j + rng.random()) * sm;
      if (y > g.waterLine(x) - 2 || !near(p, x, y, 20)) continue;
      const light = g.foliageLight(x, y);
      // Only some of the cells get a touch, more of them where the sun lands.
      if (!rng.chance(0.35 + light * 0.45)) continue;
      const col = ramp(s.foliage, light + rng.range(-0.18, 0.22)), ang = lean(p, x, y) + rng.range(-0.3, 0.3);
      const len = rng.range(9, 26), wide = len * rng.range(0.3, 0.6);
      push(p, L.FOLIAGE, key, (ctx) => touch(ctx, rng, x, y, len, wide, ang, col, 0.88));
    }
  }

  planWillows(p);
  planBank(p);
}

/** Weeping willow fronds: long hanging runs of dabs that end just above the water. */
function planWillows(p: TilePlan) {
  const g = p.g, s = g.series, sp = 15;
  const i0 = Math.floor((p.x0 - p.pad) / sp) - 2, i1 = Math.ceil((p.x1 + p.pad) / sp) + 2;
  for (let i = i0; i <= i1; i++) {
    for (let k = 0; k < 2; k++) {
      const { rng, key } = cellRng(p, L.WILLOW, i, k);
      const x = (i + rng.random()) * sp, w = g.willow(x);
      if (!rng.chance(w * 0.85)) continue;
      const top = rng.range(-60, g.waterTop * 0.45), bottom = Math.min(g.waterLine(x) - rng.range(4, 40), top + lerp(140, 520, w) * rng.range(0.6, 1));
      if (bottom <= top + 20) continue;
      const sway = rng.range(-30, 30), wave = rng.range(3, 8), pts: Pt[] = [];
      for (let t = 0; t <= 1.0001; t += 0.1) pts.push([x + sway * t * t + Math.sin(t * 6 + i) * wave, lerp(top, bottom, t)]);
      if (!near(p, x + sway / 2, (top + bottom) / 2, 30, (bottom - top) / 2 + 10)) continue;
      const col = ramp(s.foliage, g.foliageLight(x, (top + bottom) / 2) + rng.range(-0.15, 0.35)), wide = rng.range(5, 10);
      push(p, L.WILLOW, key, (ctx) => dabLine(ctx, rng, pts, wide, col, 0.75, wide * 1.6));
    }
  }
}

/** The dark lip where the bank meets the water. */
function planBank(p: TilePlan) {
  const g = p.g, s = g.series, sp = 10;
  if (p.y1 + p.pad < g.waterTop - 40 || p.y0 - p.pad > g.waterTop + 40) return;
  const i0 = Math.floor((p.x0 - p.pad) / sp) - 1, i1 = Math.ceil((p.x1 + p.pad) / sp) + 1;
  for (let i = i0; i <= i1; i++) {
    const { rng, key } = cellRng(p, L.BANK, i, 0);
    const x = (i + rng.random()) * sp, y = g.waterLine(x) + rng.range(-12, 5);
    const col: RGB = mix(ramp(s.foliage, rng.range(0, 0.2)), s.water[0], 0.4);
    push(p, L.BANK, key, (ctx) => dab(ctx, x, y, rng.range(20, 30), rng.range(5, 9), rng.range(-0.08, 0.08), col, 0.8, rng.range(-0.1, 0.1)));
  }
}

/** Reeds and grasses standing at the side edges, in front of everything. */
export function planReeds(p: TilePlan) {
  const g = p.g, s = g.series, sp = 9;
  if (!g.reedL && !g.reedR) return;
  const i0 = Math.floor((p.x0 - p.pad - 80) / sp), i1 = Math.ceil((p.x1 + p.pad + 80) / sp);
  for (let i = i0; i <= i1; i++) {
    const { rng, key } = cellRng(p, L.REED, i, 0);
    const x = (i + rng.random()) * sp, w = g.reeds(x);
    if (!rng.chance(w * 0.9)) continue;
    const base = rng.range(H * 0.62, H + 30), tall = lerp(80, 360, w) * rng.range(0.5, 1), lean = rng.range(-0.35, 0.35);
    const pts: Pt[] = [];
    for (let t = 0; t <= 1.0001; t += 0.2) pts.push([x + Math.sin(lean) * tall * t * t, base - tall * t]);
    if (!near(p, x, base - tall / 2, Math.abs(Math.sin(lean)) * tall + 10, tall / 2 + 10)) continue;
    const col = ramp(s.reed, rng.range(0.1, 0.95)), iris = s.name !== 'autumn' && rng.chance(0.06);
    push(p, L.REED, key, (ctx) => {
      dabLine(ctx, rng, pts, rng.range(4, 7), col, 0.9, 9);
      if (iris) {
        const [tx, ty] = pts[pts.length - 1];
        for (let k = 0; k < 4; k++) dab(ctx, tx + rng.range(-5, 5), ty + rng.range(-4, 6), rng.range(7, 11), rng.range(3, 5), rng.range(0, Math.PI), [118, 88, 168], 0.85);
      }
    });
  }
}

/** The air between us and the bank: mist gathers just above the water and thins toward us. */
export function planVeil(p: TilePlan) {
  const g = p.g, s = g.series;
  if (s.mist <= 0) return;
  push(p, L.VEIL, 0, (ctx) => {
    const grad = ctx.createLinearGradient(0, 0, 0, H), wt = g.waterTop / H;
    grad.addColorStop(0, css(s.air, s.mist * 0.45));
    grad.addColorStop(wt, css(s.air, s.mist * 0.85));
    grad.addColorStop(Math.min(1, wt + 0.18), css(s.air, s.mist * 0.35));
    grad.addColorStop(1, css(s.air, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(p.x0 - p.pad, p.y0 - p.pad, p.x1 - p.x0 + p.pad * 2, p.y1 - p.y0 + p.pad * 2);
  });
}
