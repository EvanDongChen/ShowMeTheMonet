// The Japanese footbridge: a shallow arch with a thick deck, two or three rails and regular posts,
// painted in short touches that follow its curve. Lit from above, shadowed underneath.
import { darken } from '../core/color';
import { dab, dabLine, ramp, type Pt } from '../core/dab';
import { cellRng, L, near, push, type TilePlan } from './plan';

export function planBridge(p: TilePlan) {
  const g = p.g, b = g.bridge, s = g.series, sp = 9;
  const a = Math.floor((b.cx - b.span / 2) / sp) - 1, z = Math.ceil((b.cx + b.span / 2) / sp) + 1;
  const slope = (x: number) => Math.atan2(g.deckY(x + 1) - g.deckY(x - 1), 2);

  for (let i = a; i <= z; i++) {
    const { rng, key } = cellRng(p, L.BRIDGE, i, 0);
    const x = (i + rng.random()) * sp, deck = g.deckY(x), ang = slope(x);
    if (!near(p, x, deck - b.railH / 2, 30, b.railH + b.thick * 3)) continue;

    // Shade cast under the deck onto the bank behind.
    push(p, L.BRIDGE_SHADE, key, (ctx) => {
      for (let k = 0; k < 2; k++) {
        dab(ctx, x + rng.range(-4, 4), deck + b.thick * rng.range(1, 2.6), rng.range(16, 26), b.thick * 0.8, ang, darken(ramp(s.foliage, 0.05), 0.2), 0.3);
      }
    });

    push(p, L.BRIDGE, 1 + key, (ctx) => {
      // The deck: lit along its top edge, dark underneath.
      for (const [f, t] of [[0.85, 0.15], [0.5, 0.5], [0.15, 0.85]] as const) {
        dab(ctx, x, deck + b.thick * t, rng.range(15, 22), b.thick * 0.42, ang + rng.range(-0.06, 0.06), ramp(s.bridge, f * 0.8 + rng.range(-0.08, 0.08)), 0.92);
      }
      // The rails, each with a highlight on top.
      for (let r = 1; r <= b.rails; r++) {
        const ry = deck - (b.railH * r) / b.rails;
        dab(ctx, x, ry, rng.range(15, 22), rng.range(8, 11), ang + rng.range(-0.05, 0.05), ramp(s.bridge, 0.5 + rng.range(-0.12, 0.12)), 0.95);
        if (rng.chance(0.6)) dab(ctx, x, ry - 3, rng.range(8, 16), 3, ang, ramp(s.bridge, 0.95), 0.8);
      }
    });
  }

  // Posts, from the deck up through the rails.
  const m0 = Math.floor((b.span / 2) / b.post);
  for (let m = -m0; m <= m0; m++) {
    const { rng, key } = cellRng(p, L.BRIDGE, m, 1);
    const x = b.cx + m * b.post, deck = g.deckY(x);
    if (!near(p, x, deck - b.railH / 2, 10, b.railH)) continue;
    const pts: Pt[] = [[x, deck + 2], [x + rng.range(-1, 1), deck - b.railH - 5]];
    push(p, L.BRIDGE, key, (ctx) => {
      dabLine(ctx, rng, pts, rng.range(8, 10), ramp(s.bridge, 0.42), 0.95, 11);
      dabLine(ctx, rng, [[x - 3, deck], [x - 3, deck - b.railH]], 2.6, ramp(s.bridge, 0.9), 0.6, 12);
    });
  }
}
