// Hands painting jobs (easel tiles, drift cards) to a pool of workers and keeps the latest image of
// each. Falls back to painting on the page when workers or OffscreenCanvas aren't available.
import { Garden } from '../world/garden';
import type { SeriesName } from '../world/series';
import { paintCard } from './cards';
import { paintTile } from './tiles';
import PaintWorker from './worker?worker&inline';
import type { FromWorker, Job, ToWorker } from './worker';

export interface Painted {
  image: HTMLCanvasElement | null;
  progress: number;
  done: boolean;
}

interface Slot { worker: Worker | null; busy: string | null; }

export class PaintPool {
  private images = new Map<string, Painted>();
  private slots: Slot[] = [];
  private local: Garden | null = null;
  private disposed = false;

  constructor(readonly seed: string, private onChange: (id: string) => void, readonly light: SeriesName | null = null) {
    const canWork = typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined';
    // A few workers paint in parallel; more would starve the page's own rendering on smaller machines.
    // A phone gets fewer: its cores are slower and share a thermal budget with the page.
    const cores = navigator.hardwareConcurrency || 2, phone = matchMedia('(pointer: coarse)').matches;
    const n = canWork ? Math.max(1, Math.min(phone && cores <= 6 ? 2 : 3, cores - 2)) : 0;
    for (let i = 0; i < n; i++) {
      try {
        const worker = new PaintWorker();
        const slot: Slot = { worker, busy: null };
        worker.onmessage = (e: MessageEvent<FromWorker>) => this.receive(slot, e.data);
        worker.onerror = () => this.fallBack();
        this.send(slot, { type: 'init', seed, light });
        this.slots.push(slot);
      } catch {
        break;
      }
    }
    if (!this.slots.length) this.fallBack();
  }

  get(id: string): Painted | undefined {
    return this.images.get(id);
  }

  /** Make sure the wanted jobs (in priority order) are painting or painted. */
  request(wanted: [string, Job][]) {
    let k = 0;
    for (const slot of this.slots) {
      if (slot.busy !== null) continue;
      while (k < wanted.length && this.images.has(wanted[k][0])) k++;
      if (k >= wanted.length) return;
      const [id, job] = wanted[k++];
      this.images.set(id, { image: null, progress: 0, done: false });
      slot.busy = id;
      if (slot.worker) this.send(slot, { type: 'job', id, job });
      else this.paintHere(slot, id, job);
    }
  }

  /** Free images that aren't wanted any more and aren't being painted. */
  evict(keep: (id: string) => boolean) {
    const busy = new Set(this.slots.map((s) => s.busy));
    for (const [id, im] of this.images) {
      if (keep(id) || busy.has(id)) continue;
      if (im.image) im.image.width = im.image.height = 0;
      this.images.delete(id);
    }
  }

  get idle() {
    return this.slots.every((s) => s.busy === null);
  }

  dispose() {
    this.disposed = true;
    for (const s of this.slots) s.worker?.terminate();
    this.evict(() => false);
  }

  private send(slot: Slot, msg: ToWorker) {
    slot.worker!.postMessage(msg);
  }

  private receive(slot: Slot, msg: FromWorker) {
    if (this.disposed) {
      if (msg.type === 'frame') msg.bitmap.close();
      return;
    }
    if (msg.type === 'error') {
      console.warn(`${msg.id} failed in worker:`, msg.message);
      this.images.delete(msg.id);
      slot.busy = null;
      return;
    }
    // Copy the bitmap into a plain canvas once. Redrawing worker bitmaps every frame is unreliable
    // in some Chrome compositing paths, while page canvases are always safe to draw.
    const image = this.images.get(msg.id)?.image ?? document.createElement('canvas');
    if (image.width !== msg.bitmap.width || image.height !== msg.bitmap.height) {
      image.width = msg.bitmap.width;
      image.height = msg.bitmap.height;
    }
    const ctx = image.getContext('2d')!;
    ctx.clearRect(0, 0, image.width, image.height);
    ctx.drawImage(msg.bitmap, 0, 0);
    msg.bitmap.close();
    this.images.set(msg.id, { image, progress: msg.progress, done: msg.done });
    if (msg.done) slot.busy = null;
    this.onChange(msg.id);
  }

  /** Replace workers with a main-thread painting slot. */
  private fallBack() {
    if (this.local) return;
    for (const s of this.slots) s.worker?.terminate();
    for (const s of this.slots) if (s.busy !== null) this.images.delete(s.busy);
    this.local = new Garden(this.seed, this.light);
    this.slots = [{ worker: null, busy: null }];
  }

  private paintHere(slot: Slot, id: string, job: Job) {
    const finish = (image: HTMLCanvasElement, progress: number, done: boolean) => {
      if (this.disposed) return;
      this.images.set(id, { image, progress, done });
      if (done) slot.busy = null;
      this.onChange(id);
    };
    if (job.type === 'tile') {
      paintTile(this.local!, job.t, job.scale, (c, progress, done) => finish(c as unknown as HTMLCanvasElement, progress, done), 6, 0, 10);
    } else {
      // Defer so a burst of card requests doesn't block the frame that asked for them.
      setTimeout(() => finish(paintCard(this.local!, job.kind, job.variant, job.ppm) as unknown as HTMLCanvasElement, 1, true), 0);
    }
  }
}
