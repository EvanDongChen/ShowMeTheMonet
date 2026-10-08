// The easel picture, alive: light trembling on the open water, brush strokes streaming along the
// pond's currents and swirling through the leaves, rings spreading where something touched the
// surface, petals drifting down from the willows, a dragonfly crossing the pond.
//
// And it can be stirred. With stir mode on, the cursor drags the streaming strokes into eddies and
// leaves a trail of fresh paint (the colour the painting has under it), ripples spread as it crosses
// the water, the lily pads it brushes past send out rings, flowers glow as it nears them, the
// dragonfly follows it, and a click splashes paint outward and scatters petals. The painting under
// all this is never touched.
//
// Drawn on its own canvas over the finished picture; never changes what a seed paints.
import { css, darken, lighten, type RGB } from '../core/color';
import { clamp, lerp } from '../core/math';
import { H, W, type Garden, type Pad } from '../world/garden';

interface Spark { x: number; y: number; ph: number; speed: number; len: number; }
interface Ring { x: number; y: number; age: number; life: number; size: number; }
interface Petal { x: number; y: number; vy: number; sway: number; ph: number; landed: number; vx?: number; col?: RGB; }
interface Fly { x: number; y: number; vx: number; vy: number; ph: number; }
/** One brush stroke of the living paint: a short trail that fades in and out as it streams along. */
interface Stroke {
  x: number; y: number;
  /** Recent positions, oldest first, as flat x,y pairs. */
  trail: number[];
  age: number; life: number; speed: number; w: number; col: RGB;
  /** Extra velocity from being stirred, which fades away. */
  ex: number; ey: number;
  /** Flung loose: it travels on its own momentum rather than the current. */
  free?: boolean;
}

const TRAIL_STEP = 5;
const TRAIL_POINTS = 7;

export class Life {
  private sparks: Spark[] = [];
  private rings: Ring[] = [];
  private petals: Petal[] = [];
  private fly: Fly | null = null;
  private nextFly = 6;
  private ps: Stroke[] = [];
  private t = 0;
  /** Stir mode: the cursor drags the strokes, trails paint behind it and makes the flowers glow. */
  stir = false;
  /** 0..1: scales the number of streaming strokes. */
  quality = 1;
  private cur = { x: 0, y: 0, vx: 0, vy: 0, on: false };
  /** Reads the painted colour at a point of the painting (supplied by the page, which holds the picture). */
  sample: ((x: number, y: number) => RGB | null) | null = null;
  private nextRing = 0;
  private flowers: Pad[];
  private padCool = new Map<Pad, number>();

  constructor(private g: Garden) {
    this.flowers = g.pads.filter((p) => p.flower >= 0);
    // Sparks sit where the painting left the water open and pale, so the light trembles there.
    for (let tries = 0; this.sparks.length < 90 && tries < 4000; tries++) {
      const x = Math.random() * W, y = lerp(g.waterTop + 8, H, Math.pow(Math.random(), 0.8));
      if (g.noise.noise2(x / 210, y / 55 + 11) < 0.12 || this.onPad(x, y)) continue;
      const d = g.depth(y);
      this.sparks.push({ x, y, ph: Math.random() * 10, speed: 0.6 + Math.random() * 1.2, len: lerp(6, 26, d) });
    }
  }

  private onPad(x: number, y: number) {
    return this.g.pads.some((p) => Math.abs(x - p.x) < p.w / 2 && Math.abs(y - p.y) < p.h / 2);
  }

  /** The bridge is left as it was painted: no strokes stream across it. */
  private onBridge(x: number, y: number) {
    const b = this.g.bridge;
    if (Math.abs(x - b.cx) > b.span / 2) return false;
    const deck = this.g.deckY(x);
    return y > deck - b.railH - 10 && y < deck + b.thick * 1.3;
  }

  /** Where the strokes flow: sideways drifts on the water that meander in bands, and swirls in the leaves. */
  private field(x: number, y: number): [number, number] {
    const n = this.g.noise;
    if (y > this.g.waterLine(x) + 6) {
      const a = n.noise2(x / 240, y / 70 + 5 + this.t * 0.05) * 1.7;
      return [Math.cos(a), 0.28 * Math.sin(a)];
    }
    const a = n.noise2(x / 130, y / 130 + 40 + this.t * 0.06) * 3.4;
    return [Math.cos(a), Math.sin(a) + 0.15];
  }

  private spawn(): Stroke | null {
    if (!this.sample) return null;
    const g = this.g;
    for (let tries = 0; tries < 6; tries++) {
      const x = Math.random() * W, y = Math.random() * H;
      if (this.onBridge(x, y) || this.onPad(x, y)) continue;
      const base = this.sample(x, y);
      if (!base) continue;
      const water = y > g.waterLine(x);
      return {
        x, y, trail: [x, y], age: 0, life: 2.5 + Math.random() * 3.5, speed: water ? 16 + Math.random() * 26 : 12 + Math.random() * 20,
        w: 5 + Math.random() * 4, col: lighten(base, 0.22 + Math.random() * 0.22), ex: 0, ey: 0,
      };
    }
    return null;
  }

  /** Where the cursor is, in painting units, and how fast it is moving (units per second). */
  pointer(x: number, y: number, vx: number, vy: number) {
    const c = this.cur;
    c.vx += (vx - c.vx) * 0.4;
    c.vy += (vy - c.vy) * 0.4;
    c.x = x;
    c.y = y;
    c.on = true;
  }

  pointerOut() {
    this.cur.on = false;
    this.cur.vx = this.cur.vy = 0;
  }

  /** Fresh strokes of whatever paint lies at (x, y), flung outward with velocity (vx, vy). */
  private smear(x: number, y: number, n: number, vx: number, vy: number, spread: number, free = true) {
    const base = this.sample?.(x, y) ?? this.g.series.foliage[3];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = spread * (0.4 + Math.random() * 0.6);
      const px = x + (Math.random() - 0.5) * 16, py = y + (Math.random() - 0.5) * 16;
      this.ps.push({
        x: px, y: py, trail: [px, py], age: 0, life: 1.4 + Math.random() * 1.2, speed: free ? 0 : 20 + Math.random() * 15, w: 8 + Math.random() * 6,
        col: lighten(base, 0.34 + Math.random() * 0.26), ex: vx + Math.cos(a) * sp, ey: vy + Math.sin(a) * sp, free,
      });
    }
  }

  /** A click: a ring of paint flung outward from (x, y), the strokes nearby pushed away, rings and petals. */
  burst(x: number, y: number) {
    const g = this.g, water = y > g.waterLine(x);
    if (water) for (let i = 0; i < 3; i++) this.rings.push({ x, y, age: -i * 0.18, life: 2, size: lerp(18, 70, g.depth(y)) * (1 + i * 0.35) });
    for (const p of this.ps) {
      const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy) || 1, f = Math.exp(-(d * d) / (150 * 150));
      p.ex += (dx / d) * 260 * f;
      p.ey += (dy / d) * 260 * f;
    }
    for (let i = 0, n = 26; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.2, sp = 170 + Math.random() * 110;
      const px = x + Math.cos(a) * 6, py = y + Math.sin(a) * 6, base = this.sample?.(px, py) ?? g.series.foliage[3];
      this.ps.push({
        x: px, y: py, trail: [px, py], age: 0, life: 1.3 + Math.random(), speed: 15 + Math.random() * 20, w: 7 + Math.random() * 5,
        col: lighten(base, 0.38 + Math.random() * 0.26), ex: Math.cos(a) * sp, ey: Math.sin(a) * sp,
      });
    }
    // A bloom that is clicked scatters its petals, which arc up and drift back down to the water.
    for (const f of this.flowers) {
      if (Math.hypot(f.x - x, f.y - y) > Math.max(40, f.w * 0.7)) continue;
      const col = g.series.flower[f.flower];
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, sp = 50 + Math.random() * 90;
        this.petals.push({ x: f.x, y: f.y - f.h * 0.3, vy: Math.sin(a) * sp, vx: Math.cos(a) * sp, sway: 6 + Math.random() * 10, ph: Math.random() * 6, landed: 0, col });
      }
    }
    // A click in the leaves shakes a few petals loose.
    if (!water) for (let i = 0; i < 5; i++) this.petals.push({ x: x + (Math.random() - 0.5) * 60, y: y + (Math.random() - 0.5) * 30, vy: 14 + Math.random() * 14, sway: 10 + Math.random() * 20, ph: Math.random() * 6, landed: 0 });
    // The dragonfly takes fright and darts off.
    if (this.fly) this.fly.vx = (this.fly.x < x ? -1 : 1) * 260;
  }

  update(dt: number) {
    const g = this.g;
    this.t += dt;
    if (Math.random() < dt * 0.7) {
      const x = Math.random() * W, y = lerp(g.waterTop + 10, H - 10, Math.random());
      if (!this.onPad(x, y)) this.rings.push({ x, y, age: 0, life: 3 + Math.random() * 2, size: lerp(14, 60, g.depth(y)) });
    }
    for (const r of this.rings) r.age += dt;
    this.rings = this.rings.filter((r) => r.age < r.life);

    if (this.petals.length < 6 && Math.random() < dt * 0.25) {
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
      // Petals that were flung have a push and fall under gravity; the rest drift down at their own pace.
      if (p.vx !== undefined) {
        p.vy += 110 * dt;
        p.vx *= Math.exp(-dt * 1.2);
        p.x += p.vx * dt;
      }
      p.y += p.vy * dt;
      p.x += Math.sin(p.ph * 1.3) * p.sway * dt;
      if (p.y > g.waterLine(p.x) + 20 + g.depth(p.y) * 200 && p.y > g.waterTop + 30 && p.vy > 0) {
        p.landed = 0.001;
        this.rings.push({ x: p.x, y: p.y, age: 0, life: 3, size: lerp(14, 50, g.depth(p.y)) });
      }
    }
    this.petals = this.petals.filter((p) => p.landed < 30 && p.y < H + 20 && p.y > -80);

    // The streaming strokes: retire those that aged out, then top back up.
    const c = this.cur, stirring = this.stir && c.on, cspeed = Math.hypot(c.vx, c.vy);
    const target = Math.round(120 * this.quality);
    this.ps = this.ps.filter((p) => p.age < p.life && p.x > -30 && p.x < W + 30 && p.y > -30 && p.y < H + 30 && (p.free || !this.onBridge(p.x, p.y)));
    for (let i = 0; this.ps.length < target && i < 40; i++) {
      const p = this.spawn();
      if (p) this.ps.push(p);
    }

    if (stirring) {
      const onWater = c.y > g.waterLine(c.x);
      // A trail of fresh paint behind a moving cursor, in whatever colour the painting has there.
      if (cspeed > 60 && this.ps.length < target * 2.4 && !this.onBridge(c.x, c.y)) this.smear(c.x, c.y, Math.min(5, 2 + Math.floor(cspeed / 350)), c.vx * 0.12, c.vy * 0.12, 22, false);
      // Ripples spread where the cursor crosses the water.
      this.nextRing -= dt;
      if (onWater && cspeed > 40 && this.nextRing <= 0) {
        this.rings.push({ x: c.x, y: c.y, age: 0, life: 1.6, size: lerp(12, 42, g.depth(c.y)) });
        this.nextRing = 0.14;
      }
      // Lily pads the cursor brushes past send out a ring of their own.
      for (const p of g.pads) {
        const cool = (this.padCool.get(p) ?? 0) - dt;
        this.padCool.set(p, cool);
        if (cool > 0 || cspeed < 70 || Math.abs(p.x - c.x) > p.w * 0.6 || Math.abs(p.y - c.y) > p.h * 0.9 + 8) continue;
        this.rings.push({ x: p.x, y: p.y, age: 0, life: 1.9, size: p.w * 0.85 });
        this.padCool.set(p, 0.9);
      }
    }

    // The pull on nearby strokes is capped, so a flick of the mouse swirls them rather than flinging them away.
    const pull = cspeed > 700 ? 700 / cspeed : 1, R2 = 110 * 110, damp = Math.exp(-dt * 1.6);
    for (const p of this.ps) {
      p.age += dt;
      if (stirring) {
        // Strokes near the cursor are dragged along with it and curl around it into a little eddy.
        const dx = p.x - c.x, dy = p.y - c.y, d2 = dx * dx + dy * dy;
        if (d2 < R2 * 4) {
          const f = Math.exp(-d2 / R2), d = Math.sqrt(d2) || 1;
          p.ex += (c.vx * pull * 1.6 * f + (-dy / d) * 110 * f) * dt;
          p.ey += (c.vy * pull * 1.6 * f + (dx / d) * 110 * f) * dt;
        }
      }
      p.ex *= damp;
      p.ey *= damp;
      const v = p.free ? [0, 0] : this.field(p.x, p.y);
      p.x += (v[0] * p.speed + p.ex) * dt;
      p.y += (v[1] * p.speed + p.ey) * dt;
      const lx = p.trail[p.trail.length - 2], ly = p.trail[p.trail.length - 1];
      if (Math.hypot(p.x - lx, p.y - ly) >= TRAIL_STEP) {
        p.trail.push(p.x, p.y);
        if (p.trail.length > TRAIL_POINTS * 2) p.trail.splice(0, 2);
      }
    }

    this.nextFly -= dt;
    if (stirring && !this.fly && this.nextFly < 2) this.fly = { x: c.x + 140, y: c.y - 30, vx: 0, vy: 0, ph: 0 };
    if (!this.fly && this.nextFly < 0) {
      const left = Math.random() < 0.5;
      this.fly = { x: left ? -20 : W + 20, y: lerp(g.waterTop, H * 0.9, Math.random()), vx: (left ? 1 : -1) * 160, vy: 0, ph: 0 };
    }
    if (this.fly) {
      const f = this.fly;
      f.ph += dt;
      if (stirring) {
        // The dragonfly is drawn to the cursor, and hovers around it.
        const tx = c.x + Math.cos(f.ph * 2.2) * 70, ty = c.y - 34 + Math.sin(f.ph * 3.1) * 26, k = Math.min(1, 2.6 * dt);
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

  /** Draw in painting units; the caller has set the transform from painting units to pixels. */
  draw(ctx: CanvasRenderingContext2D, t: number) {
    const s = this.g.series;
    for (const sp of this.sparks) {
      const a = Math.max(0, Math.sin(t * sp.speed + sp.ph)) ** 3;
      if (a < 0.02) continue;
      ctx.fillStyle = css(lighten(s.glint[2], 0.3), a * 0.55);
      ctx.beginPath();
      ctx.ellipse(sp.x, sp.y, sp.len * (0.5 + a * 0.5), Math.max(1, sp.len * 0.08), 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // The streaming strokes: each fades in, streams along its current, and fades out.
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const p of this.ps) {
      const n = p.trail.length / 2;
      if (n < 2) continue;
      const fade = Math.sin(Math.PI * clamp(p.age / p.life, 0, 1)), lay = (dx: number, dy: number, w: number, col: RGB, a: number) => {
        ctx.strokeStyle = css(col, a * fade);
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(p.trail[0] + dx, p.trail[1] + dy);
        for (let i = 1; i < n; i++) ctx.lineTo(p.trail[i * 2] + dx, p.trail[i * 2 + 1] + dy);
        ctx.lineTo(p.x + dx, p.y + dy);
        ctx.stroke();
      };
      // Thick paint: a shadow under it, the body, and a ridge of light along its edge.
      lay(p.w * 0.2, p.w * 0.24, p.w * 1.1, darken(p.col, 0.5), 0.35);
      lay(0, 0, p.w, p.col, 0.9);
      lay(-p.w * 0.22, -p.w * 0.25, Math.max(1, p.w * 0.2), lighten(p.col, 0.4), 0.6);
    }
    ctx.restore();

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
    for (const p of this.petals) {
      ctx.fillStyle = css(p.col ?? s.flower[1], p.landed ? Math.max(0, 0.9 - p.landed / 30) : 0.9);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 4, p.landed ? 1.6 : 2.6, Math.sin(p.ph * 2) * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Blooms glow as the cursor nears them, like stars in a night sky.
    const c = this.cur;
    if (this.stir && c.on) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const f of this.flowers) {
        const near = Math.exp(-((f.x - c.x) ** 2 + (f.y - c.y) ** 2) / (140 * 140));
        if (near < 0.05) continue;
        const R = Math.max(18, f.w * 0.7) * (1 + 0.6 * near), col = lighten(s.flower[f.flower], 0.3), gr = ctx.createRadialGradient(f.x, f.y - f.h * 0.3, 0, f.x, f.y - f.h * 0.3, R);
        gr.addColorStop(0, css(col, 0.6 * near));
        gr.addColorStop(1, css(col, 0));
        ctx.fillStyle = gr;
        ctx.fillRect(f.x - R, f.y - f.h * 0.3 - R, R * 2, R * 2);
      }
      ctx.restore();
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
