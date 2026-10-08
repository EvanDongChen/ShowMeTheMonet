// The drift's ambience, made of noise and a few sine chirps rather than recordings: water lapping
// under the boat, wind working through the leaves, birds calling from somewhere in the garden, now
// and then a fish, and a splash with each stroke of the oars. Quiet by design, and never asked for
// until the person steps into the boat (browsers won't start audio before then anyway).
import type { Boat } from '../drift/camera';

export class Ambience {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private water: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private strokes = 0;
  private birdAt = 0;
  private plopAt = 0;
  private stopTimer = 0;
  muted = false;

  private static LEVEL = 0.5;

  /** Begin (or resume) the ambience. Call from a click or key press. */
  start() {
    clearTimeout(this.stopTimer);
    try {
      if (!this.ctx) this.build();
      void this.ctx?.resume();
      this.fade();
    } catch {
      // No audio, or blocked: the garden is silent, which is fine.
    }
  }

  /** Fade out and let the audio device rest. */
  stop() {
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
    clearTimeout(this.stopTimer);
    this.stopTimer = window.setTimeout(() => void this.ctx?.suspend(), 1200);
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.fade();
  }

  private fade() {
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : Ambience.LEVEL, this.ctx.currentTime, 0.4);
  }

  private build() {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor(), master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    this.ctx = ctx;
    this.master = master;

    // Soft, brownish noise to build everything from.
    const len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    this.noise = buf;

    // Water: a low, rolling wash that swells slowly.
    const water = ctx.createGain();
    water.gain.value = 0.32;
    this.water = water;
    const wsrc = this.loop(ctx, buf), wlp = ctx.createBiquadFilter();
    wlp.type = 'lowpass';
    wlp.frequency.value = 560;
    wsrc.connect(wlp).connect(water).connect(master);
    this.lfo(ctx, 0.13, 0.1, water.gain);

    // Leaves: a high, breathy rustle that comes and goes with the wind.
    const leaves = ctx.createGain();
    leaves.gain.value = 0.05;
    const lsrc = this.loop(ctx, buf), lbp = ctx.createBiquadFilter();
    lbp.type = 'bandpass';
    lbp.frequency.value = 2600;
    lbp.Q.value = 0.6;
    lsrc.connect(lbp).connect(leaves).connect(master);
    this.lfo(ctx, 0.07, 0.04, leaves.gain);
  }

  private loop(ctx: AudioContext, buf: AudioBuffer) {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = Math.random() * 1.5;
    src.start();
    return src;
  }

  private lfo(ctx: AudioContext, hz: number, depth: number, target: AudioParam) {
    const osc = ctx.createOscillator(), amp = ctx.createGain();
    osc.frequency.value = hz;
    amp.gain.value = depth;
    osc.connect(amp).connect(target);
    osc.start();
  }

  update(dt: number, boat: Boat) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.muted || !this.noise || !this.water) return;
    const now = ctx.currentTime;
    // The faster we move, the more the water talks.
    this.water.gain.setTargetAtTime(0.28 + 0.14 * Math.min(Math.abs(boat.v), 3) / 3, now, 0.6);
    if (boat.strokes !== this.strokes) {
      this.strokes = boat.strokes;
      this.splash(now);
    }
    if (now > this.birdAt) {
      this.birdAt = now + 2.5 + Math.random() * 7;
      this.chirp(now);
    }
    if (now > this.plopAt) {
      this.plopAt = now + 6 + Math.random() * 9;
      this.plop(now);
    }
    void dt;
  }

  private pan(ctx: AudioContext) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.random() * 1.6 - 0.8;
    p.connect(this.master!);
    return p;
  }

  /** An oar leaving the water: a short, bright burst of noise. */
  private splash(now: number) {
    const ctx = this.ctx!, src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.noise;
    bp.type = 'bandpass';
    bp.frequency.value = 1300;
    bp.Q.value = 0.7;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.5, now + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    src.connect(bp).connect(g).connect(this.pan(ctx));
    src.start(now, Math.random() * 2, 0.6);
  }

  /** A few quick, rising or falling notes, from somewhere off in the trees. */
  private chirp(now: number) {
    const ctx = this.ctx!, out = this.pan(ctx), base = 2400 + Math.random() * 2400, notes = 2 + Math.floor(Math.random() * 4);
    let at = now + 0.02;
    for (let i = 0; i < notes; i++) {
      const osc = ctx.createOscillator(), g = ctx.createGain(), len = 0.05 + Math.random() * 0.08, up = Math.random() < 0.6;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(base * (1 + (i % 2) * 0.12), at);
      osc.frequency.exponentialRampToValueAtTime(base * (up ? 1.35 : 0.8), at + len);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.05, at + len * 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, at + len);
      osc.connect(g).connect(out);
      osc.start(at);
      osc.stop(at + len + 0.02);
      at += len + 0.04 + Math.random() * 0.06;
    }
  }

  /** A fish rising, a small round drop of sound. */
  private plop(now: number) {
    const ctx = this.ctx!, osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(620, now + 0.09);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.12, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    osc.connect(g).connect(this.pan(ctx));
    osc.start(now);
    osc.stop(now + 0.2);
  }
}
