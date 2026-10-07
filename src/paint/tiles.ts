// Plans and paints one tile of the easel picture. Runs in a worker or on the page.
import { Rng } from '../core/rng';
import { H, W, type Garden } from '../world/garden';
import { planBridge } from './bridge';
import { planFoliage, planReeds, planVeil, planWash } from './foliage';
import { planLilies } from './lilies';
import type { Op, TilePlan } from './plan';
import { planWater } from './water';

export const COLS = 4, ROWS = 2, TILES = COLS * ROWS;
const PAD = 60;

export type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

/** A 2D canvas that works both in a worker and on the page. */
export function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/**
 * Brush code is written against the page's context type; an offscreen one has the same drawing API.
 * Worker canvases are rasterised on the CPU (willReadFrequently): tens of thousands of dabs sent to
 * the GPU would queue up in front of the page's own frames and make animation stutter.
 */
export function context2d(c: AnyCanvas): CanvasRenderingContext2D {
  return c.getContext('2d', { willReadFrequently: true }) as unknown as CanvasRenderingContext2D;
}

/** Pixel size of the whole picture at a render scale. */
export function picturePixels(scale: number) {
  return { w: Math.round(W * scale), h: Math.round(H * scale) };
}

/** A tile's rectangle in pixels. Edges are rounded once, globally, so neighbours share them exactly. */
export function tileRect(t: number, scale: number) {
  const { w, h } = picturePixels(scale), c = t % COLS, r = Math.floor(t / COLS);
  const px0 = Math.round((c * w) / COLS), px1 = Math.round(((c + 1) * w) / COLS);
  const py0 = Math.round((r * h) / ROWS), py1 = Math.round(((r + 1) * h) / ROWS);
  return { px0, py0, pw: px1 - px0, ph: py1 - py0 };
}

export function planTile(g: Garden, t: number): Op[] {
  const c = t % COLS, r = Math.floor(t / COLS);
  return planRect(g, (c * W) / COLS, (r * H) / ROWS, ((c + 1) * W) / COLS, ((r + 1) * H) / ROWS);
}

/** Plan any rectangle of the picture; a tile is one, the whole canvas is another. */
export function planRect(g: Garden, x0: number, y0: number, x1: number, y1: number): Op[] {
  const p: TilePlan = { g, x0, y0, x1, y1, pad: PAD, items: [] };
  planWash(p);
  planFoliage(p);
  planWater(p);
  planLilies(p);
  planBridge(p);
  planVeil(p);
  planReeds(p);
  p.items.sort((a, b) => a.layer - b.layer || a.key - b.key);
  const ops = p.items.map((i) => i.op);
  ops.push((ctx) => weave(ctx, p));
  return ops;
}

let weaveTile: AnyCanvas | null = null;

/** Canvas-weave texture, anchored to painting coordinates so it runs straight across tiles. */
function weave(ctx: CanvasRenderingContext2D, p: TilePlan) {
  if (!weaveTile) {
    const rng = new Rng(18990);
    weaveTile = makeCanvas(64, 64);
    const tc = context2d(weaveTile), img = tc.createImageData(64, 64);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const v = 128 + ((x & 2) ^ (y & 2) ? 7 : -7) + (rng.random() - 0.5) * 30;
        const i = (y * 64 + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
    }
    tc.putImageData(img, 0, 0);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = ctx.createPattern(weaveTile as CanvasImageSource, 'repeat')!;
  ctx.fillRect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0);
  ctx.restore();
}

/**
 * Paints one tile in time slices, yielding between them. Reports partial images so the picture
 * can be watched as it forms. Shared by the worker and the main-thread fallback.
 */
export async function paintTile(
  g: Garden, t: number, scale: number,
  report: (canvas: AnyCanvas, progress: number, done: boolean) => Promise<void> | void,
  sliceMs = 14, reportEveryMs = 160, restMs = 3,
) {
  const { px0, py0, pw, ph } = tileRect(t, scale);
  // The rasteriser treats a path that crosses the canvas edge a little differently from one that
  // doesn't, which would leave a faint seam. So paint with a margin and keep only the inside.
  const canvas = makeCanvas(pw + MARGIN * 2, ph + MARGIN * 2), ctx = context2d(canvas);
  const out = makeCanvas(pw, ph), octx = context2d(out);
  ctx.setTransform(scale, 0, 0, scale, MARGIN - px0, MARGIN - py0);
  const crop = () => {
    octx.clearRect(0, 0, pw, ph);
    octx.drawImage(canvas as CanvasImageSource, -MARGIN, -MARGIN);
    return out;
  };
  const ops = planTile(g, t);
  let i = 0, last = performance.now();
  while (i < ops.length) {
    const t0 = performance.now();
    while (i < ops.length && performance.now() - t0 < sliceMs) ops[i++](ctx);
    if (i < ops.length && performance.now() - last > reportEveryMs) {
      last = performance.now();
      await report(crop(), i / ops.length, false);
    }
    // A short rest between slices leaves CPU time for the page to keep animating smoothly.
    if (restMs) await new Promise((r) => setTimeout(r, restMs));
  }
  await report(crop(), 1, true);
}

const MARGIN = 6;
