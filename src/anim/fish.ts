// Fish in the live pond: dim shapes just under the surface, the colour of the deep water, with a gold
// one or two among them. They wander the pond and rest in the shade of the pads, and they answer the
// person: hold the cursor still on the water and they come over, slowly, and circle beneath it, and
// now and then one rises and kisses the surface. Move fast and they bolt. Left alone they nose at the
// lilies that have been planted (setting them rocking) and take petals that have settled on the water.
//
// Drawn over the finished picture, under the bridge; never changes what a seed paints.
import { css, darken, hex, lighten, mix, type RGB } from '../core/color';
import { clamp, lerp } from '../core/math';
import { W, H, type Garden } from '../world/garden';

/** What the fish can see of the rest of the pond's life. */
export interface FishPond {
  /** The pond's clock, in seconds. */
  t: number;
  /** The cursor, in painting units; `speed` in painting units a second, `still` seconds since it moved. */
  cursor: { x: number; y: number; on: boolean; speed: number; still: number };
  planted: readonly { x: number; y: number; w: number; nudge: number }[];
  petals: { x: number; y: number; landed: number }[];
  ring(x: number, y: number, size: number, life: number, delay?: number): void;
}

type Mode = 'wander' | 'curious' | 'flee';

interface Fish {
  x: number; y: number;
  /** Heading on the water's plane, and speed in plane units a second (scaled by perspective on screen). */
  dir: number; v: number;
  len: number;
  col: RGB;
  /** How readily it comes to the cursor: the bold come first, the shy only after a while. */
  bold: number;
  slot: number;
  mode: Mode;
  until: number;
  tx: number; ty: number;
  /** What it is swimming toward, if anything: a petal to take or a lily to nose at. */
  goal: { kind: 'petal'; ref: FishPond['petals'][number] } | { kind: 'lily'; ref: FishPond['planted'][number] } | null;
  /** When it will next change its mind about where to go. */
  rethink: number;
  near: number;
  swim: number;
  /** Raised toward the surface (after a rise), and hidden in the shade of a pad, both 0..1. */
  rise: number;
  hide: number;
}

/** Turn `a` toward `b` by at most `max`. */
function turn(a: number, b: number, max: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + clamp(d, -max, max);
}

export class School {
  private fish: Fish[] = [];
  private t = 0;
  private pond: FishPond | null = null;

  constructor(private g: Garden) {
    const s = g.series, n = 5 + Math.floor(Math.random() * 2);
    // The shadows of the deep water, leaning violet as Monet's shade does, and a gold one or two.
    const dark = darken(mix(s.water[0], s.accent[0], 0.5), 0.38);
    const gold = mix(mix(hex('#e8873a'), s.accent[3], 0.15), s.water[2], 0.12);
    for (let i = 0; i < n; i++) {
      const p = this.spot();
      this.fish.push({
        x: p.x, y: p.y, dir: Math.random() * Math.PI * 2, v: 0,
        len: lerp(95, 140, Math.random()),
        col: i < 2 ? mix(gold, dark, i * 0.2) : mix(dark, s.water[1], Math.random() * 0.3),
        bold: Math.random(), slot: (i / n) * Math.PI * 2, mode: 'wander', until: 0,
        tx: p.x, ty: p.y, goal: null, rethink: Math.random() * 4, near: 0,
        swim: Math.random() * 10, rise: 0, hide: 0,
      });
    }
  }

  /** A place on the open water between the pads, clear of the reeds at the edges, kinder to the near water than the far. */
  private spot() {
    const g = this.g;
    let x = 0, y = 0;
    for (let tries = 0; tries < 8; tries++) {
      x = lerp(70, W - 70, Math.random());
      y = lerp(g.waterLine(x) + 30, H - 40, Math.sqrt(Math.random()));
      if (!this.underPad(x, y)) break;
    }
    return { x, y };
  }

  /** Is (x, y) under a pad? Tested against the leaf's ellipse, a little inside its painted edge. */
  private underPad(x: number, y: number) {
    return this.g.pads.some((p) => {
      const u = (x - p.x) / (p.w * 0.42), v = (y - p.y) / (p.h * 0.42);
      return u * u + v * v < 1;
    });
  }

  /** How large things are at y, and how the water's plane is squashed there. */
  private persp(y: number) {
    const d = this.g.depth(y);
    return { per: lerp(0.25, 1, d), sq: lerp(0.5, 0.78, d), d };
  }

  /** Distance on the water's plane, in plane units. */
  private dist(f: Fish, x: number, y: number) {
    const { per, sq } = this.persp(f.y);
    return Math.hypot(x - f.x, (y - f.y) / sq) / per;
  }

  /** Something hit the water near (x, y): fish within `r` (plane units) bolt away from it. */
  startle(x: number, y: number, r: number) {
    for (const f of this.fish) {
      const d = this.dist(f, x, y);
      if (d > r) continue;
      const { per, sq } = this.persp(f.y), away = Math.atan2((f.y - y) / sq, f.x - x), run = 260 + Math.random() * 140;
      f.mode = 'flee';
      f.until = this.t + 0.9 + Math.random() * 0.7;
      f.goal = null;
      f.near = 0;
      f.tx = clamp(f.x + Math.cos(away) * run * per, 70, W - 70);
      f.ty = f.y + Math.sin(away) * run * per * sq;
      f.v = Math.max(f.v, 240 * (1 - d / (r * 1.4)));
      if (Math.random() < 0.5) this.headRing(f, 0.5);
    }
  }

  /** Where its mouth is, on screen. */
  private head(f: Fish) {
    const { per, sq } = this.persp(f.y);
    return { x: f.x + Math.cos(f.dir) * f.len * 0.5 * per, y: f.y + Math.sin(f.dir) * f.len * 0.5 * per * sq };
  }

  private headRing(f: Fish, size: number, delay = 0) {
    const h = this.head(f), { per } = this.persp(f.y);
    this.pond?.ring(h.x, h.y, f.len * per * size, 2.4, delay);
  }

  update(dt: number, pond: FishPond) {
    this.pond = pond;
    this.t = pond.t;
    const g = this.g, c = pond.cursor, t = this.t;
    const onWater = c.on && c.y > g.waterLine(c.x) + 14;
    // A cursor sweeping fast over the water scares off whatever is close by.
    if (onWater && c.speed > 700) this.startle(c.x, c.y, 170);
    const calm = onWater && c.speed < 140;

    for (const f of this.fish) {
      const { per, sq } = this.persp(f.y);
      if (f.mode === 'flee' && t > f.until) f.mode = 'wander';
      // Hold still over the water and the fish come to see, the bold ones first.
      if (f.mode !== 'flee') {
        const come = calm && c.still > 0.35 + f.bold * 2.4 && this.dist(f, c.x, c.y) < 900;
        if (come && f.mode !== 'curious') { f.mode = 'curious'; f.goal = null; }
        if (!come && f.mode === 'curious') { f.mode = 'wander'; f.rethink = t + 0.5 + Math.random() * 2; f.near = 0; }
      }

      let want = 45, rate = 1.6;
      if (f.mode === 'curious') {
        // Circle slowly beneath the cursor, each at its own place in the ring.
        const cp = this.persp(c.y), R = 30 + f.len * 0.5, a = t * 0.45 + f.slot;
        f.tx = c.x + Math.cos(a) * R * cp.per;
        f.ty = c.y + Math.sin(a) * R * cp.per * cp.sq;
        const d = this.dist(f, f.tx, f.ty);
        // Hurry over from far off, then slow to a drift beneath it.
        want = clamp(d * 0.9, 18, 190);
        rate = 2.6;
        if (this.dist(f, c.x, c.y) < R * 1.7) f.near += dt;
        // Now and then one that has been circling a while rises and kisses the surface.
        if (f.near > 1.8 && Math.random() < dt * 0.4) {
          f.rise = 1;
          f.near = 0;
          this.headRing(f, 0.55);
          this.headRing(f, 0.35, 0.26);
        }
      } else if (f.mode === 'flee') {
        want = 30;
        rate = 7;
      } else {
        // Wandering: drift toward somewhere, now and then toward a petal to take or a lily to nose at.
        if (t > f.rethink || (f.goal && f.goal.kind === 'petal' && f.goal.ref.landed >= 30)) this.choose(f, pond);
        if (f.goal) {
          f.tx = f.goal.ref.x;
          f.ty = f.goal.ref.y;
          want = 55;
          const reach = f.goal.kind === 'lily' ? f.goal.ref.w * 0.35 : 8;
          if (this.dist(this.headFish(f), f.tx, f.ty) < reach + 6) this.arrive(f);
        } else if (this.dist(f, f.tx, f.ty) < 20) {
          // There: rest a moment before moving on.
          want = 0;
          if (t > f.rethink) this.choose(f, pond);
        }
      }

      // Steer on the water's plane, ease toward the speed it wants, and swim.
      f.dir = turn(f.dir, Math.atan2((f.ty - f.y) / sq, f.tx - f.x), rate * dt);
      f.v += (want - f.v) * Math.min(1, dt * (f.mode === 'flee' ? 1.2 : 1.6));
      f.x += Math.cos(f.dir) * f.v * per * dt;
      f.y += Math.sin(f.dir) * f.v * per * sq * dt;
      // Keep to the open water.
      const top = g.waterLine(f.x) + 22;
      if (f.x < 50 || f.x > W - 50 || f.y < top || f.y > H - 22) {
        f.x = clamp(f.x, 50, W - 50);
        f.y = clamp(f.y, top, H - 22);
        const p = this.spot();
        f.tx = p.x;
        f.ty = p.y;
        f.goal = null;
      }
      f.swim += dt * (2.5 + f.v / 22);
      f.rise = Math.max(0, f.rise - dt * 0.45);
      f.hide += ((this.underPad(f.x, f.y) ? 1 : 0) - f.hide) * Math.min(1, dt * 3);
    }
  }

  /** The fish as if it were at its mouth: goals are reached with the mouth, not the middle. */
  private headFish(f: Fish): Fish {
    return { ...f, ...this.head(f) };
  }

  private choose(f: Fish, pond: FishPond) {
    f.rethink = this.t + 3 + Math.random() * 6;
    f.goal = null;
    const r = Math.random();
    if (r < 0.45) {
      // The nearest petal settled on the water, if any is near enough to notice.
      let best: FishPond['petals'][number] | null = null, bd = 520;
      for (const p of pond.petals) {
        if (!p.landed || p.landed > 26 || p.y < this.g.waterLine(p.x) + 22) continue;
        const d = this.dist(f, p.x, p.y);
        if (d < bd) { bd = d; best = p; }
      }
      if (best) { f.goal = { kind: 'petal', ref: best }; return; }
    }
    if (r < 0.75 && pond.planted.length) {
      f.goal = { kind: 'lily', ref: pond.planted[Math.floor(Math.random() * pond.planted.length)] };
      return;
    }
    const p = this.spot();
    f.tx = p.x;
    f.ty = p.y;
  }

  private arrive(f: Fish) {
    const goal = f.goal!;
    if (goal.kind === 'petal') goal.ref.landed = 30;
    else goal.ref.nudge = this.t;
    f.rise = Math.max(f.rise, 0.7);
    this.headRing(f, goal.kind === 'lily' ? 0.45 : 0.3);
    f.goal = null;
    f.rethink = this.t + 1 + Math.random() * 2;
    const p = this.spot();
    f.tx = p.x;
    f.ty = p.y;
  }

  /** Draw in painting units, over the moving picture and under the bridge. */
  draw(ctx: CanvasRenderingContext2D) {
    // Far fish first, so the nearer swim over them.
    for (const f of [...this.fish].sort((a, b) => a.y - b.y)) this.drawFish(ctx, f);
  }

  private drawFish(ctx: CanvasRenderingContext2D, f: Fish) {
    const { per, sq, d } = this.persp(f.y), L = f.len;
    // Under the water they are dim and soft; rising, they come up clearer; under a pad, nearly gone.
    const a = clamp((0.66 + 0.25 * f.rise) * lerp(0.6, 1, d) * (1 - 0.55 * f.hide), 0, 0.9);
    if (a < 0.02) return;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.scale(per, per * sq);
    ctx.rotate(f.dir);

    // The spine, head (+x) to tail, bending in a wave that runs back along the body.
    const N = 10, flex = clamp(0.45 + f.v / 110, 0.45, 1.6), top: [number, number][] = [], bot: [number, number][] = [];
    let tail: [number, number, number] = [0, 0, 0];
    for (let i = 0; i < N; i++) {
      const s = i / (N - 1), x = L * (0.5 - s * 0.86), y = Math.sin(f.swim - s * 4.2) * L * 0.075 * Math.pow(s, 1.4) * flex;
      const w = L * 0.16 * Math.pow(Math.sin(Math.PI * Math.min(0.999, 0.12 + s * 0.88)), 0.75) * (1 - 0.55 * s);
      const y2 = Math.sin(f.swim - (s + 0.05) * 4.2) * L * 0.075 * Math.pow(s + 0.05, 1.4) * flex, ang = Math.atan2(y2 - y, -L * 0.043);
      top.push([x - Math.sin(ang) * w, y + Math.cos(ang) * w]);
      bot.push([x + Math.sin(ang) * w, y - Math.cos(ang) * w]);
      if (i === N - 1) tail = [x, y, ang];
    }
    const body = () => {
      ctx.beginPath();
      ctx.moveTo(top[0][0], top[0][1]);
      for (const p of top) ctx.lineTo(p[0], p[1]);
      // The tail fin: two lobes swept back from the end of the spine.
      const [tx, ty, ta] = tail, ca = Math.cos(ta), sa = Math.sin(ta), fl = L * 0.2, fw = L * 0.13;
      ctx.lineTo(tx + ca * fl - sa * fw, ty + sa * fl + ca * fw);
      ctx.lineTo(tx + ca * fl * 0.55, ty + sa * fl * 0.55);
      ctx.lineTo(tx + ca * fl + sa * fw, ty + sa * fl - ca * fw);
      for (let i = bot.length - 1; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]);
      ctx.closePath();
    };

    // A soft halo of the same colour first, so the edges read as seen through water, then the body.
    ctx.lineJoin = 'round';
    body();
    ctx.strokeStyle = css(f.col, a * 0.35);
    ctx.lineWidth = L * 0.1;
    ctx.stroke();
    ctx.fillStyle = css(f.col, a);
    ctx.fill();
    // Two little fins behind the head.
    ctx.fillStyle = css(f.col, a * 0.7);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(L * 0.22, side * L * 0.14, L * 0.07, L * 0.035, side * (0.7 + Math.sin(f.swim * 1.3) * 0.25), 0, Math.PI * 2);
      ctx.fill();
    }
    // A touch of light along the back, as a brushstroke would catch it.
    ctx.strokeStyle = css(lighten(f.col, 0.35), a * 0.55);
    ctx.lineWidth = L * 0.035;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(top[1][0] * 0.5 + bot[1][0] * 0.5, (top[1][1] + bot[1][1]) / 2);
    for (let i = 2; i < 6; i++) ctx.lineTo((top[i][0] + bot[i][0]) / 2, (top[i][1] + bot[i][1]) / 2);
    ctx.stroke();
    ctx.restore();
  }
}
