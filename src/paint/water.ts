// The pond surface: the bank mirrored upside down and broken by ripples, pale glints of sky, and
// the reflection of the footbridge.
import { darken, mix } from '../core/color';
import { dab, ramp, touch } from '../core/dab';
import { lerp } from '../core/math';
import { H } from '../world/garden';
import { cellRng, cells, L, near, push, type TilePlan } from './plan';

/** What the water shows at (x, y): the bank above, mirrored, darkened and cooled by the pond. */
function reflection(p: TilePlan, x: number, y: number) {
  const g = p.g, wl = g.waterLine(x), d = g.depth(y);
  const above = g.foliageColor(x, 2 * wl - y);
  return mix(darken(above, 0.22), ramp(g.series.water, 0.25 + d * 0.5), 0.3 + d * 0.3);
}

export function planWater(p: TilePlan) {
  const g = p.g, s = g.series;
  if (p.y1 + p.pad < g.waterTop - 20) return;

  const big = 22, c0 = cells(p, big, big * 0.6);
  for (let i = c0.i0; i <= c0.i1; i++) {
    for (let j = c0.j0; j <= c0.j1; j++) {
      const { rng, key } = cellRng(p, L.WATER_BASE, i, j);
      const x = (i + rng.random()) * big, y = (j + rng.random()) * big * 0.6;
      if (y < g.waterLine(x) - 2 || !near(p, x, y, 40)) continue;
      const d = g.depth(y), col = reflection(p, x, y);
      push(p, L.WATER_BASE, key, (ctx) => dab(ctx, x, y, lerp(26, 52, d), lerp(6, 16, d), rng.range(-0.05, 0.05), col, 0.85, rng.range(-0.05, 0.05)));
    }
  }

  const sx = 12, sy = 7, c1 = cells(p, sx, sy);
  for (let i = c1.i0; i <= c1.i1; i++) {
    for (let j = c1.j0; j <= c1.j1; j++) {
      const { rng, key } = cellRng(p, L.WATER, i, j);
      const x = (i + rng.random()) * sx, y = (j + rng.random()) * sy;
      if (y < g.waterLine(x) || !near(p, x, y, 30)) continue;
      const d = g.depth(y);
      // Farther away the ripples crowd together, so fewer separate touches show.
      if (!rng.chance(lerp(0.45, 0.8, d))) continue;
      // Under the willows the reflections fall in vertical streaks, as Monet paints them;
      // elsewhere the surface is laid in flat horizontal strokes.
      const streak = rng.chance(g.willow(x) * 0.7);
      const ang = streak ? Math.PI / 2 + rng.range(-0.1, 0.1) : rng.range(-0.07, 0.07);
      const len = streak ? lerp(12, 30, d) : lerp(8, 30, d), w = lerp(2.5, 7, d);
      const col = reflection(p, x, y);
      push(p, L.WATER, key, (ctx) => touch(ctx, rng, x, y, len, w, ang, col, 0.85));
    }
  }

  const sg = 22, c2 = cells(p, sg, sg * 0.5);
  for (let i = c2.i0; i <= c2.i1; i++) {
    for (let j = c2.j0; j <= c2.j1; j++) {
      const { rng, key } = cellRng(p, L.GLINT, i, j);
      const x = (i + rng.random()) * sg, y = (j + rng.random()) * sg * 0.5;
      if (y < g.waterLine(x) + 4 || !near(p, x, y, 30)) continue;
      const open = g.noise.noise2(x / 210, y / 55 + 11);
      if (open < 0.12 || !rng.chance(0.55)) continue;
      const d = g.depth(y), col = ramp(s.glint, rng.random());
      push(p, L.GLINT, key, (ctx) => dab(ctx, x, y, lerp(10, 40, d) * rng.range(0.6, 1.2), lerp(1.8, 5, d), rng.range(-0.05, 0.05), col, 0.35 + open * 0.5));
    }
  }

  planBridgeReflection(p);
}

/** The arch reflected upside down below the bank, broken into dashes by the ripples. */
function planBridgeReflection(p: TilePlan) {
  const g = p.g, b = g.bridge, s = g.series, sp = 8;
  const a = Math.floor((b.cx - b.span / 2) / sp), z = Math.ceil((b.cx + b.span / 2) / sp);
  for (let i = a; i <= z; i++) {
    const { rng, key } = cellRng(p, L.BRIDGE_REFLECT, i, 0);
    const x = (i + rng.random()) * sp, wl = g.waterLine(x), deck = g.deckY(x);
    const parts = [deck + b.thick / 2, deck - b.railH, deck - b.railH / 2];
    // Every value is drawn here, up front, so a tile that skips one dash still agrees with its
    // neighbour about the others.
    const col = darken(ramp(s.bridge, 0.35), 0.15);
    for (const y0 of parts) {
      const y = 2 * wl - y0 + rng.range(-2, 2), show = rng.chance(0.7);
      const len = rng.range(10, 18), wide = (y0 > deck ? b.thick * 0.5 : 4) * rng.range(0.6, 1), ang = rng.range(-0.06, 0.06);
      if (!show || y >= H || !near(p, x, y, 20)) continue;
      push(p, L.BRIDGE_REFLECT, key, (ctx) => dab(ctx, x, y, len, wide, ang, col, 0.4));
    }
  }
}
