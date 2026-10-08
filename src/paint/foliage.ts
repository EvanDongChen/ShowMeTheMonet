// The far bank: a wall of foliage above the water, weeping willows hanging across the top, the
// shadowed lip of the bank and the irises and grasses growing along it, the reeds standing at the
// edges, and the veil of air over it all.
import { css, mix, type RGB } from '../core/color';
import { dab, dabLine, flat, ramp, touch, type Pt } from '../core/dab';
import { lerp, smoothstep } from '../core/math';
import type { Rng } from '../core/rng';
import { H } from '../world/garden';
import type { Series } from '../world/series';
import { cellRng, cells, L, near, push, type TilePlan } from './plan';

/** The ground: a soft vertical wash from the foliage down through the water. */
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

  // The underpainting: big, thin, loose strokes blocking in the masses, which show through
  // wherever the later touches leave a gap.
  const sp = 64, c = cells(p, sp);
  for (let i = c.i0; i <= c.i1; i++) {
    for (let j = c.j0; j <= c.j1; j++) {
      const { rng, key } = cellRng(p, L.UNDER, i, j);
      const x = (i + rng.random()) * sp, y = (j + rng.random()) * sp;
      if (!near(p, x, y, 90)) continue;
      const wet = y > g.waterLine(x);
      const col = wet ? mix(g.foliageColor(x, 2 * g.waterLine(x) - y), ramp(s.water, 0.4), 0.5) : g.foliageColor(x, y);
      const ang = wet ? rng.range(-0.1, 0.1) : Math.PI / 2 + rng.range(-0.6, 0.6);
      push(p, L.UNDER, key, (ctx) => flat(ctx, rng, x, y, rng.range(90, 150), rng.range(40, 70), ang, col, 0.45, rng.range(-0.1, 0.1)));
    }
  }
}

/** Leaves lean: mostly hanging, swayed by a slow field so neighbouring dabs agree. */
function lean(p: TilePlan, x: number, y: number) {
  const g = p.g, w = g.willow(x);
  return Math.PI / 2 + g.noise.noise2(x / 110, y / 110 + 40) * lerp(1.1, 0.25, w);
}

/**
 * Now and then swap a touch for a complementary one: violet among the shadows, warm yellow or
 * pink among the lights. Always draws from the stream, so the stroke after it doesn't shift.
 */
export function accent(rng: Rng, s: Series, col: RGB, chance: number, light: number): RGB {
  const roll = rng.random(), pick = rng.int(0, 1);
  if (roll >= chance) return col;
  const a = light < 0.5 ? s.accent[pick] : s.accent[2 + pick];
  return mix(a, col, 0.35);
}

/** A stroke size that is usually middling and now and then much bigger or smaller. */
const size = (rng: Rng, base: number) => base * Math.exp(rng.bell() * 0.42);

export function planFoliage(p: TilePlan) {
  const g = p.g, s = g.series;
  if (p.y0 - p.pad > g.waterTop + 30) return;

  const big = 22, c0 = cells(p, big);
  for (let i = c0.i0; i <= c0.i1; i++) {
    for (let j = c0.j0; j <= c0.j1; j++) {
      const { rng, key } = cellRng(p, L.FOLIAGE_BASE, i, j);
      const x = (i + rng.random()) * big, y = (j + rng.random()) * big;
      if (y > g.waterLine(x) + 2 || !near(p, x, y, 45)) continue;
      const light = g.foliageLight(x, y) - 0.2;
      const col = accent(rng, s, ramp(s.foliage, light + rng.range(-0.12, 0.12)), 0.16, light);
      const w = g.willow(x), len = size(rng, 34) * (1 + w * 0.8), wide = len * rng.range(0.35, 0.6) * (1 - w * 0.4), ang = lean(p, x, y) + rng.range(-0.6, 0.6) * (1 - w * 0.5);
      push(p, L.FOLIAGE_BASE, key, (ctx) => touch(ctx, rng, x, y, len, wide, ang, col, 0.9));
    }
  }

  const sm = 12, c1 = cells(p, sm);
  for (let i = c1.i0; i <= c1.i1; i++) {
    for (let j = c1.j0; j <= c1.j1; j++) {
      const { rng, key } = cellRng(p, L.FOLIAGE, i, j);
      const x = (i + rng.random()) * sm, y = (j + rng.random()) * sm;
      if (y > g.waterLine(x) - 2 || !near(p, x, y, 22)) continue;
      const light = g.foliageLight(x, y);
      // Only some of the cells get a touch, more of them where the sun lands.
      if (!rng.chance(0.3 + light * 0.45)) continue;
      const col = accent(rng, s, ramp(s.foliage, light + rng.range(-0.2, 0.2)), 0.13, light);
      const w = g.willow(x), len = size(rng, 15) * (1 + w * 0.9), wide = len * rng.range(0.3, 0.55) * (1 - w * 0.45), ang = lean(p, x, y) + rng.range(-0.5, 0.5) * (1 - w * 0.5);
      push(p, L.FOLIAGE, key, (ctx) => touch(ctx, rng, x, y, len, wide, ang, col, 0.9));
    }
  }

  // Sun on the leaves: small, thick, pale touches only where the light is strongest.
  const hi = 9, c2 = cells(p, hi);
  for (let i = c2.i0; i <= c2.i1; i++) {
    for (let j = c2.j0; j <= c2.j1; j++) {
      const { rng, key } = cellRng(p, L.FOLIAGE_LIGHT, i, j);
      const x = (i + rng.random()) * hi, y = (j + rng.random()) * hi;
      const light = g.foliageLight(x, y);
      if (y > g.waterLine(x) - 6 || light < 0.62 || !rng.chance((light - 0.6) * 1.6) || !near(p, x, y, 14)) continue;
      const col = accent(rng, s, ramp(s.foliage, light + rng.range(0.05, 0.3)), 0.2, 1);
      const len = size(rng, 9), ang = lean(p, x, y) + rng.range(-0.8, 0.8);
      push(p, L.FOLIAGE_LIGHT, key, (ctx) => touch(ctx, rng, x, y, len, len * rng.range(0.4, 0.7), ang, col, 0.95));
    }
  }

  // Flecks of colour: small dabs of pale yellow, pink and lilac caught in the leaves, thickest in
  // the sunny clumps, as in the bright bushes to the right of Monet's bridge.
  const fl = 7, c3 = cells(p, fl);
  for (let i = c3.i0; i <= c3.i1; i++) {
    for (let j = c3.j0; j <= c3.j1; j++) {
      const { rng, key } = cellRng(p, L.FOLIAGE_FLECK, i, j);
      const x = (i + rng.random()) * fl, y = (j + rng.random()) * fl;
      const light = g.foliageLight(x, y), clump = g.noise.noise2(x / 75, y / 60 + 5);
      if (y > g.waterLine(x) - 8 || !rng.chance(smoothstep(0.35, 0.8, light) * (0.1 + 0.5 * smoothstep(-0.1, 0.5, clump))) || !near(p, x, y, 12)) continue;
      const roll = rng.random();
      const col = roll < 0.45 ? mix(ramp(s.foliage, 1), s.accent[3], rng.range(0.1, 0.5)) : roll < 0.65 ? mix(s.accent[2], ramp(s.foliage, 0.9), 0.4) : roll < 0.8 ? mix(s.accent[1], ramp(s.foliage, 0.9), 0.5) : ramp(s.foliage, rng.range(0.75, 1));
      const len = size(rng, 8), ang = lean(p, x, y) + rng.range(-1, 1);
      push(p, L.FOLIAGE_FLECK, key, (ctx) => touch(ctx, rng, x, y, len, len * rng.range(0.4, 0.7), ang, col, 0.92));
    }
  }

  planWillows(p, L.WILLOW, 1);
  planBank(p);
  planBankPlants(p);
}

/**
 * Weeping willow fronds: long hanging runs of strokes. The thickest willows hang at the sides,
 * but short fronds fringe the whole top of the picture, as they do in Monet's. The front layer
 * is a sparse handful painted over the bridge.
 */
export function planWillows(p: TilePlan, layer: number, density: number) {
  const g = p.g, s = g.series, sp = 8, front = layer === L.WILLOW_FRONT;
  const i0 = Math.floor((p.x0 - p.pad) / sp) - 4, i1 = Math.ceil((p.x1 + p.pad) / sp) + 4;
  for (let i = i0; i <= i1; i++) {
    const { rng, key } = cellRng(p, layer, i, 0);
    const x = (i + rng.random()) * sp, w = g.willow(x);
    const reach = Math.max(w, 0.28);
    if (!rng.chance(front ? Math.max(0, w - 0.45) * 0.5 * density : (0.12 + w * 0.7) * density)) continue;
    const top = rng.range(-60, lerp(20, g.waterTop * 0.4, w));
    const fall = lerp(70, 520, reach) * rng.range(0.55, 1.1);
    const bottom = Math.min(g.waterLine(x) - rng.range(4, 40), top + fall);
    if (bottom <= top + 20) continue;
    const sway = rng.range(-34, 34), wave = rng.range(3, 9), pts: Pt[] = [];
    for (let t = 0; t <= 1.0001; t += 0.1) pts.push([x + sway * t * t + Math.sin(t * 6 + i) * wave, lerp(top, bottom, t)]);
    if (!near(p, x + sway / 2, (top + bottom) / 2, 40, (bottom - top) / 2 + 10)) continue;
    const light = g.foliageLight(x, (top + bottom) / 2) + rng.range(-0.15, 0.4);
    const col = accent(rng, s, ramp(s.foliage, light), 0.08, light), wide = rng.range(5, 11);
    push(p, layer, key, (ctx) => frond(ctx, rng, pts, wide, col, s, front ? 0.92 : 0.85));
  }
}

/**
 * A frond is not a line but a fall of short strokes down a curve, each a little different in tone,
 * with gaps where the leaves part. It thins and pales toward its tip.
 */
function frond(ctx: CanvasRenderingContext2D, rng: Rng, pts: Pt[], wide: number, col: RGB, s: Series, alpha: number) {
  const n = pts.length - 1;
  for (let k = 0; k < n; k++) {
    if (rng.chance(0.22)) continue;
    const a = pts[k], b = pts[k + 1], t = k / n, w = wide * (1 - t * 0.45);
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + rng.range(-0.25, 0.25);
    const c = ramp(s.foliage, 0.35 + rng.range(-0.2, 0.25) + t * 0.15);
    touch(ctx, rng, (a[0] + b[0]) / 2 + rng.range(-3, 3), (a[1] + b[1]) / 2, Math.hypot(b[0] - a[0], b[1] - a[1]) * rng.range(0.7, 1.15), w * rng.range(0.7, 1.1), ang, mix(col, c, 0.4), alpha);
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
    const col: RGB = mix(ramp(s.foliage, rng.range(0, 0.2)), s.accent[0], 0.25);
    push(p, L.BANK, key, (ctx) => flat(ctx, rng, x, y, rng.range(20, 32), rng.range(5, 9), rng.range(-0.08, 0.08), col, 0.85, rng.range(-0.1, 0.1)));
  }
}

/** Irises, flags and grasses growing thick along the far bank, just above their reflections. */
function planBankPlants(p: TilePlan) {
  const g = p.g, s = g.series, sp = 7;
  if (p.y1 + p.pad < g.waterTop - 120 || p.y0 - p.pad > g.waterTop + 30) return;
  const i0 = Math.floor((p.x0 - p.pad) / sp) - 2, i1 = Math.ceil((p.x1 + p.pad) / sp) + 2;
  const blooms: RGB[] = [s.accent[0], s.accent[1], s.flower[2], s.accent[3], s.flower[0]];
  for (let i = i0; i <= i1; i++) {
    const { rng, key } = cellRng(p, L.BANK_PLANTS, i, 0);
    const x = (i + rng.random()) * sp, base = g.waterLine(x) + rng.range(-3, 3);
    // Thicker in clumps, thinner between them.
    if (!rng.chance(0.35 + 0.6 * smoothstep(-0.3, 0.4, g.noise.noise2(x / 70, 9.1)))) continue;
    const clump = smoothstep(0.1, 0.5, g.noise.noise2(x / 90, 3.3));
    const n = rng.int(3, 7), tall = 14 + Math.pow(rng.random(), 1.8) * (50 + clump * 70), flower = rng.chance(0.22) ? rng.pick(blooms) : null;
    if (!near(p, x, base - tall / 2, 40, tall / 2 + 10)) continue;
    const blades: [Pt[], RGB, number][] = [];
    for (let k = 0; k < n; k++) {
      const h = tall * rng.range(0.5, 1), lean = rng.range(-0.4, 0.4), bx = x + rng.range(-5, 5);
      // Blades rise straight, then arch over toward their tips, like a fountain of grass.
      const out = (k - (n - 1) / 2) / n * 1.6 + lean * 0.5;
      blades.push([[[bx, base], [bx + out * h * 0.18, base - h * 0.6], [bx + out * h * 0.6, base - h * 0.92], [bx + out * h * 0.95, base - h * 0.82]],
        accent(rng, s, ramp(s.reed, rng.range(0.15, 1)), 0.16, 0.5), rng.range(2.4, 4.2)]);
    }
    const fx = x + rng.range(-4, 4), fy = base - tall * rng.range(0.6, 0.95);
    push(p, L.BANK_PLANTS, key, (ctx) => {
      for (const [pts, col, w] of blades) dabLine(ctx, rng, pts, w, col, 0.9, 7);
      if (flower) for (let k = 0; k < 4; k++) dab(ctx, fx + rng.range(-4, 4), fy + rng.range(-4, 4), rng.range(5, 9), rng.range(3, 5), rng.range(0, Math.PI), mix(flower, [255, 255, 255], rng.range(0, 0.3)), 0.92);
    });
  }
}

/** Reeds and grasses standing at the side edges, in front of everything. */
export function planReeds(p: TilePlan) {
  const g = p.g, s = g.series, sp = 6;
  if (!g.reedL && !g.reedR) return;
  const i0 = Math.floor((p.x0 - p.pad - 80) / sp), i1 = Math.ceil((p.x1 + p.pad + 80) / sp);
  for (let i = i0; i <= i1; i++) {
    const { rng, key } = cellRng(p, L.REED, i, 0);
    const x = (i + rng.random()) * sp, w = g.reeds(x);
    if (!rng.chance(w * 0.95)) continue;
    const base = rng.range(H * 0.6, H + 30), tall = lerp(80, 380, w) * rng.range(0.4, 1), lean = rng.range(-0.4, 0.4);
    const pts: Pt[] = [];
    for (let t = 0; t <= 1.0001; t += 0.2) pts.push([x + Math.sin(lean) * tall * t * t, base - tall * t]);
    if (!near(p, x, base - tall / 2, Math.abs(Math.sin(lean)) * tall + 10, tall / 2 + 10)) continue;
    const col = accent(rng, s, ramp(s.reed, rng.range(0.1, 0.95)), 0.02, 0.4), iris = s.name !== 'autumn' && rng.chance(0.1);
    const wide = rng.range(3.5, 7.5);
    push(p, L.REED, key, (ctx) => {
      dabLine(ctx, rng, pts, wide, col, 0.92, 9);
      if (iris) {
        const [tx, ty] = pts[pts.length - 1];
        for (let k = 0; k < 5; k++) dab(ctx, tx + rng.range(-6, 6), ty + rng.range(-4, 7), rng.range(8, 12), rng.range(3.5, 5.5), rng.range(0, Math.PI), mix(s.accent[1], [255, 255, 255], rng.range(0, 0.25)), 0.9);
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
