// "Touch the paint": switched on, the finished painting turns into wet oil. Dragging a finger (or a
// mouse) through it carries a load of paint along: the brush picks up what is under it, drags it on,
// and slowly mixes it with whatever it passes over, so strokes smear into streaks that fade into new
// colours. The drag is raked with bristle marks that let the paint beneath show through, and turned a
// little by a noise field, which is what makes it swirl.
//
// This only ever works on the picture canvas of the page, only while it is on, and it keeps the
// painting as it was, so switching it off puts everything back. It never changes what a seed paints,
// so it is free to use Math.random().

/** How much of the carried paint survives each touch: the rest is replaced by what is underneath. */
const CARRY = 0.88;

export class Flow {
  /** The painting as it was when the mode was switched on. */
  private base: HTMLCanvasElement;
  /** What is under the brush, and the shaped paint about to be laid down. */
  private tmp: HTMLCanvasElement;
  /** The paint on the brush. */
  private load: HTMLCanvasElement;
  private mask: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private tctx: CanvasRenderingContext2D;
  private lctx: CanvasRenderingContext2D;
  private loaded = false;
  private t = 0;
  private demoing = 0;
  private demoActive = false;
  /** Brush radius in picture pixels. */
  readonly r: number;

  constructor(private picture: HTMLCanvasElement, private curl: (x: number, y: number, t: number) => number) {
    this.ctx = picture.getContext('2d')!;
    this.r = Math.max(14, Math.round(picture.width * 0.032));
    this.base = document.createElement('canvas');
    this.base.width = picture.width;
    this.base.height = picture.height;
    this.base.getContext('2d')!.drawImage(picture, 0, 0);
    this.tmp = document.createElement('canvas');
    this.tmp.width = this.tmp.height = this.r * 2;
    this.tctx = this.tmp.getContext('2d')!;
    this.load = document.createElement('canvas');
    this.load.width = this.load.height = this.r * 2;
    this.lctx = this.load.getContext('2d')!;
    this.mask = this.makeMask();
  }

  /** A round brush with a soft edge, raked with bristle streaks along its direction of travel (+x). */
  private makeMask() {
    const r = this.r, c = document.createElement('canvas');
    c.width = c.height = r * 2;
    const m = c.getContext('2d')!, g = m.createRadialGradient(r, r, r * 0.15, r, r, r);
    g.addColorStop(0, 'rgba(0, 0, 0, 1)');
    g.addColorStop(0.65, 'rgba(0, 0, 0, 0.85)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    m.fillStyle = g;
    m.fillRect(0, 0, r * 2, r * 2);
    m.globalCompositeOperation = 'destination-out';
    m.lineCap = 'round';
    for (let i = 0; i < 38; i++) {
      const y = Math.random() * r * 2, x0 = Math.random() * r * 0.5, x1 = r * 2 - Math.random() * r * 0.5;
      m.strokeStyle = `rgba(0, 0, 0, ${0.35 + Math.random() * 0.55})`;
      m.lineWidth = 0.8 + Math.random() * 2.8;
      m.beginPath();
      m.moveTo(x0, y);
      m.lineTo(x1, y + (Math.random() - 0.5) * 5);
      m.stroke();
    }
    return c;
  }

  /** Lift the brush: the next touch starts with a clean load of whatever is under it. */
  lift() {
    this.loaded = false;
  }

  /** Drag the paint along the segment from (x0, y0) to (x1, y1), in picture pixels. */
  stroke(x0: number, y0: number, x1: number, y1: number) {
    const dx = x1 - x0, dy = y1 - y0, dist = Math.hypot(dx, dy);
    if (dist < 0.5) return;
    const step = this.r * 0.26, n = Math.min(40, Math.max(1, Math.ceil(dist / step)));
    for (let i = 1; i <= n; i++) this.dab(x0 + (dx * i) / n, y0 + (dy * i) / n, dx, dy);
  }

  private dab(x: number, y: number, dx: number, dy: number) {
    const r = this.r, t = this.tctx, l = this.lctx;
    // What is under the brush...
    t.globalCompositeOperation = 'source-over';
    t.globalAlpha = 1;
    t.clearRect(0, 0, r * 2, r * 2);
    t.drawImage(this.picture, x - r, y - r, r * 2, r * 2, 0, 0, r * 2, r * 2);
    // ...mixes into the paint on the brush (the first touch just loads it)...
    if (!this.loaded) {
      l.globalAlpha = 1;
      l.clearRect(0, 0, r * 2, r * 2);
      l.drawImage(this.tmp, 0, 0);
      this.loaded = true;
    } else {
      l.globalAlpha = 1 - CARRY;
      l.drawImage(this.tmp, 0, 0);
      l.globalAlpha = 1;
    }
    // ...which is shaped by the raked brush, aligned with the way we're moving...
    t.clearRect(0, 0, r * 2, r * 2);
    t.drawImage(this.load, 0, 0);
    t.globalCompositeOperation = 'destination-in';
    t.save();
    t.translate(r, r);
    t.rotate(Math.atan2(dy, dx));
    t.drawImage(this.mask, -r, -r);
    t.restore();
    t.globalCompositeOperation = 'source-over';
    // ...and laid down here, turned a little by the flow, which is what makes the paint swirl.
    const c = this.ctx;
    c.save();
    c.globalAlpha = 0.88;
    c.translate(x, y);
    c.rotate(this.curl(x, y, this.t) * 0.4);
    c.drawImage(this.tmp, -r, -r);
    c.restore();
  }

  /** Advance the slow drift of the flow field. */
  tick(dt: number) {
    this.t += dt;
  }

  /** A first stroke, to show what the paint can do: a long curling sweep through the upper canvas. */
  demo() {
    const w = this.picture.width, h = this.picture.height, start = performance.now(), id = ++this.demoing, dur = 2600;
    let last: [number, number] | null = null;
    this.lift();
    this.demoActive = true;
    const frame = (now: number) => {
      if (id !== this.demoing) return;
      const u = Math.min(1, (now - start) / dur), e = u * u * (3 - 2 * u);
      const x = w * (0.14 + 0.72 * e), y = h * (0.2 + 0.1 * Math.sin(e * 6.5) + 0.12 * e);
      if (last) this.stroke(last[0], last[1], x, y);
      last = [x, y];
      if (u < 1) requestAnimationFrame(frame);
      else this.demoActive = false;
    };
    requestAnimationFrame(frame);
  }

  /** The person has taken over: stop the demonstration. */
  cancelDemo() {
    if (this.demoActive) {
      this.demoActive = false;
      this.lift();
    }
    this.demoing++;
  }

  /** Put the painting back as it was, but stay in the mode. */
  reset() {
    this.cancelDemo();
    this.lift();
    this.ctx.globalAlpha = 1;
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.drawImage(this.base, 0, 0);
  }

  /** Leave the mode, with the painting as it was. */
  stop() {
    this.reset();
  }
}
