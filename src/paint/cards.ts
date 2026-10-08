// Cutout cards for the drift: each a flat, transparent piece of painted scenery (a willow, a clump
// of reeds, a footbridge, a lily pad) that the drift stands up at some depth in the garden like a
// stage flat. Cards are painted with the same dabs as the easel and in the seed's light.
//
// Card coordinates are metres, with the origin at the top left and the card's foot on the water
// at y = h. A card is painted from hash(seed, kind, variant), so a variant always looks the same.
import { mix, type RGB } from '../core/color';
import { dab, dabLine, flat, ramp, touch, type Ctx, type Pt } from '../core/dab';
import { lerp } from '../core/math';
import type { Rng } from '../core/rng';
import type { Garden } from '../world/garden';
import type { Series } from '../world/series';
import { drawPad } from './lilies';
import { context2d, makeCanvas, type AnyCanvas } from './tiles';

export type CardKind = 'reeds' | 'iris' | 'grass' | 'flowers' | 'shrub' | 'willow' | 'poplar' | 'backdrop' | 'bridge' | 'pad' | 'bloom';

export interface CardSpec { w: number; h: number; variants: number; ppm: number; }

/** Size in metres, how many variants a seed paints, and the pixel density they're painted at. */
export const CARDS: Record<CardKind, CardSpec> = {
  reeds: { w: 1.8, h: 2.2, variants: 5, ppm: 56 },
  grass: { w: 2.2, h: 1, variants: 4, ppm: 56 },
  flowers: { w: 3.2, h: 1.5, variants: 6, ppm: 48 },
  iris: { w: 1.8, h: 1.3, variants: 4, ppm: 56 },
  shrub: { w: 3.6, h: 2.6, variants: 5, ppm: 44 },
  willow: { w: 8, h: 9, variants: 5, ppm: 36 },
  poplar: { w: 3.6, h: 12, variants: 3, ppm: 30 },
  backdrop: { w: 20, h: 9, variants: 4, ppm: 20 },
  bridge: { w: 16, h: 4.4, variants: 2, ppm: 60 },
  pad: { w: 1, h: 0.4, variants: 8, ppm: 96 },
  bloom: { w: 0.4, h: 0.3, variants: 4, ppm: 160 },
};

export const CARD_KINDS = Object.keys(CARDS) as CardKind[];

export const cardId = (kind: CardKind, variant: number) => `card:${kind}:${variant}`;

/** Bridge geometry in card metres: deck height across the span, for painting and for passing under. */
export const BRIDGE = {
  apex: 0.36, end: 0.84, thick: 0.075, railH: 0.24,
  deckY(x: number, w: number, h: number) {
    const u = (x - w / 2) / (w / 2);
    return lerp(BRIDGE.apex, BRIDGE.end, u * u) * h;
  },
};

export function paintCard(g: Garden, kind: CardKind, variant: number, ppm = CARDS[kind].ppm): AnyCanvas {
  const spec = CARDS[kind], cw = Math.ceil(spec.w * ppm), ch = Math.ceil(spec.h * ppm);
  const canvas = makeCanvas(cw, ch), ctx = context2d(canvas);
  ctx.setTransform(ppm, 0, 0, ppm, 0, 0);
  const rng = g.rng(0xca4d, CARD_KINDS.indexOf(kind), variant);
  const c: CardCtx = { ctx, rng, g, s: g.series, w: spec.w, h: spec.h, v: variant };
  PAINTERS[kind](c);
  return canvas;
}

interface CardCtx { ctx: Ctx; rng: Rng; g: Garden; s: Series; w: number; h: number; v: number; }

/**
 * Fill a silhouette with foliage dabs. `inside` is how far inside the shape a point is (> 0 is in),
 * `light` how lit it is. Points near the edge are kept by chance, which leaves a ragged outline.
 */
function mass(c: CardCtx, sp: number, size: number, inside: (x: number, y: number) => number,
  light: (x: number, y: number) => number, lean: (x: number, y: number) => number, ramp0: readonly RGB[] = c.s.foliage) {
  const { ctx, rng, w, h } = c;
  for (let pass = 0; pass < 2; pass++) {
    const step = pass ? sp * 0.6 : sp, sz = pass ? size * 0.6 : size;
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const px = x + rng.random() * step, py = y + rng.random() * step, d = inside(px, py);
        if (d < -0.05 || (d < 0.12 && !rng.chance(0.5 + d * 4))) continue;
        // Stay a brush-width inside the card, or the sprite's edge would slice dabs into a straight line.
        if (Math.min(px, w - px, py) < sz * 0.75) continue;
        if (pass && !rng.chance(0.55)) continue;
        const l = light(px, py) + rng.range(-0.12, 0.12) + (pass ? 0.12 : -0.05);
        touch(ctx, rng, px, py, sz * rng.range(0.7, 1.3), sz * rng.range(0.35, 0.55), lean(px, py) + rng.range(-0.4, 0.4), ramp(ramp0, l), 0.9);
      }
    }
  }
}

/** A noise-wobbled ellipse: > 0 inside, < 0 outside. */
function blob(c: CardCtx, cx: number, cy: number, rx: number, ry: number, rough = 0.18) {
  return (x: number, y: number) => {
    const dx = (x - cx) / rx, dy = (y - cy) / ry, a = Math.atan2(dy, dx);
    const r = 1 + c.g.noise.noise2(Math.cos(a) * 1.6 + c.v * 13.7, Math.sin(a) * 1.6 + 40) * rough;
    return r - Math.hypot(dx, dy);
  };
}

const PAINTERS: Record<CardKind, (c: CardCtx) => void> = {
  shrub(c) {
    const { w, h, g } = c, inside = blob(c, w / 2, h * 0.56, w * 0.47, h * 0.46);
    mass(c, 0.16, 0.36, (x, y) => Math.min(inside(x, y), (h - y) * 4),
      (x, y) => 0.75 - (y / h) * 0.6 - (x / w) * 0.15 + g.noise.noise2(x * 1.3 + c.v * 5, y * 1.3) * 0.3,
      (x, y) => Math.PI / 2 + g.noise.noise2(x, y + 7) * 0.8);
    if (c.rng.chance(0.4)) blossoms(c, inside, c.rng.pick(c.s.flower));
  },

  willow(c) {
    const { ctx, rng, w, h, g, s } = c;
    // Trunk, leaning a little, mostly hidden by the curtain of fronds.
    const lean = rng.range(-0.6, 0.6), trunk: Pt[] = [[w / 2 + lean * 0.3, h], [w / 2 + lean, h * 0.55], [w / 2 + lean * 1.4, h * 0.3]];
    dabLine(ctx, rng, trunk, 0.32, mix(s.reed[0], [70, 50, 40], 0.5), 0.95, 0.3);
    const crown = blob(c, w / 2 + lean, h * 0.27, w * 0.4, h * 0.24, 0.25);
    const light = (x: number, y: number) => 0.85 - (y / h) * 0.55 + g.noise.noise2(x * 0.7 + c.v * 3, y * 0.7) * 0.35;
    mass(c, 0.3, 0.55, crown, light, (x, y) => Math.PI / 2 + g.noise.noise2(x * 0.5, y * 0.5) * 0.6);
    // The curtain: fronds falling from under the crown almost to the water.
    const n = Math.round(w * 9);
    for (let i = 0; i < n; i++) {
      const x = w * (0.04 + 0.92 * (i + rng.random()) / n), edge = 1 - Math.abs(x / w - 0.5) * 2;
      const top = h * (0.18 + (1 - edge) * 0.3) + rng.range(0, 0.6), bottom = h * rng.range(0.82, 0.99);
      const sway = rng.range(-0.3, 0.3), pts: Pt[] = [];
      for (let t = 0; t <= 1.0001; t += 0.1) pts.push([x + sway * t * t + Math.sin(t * 7 + i) * 0.06, lerp(top, bottom, t)]);
      dabLine(c.ctx, rng, pts, rng.range(0.1, 0.2), ramp(s.foliage, light(x, (top + bottom) / 2) + rng.range(-0.1, 0.3)), 0.8, 0.22);
    }
  },

  poplar(c) {
    const { w, h, g } = c, inside = blob(c, w / 2, h * 0.47, w * 0.4, h * 0.46, 0.12);
    dabLine(c.ctx, c.rng, [[w / 2, h], [w / 2, h * 0.75]], 0.25, mix(c.s.reed[0], [60, 44, 36], 0.5), 0.95, 0.25);
    mass(c, 0.24, 0.5, (x, y) => Math.min(inside(x, y), (h * 0.95 - y)),
      (x, y) => 0.8 - (y / h) * 0.45 - (x / w) * 0.25 + g.noise.noise2(x + c.v * 9, y * 0.5) * 0.3,
      () => Math.PI / 2 + c.rng.range(-0.2, 0.2));
  },

  backdrop(c) {
    const { w, h, g } = c;
    // A long, rolling wall of distant trees with a flat foot on the far water.
    const top = (x: number) => h * (0.12 + 0.3 * (0.5 + 0.5 * g.noise.fbm(x / 4 + c.v * 31, 3.3, 3)));
    const fade = (x: number) => Math.min(x, w - x) / 1.5;
    mass(c, 0.42, 0.9, (x, y) => Math.min((y - top(x)) / 2, fade(x), (h - y) * 2),
      (x, y) => 0.7 - ((y - top(x)) / h) * 0.7 + g.noise.noise2(x / 2 + c.v, y / 2) * 0.35,
      (x, y) => Math.PI / 2 + g.noise.noise2(x / 3, y / 3) * 0.9);
  },

  reeds(c) {
    const { ctx, rng, w, h, s } = c, n = rng.int(9, 15);
    for (let i = 0; i < n; i++) {
      const x = w * rng.range(0.15, 0.85), tall = h * rng.range(0.45, 1), lean = rng.range(-0.35, 0.35);
      const pts: Pt[] = [];
      for (let t = 0; t <= 1.0001; t += 0.2) pts.push([x + Math.sin(lean) * tall * t * t, h - tall * t]);
      dabLine(ctx, rng, pts, rng.range(0.035, 0.07), ramp(s.reed, rng.range(0.1, 0.95)), 0.95, 0.12);
      if (rng.chance(0.25)) {
        const [tx, ty] = pts[pts.length - 1];
        dab(ctx, tx, ty + 0.12, 0.26, 0.08, Math.PI / 2 + lean, [96, 64, 40], 0.95);
      }
    }
  },

  iris(c) {
    const { ctx, rng, w, h, s } = c, n = rng.int(8, 13);
    const petal: RGB = s.name === 'rose' || s.name === 'autumn' ? [200, 120, 160] : [112, 86, 176];
    for (let i = 0; i < n; i++) {
      const x = w * rng.range(0.2, 0.8), tall = h * rng.range(0.4, 0.85), lean = (x / w - 0.5) * 1.2 + rng.range(-0.2, 0.2);
      const pts: Pt[] = [[x, h], [x + Math.sin(lean) * tall * 0.3, h - tall * 0.5], [x + Math.sin(lean) * tall * 0.6, h - tall]];
      dabLine(ctx, rng, pts, rng.range(0.05, 0.09), ramp(s.reed, rng.range(0.3, 0.95)), 0.95, 0.1);
    }
    for (let i = rng.int(3, 6); i > 0; i--) {
      const x = w * rng.range(0.25, 0.75), y = h * rng.range(0.1, 0.4);
      for (let k = 0; k < 4; k++) dab(ctx, x + rng.range(-0.06, 0.06), y + rng.range(-0.05, 0.07), rng.range(0.1, 0.16), 0.06, rng.range(0, Math.PI), mix(petal, [255, 255, 255], rng.range(0, 0.35)), 0.95);
      dab(ctx, x, y, 0.05, 0.04, 0, [240, 210, 90], 0.9);
    }
  },

  bridge(c) {
    const { ctx, rng, w, h, s } = c, deck = (x: number) => BRIDGE.deckY(x, w, h);
    const thick = BRIDGE.thick * h, railH = BRIDGE.railH * h;
    const shade = mix(ramp(s.bridge, 0.15), s.accent[0], 0.35), warm = mix(ramp(s.bridge, 0.92), s.accent[3], 0.35);
    // Piles standing in the water under the ends and the middle of the span.
    for (const u of [0.1, 0.22, 0.42, 0.58, 0.78, 0.9]) {
      const x = w * u + rng.range(-0.08, 0.08);
      dabLine(ctx, rng, [[x, h + 0.1], [x + rng.range(-0.04, 0.04), deck(x) + thick]], 0.2, mix(shade, ramp(s.bridge, 0.25), 0.5), 0.95, 0.2);
    }
    const slope = (x: number) => Math.atan2(deck(x + 0.05) - deck(x - 0.05), 0.1);
    for (let x = 0.1; x < w - 0.1; x += 0.13) {
      const y = deck(x), a = slope(x);
      // The deck: violet shade beneath, the bridge's own green, warm light along the top.
      for (const t of [0.85, 0.5, 0.15]) {
        const col = t > 0.6 ? mix(shade, ramp(s.bridge, 0.3), rng.random()) : ramp(s.bridge, (1 - t) * 0.8 + rng.range(-0.1, 0.1));
        touch(ctx, rng, x, y + thick * t, rng.range(0.24, 0.36), thick * rng.range(0.4, 0.55), a + rng.range(-0.07, 0.07), col, 0.95);
      }
      if (rng.chance(0.5)) flat(ctx, rng, x, y - 0.02, rng.range(0.12, 0.24), 0.04, a, warm, 0.85);
      for (let r = 1; r <= 2; r++) {
        if (rng.chance(0.08)) continue;
        touch(ctx, rng, x, y - (railH * r) / 2 + rng.range(-0.015, 0.015), rng.range(0.22, 0.32), rng.range(0.1, 0.14), a + rng.range(-0.06, 0.06), ramp(s.bridge, 0.5 + rng.range(-0.15, 0.12)), 0.95);
      }
      if (rng.chance(0.55)) flat(ctx, rng, x, y - railH - 0.05, rng.range(0.12, 0.22), 0.04, a, rng.chance(0.4) ? warm : ramp(s.bridge, 0.95), 0.8);
    }
    for (let x = 0.35; x < w - 0.3; x += 0.75) {
      const y = deck(x), lean = rng.range(-0.03, 0.03);
      dabLine(ctx, rng, [[x, y + 0.02], [x + lean, y - railH - 0.08]], 0.14, ramp(s.bridge, rng.range(0.32, 0.5)), 0.95, 0.15);
      dabLine(ctx, rng, [[x - 0.05, y], [x - 0.05 + lean, y - railH]], 0.035, ramp(s.bridge, 0.9), 0.55, 0.16);
    }
  },

  pad(c) {
    // Painted already foreshortened, in the easel's horizontal strokes; the drift squashes it a
    // little more for depth. Drawn in easel units (a hundred to the metre) so the strokes match.
    const { ctx, rng, s, v } = c;
    ctx.scale(0.01, 0.01);
    drawPad(ctx, rng, { x: 50, y: 20, w: 90, h: 32, rot: 0, tone: (v + 0.5) / CARDS.pad.variants, notch: rng.range(-2.6, -0.5), flower: -1, key: 0 }, s);
  },

  bloom(c) {
    // A water lily seen from the side, standing on its pad.
    const { ctx, rng, w, h, s } = c, col = s.flower[c.v % s.flower.length];
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + rng.range(-1.35, 1.35), r = rng.range(0.03, 0.08);
      dab(ctx, w / 2 + Math.cos(a) * r * 1.6, h * 0.62 + Math.sin(a) * r, rng.range(0.1, 0.15), 0.05, a, mix(col, [255, 255, 255], i < 4 ? 0 : 0.3), 0.95);
    }
    dab(ctx, w / 2, h * 0.58, 0.06, 0.04, 0, [244, 214, 110], 0.95);
    dab(ctx, w / 2, h * 0.88, 0.3, 0.05, 0, ramp(s.pad, 0.4), 0.8);
  },

  grass(c) {
    // A tuft of long grass leaning every which way, with a few seed heads.
    const { ctx, rng, w, h, s } = c, n = rng.int(28, 44);
    for (let i = 0; i < n; i++) {
      const x = w * (0.5 + rng.bell() * 0.3), tall = h * rng.range(0.35, 1), lean = (x / w - 0.5) * 1.4 + rng.range(-0.4, 0.4);
      const pts: Pt[] = [[x, h], [x + Math.sin(lean) * tall * 0.35, h - tall * 0.55], [x + Math.sin(lean) * tall * 0.8, h - tall]];
      dabLine(ctx, rng, pts, rng.range(0.03, 0.06), ramp(s.reed, rng.range(0.2, 1)), 0.92, 0.09);
    }
    for (let i = rng.int(2, 6); i > 0; i--) dab(ctx, w * rng.range(0.25, 0.75), h * rng.range(0.05, 0.3), 0.12, 0.04, Math.PI / 2 + rng.range(-0.4, 0.4), mix(s.reed[3], s.accent[3], 0.4), 0.9);
  },

  flowers(c) {
    // A bed of flowers: a low mound of leaves thick with blossom in one or two colours.
    const { ctx, rng, w, h, g, s, v } = c, inside = blob(c, w / 2, h * 0.62, w * 0.47, h * 0.4, 0.3);
    mass(c, 0.13, 0.26, (x, y) => Math.min(inside(x, y), (h - y) * 4),
      (x, y) => 0.55 - (y / h) * 0.45 + g.noise.noise2(x * 1.5 + v * 7, y * 1.5) * 0.25,
      (x, y) => Math.PI / 2 + g.noise.noise2(x * 2, y * 2 + 3) * 1.2);
    const hues: RGB[] = [s.flower[2], s.accent[1], s.accent[3], s.flower[0], s.flower[3], s.accent[2]];
    const a = hues[v % hues.length], b = hues[(v + 2) % hues.length];
    for (let i = 0; i < 150; i++) {
      const x = rng.random() * w, y = rng.random() * h;
      if (inside(x, y) < 0.05 || y > h * 0.92) continue;
      const col = mix(rng.chance(0.75) ? a : b, [255, 255, 255], rng.range(0, 0.35));
      touch(ctx, rng, x, y, rng.range(0.07, 0.14), rng.range(0.05, 0.09), rng.range(0, Math.PI), col, 0.95);
    }
  },
};

function blossoms(c: CardCtx, inside: (x: number, y: number) => number, col: RGB) {
  const { ctx, rng, w, h } = c;
  for (let i = 0; i < 40; i++) {
    const x = rng.random() * w, y = rng.random() * h;
    if (inside(x, y) < 0.1) continue;
    dab(ctx, x, y, 0.1, 0.07, rng.range(0, Math.PI), mix(col, [255, 255, 255], rng.range(0, 0.4)), 0.9);
  }
}
