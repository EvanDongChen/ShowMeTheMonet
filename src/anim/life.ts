// The easel picture, alive, and a pond to tend. Light trembles on the open water, rings spread where
// something touched the surface, petals drift down from the willows, a dragonfly crosses the pond.
//
// And the person can tend it, just by moving through it: the cursor drifting over the water plants
// water lilies as it goes, each growing from a bud into a bloom (with its own pad, painted in the same
// strokes as the rest), and scatters petals that float away; passing through the leaves shakes petals
// loose. Planted lilies send out the odd ring, and call the
// dragonfly to hover over them. What has been planted is kept for the next visit, per canvas.
//
// Drawn on its own canvas over the finished picture; never changes what a seed paints.
import { css, lighten, type RGB } from '../core/color';
import { clamp, lerp } from '../core/math';
import { Rng } from '../core/rng';
import { drawFlower, drawPad } from '../paint/lilies';
import { H, W, type Garden, type Pad } from '../world/garden';

interface Spark { x: number; y: number; ph: number; speed: number; len: number; }
interface Ring { x: number; y: number; age: number; life: number; size: number; }
interface Petal { x: number; y: number; vy: number; sway: number; ph: number; landed: number; vx?: number; col?: RGB; }
interface Fly { x: number; y: number; vx: number; vy: number; ph: number; }
/** What is kept of a planted lily. */
interface Saved { x: number; y: number; w: number; flower: number; tone: number; notch: number; seed: number; }
interface Planted extends Saved {
  born: number;
  pad: HTMLCanvasElement;
  bloom: HTMLCanvasElement;
  /** Where the lily sits in its sprites, in painting units. */
  bx: number; by: number; sw: number; sh: number;
  nextRing: number;
}

const MAX_PLANTED = 80;
/** The spring grid: columns across the painting, and rows of ROW units down it. */
const GW = 10;
const ROW = 10;
const GH = Math.ceil(H / ROW);
/** Sprites are painted at this many pixels per painting unit, so planted lilies stay crisp. */
const S = 2;

export class Life {
  private sparks: Spark[] = [];
  private rings: Ring[] = [];
  private petals: Petal[] = [];
  private fly: Fly | null = null;
  private nextFly = 6;
  private t = 0;
  private planted: Planted[] = [];
  private cur = { x: 0, y: 0, on: false };
  private sprinkleAt = 0;
  /** How far the cursor has travelled since it last planted something, and when it may next. */
  private travelled = 0;
  /** The cursor's velocity in painting units per second, and when it last moved. */
  private cvx = 0;
  private cvy = 0;
  private lastMove = 0;
  /** A grid of springs over the whole painting: the cursor shoves the leaves and reeds, and they swing back. */
  private gx = new Float32Array(GW * GH);
  private gv = new Float32Array(GW * GH);
  /** Ripples spreading over the water from where the cursor passed. */
  private wakes: { x: number; y: number; t: number; s: number }[] = [];
  private lastWake = { x: -999, y: -999 };
  private plantAt = 0;
  /** Is the pond being tended (the pointer is over the painting and the mode is on)? */
  tending = false;

  constructor(private g: Garden) {
    // Sparks sit where the painting left the water open and pale, so the light trembles there.
    for (let tries = 0; this.sparks.length < 90 && tries < 4000; tries++) {
      const x = Math.random() * W, y = lerp(g.waterTop + 8, H, Math.pow(Math.random(), 0.8));
      if (g.noise.noise2(x / 210, y / 55 + 11) < 0.12 || this.onPad(x, y)) continue;
      const d = g.depth(y);
      this.sparks.push({ x, y, ph: Math.random() * 10, speed: 0.6 + Math.random() * 1.2, len: lerp(6, 26, d) });
    }
    for (const s of this.load()) this.planted.push(this.grow(s, -10));
  }

  private onPad(x: number, y: number) {
    return this.g.pads.some((p) => Math.abs(x - p.x) < p.w / 2 && Math.abs(y - p.y) < p.h / 2);
  }

  // ——— keeping the garden ———

  private key() {
    return `monet-pond:${this.g.seed}:${this.g.series.name}`;
  }

  private load(): Saved[] {
    try {
      const raw = JSON.parse(localStorage.getItem(this.key()) ?? '[]');
      return Array.isArray(raw) ? raw.filter((s) => s && isFinite(s.x) && isFinite(s.y) && isFinite(s.w)).slice(-MAX_PLANTED) : [];
    } catch {
      return [];
    }
  }

  private save() {
    try {
      const out: Saved[] = this.planted.map(({ x, y, w, flower, tone, notch, seed }) => ({ x, y, w, flower, tone, notch, seed }));
      if (out.length) localStorage.setItem(this.key(), JSON.stringify(out));
      else localStorage.removeItem(this.key());
    } catch {
      // Private windows just forget.
    }
  }

  /** How many lilies have been planted. */
  get count() {
    return this.planted.length;
  }

  /** Clear the pond of everything that was planted. */
  clear() {
    this.planted = [];
    this.save();
  }

  /** A planted lily's pad and bloom, painted once into sprites with the easel's own brush. */
  private grow(s: Saved, born: number): Planted {
    const g = this.g, h = s.w * lerp(0.2, 0.42, g.depth(s.y)), sw = Math.ceil(s.w * 1.5), sh = Math.ceil(s.w * 1.05);
    const bx = sw / 2, by = sh * 0.74;
    const make = (draw: (ctx: CanvasRenderingContext2D) => void) => {
      const c = document.createElement('canvas');
      c.width = sw * S;
      c.height = sh * S;
      const ctx = c.getContext('2d')!;
      ctx.scale(S, S);
      draw(ctx);
      return c;
    };
    const pad: Pad = { x: bx, y: by, w: s.w, h, rot: 0, tone: s.tone, notch: s.notch, flower: s.flower, key: 0 };
    // The planted bloom is larger than the ones in the painting, so it reads as something you did.
    const big: Pad = { ...pad, w: s.w * 1.5 };
    return {
      ...s, born, bx, by, sw, sh, nextRing: this.t + 5 + Math.random() * 8,
      pad: make((ctx) => drawPad(ctx, new Rng(s.seed), pad, g.series)),
      bloom: make((ctx) => drawFlower(ctx, new Rng(s.seed + 1), big, g.series)),
    };
  }

  // ——— tending ———

  /** Where the cursor is, in painting units. */
  pointer(x: number, y: number) {
    const c = this.cur, d = c.on ? Math.hypot(x - c.x, y - c.y) : 0;
    // How fast the cursor is moving, smoothed so a jittery mouse still reads as one motion.
    if (c.on && this.tending) {
      const dt = Math.max(1 / 120, this.t - this.lastMove), k = Math.min(1, dt * 14);
      this.cvx += ((x - c.x) / dt - this.cvx) * k;
      this.cvy += ((y - c.y) / dt - this.cvy) * k;
    }
    this.lastMove = this.t;
    c.x = x;
    c.y = y;
    c.on = true;
    if (!this.tending || d < 0.5) return;
    // On the water the cursor sends ripples spreading out from where it passes.
    if (this.onWater(x, y) && Math.hypot(x - this.lastWake.x, y - this.lastWake.y) > 26) {
      this.wakes.push({ x, y, t: this.t, s: clamp(Math.hypot(this.cvx, this.cvy) / 500, 0.45, 1) });
      if (this.wakes.length > 14) this.wakes.shift();
      this.lastWake = { x, y };
    }
    // Moving through the pond tends it: petals scatter as you go, and a lily is planted every so far.
    this.sprinkle(x, y);
    this.travelled += d;
    const water = this.onWater(x, y);
    if (this.t >= this.plantAt && this.travelled > (water ? 150 : 230)) {
      this.tend(x, y);
      this.travelled = 0;
      this.plantAt = this.t + 0.7;
    }
  }

  pointerOut() {
    this.cur.on = false;
    this.travelled = 0;
  }

  private onWater(x: number, y: number) {
    return y > this.g.waterLine(x) + 10;
  }

  /** On the water this plants a lily; in the leaves it shakes petals loose. */
  tend(x: number, y: number) {
    const g = this.g;
    if (this.onWater(x, y)) {
      const d = g.depth(y), w = clamp(lerp(22, 110, Math.pow(d, 1.1)) * (1 + Math.random() * 0.25), 30, 120);
      const v = Math.random(), nf = g.series.flower.length;
      const flower = Math.min(nf - 1, v < 0.4 ? 0 : v < 0.65 ? 1 : v < 0.8 ? 2 : v < 0.9 ? 3 : 4);
      this.planted.push(this.grow({ x, y, w, flower, tone: 0.3 + Math.random() * 0.7, notch: (Math.random() - 0.5) * 2 * Math.PI, seed: (Math.random() * 2 ** 30) | 0 }, this.t));
      if (this.planted.length > MAX_PLANTED) this.planted.shift();
      for (let i = 0; i < 2; i++) this.rings.push({ x, y, age: -i * 0.22, life: 2.2, size: w * (0.9 + i * 0.45) });
      for (let i = 0; i < 3; i++) this.petal(x + (Math.random() - 0.5) * w, y, true);
      this.save();
      return;
    }
    // A shake of the leaves: petals fall from where the cursor touched, and settle on the water.
    for (let i = 0; i < 8; i++) this.petal(x + (Math.random() - 0.5) * 70, y + (Math.random() - 0.5) * 24, false);
    if (this.fly) this.fly.vx = (this.fly.x < x ? -1 : 1) * 220;
  }

  /** Moving scatters petals: onto the water where they float, loose from the leaves where they fall. */
  sprinkle(x: number, y: number) {
    if (this.t < this.sprinkleAt) return;
    this.sprinkleAt = this.t + 0.16;
    const water = this.onWater(x, y);
    this.petal(x + (Math.random() - 0.5) * 24, y + (Math.random() - 0.5) * 12, water);
    if (water && Math.random() < 0.25) this.rings.push({ x, y, age: 0, life: 1.6, size: lerp(12, 38, this.g.depth(y)) });
  }

  private petal(x: number, y: number, landed: boolean) {
    const s = this.g.series, col = s.flower[Math.min(s.flower.length - 1, 1 + Math.floor(Math.random() * 3))];
    if (landed) this.petals.push({ x, y, vy: 0, sway: 0, ph: Math.random() * 6, landed: 0.001, col });
    else this.petals.push({ x, y, vy: 18 + Math.random() * 16, sway: 12 + Math.random() * 22, ph: Math.random() * 6, landed: 0, col });
  }

  // ——— the pond's own life ———

  update(dt: number) {
    const g = this.g;
    this.t += dt;
    this.physics(dt);
    if (Math.random() < dt * 0.7) {
      const x = Math.random() * W, y = lerp(g.waterTop + 10, H - 10, Math.random());
      if (!this.onPad(x, y)) this.rings.push({ x, y, age: 0, life: 3 + Math.random() * 2, size: lerp(14, 60, g.depth(y)) });
    }
    // Planted lilies stir the water now and then, as something moving beneath them.
    for (const p of this.planted) {
      if (this.t > p.nextRing && this.t - p.born > 2.5) {
        this.rings.push({ x: p.x, y: p.y, age: 0, life: 3, size: p.w * 0.9 });
        p.nextRing = this.t + 7 + Math.random() * 12;
      }
    }
    for (const r of this.rings) r.age += dt;
    this.rings = this.rings.filter((r) => r.age < r.life);

    if (this.petals.length < 8 && Math.random() < dt * 0.25) {
      const side = Math.random() < 0.5 ? g.willowL * Math.random() : W - g.willowR * Math.random();
      this.petals.push({ x: side, y: -10 + Math.random() * g.waterTop * 0.5, vy: 12 + Math.random() * 10, sway: 10 + Math.random() * 20, ph: Math.random() * 6, landed: 0 });
    }
    for (const p of this.petals) {
      p.ph += dt;
      if (p.landed) {
        p.landed += dt;
        p.x += dt * 2;
        continue;
      }
      p.y += p.vy * dt;
      p.x += Math.sin(p.ph * 1.3) * p.sway * dt;
      if (p.y > g.waterLine(p.x) + 20 + g.depth(p.y) * 200 && p.y > g.waterTop + 30) {
        p.landed = 0.001;
        this.rings.push({ x: p.x, y: p.y, age: 0, life: 3, size: lerp(14, 50, g.depth(p.y)) });
      }
    }
    this.petals = this.petals.filter((p) => p.landed < 30 && p.y < H + 20 && p.x > -40 && p.x < W + 40);

    this.nextFly -= dt;
    const home = this.tending && this.planted.length ? this.planted[this.planted.length - 1] : null;
    if (home && !this.fly) this.fly = { x: home.x + 160, y: home.y - 60, vx: 0, vy: 0, ph: 0 };
    if (!this.fly && this.nextFly < 0) {
      const left = Math.random() < 0.5;
      this.fly = { x: left ? -20 : W + 20, y: lerp(g.waterTop, H * 0.9, Math.random()), vx: (left ? 1 : -1) * 160, vy: 0, ph: 0 };
    }
    if (this.fly) {
      const f = this.fly;
      f.ph += dt;
      if (home) {
        // The dragonfly is drawn to the newest lily, and hovers over it.
        const tx = home.x + Math.cos(f.ph * 1.7) * home.w * 0.5, ty = home.y - home.w * 0.5 + Math.sin(f.ph * 2.6) * 14, k = Math.min(1, 2.2 * dt);
        f.x += (tx - f.x) * k;
        f.y += (ty - f.y) * k;
      } else {
        // Dart, hover, dart.
        const dash = Math.sin(f.ph * 1.7) > 0.2 ? 1 : 0.08;
        f.x += f.vx * dash * dt;
        f.y += (Math.sin(f.ph * 2.3) * 40 + f.vy) * dash * dt;
        if (f.x < -40 || f.x > W + 40) {
          this.fly = null;
          this.nextFly = 10 + Math.random() * 16;
        }
      }
    }
  }

  /**
   * The cursor's push on the painting. A grid of springs lies over it: near the cursor each cell is
   * shoved the way the cursor is going (and a little away from it), then swings back and settles,
   * dragging its neighbours so the movement travels outward and rolls on after the cursor has gone.
   */
  private physics(dt: number) {
    const c = this.cur, live = this.tending && c.on;
    // A cursor that stops stops pushing.
    if (this.t - this.lastMove > 0.06) {
      const k = Math.exp(-dt * 9);
      this.cvx *= k;
      this.cvy *= k;
    }
    this.wakes = this.wakes.filter((w) => this.t - w.t < 2.2);
    const cw = W / GW, R2 = 120 * 120, sx = this.gx, sv = this.gv, step = Math.min(dt, 0.033);
    for (let j = 0; j < GH; j++) {
      const y = (j + 0.5) * ROW;
      for (let i = 0; i < GW; i++) {
        const k = j * GW + i, x = (i + 0.5) * cw;
        let acc = -46 * sx[k] - 3.2 * sv[k];
        // Neighbours pull on each other, so a shove travels along the foliage and across the water.
        const l = i > 0 ? sx[k - 1] : sx[k], r = i < GW - 1 ? sx[k + 1] : sx[k], u = j > 0 ? sx[k - GW] : sx[k], d = j < GH - 1 ? sx[k + GW] : sx[k];
        acc += 16 * (l + r + u + d - 4 * sx[k]);
        if (live) {
          const dx = x - c.x, dy = y - c.y, d2 = dx * dx + dy * dy;
          if (d2 < R2 * 4) {
            const f = Math.exp(-d2 / R2), away = dx / (Math.sqrt(d2) + 20);
            // The leaves are shoved the way the cursor goes, and brushed aside as it passes.
            acc += (this.cvx * 1.1 + away * Math.hypot(this.cvx, this.cvy) * 0.5) * f;
          }
        }
        sv[k] += acc * step;
        sx[k] = clamp(sx[k] + sv[k] * step, -22, 22);
      }
    }
  }

  /** The planted lilies, at a given moment of their growing. Pass a large `age` for fully grown. */
  private drawPlanted(ctx: CanvasRenderingContext2D, now: number, still = false) {
    for (const p of this.planted) {
      const age = still ? 99 : now - p.born, gp = clamp(age / 0.9, 0, 1), gf = clamp((age - 0.5) / 1.7, 0, 1);
      const ep = gp * gp * (3 - 2 * gp);
      // The bloom opens with a little overshoot, like something that wanted to.
      const ef = gf === 0 ? 0 : 1 + 2.1 * Math.pow(gf - 1, 3) + 1.1 * Math.pow(gf - 1, 2);
      if (ep > 0.01) {
        ctx.save();
        ctx.translate(p.x, p.y + (still ? 0 : Math.sin(now * 1.1 + p.seed) * lerp(0.6, 2.2, this.g.depth(p.y))));
        ctx.scale(ep, ep);
        ctx.drawImage(p.pad, -p.bx, -p.by, p.sw, p.sh);
        ctx.restore();
      }
      if (ef > 0.01) {
        ctx.save();
        ctx.translate(p.x, p.y + (still ? 0 : Math.sin(now * 1.1 + p.seed) * lerp(0.6, 2.2, this.g.depth(p.y))));
        ctx.rotate(still ? 0 : Math.sin(now * 0.9 + p.seed) * 0.03);
        ctx.scale(ef, ef);
        ctx.drawImage(p.bloom, -p.bx, -p.by, p.sw, p.sh);
        ctx.restore();
      }
    }
  }

  /** The planted lilies, fully grown, for a postcard: painting units, so scale the context first. */
  paintPlanted(ctx: CanvasRenderingContext2D) {
    this.drawPlanted(ctx, 0, true);
  }

  /**
   * The painting itself, made to move. The finished picture is laid over itself again in thin
   * strips, each nudged by a travelling wave, so the whole of it breathes without a single stroke
   * being repainted: the willows and leaves sway in a wind that gusts and eases, with the willows
   * swaying most, the reflections shimmer and the lily pads bob on the water, more the nearer they
   * are. The bridge is rigid and left as painted. The picture canvas underneath is never touched,
   * so switching the pond off (or a postcard) gives back the still painting.
   */
  private drawLiving(ctx: CanvasRenderingContext2D, picture: HTMLCanvasElement, t: number) {
    const g = this.g, k = picture.width / W, wt = g.waterTop, cols = GW, cw = W / cols, grid = this.gx;
    // The spring grid between its cell centres, so a shove leans smoothly across the leaves.
    const gridAt = (x: number, j: number) => {
      const f = clamp(x / cw - 0.5, 0, cols - 1), i = Math.min(cols - 2, Math.floor(f)), u = f - i;
      return grid[j * GW + i] * (1 - u) + grid[j * GW + i + 1] * u;
    };
    const sub = 3, sw = cw / sub;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // The leaves and willows sway everywhere, in front of and behind the bridge. The bridge is painted
    // into the same picture, so where it stands the sway is much smaller and capped: the plants around
    // and behind it still answer the cursor, while the bridge only trembles.
    const b = g.bridge, inBridge = (x: number, y: number) => Math.abs(x - b.cx) < b.span / 2 + 6 && y > g.deckY(x) - b.railH - 12 && y < g.deckY(x) + b.thick * 1.6;
    ctx.save();
    for (let y = 0; y < wt; y += ROW) {
      const h = Math.min(ROW, wt - y), env = Math.pow(Math.sin(Math.PI * (y / wt)), 0.8), j = Math.min(GH - 1, Math.floor(y / ROW));
      for (let i = 0; i < cols; i++) {
        const cx = i * cw, gust = 0.65 + 0.35 * Math.sin(t * 0.35 + cx * 0.004), willow = 1 + 1.3 * g.willow(cx + cw / 2);
        const wind = env * gust * willow * (2.6 * Math.sin(t * 0.9 + y * 0.012 + cx * 0.006) + 1.1 * Math.sin(t * 1.7 + y * 0.03 + cx * 0.01));
        const push = (0.5 + 0.5 * env) * (0.7 + 0.5 * willow), yc = y + h / 2;
        const calm = (x: number) => (inBridge(x, yc) ? 0.28 : 1), cap = (v: number, x: number) => (inBridge(x, yc) ? clamp(v, -3.2, 3.2) : v);
        // Where the cursor has set the leaves swinging, draw them in narrow slices so they bend rather than step.
        if (Math.abs(grid[j * GW + i]) + Math.abs(grid[j * GW + Math.min(cols - 1, i + 1)]) > 1.2) {
          for (let q = 0; q < sub; q++) {
            const sx = cx + q * sw;
            ctx.drawImage(picture, sx * k, y * k, (sw + 1) * k, (h + 0.6) * k, sx + cap((wind + gridAt(sx + sw / 2, j) * push) * calm(sx + sw / 2), sx + sw / 2), y, sw + 1, h + 0.6);
          }
        } else {
          ctx.drawImage(picture, cx * k, y * k, (cw + 1) * k, (h + 0.6) * k, cx + cap((wind + grid[j * GW + i] * push) * calm(cx + cw / 2), cx + cw / 2), y, cw + 1, h + 0.6);
        }
      }
    }
    ctx.restore();

    // The water: reflections shimmer, the pads and flowers bob, the cursor's ripples roll through.
    const wakes = this.wakes, now = this.t;
    for (let y = wt; y < H; y += 7) {
      const h = Math.min(7, H - y), d = g.depth(y), amp = lerp(0.6, 3, d), bob = lerp(0.6, 2.8, d), j = Math.min(GH - 1, Math.floor(y / ROW)), yc = y + h / 2, scale = lerp(0.8, 1.6, d);
      for (let i = 0; i < cols; i++) {
        const cx = i * cw;
        // Is a ripple front (or the cursor's drag) passing through this stretch of water? Then it is drawn in narrow slices.
        let active = Math.abs(grid[j * GW + i]) > 1.2;
        for (let q = 0; !active && q < wakes.length; q++) {
          const w = wakes[q], rx = cx + cw / 2 - w.x, ry = (yc - w.y) * 2.4;
          active = Math.abs(Math.hypot(rx, ry) - 80 * (now - w.t)) < cw * 0.6 + 45;
        }
        const slices = active ? sub : 1, width = cw / slices;
        for (let q = 0; q < slices; q++) {
          const sx = cx + q * width, xc = sx + width / 2;
          let dx = amp * (Math.sin(t * 1.5 + y * 0.09 + xc * 0.01) + 0.6 * Math.sin(t * 2.6 + y * 0.21 + xc * 0.02)) + gridAt(xc, j) * 0.6;
          let dy = bob * Math.sin(t * 1.1 + y * 0.05 + xc * 0.008);
          if (active) {
            for (const w of wakes) {
              const age = Math.max(0, now - w.t);
              // A ring spreading out (squashed, for the perspective of the water), with a few crests behind its front.
              const rx = xc - w.x, ry = (yc - w.y) * 2.4, r = Math.hypot(rx, ry) + 1, band = r - 80 * age;
              const wave = w.s * Math.exp(-1.0 * age) * Math.cos(band * 0.2) * Math.exp(-(band * band) / (2 * 50 * 50)) / (1 + r * 0.008);
              if (Math.abs(wave) < 0.01) continue;
              dy += wave * 9 * scale;
              dx += wave * 8 * (rx / r) * scale;
            }
          }
          const sy = clamp(y + dy, 0, H - h - 0.6);
          ctx.drawImage(picture, sx * k, sy * k, (width + 1) * k, (h + 0.6) * k, sx + dx, y, width + 1, h + 0.6);
        }
      }
    }
    ctx.restore();
  }

  /** Draw in painting units; the caller has set the transform from painting units to pixels. */
  draw(ctx: CanvasRenderingContext2D, t: number, picture?: HTMLCanvasElement) {
    const s = this.g.series;
    if (picture) this.drawLiving(ctx, picture, t);
    for (const sp of this.sparks) {
      const a = Math.max(0, Math.sin(t * sp.speed + sp.ph)) ** 3;
      if (a < 0.02) continue;
      ctx.fillStyle = css(lighten(s.glint[2], 0.3), a * 0.55);
      ctx.beginPath();
      ctx.ellipse(sp.x, sp.y, sp.len * (0.5 + a * 0.5), Math.max(1, sp.len * 0.08), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const r of this.rings) {
      if (r.age < 0) continue;
      const k = r.age / r.life, d = this.g.depth(r.y);
      ctx.strokeStyle = css(lighten(s.glint[1], 0.2), (1 - k) * 0.45);
      ctx.lineWidth = lerp(0.8, 2, d);
      for (const f of [1, 0.6]) {
        ctx.beginPath();
        ctx.ellipse(r.x, r.y, r.size * k * f + 1, (r.size * k * f + 1) * lerp(0.2, 0.42, d), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    this.drawPlanted(ctx, this.t);
    for (const p of this.petals) {
      ctx.fillStyle = css(p.col ?? s.flower[1], p.landed ? Math.max(0, 0.9 - p.landed / 30) : 0.9);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 4, p.landed ? 1.6 : 2.6, Math.sin(p.ph * 2) * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.fly) {
      const f = this.fly, flap = Math.sin(t * 70) * 0.4;
      ctx.strokeStyle = css([36, 62, 84], 0.9);
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(f.x - 13, f.y);
      ctx.lineTo(f.x + 13, f.y);
      ctx.stroke();
      ctx.fillStyle = css([226, 238, 242], 0.5);
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(f.x + 2, f.y - side * 5 * (1 + flap), 10, 3, side * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
