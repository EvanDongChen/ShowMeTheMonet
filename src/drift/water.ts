// The drift's painted surfaces: the pond's face, the sky above the trees, and the canvas itself.
//
// The water is a tile of horizontal brushwork, painted once per seed, laid down on the water plane
// in perspective one screen row at a time (each row a pattern fill scaled for its depth), like the
// floor of an old racing game. Its strokes are half-transparent, so the mirrored garden shows
// through them: a reflection painted over, as Monet would, rather than a glassy mirror.
import { css, lighten, mix } from '../core/color';
import { flat, ramp, touch } from '../core/dab';
import { clamp } from '../core/math';
import { Rng } from '../core/rng';
import type { Garden } from '../world/garden';

/** The water tile: TILE metres square, painted at PPM pixels per metre. */
const TILE = 8, PPM = 64, SIZE = TILE * PPM;
/** World scales of the tile: each this many times finer than the last, for nearer water. */
const BAND = 3, SCALES = 3;

export interface WaterView {
  w: number; h: number; f: number; hy: number; eye: number;
}

export class PaintedWater {
  /** The tile and its smaller copies, for distant rows that would otherwise shimmer. */
  private levels: { pattern: CanvasPattern; ppm: number }[] = [];
  /** Where the tile sits under us: across, along, and how far the view has turned. */
  private u = 0;
  private v = 0;
  private last: { x: number; z: number } | null = null;

  constructor(private g: Garden, ctx: CanvasRenderingContext2D) {
    let tile = this.paint();
    for (let k = 0; k < 4; k++) {
      this.levels.push({ pattern: ctx.createPattern(tile, 'repeat')!, ppm: PPM / 2 ** k });
      const next = document.createElement('canvas');
      next.width = next.height = tile.width / 2;
      const nc = next.getContext('2d')!;
      nc.imageSmoothingQuality = 'high';
      nc.drawImage(tile, 0, 0, next.width, next.height);
      tile = next;
    }
  }

  /** Brushwork that wraps at its edges, so the tile repeats without a seam. */
  private paint() {
    const s = this.g.series, rng = new Rng(this.g.rng(0x3a7e).int(0, 2 ** 30));
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    const ctx = c.getContext('2d')!;
    const stroke = (fn: (ox: number, oy: number) => void) => {
      for (const ox of [-SIZE, 0, SIZE]) for (const oy of [-SIZE, 0, SIZE]) fn(ox, oy);
    };
    for (let i = 0; i < 420; i++) {
      const x = rng.random() * SIZE, y = rng.random() * SIZE, kind = rng.random();
      const col = kind < 0.45 ? ramp(s.water, rng.range(0, 0.65))
        : kind < 0.65 ? mix(ramp(s.foliage, rng.range(0.3, 0.8)), ramp(s.water, 0.4), 0.45)
        : kind < 0.88 ? mix(ramp(s.glint, rng.random()), s.air, 0.3)
        : mix(s.accent[rng.int(0, 1)], ramp(s.water, 0.5), 0.4);
      const len = rng.range(0.35, 1.7) * PPM, wide = rng.range(0.05, 0.16) * PPM, ang = rng.range(-0.06, 0.06);
      const alpha = kind >= 0.65 && kind < 0.88 ? rng.range(0.5, 0.85) : rng.range(0.45, 0.75), seed = rng.int(0, 2 ** 30);
      stroke((ox, oy) => {
        if (x + ox < -len || x + ox > SIZE + len || y + oy < -wide * 3 || y + oy > SIZE + wide * 3) return;
        touch(ctx, new Rng(seed), x + ox, y + oy, len, wide, ang, col, alpha);
      });
    }
    return c;
  }

  /** Follow the boat: slide the tile by how far we moved across and along our own view. */
  follow(x: number, z: number, sin: number, cos: number) {
    if (this.last) {
      const dx = x - this.last.x, dz = z - this.last.z;
      this.u += dx * cos - dz * sin;
      this.v += dx * sin + dz * cos;
    }
    this.last = { x, z };
  }

  draw(ctx: CanvasRenderingContext2D, view: WaterView, yaw: number, clear: (z: number) => number) {
    const { w, h, f, hy, eye } = view, row = 2;
    for (let y = Math.ceil(hy) + 1; y < h; y += row) {
      const zr = (f * eye) / (y + row / 2 - hy);
      if (zr > 90) continue;
      const alpha = clamp((90 - zr) / 40, 0, 1) * (0.45 + 0.55 * clear(zr * 0.6));
      // Near the boat a single tile would be blown up into smears, so the brushwork is laid at a
      // finer scale there (each scale BAND times finer), blending from one scale to the next.
      const k = clamp(Math.log(f / (zr * PPM * 1.4)) / Math.log(BAND), 0, SCALES - 1), k0 = Math.floor(k), mixK = k - k0;
      this.row(ctx, w, y, row, zr, eye, f, yaw, k0, alpha * (k0 + 1 < SCALES ? 1 - mixK : 1));
      if (k0 + 1 < SCALES && mixK > 0.02) this.row(ctx, w, y, row, zr, eye, f, yaw, k0 + 1, alpha * mixK);
    }
    ctx.globalAlpha = 1;
  }

  /** One screen row of the water, drawn with the tile at world scale k. */
  private row(ctx: CanvasRenderingContext2D, w: number, y: number, rh: number, zr: number, eye: number, f: number, yaw: number, k: number, alpha: number) {
    if (alpha < 0.01) return;
    const world = PPM * BAND ** k;
    // Far away, pick the smaller copy of the tile whose pixels come closest to one per screen pixel.
    const lvl = clamp(Math.ceil(Math.log2(world / (f / zr) / 1.4)), 0, this.levels.length - 1);
    const { pattern } = this.levels[lvl], ppm = world / 2 ** lvl;
    const sx = f / (zr * ppm), sy = -(f * eye) / (zr * zr * ppm);
    // A turn swings far water past faster than near water, so the across-offset grows with depth.
    const uc = (this.u + zr * yaw) * ppm, vc = (this.v + zr) * ppm;
    pattern.setTransform(new DOMMatrix([sx, 0, 0, sy, w / 2 - uc * sx, y - vc * sy]));
    ctx.globalAlpha = alpha;
    ctx.fillStyle = pattern;
    ctx.fillRect(0, y, w, rh);
  }
}

/** The sky glimpsed over the trees: a few loose, pale strokes rather than a gradient. */
export function paintSky(g: Garden) {
  const s = g.series, rng = g.rng(0x5c1), c = document.createElement('canvas');
  c.width = 640;
  c.height = 240;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, css(lighten(mix(s.air, s.glint[0], 0.5), 0.12)));
  grad.addColorStop(1, css(s.air));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 260; i++) {
    const y = rng.random() * c.height, col = rng.chance(0.15) ? mix(s.accent[rng.int(0, 2)], s.air, 0.6) : mix(ramp(s.glint, rng.random()), s.air, 0.3 + (y / c.height) * 0.5);
    flat(ctx, rng, rng.random() * c.width, y, rng.range(20, 70), rng.range(6, 16), rng.range(-0.25, 0.25), col, rng.range(0.25, 0.55), rng.range(-0.1, 0.1));
  }
  return c;
}

/** A pattern of canvas weave, laid lightly over the whole view so it reads as a painted surface. */
export function weavePattern(ctx: CanvasRenderingContext2D) {
  const rng = new Rng(18990), c = document.createElement('canvas');
  c.width = c.height = 64;
  const tc = c.getContext('2d')!, img = tc.createImageData(64, 64);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const v = 128 + ((x & 2) ^ (y & 2) ? 7 : -7) + (rng.random() - 0.5) * 30, i = (y * 64 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  tc.putImageData(img, 0, 0);
  return ctx.createPattern(c, 'repeat')!;
}
