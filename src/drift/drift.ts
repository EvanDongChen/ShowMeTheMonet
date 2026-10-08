// The drift mode: owns the river, the boat, the renderer and the controls, and asks the paint pool
// for cards as they come into view.
import { DriftLife } from '../anim/drift-life';
import type { PaintPool } from '../paint/pool';
import { CARDS, type CardKind } from '../paint/cards';
import type { Job } from '../paint/worker';
import type { Garden } from '../world/garden';
import { Boat, type Controls } from './camera';
import { DriftRenderer } from './render';
import { River } from './river';

export class Drift {
  readonly river: River;
  readonly boat: Boat;
  readonly life: DriftLife;
  private renderer: DriftRenderer;
  private keys = new Set<string>();
  private pointer = { look: 0, steer: 0, row: 0, pitch: 0 };
  paused = false;

  constructor(readonly g: Garden, private pool: PaintPool) {
    this.river = new River(g);
    this.boat = new Boat(this.river, 0);
    this.life = new DriftLife(g);
    this.renderer = new DriftRenderer(g, this.river, (id) => {
      const im = pool.get(id);
      return im?.done ? im.image : null;
    });
  }

  /** Metres rowed so far. */
  get distance() {
    return Math.max(0, this.boat.z);
  }

  get reach() {
    return River.reachOf(this.boat.z);
  }

  /** Ask the pool for the cards in view, nearest first. */
  request() {
    const jobs: [string, Job][] = this.renderer.wanted(this.boat).map((id) => {
      const [, kind, variant] = id.split(':');
      return [id, { type: 'card', kind: kind as CardKind, variant: +variant, ppm: CARDS[kind as CardKind].ppm }];
    });
    this.pool.request(jobs);
  }

  controls(): Controls {
    const k = this.keys, has = (...c: string[]) => c.some((x) => k.has(x));
    const row = (has('KeyW', 'ArrowUp') ? 1 : 0) - (has('KeyS', 'ArrowDown') ? 1 : 0) || this.pointer.row;
    const steer = (has('KeyD', 'ArrowRight') ? 1 : 0) - (has('KeyA', 'ArrowLeft') ? 1 : 0) || this.pointer.steer;
    return { row, steer, look: this.pointer.look, pitch: this.pointer.pitch };
  }

  update(dt: number) {
    if (this.paused) return;
    this.boat.drifting = true;
    this.boat.update(dt, this.controls());
    this.life.update(dt, this.boat);
    this.river.prune(this.reach);
  }

  draw(ctx: CanvasRenderingContext2D, t: number, w: number, h: number) {
    this.renderer.draw(ctx, this.boat, t, w, h, (v) => this.life.draw(ctx, v, t), (c, v) => this.life.drawSky(c, v, t));
  }

  key(code: string, down: boolean) {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  clearKeys() {
    this.keys.clear();
    this.pointer.row = this.pointer.steer = 0;
  }

  /** Pointer position over the view, -1..1 on each axis: the eye follows it (up looks up). */
  look(nx: number, ny = 0) {
    this.pointer.look = Math.max(-1, Math.min(1, nx));
    this.pointer.pitch = Math.max(-1, Math.min(1, -ny));
  }

  /** Touch: hold to row, drag sideways to steer. */
  touch(row: number, steer: number) {
    this.pointer.row = row;
    this.pointer.steer = Math.max(-1, Math.min(1, steer));
  }
}
