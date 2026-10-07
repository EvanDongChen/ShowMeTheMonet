// Draws the drift: a diorama of flat painted cards stood up in the garden, seen from the boat.
//
// Every card is a billboard facing us. Cards are projected (scale = f / depth), sorted far to near
// and painted over one another, so nearer flats cover farther ones and slide past faster as the
// boat moves. Between depth slabs a thin veil of the series' air is laid over everything already
// drawn, so each layer back is a little paler: the stacked-cardboard depth of a lit diorama.
// The water is a mirror: every standing card is drawn again upside down into a reflection buffer
// that is pasted below the horizon in rippling strips.
import { css, darken, lighten, mix } from '../core/color';
import { dab, ramp } from '../core/dab';
import { lerp } from '../core/math';
import { CARDS, cardId } from '../paint/cards';
import type { Garden } from '../world/garden';
import { Boat, EYE } from './camera';
import { River, type Placed } from './river';

const NEAR = 0.55, FAR = 120;
/** Depth slabs, far to near: the veil is laid down each time drawing crosses one. */
const SLABS = [95, 68, 48, 34, 24, 16, 10, 5];

export interface View {
  w: number; h: number; f: number;
  /** Screen row of the horizon. */
  hy: number;
  x: number; z: number; eye: number;
  sin: number; cos: number;
}

interface Shown { p: Placed; zr: number; sx: number; sy: number; sw: number; sh: number; img: HTMLCanvasElement | null; }

export type ImageOf = (id: string) => HTMLCanvasElement | null;

export class DriftRenderer {
  private refl = document.createElement('canvas');
  private rctx = this.refl.getContext('2d')!;
  private shown: Shown[] = [];
  /** Distance over which the air veils the garden: shorter in mist. */
  private haze: number;

  constructor(private g: Garden, private river: River, private image: ImageOf) {
    this.haze = lerp(85, 26, Math.min(1, g.series.mist / 0.42));
  }

  view(boat: Boat, w: number, h: number): View {
    const b = boat.bob(), yaw = boat.viewYaw;
    // A wide lens on landscape screens, a little wider still on tall ones so the banks stay in view.
    const f = Math.max(w, h * 1.1) / 2 / Math.tan((72 * Math.PI) / 360);
    return { w, h, f, hy: h * (0.44 + b.pitch), x: boat.x, z: boat.z, eye: EYE + b.dy, sin: Math.sin(yaw), cos: Math.cos(yaw) };
  }

  /** Card ids in the order they're needed: what's in view nearest first, then everything else. */
  wanted(boat: Boat): string[] {
    const out = new Set<string>();
    for (const s of [...this.shown].reverse()) out.add(cardId(s.p.kind, s.p.variant));
    for (let k = River.reachOf(boat.z) - 1; k <= River.reachOf(boat.z + FAR); k++) {
      for (const p of this.river.reach(k).cards) out.add(cardId(p.kind, p.variant));
    }
    out.add(cardId('bow', 0));
    return [...out];
  }

  /** Fraction of a thing's colour that survives the air between it and us. */
  private clear(z: number) {
    return Math.exp(-z / this.haze);
  }

  draw(ctx: CanvasRenderingContext2D, boat: Boat, t: number, w: number, h: number, overlay?: (v: View) => void) {
    const v = this.view(boat, w, h), s = this.g.series, roll = boat.bob().roll;
    this.collect(v);

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(roll);
    ctx.scale(1.04, 1.04);
    ctx.translate(-w / 2, -h / 2);

    // Sky (rarely seen past the trees) and the water's own colour.
    const sky = ctx.createLinearGradient(0, 0, 0, v.hy);
    sky.addColorStop(0, css(lighten(mix(s.air, s.glint[0], 0.5), 0.15)));
    sky.addColorStop(1, css(s.air));
    ctx.fillStyle = sky;
    ctx.fillRect(-w, -h, w * 3, v.hy + h);
    const water = ctx.createLinearGradient(0, v.hy, 0, h);
    water.addColorStop(0, css(mix(s.air, ramp(s.water, 0.6), 0.5)));
    water.addColorStop(0.25, css(ramp(s.water, 0.45)));
    water.addColorStop(1, css(ramp(s.water, 0.18)));
    ctx.fillStyle = water;
    ctx.fillRect(-w, v.hy, w * 3, h * 2);

    this.reflect(ctx, v, t);
    this.glints(ctx, v, t);

    // The cards, far to near, with a veil of air laid down at each slab boundary.
    let slab = 0;
    for (const it of this.shown) {
      while (slab < SLABS.length && it.zr < SLABS[slab]) this.veil(ctx, v, slab++);
      this.card(ctx, it);
    }
    while (slab < SLABS.length) this.veil(ctx, v, slab++);

    overlay?.(v);

    // Light falling through the garden onto the water ahead, and the edge of our vision.
    ctx.globalCompositeOperation = 'screen';
    const glow = ctx.createRadialGradient(w / 2, v.hy, 0, w / 2, v.hy, Math.max(w, h) * 0.7);
    glow.addColorStop(0, css(s.air, 0.22));
    glow.addColorStop(1, css(s.air, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(-w, -h, w * 3, h * 3);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    this.bow(ctx, boat, w, h);

    const vig = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.35, w / 2, h * 0.5, Math.max(w, h) * 0.8);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, css(darken(s.washBottom, 0.5), 0.45));
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  }

  /** Project everything in range and sort it far to near. */
  private collect(v: View) {
    this.shown.length = 0;
    const k0 = River.reachOf(v.z - 4) - 1, k1 = River.reachOf(v.z + FAR) + 1;
    for (let k = k0; k <= k1; k++) {
      for (const p of this.river.reach(k).cards) {
        const dx = p.x - v.x, dz = p.z - v.z;
        const zr = dx * v.sin + dz * v.cos;
        if (zr < (p.flat ? 0.3 : NEAR) || zr > FAR) continue;
        const xr = dx * v.cos - dz * v.sin, sc = v.f / zr, sw = p.w * sc, sx = v.w / 2 + xr * sc;
        if (sx + sw / 2 < -v.w * 0.1 || sx - sw / 2 > v.w * 1.1) continue;
        // A pad lies on the water, so it is foreshortened by how steeply we look down at it.
        const sh = p.flat ? sw * (v.eye / zr) * 1.15 : p.h * sc;
        this.shown.push({ p, zr, sx, sy: v.hy + v.eye * sc, sw, sh, img: this.image(cardId(p.kind, p.variant)) });
      }
    }
    this.shown.sort((a, b) => b.zr - a.zr);
  }

  private card(ctx: CanvasRenderingContext2D, it: Shown) {
    const { p, sx, sy, sw, sh, img } = it;
    if (!img) {
      // Until the card is painted, a soft blot of its colour holds its place.
      if (p.flat || p.kind === 'bridge') return;
      ctx.fillStyle = css(ramp(this.g.series.foliage, 0.45), 0.5);
      ctx.beginPath();
      ctx.ellipse(sx, sy - sh * 0.5, sw * 0.4, sh * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const y = p.flat ? sy - sh / 2 : sy - sh;
    if (p.flip) {
      ctx.save();
      ctx.translate(sx, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, -sw / 2, y, sw, sh);
      ctx.restore();
    } else {
      ctx.drawImage(img, sx - sw / 2, y, sw, sh);
    }
  }

  /** Lay a veil of air over everything drawn so far, down to where water at this depth lies. */
  private veil(ctx: CanvasRenderingContext2D, v: View, i: number) {
    const far = SLABS[i], near = SLABS[i + 1] ?? 0;
    const a = 1 - this.clear(far - near);
    const bottom = v.hy + (v.eye * v.f) / far;
    ctx.fillStyle = css(this.g.series.air, a);
    ctx.fillRect(-v.w, -v.h, v.w * 3, bottom + v.h);
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
      r.globalAlpha = 0.25 + 0.6 * this.clear(it.zr);
      r.save();
      r.translate(it.sx, it.sy);
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
    ctx.fillRect(-v.w, hy, v.w * 3, v.h * 2);
  }

  /** Flecks of sky on the water, each lying at a fixed spot so they sweep past as we row. */
  private glints(ctx: CanvasRenderingContext2D, v: View, t: number) {
    const s = this.g.series, k0 = River.reachOf(v.z) - 1, k1 = River.reachOf(v.z + 60);
    for (let k = k0; k <= k1; k++) {
      for (const gl of this.river.reach(k).glints) {
        const dx = gl.x - v.x, dz = gl.z - v.z, zr = dx * v.sin + dz * v.cos;
        if (zr < (gl.dark ? 1.2 : 3) || zr > 60) continue;
        const sc = v.f / zr, sx = v.w / 2 + (dx * v.cos - dz * v.sin) * sc;
        if (sx < -50 || sx > v.w + 50) continue;
        const shimmer = 0.5 + 0.5 * Math.sin(t * 1.3 + gl.tone * 20);
        const len = Math.min(gl.len * sc, v.w * (gl.dark ? 0.12 : 0.06));
        const col = gl.dark ? ramp(s.water, gl.tone * 0.3) : ramp(s.glint, gl.tone), a = gl.dark ? 0.35 : 0.25 + 0.4 * shimmer;
        dab(ctx, sx + Math.sin(t * 0.8 + gl.tone * 9) * len * 0.05, v.hy + v.eye * sc, len, Math.max(1, Math.min(len * 0.09, gl.dark ? 7 : 4)), 0, col, a * (0.4 + 0.6 * this.clear(zr)));
      }
    }
  }

  /** Our own bow at the foot of the view, rocking with the boat. */
  private bow(ctx: CanvasRenderingContext2D, boat: Boat, w: number, h: number) {
    const img = this.image(cardId('bow', 0));
    if (!img) return;
    const b = boat.bob(), bw = Math.min(w * 0.46, h * 0.85), bh = bw * (CARDS.bow.h / CARDS.bow.w);
    ctx.save();
    ctx.translate(w / 2, h + bh * 0.3 + b.dy * h * 1.5);
    ctx.rotate(-b.roll * 2);
    ctx.drawImage(img, -bw / 2, -bh, bw, bh);
    ctx.restore();
  }
}
