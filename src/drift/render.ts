// Draws the drift: a diorama of flat painted cards stood up in the garden, seen from the boat.
//
// Every card is a billboard facing us. Cards are projected (scale = f / depth), sorted far to near
// and painted over one another, so nearer flats cover farther ones and slide past faster as the
// boat moves. Between depth slabs a thin veil of the series' air is laid over everything already
// drawn, so each layer back is a little paler: the stacked-cardboard depth of a lit diorama.
// The water is a mirror: every standing card is drawn again upside down into a reflection buffer
// that is pasted below the horizon in rippling strips, and then painted over with brushwork laid
// on the water plane in perspective (./water.ts).
import { css, darken, lighten, mix } from '../core/color';
import { dab, ramp } from '../core/dab';
import { clamp, lerp } from '../core/math';
import { cardId } from '../paint/cards';
import type { Garden } from '../world/garden';
import { Boat, EYE } from './camera';
import { daylight } from './daylight';
import { River, type Placed } from './river';
import { PaintedWater, paintSky, weavePattern, type Sky } from './water';

const NEAR = 0.55, FAR = 120;
/**
 * Depth slabs, far to near: the veil is laid down each time drawing crosses one. They are fine
 * enough that a card slipping from one slab to the next changes by a few percent, which can't be
 * seen, rather than jumping between a handful of fog levels.
 */
const SLABS: number[] = (() => {
  const out: number[] = [];
  for (let z = 112; z > 4.5; z -= Math.max(1.5, z * 0.04)) out.push(z);
  return out;
})();

export interface View {
  w: number; h: number; f: number;
  /** Screen row of the horizon. */
  hy: number;
  x: number; z: number; eye: number;
  sin: number; cos: number;
  /** The hour (see daylight.ts) and how open the sky is overhead, all 0..1. */
  warm: number; dusk: number; dawn: number; open: number;
}

/**
 * `zr` is depth along the view axis, which places the card on screen. `d` is its distance from the
 * boat, which doesn't change when the view turns, so it orders and fogs the cards: steering never
 * reshuffles the walls or flickers their haze. `fade` eases a card in as it finishes painting and
 * out at the nearest and farthest limits, so nothing pops.
 */
interface Shown { p: Placed; zr: number; d: number; sx: number; sy: number; sw: number; sh: number; img: HTMLCanvasElement | null; fade: number; }

export type ImageOf = (id: string) => HTMLCanvasElement | null;

export class DriftRenderer {
  private refl = document.createElement('canvas');
  private rctx = this.refl.getContext('2d')!;
  private shown: Shown[] = [];
  /** Distance over which the air veils the garden: shorter in mist. */
  private haze: number;
  private sky: Sky;
  /** The sky is painted here, then set behind everything at the end so the fog never washes it out. */
  private skyBuf = document.createElement('canvas');
  /** When each card's painting was first seen finished, for easing it in. */
  private born = new Map<string, number>();
  private water: PaintedWater | null = null;
  private weave: CanvasPattern | null = null;

  constructor(private g: Garden, private river: River, private image: ImageOf) {
    this.haze = lerp(85, 26, Math.min(1, g.series.mist / 0.42));
    this.sky = paintSky(g);
  }

  view(boat: Boat, w: number, h: number): View {
    const yaw = boat.viewYaw;
    // A wide lens on landscape screens, a little wider still on tall ones so the banks stay in view.
    const f = Math.max(w, h * 1.1) / 2 / Math.tan((72 * Math.PI) / 360);
    return {
      w, h, f, hy: h * 0.44 + boat.pitch * h * 0.12, x: boat.x, z: boat.z, eye: EYE + boat.heave, sin: Math.sin(yaw), cos: Math.cos(yaw),
      ...daylight(boat.z), open: this.river.openness(boat.z + 8),
    };
  }

  /** Card ids in the order they're needed: what's in view nearest first, then everything else. */
  wanted(boat: Boat): string[] {
    const out = new Set<string>();
    for (const s of [...this.shown].reverse()) out.add(cardId(s.p.kind, s.p.variant));
    for (let k = River.reachOf(boat.z) - 1; k <= River.reachOf(boat.z + FAR); k++) {
      for (const p of this.river.reach(k).cards) out.add(cardId(p.kind, p.variant));
    }
    return [...out];
  }

  /** Fraction of a thing's colour that survives the air between it and us. */
  private clear(z: number) {
    return Math.exp(-z / this.haze);
  }

  draw(ctx: CanvasRenderingContext2D, boat: Boat, t: number, w: number, h: number, overlay?: (v: View) => void, behind?: (c: CanvasRenderingContext2D, v: View) => void) {
    const v = this.view(boat, w, h), s = this.g.series, yaw = boat.viewYaw;
    this.collect(v, t);
    this.water ??= new PaintedWater(this.g, ctx);
    this.weave ??= weavePattern(ctx);

    ctx.clearRect(0, 0, w, h);

    // The sky glimpsed over the trees: painted clouds drifting slowly, panning as we turn, with
    // the sun's bloom and birds. The tile keeps its own proportions (4:1), so clouds are never squashed.
    // The sky pans at the true angular rate of the view, so it sits at infinity behind the garden.
    const tw = (h * 0.44 + 2) * 4, off = (((yaw * v.f + t * 1.5) % tw) + tw) % tw, sh = Math.ceil(v.hy) + 2;
    if (this.skyBuf.width !== w || this.skyBuf.height !== sh) {
      this.skyBuf.width = w;
      this.skyBuf.height = sh;
    }
    const sb = this.skyBuf.getContext('2d')!;
    sb.clearRect(0, 0, w, sh);
    this.skyPlate(sb, v, off, tw);
    this.sunGlow(sb, v, off, tw, 0.34 * (1 + v.warm * 0.6 + v.open * 0.5));
    behind?.(sb, v);
    const water = ctx.createLinearGradient(0, v.hy, 0, h);
    water.addColorStop(0, css(mix(s.air, ramp(s.water, 0.6), 0.5)));
    water.addColorStop(0.25, css(ramp(s.water, 0.45)));
    water.addColorStop(1, css(ramp(s.water, 0.18)));
    ctx.fillStyle = water;
    ctx.fillRect(0, v.hy, w, h);
    // The sky lying in the water, under the reflected garden.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, v.hy, w, h - v.hy);
    ctx.clip();
    ctx.globalAlpha = 0.5;
    ctx.translate(0, v.hy * 2);
    ctx.scale(1, -1);
    ctx.drawImage(this.skyBuf, 0, 0);
    ctx.restore();

    this.reflect(ctx, v, t);
    this.water.follow(boat.x, boat.z, v.sin, v.cos);
    this.water.draw(ctx, v, yaw, (z) => this.clear(z));
    this.glints(ctx, v, t);
    this.dapples(ctx, v, t);

    // The cards, far to near, with a veil of air laid down at each slab boundary.
    let slab = 0;
    for (const it of this.shown) {
      while (slab < SLABS.length && it.d < SLABS[slab]) this.veil(ctx, v, slab++);
      this.card(ctx, it);
    }
    while (slab < SLABS.length) this.veil(ctx, v, slab++);

    // The sky goes behind all of it: fog only tints the cards and water, so the clouds keep their colour.
    ctx.globalCompositeOperation = 'destination-over';
    ctx.drawImage(this.skyBuf, 0, 0);
    ctx.globalCompositeOperation = 'source-over';

    this.shafts(ctx, v, off, tw, t);
    overlay?.(v);

    // Light falling through the garden onto the water ahead, and the edge of our vision.
    ctx.globalCompositeOperation = 'screen';
    this.sunGlow(ctx, v, off, tw, 0.14);
    const glow = ctx.createRadialGradient(w / 2, v.hy, 0, w / 2, v.hy, Math.max(w, h) * 0.7);
    glow.addColorStop(0, css(s.air, 0.22));
    glow.addColorStop(1, css(s.air, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';

    const vig = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.35, w / 2, h * 0.5, Math.max(w, h) * 0.8);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, css(darken(s.washBottom, 0.5), 0.45));
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);

    this.grade(ctx, v);

    // The weave of the canvas showing through the paint.
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = this.weave;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** The colour of the hour laid over everything: gold in the afternoon, violet at dusk, pink at dawn. */
  private grade(ctx: CanvasRenderingContext2D, v: View) {
    const warm = v.warm * (this.g.series.name === 'evening' ? 0.5 : 1), fill = (op: GlobalCompositeOperation, col: [number, number, number], a: number) => {
      if (a < 0.01) return;
      ctx.globalCompositeOperation = op;
      ctx.fillStyle = css(col, a);
      ctx.fillRect(0, 0, v.w, v.h);
    };
    fill('soft-light', [255, 168, 86], warm * 0.55);
    fill('multiply', [150, 140, 196], v.dusk * 0.4);
    fill('soft-light', [70, 60, 150], v.dusk * 0.5);
    fill('screen', [255, 196, 210], v.dawn * 0.16);
    ctx.globalCompositeOperation = 'source-over';
  }

  /** One copy of the sky, tiled across the view. */
  private skyPlate(ctx: CanvasRenderingContext2D, v: View, off: number, tw: number) {
    for (const x of [-off, tw - off, 2 * tw - off]) if (x < v.w && x + tw > 0) ctx.drawImage(this.sky.canvas, x, 0, tw, v.hy + 2);
  }

  /** The sun, a soft bloom in the sky's own coordinates, so it swings past as the view turns. */
  private sunGlow(ctx: CanvasRenderingContext2D, v: View, off: number, tw: number, strength: number) {
    const s = this.g.series, prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'screen';
    for (const k of [-1, 0, 1]) {
      const sx = this.sky.sunU * tw - off + k * tw, sy = v.hy * this.sky.sunV, r = v.w * 0.34;
      if (sx < -r || sx > v.w + r) continue;
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      glow.addColorStop(0, css(mix(s.glint[2], [255, 244, 214], 0.5), strength * 1.4));
      glow.addColorStop(0.25, css(s.glint[1], strength * 0.6));
      glow.addColorStop(1, css(s.glint[1], 0));
      ctx.fillStyle = glow;
      ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = prev;
  }

  /** Project everything in range and sort it far to near. */
  private collect(v: View, t: number) {
    this.shown.length = 0;
    const k0 = River.reachOf(v.z - 4) - 1, k1 = River.reachOf(v.z + FAR) + 1;
    for (let k = k0; k <= k1; k++) {
      for (const p of this.river.reach(k).cards) {
        const dx = p.x - v.x, dz = p.z - v.z;
        const zr = dx * v.sin + dz * v.cos;
        const d = Math.hypot(dx, dz);
        if (zr < (p.flat ? 1.1 : NEAR) || d > FAR) continue;
        const xr = dx * v.cos - dz * v.sin, sc = v.f / zr, sw = p.w * sc, sx = v.w / 2 + xr * sc;
        if (sx + sw / 2 < -v.w * 0.1 || sx - sw / 2 > v.w * 1.1) continue;
        // A pad lies on the water, so it is foreshortened by how steeply we look down at it.
        const sh = p.flat ? sw * (v.eye / zr) * 1.15 : p.h * sc;
        if (p.elev && v.hy + (v.eye - p.elev) * sc < -8) continue;
        const id = cardId(p.kind, p.variant), img = this.image(id);
        let appear = 0;
        if (img) {
          if (!this.born.has(id)) this.born.set(id, t);
          appear = clamp((t - this.born.get(id)!) / 0.9, 0, 1);
          appear = appear * appear * (3 - 2 * appear);
        }
        const fade = appear * clamp((FAR - d) / (FAR * 0.2), 0, 1) * (p.flat ? 1 : clamp((zr - NEAR) / 0.9, 0, 1));
        if (fade <= 0.004) continue;
        this.shown.push({ p, zr, d, sx, sy: v.hy + (v.eye - (p.elev ?? 0)) * sc, sw, sh, img, fade });
      }
    }
    this.shown.sort((a, b) => b.d - a.d);
  }

  private card(ctx: CanvasRenderingContext2D, it: Shown) {
    const { p, sx, sy, sw, sh, img } = it;
    if (!img) return;
    const y = p.flat ? sy - sh / 2 : sy - sh;
    // Pads right under the bow fade away rather than looming up as giant blurs.
    ctx.globalAlpha = it.fade * (p.flat && it.zr < 2.2 ? (it.zr - 1.1) / 1.1 : 1);
    if (p.flip) {
      ctx.save();
      ctx.translate(sx, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, -sw / 2, y, sw, sh);
      ctx.restore();
    } else {
      ctx.drawImage(img, sx - sw / 2, y, sw, sh);
    }
    ctx.globalAlpha = 1;
  }

  /** Lay a veil of air over everything drawn so far, down to where water at this depth lies. */
  private veil(ctx: CanvasRenderingContext2D, v: View, i: number) {
    const far = SLABS[i], near = SLABS[i + 1] ?? 0;
    const a = 1 - this.clear(far - near);
    const bottom = v.hy + (v.eye * v.f) / far;
    // Only over what's already painted (cards, water), never over the empty sky behind.
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = css(this.g.series.air, a);
    ctx.fillRect(0, 0, v.w, bottom);
    ctx.globalCompositeOperation = 'source-over';
  }

  /** The mirror: standing cards upside down, broken into ripples below the horizon. */
  private reflect(ctx: CanvasRenderingContext2D, v: View, t: number) {
    const rw = Math.ceil(v.w / 2), rh = Math.ceil(v.h / 2);
    if (this.refl.width !== rw || this.refl.height !== rh) {
      this.refl.width = rw;
      this.refl.height = rh;
    }
    const r = this.rctx;
    r.setTransform(1, 0, 0, 1, 0, 0);
    r.clearRect(0, 0, rw, rh);
    r.setTransform(0.5, 0, 0, 0.5, 0, 0);
    for (const it of this.shown) {
      if (it.p.flat || !it.img) continue;
      r.globalAlpha = (0.25 + 0.6 * this.clear(it.d)) * it.fade;
      r.save();
      r.translate(it.sx, v.hy + (v.eye + (it.p.elev ?? 0)) * (it.sw / it.p.w));
      r.scale(it.p.flip ? -1 : 1, -1);
      r.drawImage(it.img, -it.sw / 2, -it.sh, it.sw, it.sh);
      r.restore();
    }
    r.globalAlpha = 1;

    const hy = Math.floor(v.hy), step = 3;
    ctx.globalAlpha = 0.62;
    for (let y = hy; y < v.h; y += step) {
      const near = (y - hy) / (v.h - hy);
      const ox = Math.sin(y * 0.11 - t * 1.7) * (0.6 + near * 7) + Math.sin(y * 0.031 + t * 0.6) * near * 4;
      ctx.drawImage(this.refl, 0, y / 2, rw, step / 2, ox, y, v.w, step);
    }
    ctx.globalAlpha = 1;
    // The pond's own colour and the sky's pale sheen, over the mirrored garden.
    const tint = ctx.createLinearGradient(0, hy, 0, v.h);
    tint.addColorStop(0, css(this.g.series.air, 0.35));
    tint.addColorStop(0.3, css(ramp(this.g.series.water, 0.4), 0.18));
    tint.addColorStop(1, css(ramp(this.g.series.water, 0.15), 0.3));
    ctx.fillStyle = tint;
    ctx.fillRect(0, hy, v.w, v.h);
  }

  /** Sunlight falling through the canopy onto the water: soft slanted shafts that drift a little. */
  private shafts(ctx: CanvasRenderingContext2D, v: View, off: number, tw: number, t: number) {
    const s = this.g.series, strength = (s.name === 'evening' ? 1.7 : s.name === 'mist' ? 1.4 : 1) * (1 + v.warm * 0.8 + v.open * 1.2);
    const col = lighten(mix(s.glint[2], [255, 244, 214], 0.5), 0.02);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 7; i++) {
      const u = (i + 0.5) / 7 + 0.04 * Math.sin(i * 3.7), a = (0.05 + 0.035 * Math.sin(t * 0.25 + i * 2.1)) * strength;
      const half = 22 + (26 * ((i * 37) % 5)) / 5, len = v.h * 0.78;
      for (const k of [-1, 0, 1]) {
        const x0 = u * tw - off + k * tw, x1 = x0 - 0.28 * len;
        if (x0 + 120 < 0 || x1 - 200 > v.w) continue;
        const grad = ctx.createLinearGradient(0, 0, 0, len);
        grad.addColorStop(0, css(col, a));
        grad.addColorStop(1, css(col, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(x0 - half, 0);
        ctx.lineTo(x0 + half, 0);
        ctx.lineTo(x1 + half * 2.4, len);
        ctx.lineTo(x1 - half * 2.4, len);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /** Patches of sun on the water, lying where they fall so they sweep past as we row. */
  private dapples(ctx: CanvasRenderingContext2D, v: View, t: number) {
    const s = this.g.series, k0 = River.reachOf(v.z) - 1, k1 = River.reachOf(v.z + 55), warm = mix(s.glint[2], s.accent[3], 0.3);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let k = k0; k <= k1; k++) {
      for (const d of this.river.reach(k).dapples) {
        const dx = d.x - v.x, dz = d.z - v.z, zr = dx * v.sin + dz * v.cos;
        if (zr < 2 || zr > 55) continue;
        const sc = v.f / zr, sx = v.w / 2 + (dx * v.cos - dz * v.sin) * sc, rx = d.r * sc;
        if (sx < -rx || sx > v.w + rx) continue;
        const ry = rx * (v.eye / zr) * 1.2 + 1, a = (0.1 + 0.1 * (0.5 + 0.5 * Math.sin(t * 0.7 + d.tone * 30))) * (0.4 + 0.6 * this.clear(zr));
        ctx.save();
        ctx.translate(sx, v.hy + v.eye * sc);
        ctx.scale(1, ry / rx);
        const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
        gr.addColorStop(0, css(warm, a));
        gr.addColorStop(1, css(warm, 0));
        ctx.fillStyle = gr;
        ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  /** Flecks of sky on the water, each lying at a fixed spot so they sweep past as we row. */
  private glints(ctx: CanvasRenderingContext2D, v: View, t: number) {
    const s = this.g.series, k0 = River.reachOf(v.z) - 1, k1 = River.reachOf(v.z + 60);
    for (let k = k0; k <= k1; k++) {
      for (const gl of this.river.reach(k).glints) {
        const dx = gl.x - v.x, dz = gl.z - v.z, zr = dx * v.sin + dz * v.cos;
        if (gl.dark || zr < 3 || zr > 60) continue;
        const sc = v.f / zr, sx = v.w / 2 + (dx * v.cos - dz * v.sin) * sc;
        if (sx < -50 || sx > v.w + 50) continue;
        const shimmer = 0.5 + 0.5 * Math.sin(t * 1.3 + gl.tone * 20);
        const len = Math.min(gl.len * sc, v.w * (gl.dark ? 0.12 : 0.06));
        const col = gl.dark ? ramp(s.water, gl.tone * 0.3) : ramp(s.glint, gl.tone), a = gl.dark ? 0.35 : 0.25 + 0.4 * shimmer;
        dab(ctx, sx + Math.sin(t * 0.8 + gl.tone * 9) * len * 0.05, v.hy + v.eye * sc, len, Math.max(1, Math.min(len * 0.09, gl.dark ? 7 : 4)), 0, col, a * (0.4 + 0.6 * this.clear(zr)));
      }
    }
  }
}
