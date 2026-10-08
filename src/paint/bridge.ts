// The Japanese footbridge: a shallow arch with a thick deck, two or three rails and regular posts,
// painted loosely in short strokes that follow its curve. Warm light along its top, violet shade
// underneath, and rails that break and blur where light and leaves get in the way.
import { darken, mix } from '../core/color';
import { dabLine, flat, ramp, type Pt } from '../core/dab';
import { cellRng, L, near, push, type TilePlan } from './plan';

export function planBridge(p: TilePlan) {
  const g = p.g, b = g.bridge, s = g.series, sp = 9;
  const a = Math.floor((b.cx - b.span / 2) / sp) - 1, z = Math.ceil((b.cx + b.span / 2) / sp) + 1;
  const slope = (x: number) => Math.atan2(g.deckY(x + 1) - g.deckY(x - 1), 2);
  const shade = darken(mix(ramp(s.bridge, 0.15), s.accent[0], 0.35), 0.05), warm = mix(ramp(s.bridge, 0.92), s.accent[3], 0.35);

  for (let i = a; i <= z; i++) {
    const { rng, key } = cellRng(p, L.BRIDGE, i, 0);
    const x = (i + rng.random()) * sp, deck = g.deckY(x), ang = slope(x);
    if (!near(p, x, deck - b.railH / 2, 34, b.railH + b.thick * 3)) continue;

    // Shade cast under the deck onto the bank behind.
    push(p, L.BRIDGE_SHADE, key, (ctx) => {
      for (let k = 0; k < 2; k++) {
        flat(ctx, rng, x + rng.range(-4, 4), deck + b.thick * rng.range(1, 2.6), rng.range(16, 28), b.thick * 0.8, ang, darken(mix(ramp(s.foliage, 0.05), s.accent[0], 0.3), 0.2), 0.3);
      }
    });

    push(p, L.BRIDGE, 1 + key, (ctx) => {
      // The deck: warm light along the top edge, violet shade beneath.
      for (const t of [0.85, 0.5, 0.15]) {
        const col = t > 0.6 ? mix(shade, ramp(s.bridge, 0.3), rng.random()) : ramp(s.bridge, (1 - t) * 0.8 + rng.range(-0.1, 0.1));
        flat(ctx, rng, x, deck + b.thick * t, rng.range(15, 24), b.thick * rng.range(0.38, 0.5), ang + rng.range(-0.07, 0.07), col, 0.93, rng.range(-0.05, 0.05));
      }
      if (rng.chance(0.5)) flat(ctx, rng, x, deck - 1, rng.range(8, 16), 3, ang, warm, 0.8);
      // The rails, each now and then broken off where light or leaves cross it.
      for (let r = 1; r <= b.rails; r++) {
        if (rng.chance(0.1)) continue;
        const ry = deck - (b.railH * r) / b.rails + rng.range(-1.2, 1.2);
        flat(ctx, rng, x, ry, rng.range(14, 22), rng.range(7, 10), ang + rng.range(-0.06, 0.06), ramp(s.bridge, 0.5 + rng.range(-0.15, 0.12)), 0.92, rng.range(-0.06, 0.06));
        if (rng.chance(0.55)) flat(ctx, rng, x, ry - 3, rng.range(8, 16), 2.6, ang, rng.chance(0.4) ? warm : ramp(s.bridge, 0.95), 0.75);
      }
    });
  }

  // Posts, from the deck up through the rails.
  const m0 = Math.floor((b.span / 2) / b.post);
  for (let m = -m0; m <= m0; m++) {
    const { rng, key } = cellRng(p, L.BRIDGE, m, 1);
    const x = b.cx + m * b.post, deck = g.deckY(x);
    if (!near(p, x, deck - b.railH / 2, 12, b.railH)) continue;
    const top: Pt = [x + rng.range(-1.5, 1.5), deck - b.railH - 5], pts: Pt[] = [[x, deck + 2], top];
    const wide = rng.range(7, 10), col = ramp(s.bridge, rng.range(0.32, 0.5));
    push(p, L.BRIDGE, key, (ctx) => {
      dabLine(ctx, rng, pts, wide, col, 0.94, 12);
      dabLine(ctx, rng, [[x - wide * 0.3, deck], [top[0] - wide * 0.3, top[1] + 6]], 2.4, ramp(s.bridge, 0.9), 0.55, 12);
    });
  }
}
