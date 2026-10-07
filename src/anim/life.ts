// The easel picture, alive: light trembling on the open water, rings spreading where something
// touched the surface, a petal drifting down from the willows, a dragonfly crossing the pond.
// Drawn on its own canvas over the finished picture; never changes what a seed paints.
import { css, lighten } from '../core/color';
import { lerp } from '../core/math';
import { H, W, type Garden } from '../world/garden';

interface Spark { x: number; y: number; ph: number; speed: number; len: number; }
interface Ring { x: number; y: number; age: number; life: number; size: number; }
interface Petal { x: number; y: number; vy: number; sway: number; ph: number; landed: number; }
interface Fly { x: number; y: number; vx: number; vy: number; ph: number; }

export class Life {
  private sparks: Spark[] = [];
  private rings: Ring[] = [];
  private petals: Petal[] = [];
  private fly: Fly | null = null;
  private nextFly = 6;

  constructor(private g: Garden) {
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

  update(dt: number) {
    const g = this.g;
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
      p.y += p.vy * dt;
      p.x += Math.sin(p.ph * 1.3) * p.sway * dt;
      if (p.y > g.waterLine(p.x) + 20 + g.depth(p.y) * 200 && p.y > g.waterTop + 30) {
        p.landed = 0.001;
        this.rings.push({ x: p.x, y: p.y, age: 0, life: 3, size: lerp(14, 50, g.depth(p.y)) });
      }
    }
    this.petals = this.petals.filter((p) => p.landed < 30 && p.y < H + 20);

    this.nextFly -= dt;
    if (!this.fly && this.nextFly < 0) {
      const left = Math.random() < 0.5;
      this.fly = { x: left ? -20 : W + 20, y: lerp(g.waterTop, H * 0.9, Math.random()), vx: (left ? 1 : -1) * 160, vy: 0, ph: 0 };
    }
    if (this.fly) {
      const f = this.fly;
      f.ph += dt;
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
    for (const r of this.rings) {
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
      ctx.fillStyle = css(s.flower[1], p.landed ? Math.max(0, 0.9 - p.landed / 30) : 0.9);
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
