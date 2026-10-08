// A painting worker: paints easel tiles and drift cards off the main thread and sends them back as
// bitmaps.
import { Garden } from '../world/garden';
import type { SeriesName } from '../world/series';
import { paintCard, type CardKind } from './cards';
import { paintTile, type TileLayer } from './tiles';

export type Job = { type: 'tile'; t: number; scale: number; layer?: TileLayer } | { type: 'card'; kind: CardKind; variant: number; ppm: number };

export type ToWorker = { type: 'init'; seed: string; light: SeriesName | null } | { type: 'job'; id: string; job: Job };
export type FromWorker =
  | { type: 'frame'; id: string; bitmap: ImageBitmap; progress: number; done: boolean }
  | { type: 'error'; id: string; message: string };

let garden: Garden | null = null;

const post = (msg: FromWorker, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer);

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  if (m.type === 'init') {
    garden = new Garden(m.seed, m.light);
    return;
  }
  if (!garden) return;
  const { id, job } = m;
  try {
    if (job.type === 'tile') {
      await paintTile(garden, job.t, job.scale, async (canvas, progress, done) => {
        const bitmap = done ? (canvas as OffscreenCanvas).transferToImageBitmap() : await createImageBitmap(canvas as OffscreenCanvas);
        post({ type: 'frame', id, bitmap, progress, done }, [bitmap]);
      }, 14, 160, 3, job.layer);
    } else {
      const canvas = paintCard(garden, job.kind, job.variant, job.ppm) as OffscreenCanvas;
      const bitmap = canvas.transferToImageBitmap();
      post({ type: 'frame', id, bitmap, progress: 1, done: true }, [bitmap]);
    }
  } catch (err) {
    post({ type: 'error', id, message: String(err) });
  }
};
