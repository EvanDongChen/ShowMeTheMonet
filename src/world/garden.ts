// A seed's water garden: the light it is painted in, the footbridge, the far bank and the rafts
// of water lilies. Everything here is derived from the seed, so it can be rebuilt identically in
// any worker; the painters in src/paint only read from it.
import { lerp, smoothstep } from '../core/math';
import { Noise } from '../core/noise';
import { hash, hashString, Rng } from '../core/rng';
import { ramp } from '../core/dab';
import { CLASSIC_SEED, GIVERNY, type RaftNote } from './giverny';
import { SERIES, SERIES_NAMES, type Series, type SeriesName } from './series';
import type { RGB } from '../core/color';

/** Canvas size in painting units. */
export const W = 1200, H = 1050;
const BUCKET = 24;

export interface Bridge {
  cx: number; span: number;
  /** Deck height at the crown and at the ends of the span. */
  apex: number; end: number;
  thick: number; railH: number; rails: number; post: number;
}

export interface Pad {
  x: number; y: number; w: number; h: number;
  rot: number; tone: number;
  /** Angle of the notch cut into the leaf. */
  notch: number;
  /** Index into the series' flower ramp, or -1. */
  flower: number;
  key: number;
}

export class Garden {
  readonly s: number;
  readonly noise: Noise;
  readonly classic: boolean;
  readonly series: Series;
  readonly bridge: Bridge;
  readonly waterTop: number;
  readonly willowL: number; readonly willowR: number;
  readonly reedL: number; readonly reedR: number;
  readonly rafts: RaftNote[];
  readonly pads: Pad[];
  /** Pads bucketed on a coarse grid, to ask quickly whether a spot of water is open. */
  private padGrid = new Map<number, Pad[]>();

  /** `light` overrides which series the seed paints in; everything else stays the seed's own. */
  constructor(readonly seed: string, light: SeriesName | null = null) {
    this.s = hashString(seed);
    this.noise = new Noise(new Rng(hash(this.s, 0x6e015e)));
    this.classic = seed === CLASSIC_SEED;
    const r = this.rng(0xa11);
    if (this.classic) {
      const c = GIVERNY;
      this.series = SERIES[light ?? c.series];
      this.bridge = {
        cx: c.bridge.cx * W, span: c.bridge.span * W, apex: c.bridge.apex * H, end: c.bridge.end * H,
        thick: c.bridge.thick * H, railH: c.bridge.railH * H, rails: c.bridge.rails, post: c.bridge.post * W,
      };
      this.waterTop = c.waterTop * H;
      this.willowL = c.willowL * W; this.willowR = c.willowR * W;
      this.reedL = c.reedL * W; this.reedR = c.reedR * W;
      this.rafts = c.rafts;
    } else {
      // The first series ("Harmony in Green") is the most common, as it is in Monet's own run.
      const picked = r.chance(0.35) ? 'green' : r.pick(SERIES_NAMES);
      this.series = SERIES[light ?? picked];
      const apex = r.range(0.17, 0.3);
      this.bridge = {
        cx: r.range(0.38, 0.62) * W, span: r.range(1.05, 1.6) * W,
        apex: apex * H, end: (apex + r.range(0.08, 0.16)) * H,
        thick: r.range(0.026, 0.038) * H, railH: r.range(0.07, 0.1) * H, rails: r.chance(0.7) ? 2 : 3, post: r.range(0.045, 0.08) * W,
      };
      this.waterTop = Math.max(this.bridge.end + 0.07 * H, r.range(0.43, 0.54) * H);
      this.willowL = r.chance(0.8) ? r.range(0.1, 0.32) * W : 0;
      this.willowR = r.chance(0.8) ? r.range(0.1, 0.32) * W : 0;
      this.reedL = r.chance(0.7) ? r.range(0.05, 0.15) * W : 0;
      this.reedR = r.chance(0.7) ? r.range(0.05, 0.15) * W : 0;
      this.rafts = this.randomRafts(this.rng(0x4af7));
    }
    this.pads = this.layPads();
    for (const pad of this.pads) {
      for (let bx = Math.floor((pad.x - pad.w / 2) / BUCKET); bx <= Math.floor((pad.x + pad.w / 2) / BUCKET); bx++) {
        for (let by = Math.floor((pad.y - pad.h / 2) / BUCKET); by <= Math.floor((pad.y + pad.h / 2) / BUCKET); by++) {
          const k = bx * 4096 + by, list = this.padGrid.get(k);
          if (list) list.push(pad);
          else this.padGrid.set(k, [pad]);
        }
      }
    }
  }

  /** Is (x, y) under a lily pad (within `shrink` of its outline)? */
  covered(x: number, y: number, shrink = 0.85) {
    const list = this.padGrid.get(Math.floor(x / BUCKET) * 4096 + Math.floor(y / BUCKET));
    if (!list) return false;
    for (const p of list) {
      const dx = (x - p.x) / (p.w * 0.5 * shrink), dy = (y - p.y) / (p.h * 0.5 * shrink);
      if (dx * dx + dy * dy < 1) return true;
    }
    return false;
  }

  rng(...k: number[]) {
    return new Rng(hash(this.s, ...k));
  }

  /** Where the far bank meets the water, wobbling slightly. */
  waterLine(x: number) {
    return this.waterTop + this.noise.fbm(x / 160, 3.7, 2) * 9;
  }

  /** 0 at the far bank, 1 at the foot of the canvas: how near the water is to us. */
  depth(y: number) {
    return Math.max(0, Math.min(1, (y - this.waterTop) / (H - this.waterTop)));
  }

  /** Height of the bridge deck at x (a shallow arch). */
  deckY(x: number) {
    const b = this.bridge, u = (x - b.cx) / (b.span / 2);
    return lerp(b.apex, b.end, u * u);
  }

  /** How much weeping willow hangs at x, 0..1. */
  willow(x: number) {
    const l = this.willowL ? 1 - smoothstep(this.willowL * 0.4, this.willowL, x) : 0;
    const r = this.willowR ? smoothstep(W - this.willowR, W - this.willowR * 0.4, x) : 0;
    return Math.max(l, r);
  }

  /**
   * What grows at (x, y), as weights for weeping willow, dark mottled shrubbery and pale flowering
   * bush. The edges between stands wander with noise, so the bank reads as separate plantings
   * rather than bands: willow hanging down the left, dark shrubs behind the bridge, pale bush to the right.
   */
  plants(x: number, y: number): [number, number, number] {
    const wx = x + this.noise.noise2(x / 220, y / 170 + 60) * 140;
    const willow = this.willow(wx);
    const start = W * (0.5 + 0.05 * this.noise.noise2(7.7, 3.3));
    const patch = smoothstep(0.1, 0.55, this.noise.noise2(x / 150, y / 120 + 90));
    const bush = (1 - willow) * Math.max(smoothstep(start, start + 0.2 * W, wx), patch * 0.7);
    const shrub = Math.max(0.05, 1 - willow - bush);
    const sum = willow + bush + shrub;
    return [willow / sum, shrub / sum, bush / sum];
  }

  /** How thick the reeds grow at x along the side edges, 0..1. */
  reeds(x: number) {
    const l = this.reedL ? 1 - smoothstep(this.reedL * 0.3, this.reedL, x) : 0;
    const r = this.reedR ? smoothstep(W - this.reedR, W - this.reedR * 0.3, x) : 0;
    return Math.max(l, r);
  }

  /**
   * The light on the foliage wall at (x, y), 0 (deep shade) .. 1 (sun on leaves). Brighter high in
   * the middle where light falls through, darker in the pockets and just above the water.
   */
  foliageLight(x: number, y: number) {
    // Big masses, then bush-sized clumps with dark pockets between them, then leaf-sized dapple.
    const n = this.noise.fbm(x / 260, y / 190, 4) + this.noise.noise2(x / 85, y / 70 + 21) * 0.26 + this.noise.noise2(x / 60, y / 60 + 9) * 0.18;
    const sun = 0.18 * (1 - Math.abs(x / W - 0.5) * 1.4) - 0.22 * smoothstep(this.waterTop - 160, this.waterTop, y);
    return 0.5 + n * 0.75 + sun;
  }

  foliageColor(x: number, y: number): RGB {
    return ramp(this.series.foliage, this.foliageLight(x, y));
  }

  private randomRafts(r: Rng): RaftNote[] {
    const out: RaftNote[] = [], wt = this.waterTop / H;
    let y = wt + r.range(0.015, 0.03), side = r.chance(0.5) ? 0 : 1;
    while (y < 0.99) {
      const d = (y - wt) / (1 - wt), across = r.chance(0.25 - d * 0.15);
      const len = r.range(0.35, 0.75);
      const x0 = across ? -0.05 : side === 0 ? -0.05 : 1.05 - len;
      const x1 = across ? 1.05 : side === 0 ? len : 1.05;
      out.push({ y, x0, x1, tilt: r.range(-0.04, 0.04), rows: d < 0.7 ? r.int(1, 3) : r.int(1, 2) });
      side = r.chance(0.75) ? 1 - side : side;
      y += lerp(0.035, 0.085, d) * r.range(0.8, 1.3);
    }
    return out;
  }

  /** Lay the lily pads of every raft, receding in perspective: small and squashed far away. */
  private layPads(): Pad[] {
    const pads: Pad[] = [];
    // Monet's pond is spangled with blooms: mostly white and pink, a few red and yellow ones.
    const flowers = this.series.name === 'mist' ? 0.14 : 0.24, nf = this.series.flower.length;
    const bloom = (r: Rng) => { const v = r.random(); return Math.min(nf - 1, v < 0.42 ? 0 : v < 0.64 ? 1 : v < 0.78 ? 2 : v < 0.86 ? 3 : 4); };
    this.rafts.forEach((raft, ri) => {
      const r = this.rng(0x9ad, ri);
      const ry = raft.y * H, d0 = this.depth(ry);
      const size = lerp(20, 110, Math.pow(d0, 1.1)), rows = raft.rows * 2 + 1;
      for (let row = 0; row < rows; row++) {
        let x = raft.x0 * W + r.range(0, size * 0.5);
        while (x < raft.x1 * W) {
          // Rafts meander a little rather than lying in ruled lines.
          const wander = this.noise.noise2(x / 190, ri * 3.7 + 0.5) * size * 0.9;
          const y = ry + raft.tilt * (x - W / 2) + wander + row * size * lerp(0.13, 0.22, d0) + r.bell() * size * 0.07;
          const d = this.depth(y), w = lerp(20, 110, Math.pow(d, 1.1)) * r.range(0.7, 1.25);
          // Rafts thin out at their ends and break into holes where the noise is low.
          const t = (x / W - raft.x0) / (raft.x1 - raft.x0), edge = Math.min(t, 1 - t);
          const keep = this.noise.noise2(x / 140, y / 50 + ri * 7.1) + edge * 2.2 > -0.15;
          if (keep && y > this.waterLine(x) + 3) {
            pads.push({
              x, y, w, h: w * lerp(0.2, 0.42, d), rot: r.range(-0.08, 0.08), tone: r.range(0.3, 1),
              notch: r.range(-Math.PI, Math.PI),
              // Blooms gather in drifts rather than being sprinkled evenly.
              flower: r.chance(flowers * (0.35 + 1.5 * smoothstep(-0.25, 0.45, this.noise.noise2(x / 110 + 40, y / 70)))) ? bloom(r) : -1,
              key: y + r.random() * 0.5,
            });
          }
          x += w * r.range(0.45, 0.8);
        }
      }
    });
    return pads;
  }
}
