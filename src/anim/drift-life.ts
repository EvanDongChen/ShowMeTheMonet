// Life around the boat: rings from the oars, the bow and now and then a rising fish, pollen hanging in
// the light, petals afloat, dragonflies and butterflies, and birds crossing the sky. Drawn over the
// drift's cards (the birds, behind them); never changes what a seed paints.
import { css, lighten, mix, type RGB } from '../core/color';
import type { Boat } from '../drift/camera';
import type { View } from '../drift/render';
import type { Garden } from '../world/garden';

interface Ring { x: number; z: number; r: number; age: number; life: number; }
interface Mote { x: number; y: number; z: number; ph: number; }
interface Petal { x: number; z: number; col: RGB; rot: number; }
interface Fly { x: number; y: number; z: number; vx: number; vy: number; vz: number; ph: number; butter: boolean; side: number; col: RGB; }
interface Bird { az: number; el: number; speed: number; ph: number; size: number; }

export class DriftLife {
  private rings: Ring[] = [];
  private motes: Mote[] = [];
  private petals: Petal[] = [];
  private flies: Fly[] = [];
  private birds: Bird[] = [];
  private riseIn = 2;
  private strokes = 0;
  private wake = 0;
  quality = 1;
  /** How far into dusk the view is (0..1): the pollen turns to fireflies. */
  private dusk = 0;

  constructor(private g: Garden) {}

  update(dt: number, boat: Boat) {
    if (boat.strokes !== this.strokes) {
      this.strokes = boat.strokes;
      // Two oars dip either side of the seat.
      for (const side of [-1, 1]) {
        const ox = Math.cos(boat.yaw) * side * 1.3, oz = -Math.sin(boat.yaw) * side * 1.3;
        this.rings.push({ x: boat.x + ox + Math.sin(boat.yaw) * 2.2, z: boat.z + oz + Math.cos(boat.yaw) * 2.2, r: 0.05, age: 0, life: 2.6 });
      }
    }
    this.wake += dt * Math.abs(boat.v);
    if (this.wake > 1.4) {
      this.wake = 0;
      const ahead = 4 + Math.random() * 3;
      const side = (Math.random() - 0.5) * 3;
      this.rings.push({ x: boat.x + Math.sin(boat.yaw) * ahead + Math.cos(boat.yaw) * side, z: boat.z + Math.cos(boat.yaw) * ahead, r: 0.05, age: 0, life: 2.4 });
    }
    // Now and then a fish rises somewhere ahead and leaves a pair of rings.
    this.riseIn -= dt;
    if (this.riseIn <= 0) {
      this.riseIn = 3 + Math.random() * 6;
      const d = 6 + Math.random() * 14, side = (Math.random() - 0.5) * 8;
      const x = boat.x + Math.sin(boat.yaw) * d + Math.cos(boat.yaw) * side, z = boat.z + Math.cos(boat.yaw) * d - Math.sin(boat.yaw) * side;
      this.rings.push({ x, z, r: 0.05, age: 0, life: 3.4 }, { x, z, r: 0.05, age: -0.45, life: 3 });
    }
    for (const r of this.rings) {
      r.age += dt;
      r.r += dt * Math.max(0.05, 0.32 - r.age * 0.08);
    }
    this.rings = this.rings.filter((r) => r.age < r.life);
    if (!this.birds.length) {
      // Two loose flocks crossing the sky, in the direction we're facing to begin with.
      for (let g = 0; g < 2; g++) {
        const az = boat.yaw + (Math.random() - 0.5) * 1.6, el = 0.2 + Math.random() * 0.14, speed = (g ? -1 : 1) * (0.02 + Math.random() * 0.02);
        for (let i = 0; i < 3 + g; i++) this.birds.push({ az: az + (Math.random() - 0.5) * 0.12, el: el + (Math.random() - 0.5) * 0.04, speed, ph: Math.random() * 10, size: 6 + Math.random() * 6 });
      }
    }
    for (const b of this.birds) b.az += b.speed * dt;

    // Motes and petals live in a box that travels with the boat; whatever falls out re-enters ahead.
    const nMotes = Math.round(70 * this.quality * (1 + this.dusk * 0.8)), nPetals = Math.round(30 * this.quality);
    while (this.motes.length < nMotes) this.motes.push(this.mote(boat, true));
    this.motes.length = nMotes;
    for (const m of this.motes) {
      m.ph += dt;
      m.x += Math.sin(m.ph * 0.7) * dt * 0.15;
      m.y += Math.sin(m.ph * 0.5 + 1) * dt * 0.08;
      if (Math.abs(m.z - boat.z - 9) > 10 || Math.abs(m.x - boat.x) > 9) Object.assign(m, this.mote(boat, false));
    }
    while (this.petals.length < nPetals) this.petals.push(this.petal(boat, true));
    this.petals.length = nPetals;
    for (const p of this.petals) {
      p.rot += dt * 0.1;
      if (p.z < boat.z - 1 || p.z > boat.z + 40) Object.assign(p, this.petal(boat, false));
    }

    const s = this.g.series;
    // Two dragonflies that dart about, and three butterflies that flutter along the banks.
    while (this.flies.length < 5) {
      const n = this.flies.length, butter = n >= 2;
      this.flies.push({
        x: boat.x, y: butter ? 0.9 : 1, z: boat.z + 6 + n, vx: 0, vy: 0, vz: 0, ph: Math.random() * 10, butter,
        side: n % 2 ? 1 : -1, col: butter ? [s.flower[0], s.accent[3], s.flower[1]][n - 2] : [40, 70, 90],
      });
    }
    for (const f of this.flies) {
      f.ph += dt;
      // Dart, hover, dart: a new heading every second or so, held near the boat (butterflies: a
      // lazier flutter, kept out over the shallows to one side).
      if (Math.random() < dt * (f.butter ? 1.6 : 0.9)) {
        const calm = f.butter ? 0.35 : 1, mid = f.butter ? boat.x + f.side * 3.5 : boat.x;
        f.vx = ((Math.random() - 0.5) * 5 + (mid - f.x) * 0.3) * calm;
        f.vy = ((Math.random() - 0.5) * 1.2 + ((f.butter ? 0.8 : 1.1) - f.y) * 0.8) * (f.butter ? 1.4 : 1);
        f.vz = ((Math.random() - 0.3) * 5 + (boat.z + 5 - f.z) * 0.3) * calm + boat.v;
      }
      const damp = Math.exp(-2.5 * dt);
      f.vx *= damp; f.vy *= damp; f.vz = boat.v + (f.vz - boat.v) * damp;
      f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
    }
  }

  private mote(boat: Boat, anywhere: boolean): Mote {
    const ahead = Math.cos(boat.yaw), side = Math.sin(boat.yaw), d = anywhere ? 1 + Math.random() * 18 : 15 + Math.random() * 4;
    return { x: boat.x + side * d + (Math.random() - 0.5) * 14, y: 0.2 + Math.random() * 3, z: boat.z + ahead * d, ph: Math.random() * 10 };
  }

  private petal(boat: Boat, anywhere: boolean): Petal {
    const d = anywhere ? 2 + Math.random() * 36 : 30 + Math.random() * 10;
    const s = this.g.series;
    return { x: boat.x + Math.sin(boat.yaw) * d + (Math.random() - 0.5) * 9, z: boat.z + Math.cos(boat.yaw) * d, col: s.flower[1 + Math.floor(Math.random() * 2)], rot: Math.random() * 6 };
  }

  /** Birds, drawn before the cards so the trees can stand in front of them. */
  drawSky(ctx: CanvasRenderingContext2D, v: View, t: number) {
    const yaw = Math.atan2(v.sin, v.cos), k = v.w / 1280;
    ctx.lineCap = 'round';
    ctx.strokeStyle = css([62, 66, 90], 0.7);
    for (const b of this.birds) {
      let da = b.az - yaw;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) > 1.1) continue;
      const sx = v.w / 2 + Math.tan(da) * v.f, sy = v.hy - Math.tan(b.el + Math.sin(t * 0.4 + b.ph) * 0.008) * v.f;
      if (sy < 0 || sy > v.hy) continue;
      const span = b.size * k, flap = Math.sin(t * 5 + b.ph);
      ctx.lineWidth = Math.max(1.2, span * 0.13);
      ctx.beginPath();
      ctx.moveTo(sx - span, sy + flap * span * 0.5);
      ctx.quadraticCurveTo(sx - span * 0.4, sy - span * 0.25 - flap * span * 0.2, sx, sy);
      ctx.quadraticCurveTo(sx + span * 0.4, sy - span * 0.25 - flap * span * 0.2, sx + span, sy + flap * span * 0.5);
      ctx.stroke();
    }
  }

  draw(ctx: CanvasRenderingContext2D, v: View, t: number) {
    this.dusk = v.dusk;
    const proj = (x: number, y: number, z: number) => {
      const dx = x - v.x, dz = z - v.z, zr = dx * v.sin + dz * v.cos;
      if (zr < 0.4) return null;
      const sc = v.f / zr;
      return { sx: v.w / 2 + (dx * v.cos - dz * v.sin) * sc, sy: v.hy + (v.eye - y) * sc, sc, zr };
    };
    const s = this.g.series;

    ctx.lineWidth = 1;
    for (const r of this.rings) {
      if (r.age < 0) continue;
      const p = proj(r.x, 0, r.z);
      if (!p || p.zr < 1.8) continue;
      const a = (1 - r.age / r.life) * 0.4;
      ctx.strokeStyle = css(lighten(s.glint[1], 0.2), a);
      ctx.lineWidth = Math.max(1, p.sc * 0.025);
      ctx.beginPath();
      ctx.ellipse(p.sx, p.sy, r.r * p.sc, r.r * p.sc * (v.eye / p.zr), 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const pe of this.petals) {
      const p = proj(pe.x, 0, pe.z);
      if (!p || p.sx < -20 || p.sx > v.w + 20) continue;
      const w = Math.min(9, Math.max(1, 0.07 * p.sc));
      ctx.fillStyle = css(pe.col, 0.85);
      ctx.beginPath();
      ctx.ellipse(p.sx, p.sy, w, w * (v.eye / p.zr) + 0.5, pe.rot, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = 'lighter';
    for (const m of this.motes) {
      const p = proj(m.x, m.y, m.z);
      if (!p || p.sx < 0 || p.sx > v.w || p.sy < 0 || p.sy > v.h) continue;
      const tw = 0.5 + 0.5 * Math.sin(t * 2 + m.ph * 3), r = Math.min(2.6, Math.max(0.8, 0.012 * p.sc)) * (1 + v.dusk * 0.9);
      ctx.fillStyle = css(mix(s.glint[2], [255, 226, 120], v.dusk), (0.25 + 0.35 * tw) * (1 + v.dusk * 1.2));
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    for (const f of this.flies) {
      const p = proj(f.x, f.y, f.z);
      if (!p) continue;
      if (f.butter) {
        // Wings that open and close, seen from behind.
        const size = Math.min(26, Math.max(3, 0.2 * p.sc)), open = 0.25 + 0.75 * Math.abs(Math.sin(t * 8 + f.ph * 3));
        ctx.fillStyle = css(f.col, 0.92);
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.ellipse(p.sx + side * size * 0.3 * open, p.sy - size * 0.1, size * 0.32 * open, size * 0.42, side * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = css([60, 50, 50], 0.8);
        ctx.fillRect(p.sx - size * 0.04, p.sy - size * 0.25, Math.max(1, size * 0.08), size * 0.4);
        continue;
      }
      const len = Math.max(3, 0.09 * p.sc), flap = Math.sin(t * 60 + f.ph) * 0.3;
      ctx.strokeStyle = css([40, 70, 90], 0.9);
      ctx.lineWidth = Math.max(1, len * 0.12);
      ctx.beginPath();
      ctx.moveTo(p.sx - len / 2, p.sy);
      ctx.lineTo(p.sx + len / 2, p.sy);
      ctx.stroke();
      ctx.fillStyle = css([220, 235, 240], 0.45);
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(p.sx + len * 0.1, p.sy - len * 0.15 * side * (1 + flap), len * 0.35, len * 0.1, side * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
