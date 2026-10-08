// The Japanese footbridge: a shallow arch with a thick deck, two or three rails and regular posts,
// painted loosely in short, loaded strokes that follow its curve. Chalky lavender-white rails laid
// thick with a dark line beneath them, a green deck with warm light along its top and rust-violet
// shade underneath, and rails that break and blur where light and leaves get in the way.
import { darken, lighten, mix } from '../core/color';
import { dabLine, flat, ramp, touch, type Pt } from '../core/dab';
import { cellRng, L, near, push, type TilePlan } from './plan';

export function planBridge(p: TilePlan) {
  const g = p.g, b = g.bridge, s = g.series, sp = 9;
  const a = Math.floor((b.cx - b.span / 2) / sp) - 1, z = Math.ceil((b.cx + b.span / 2) / sp) + 1;
  const slope = (x: number) => Math.atan2(g.deckY(x + 1) - g.deckY(x - 1), 2);
  const shade = darken(mix(ramp(s.bridge, 0.15), s.accent[0], 0.35), 0.05), warm = mix(ramp(s.bridge, 0.92), s.accent[3], 0.35);
  const underline = darken(mix(ramp(s.bridge, 0.15), s.accent[0], 0.4), 0.1);

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
      // The deck: a rust-violet shadow line beneath, green body in broken strokes, warm light on top.
      flat(ctx, rng, x, deck + b.thick * 1.08, rng.range(14, 22), 2.6, ang, mix(s.accent[2], darken(shade, 0.3), 0.55), 0.8);
      for (const t of [0.85, 0.5, 0.15]) {
        const col = t > 0.6 ? mix(shade, ramp(s.bridge, 0.3), rng.random()) : ramp(s.bridge, (1 - t) * 0.6 + rng.range(-0.15, 0.1));
        touch(ctx, rng, x + rng.range(-3, 3), deck + b.thick * t, rng.range(15, 24), b.thick * rng.range(0.34, 0.46), ang + rng.range(-0.07, 0.07), rng.chance(0.12) ? mix(s.accent[4], col, 0.5) : col, 0.93);
      }
      if (rng.chance(0.6)) touch(ctx, rng, x, deck - 0.5, rng.range(8, 16), 3.4, ang, warm, 0.85);
      // The rails: chalky lavender-white laid thick, the top one greener, each with a dark line
      // beneath it and now and then broken off where light or leaves cross it.
      for (let r = 1; r <= b.rails; r++) {
        if (rng.chance(0.1)) continue;
        const top = r === b.rails, ry = deck - (b.railH * r) / b.rails + rng.range(-1.2, 1.2);
        const chalk = mix(ramp(s.bridge, rng.range(0.8, 1)), s.accent[rng.chance(0.5) ? 0 : 1], rng.range(0.12, 0.34));
        const body = top ? mix(ramp(s.bridge, rng.range(0.4, 0.6)), chalk, 0.35) : chalk;
        flat(ctx, rng, x + rng.range(-3, 3), ry + 4.5, rng.range(14, 22), 2.4, ang, underline, 0.7, rng.range(-0.06, 0.06));
        touch(ctx, rng, x, ry, rng.range(15, 24), rng.range(9, 13), ang + rng.range(-0.06, 0.06), body, 0.94);
        if (rng.chance(0.7)) touch(ctx, rng, x + rng.range(-5, 5), ry - 3.2, rng.range(8, 16), 3.6, ang, rng.chance(0.35) ? warm : lighten(chalk, 0.12), 0.8);
        if (rng.chance(0.3)) flat(ctx, rng, x + rng.range(-6, 6), ry + 2.4, rng.range(6, 12), 2.4, ang, mix(ramp(s.bridge, 0.5), s.accent[4], 0.4), 0.7);
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
    const wide = rng.range(9, 13), col = mix(ramp(s.bridge, rng.range(0.55, 0.8)), s.accent[0], 0.2);
    push(p, L.BRIDGE, key, (ctx) => {
      // Chalky core, a violet shadow down the far side, a bright edge on the near one.
      dabLine(ctx, rng, [[x + wide * 0.3, deck + 2], [top[0] + wide * 0.3, top[1]]], wide * 0.5, darken(mix(col, s.accent[0], 0.45), 0.05), 0.8, 11);
      dabLine(ctx, rng, pts, wide, col, 0.94, 12);
      dabLine(ctx, rng, [[x - wide * 0.3, deck], [top[0] - wide * 0.3, top[1] + 6]], 2.8, lighten(ramp(s.bridge, 0.95), 0.04), 0.65, 11);
      touch(ctx, rng, top[0], top[1] + 2, wide * 1.4, 4, 0, mix(ramp(s.bridge, 0.6), s.accent[4], 0.3), 0.85);
    });
  }
}
