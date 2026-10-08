// The pond surface: the bank mirrored upside down and broken by ripples, pale glints of sky, and
// the reflection of the footbridge.
import { darken, mix } from '../core/color';
import { flat, ramp, touch } from '../core/dab';
import { accent } from './foliage';
import { lerp } from '../core/math';
import { H } from '../world/garden';
import { cellRng, cells, L, near, push, type TilePlan } from './plan';

/** What the water shows at (x, y): the bank above, mirrored, darkened and cooled by the pond. */
function reflection(p: TilePlan, x: number, y: number) {
  const g = p.g, wl = g.waterLine(x), d = g.depth(y);
  const above = g.foliageColor(x, 2 * wl - y);
  // Near the bank the mirror is bright and clear; toward us the pond's own darker colour takes over.
  return mix(darken(above, 0.1 + d * 0.15), ramp(g.series.water, 0.2 + d * 0.45), 0.18 + d * 0.42);
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
      push(p, L.WATER_BASE, key, (ctx) => flat(ctx, rng, x, y, lerp(26, 56, d), lerp(6, 16, d), rng.range(-0.05, 0.05), col, 0.85, rng.range(-0.05, 0.05)));
    }
  }

  const sx = 10, sy = 6, c1 = cells(p, sx, sy);
  for (let i = c1.i0; i <= c1.i1; i++) {
    for (let j = c1.j0; j <= c1.j1; j++) {
      const { rng, key } = cellRng(p, L.WATER, i, j);
      const x = (i + rng.random()) * sx, y = (j + rng.random()) * sy;
      if (y < g.waterLine(x) || !near(p, x, y, 30)) continue;
      const d = g.depth(y);
      // Farther away the ripples crowd together, so fewer separate touches show.
      if (!rng.chance(lerp(0.7, 0.92, d))) continue;
      // Under the willows the reflections fall in vertical streaks, as Monet paints them;
      // elsewhere the surface is laid in flat horizontal strokes.
      const streak = rng.chance(Math.max(g.willow(x) * 0.7, 0.5 * (1 - d * 1.6)));
      const ang = streak ? Math.PI / 2 + rng.range(-0.15, 0.15) : rng.range(-0.08, 0.08);
      const len = (streak ? lerp(12, 30, d) : lerp(9, 34, d)) * Math.exp(rng.bell() * 0.3), w = lerp(3, 9, d) * rng.range(0.7, 1.2);
      const col = accent(rng, s, reflection(p, x, y), 0.08, 0.2);
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
      if (open < 0.2 || !rng.chance(0.4)) continue;
      const d = g.depth(y), col = accent(rng, s, mix(ramp(s.glint, rng.random()), reflection(p, x, y), 0.3), 0.2, 1);
      const len = lerp(8, 46, d) * Math.exp(rng.bell() * 0.45), ang = rng.range(-0.1, 0.1);
      push(p, L.GLINT, key, (ctx) => touch(ctx, rng, x, y, len, lerp(1.8, 6, d) * rng.range(0.7, 1.3), ang, col, 0.25 + open * 0.45));
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
    // Every value is drawn here, up front, and each dash paints from its own stream, so a tile
    // that skips one dash still agrees with its neighbour about the others.
    const col = darken(mix(ramp(s.bridge, 0.35), s.accent[0], 0.2), 0.15);
    for (const [k, y0] of parts.entries()) {
      const y = 2 * wl - y0 + rng.range(-2, 2), show = rng.chance(0.7);
      const len = rng.range(10, 18), wide = (y0 > deck ? b.thick * 0.5 : 4) * rng.range(0.6, 1), ang = rng.range(-0.06, 0.06);
      if (!show || y >= H || !near(p, x, y, 20)) continue;
      const own = g.rng(L.BRIDGE_REFLECT, i, k + 1);
      push(p, L.BRIDGE_REFLECT, key, (ctx) => flat(ctx, own, x, y, len, wide, ang, col, 0.45));
    }
  }
}
