// The page: the easel with its painting, the palette of controls, and the drift behind the canvas.
import './styles.css';
import { Life } from './anim/life';
import { clamp } from './core/math';
import { Drift } from './drift/drift';
import { PaintPool } from './paint/pool';
import { picturePixels, tileRect, TILES } from './paint/tiles';
import type { Job } from './paint/worker';
import { Garden, H, W } from './world/garden';
import { CLASSIC_SEED } from './world/giverny';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const app = $('app');
const picture = $<HTMLCanvasElement>('picture'), pictureCtx = picture.getContext('2d')!;
const lifeCanvas = $<HTMLCanvasElement>('picture-life'), lifeCtx = lifeCanvas.getContext('2d')!;
const driftCanvas = $<HTMLCanvasElement>('drift'), driftCtx = driftCanvas.getContext('2d')!;
const canvasFig = $('canvas'), seedInput = $<HTMLInputElement>('seed');
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

function storage(key: string, value?: string) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {
    // Private windows and blocked storage just forget.
  }
  return null;
}

let seed = params.get('seed') ?? (storage('monet-visited') ? randomSeed() : CLASSIC_SEED);
storage('monet-visited', '1');
let garden: Garden;
let pool: PaintPool;
let life: Life;
let drift: Drift | null = null;
let scale = 1;
let animate = params.get('animate') !== '0' && !reduced;
let mode: 'easel' | 'drift' = 'easel';
let finished = false;

function randomSeed() {
  return String(1 + Math.floor(Math.random() * 99998));
}

// ——— Painting the easel ———

const tileId = (t: number) => `tile:${t}@${scale.toFixed(3)}`;

function tileJobs(): [string, Job][] {
  return Array.from({ length: TILES }, (_, t) => [tileId(t), { type: 'tile', t, scale }] as [string, Job]);
}

function onPainted(id: string) {
  if (!id.startsWith('tile:')) return;
  const [t, at] = id.slice(5).split('@');
  if (at !== scale.toFixed(3)) return;
  const im = pool.get(id), r = tileRect(+t, scale);
  if (im?.image) pictureCtx.drawImage(im.image, r.px0, r.py0);
  progress();
}

function progress() {
  let sum = 0;
  for (let t = 0; t < TILES; t++) sum += pool.get(tileId(t))?.progress ?? 0;
  const p = sum / TILES, state = $('state');
  finished = p >= 0.999;
  canvasFig.classList.toggle('painting', !finished);
  state.textContent = finished
    ? (garden.classic ? 'after Monet, 1899' : `canvas no. ${seed}`)
    : p < 0.25 ? 'laying in the first touches…' : p < 0.6 ? 'working the water…' : p < 0.9 ? 'placing the lilies…' : 'signing it…';
}

/** Fit the canvas on the easel, and repaint it if the size it needs has changed. */
function layout() {
  const small = innerWidth <= 720;
  const maxH = innerHeight * (small ? 0.56 : 0.7), maxW = small ? innerWidth - 28 : Math.min(innerWidth - 400, innerWidth * 0.66);
  const pw = Math.round(Math.min(Math.max(maxW, 260), maxH * (W / H), 1150)), ph = Math.round(pw * (H / W));
  document.documentElement.style.setProperty('--pw', `${pw}px`);
  document.documentElement.style.setProperty('--ph', `${ph}px`);
  const dpr = Math.min(devicePixelRatio || 1, 2);
  // Paint at the size the canvas is shown, in coarse steps so small resizes don't start over.
  const want = clamp(Math.ceil(((pw * dpr) / W) * 4) / 4, 0.5, 2);
  if (want !== scale || picture.width === 0 || !pool) {
    scale = want;
    const px = picturePixels(scale);
    picture.width = px.w;
    picture.height = px.h;
    pictureCtx.fillStyle = '#ebe4d4';
    pictureCtx.fillRect(0, 0, px.w, px.h);
    if (pool) {
      pool.evict((id) => !id.startsWith('tile:'));
      for (let t = 0; t < TILES; t++) onPainted(tileId(t));
    }
  }
  lifeCanvas.width = Math.round(pw * dpr);
  lifeCanvas.height = Math.round(ph * dpr);
  seedInput.style.setProperty('--len', String(seedInput.value.length));
}

function setSeed(next: string, push = true) {
  next = next.trim().slice(0, 24) || randomSeed();
  pool?.dispose();
  seed = next;
  garden = new Garden(seed);
  pool = new PaintPool(seed, onPainted);
  life = new Life(garden);
  drift = null;
  seedInput.value = seed;
  seedInput.style.setProperty('--len', String(seed.length));
  $('series').textContent = garden.series.title;
  document.title = garden.classic ? 'Show Me the Monet' : `No. ${seed} · Show Me the Monet`;
  const b = garden.bridge;
  canvasFig.style.setProperty('--zx', `${(b.cx / W) * 100}%`);
  canvasFig.style.setProperty('--zy', `${((garden.deckY(b.cx) + garden.waterTop) / 2 / H) * 100}%`);
  picture.width = 0;
  layout();
  progress();
  if (push) {
    const u = new URL(location.href);
    u.searchParams.set('seed', seed);
    history.replaceState(null, '', u);
  }
  if (mode === 'drift') startDrift();
}

// ——— Drifting ———

let hintTimer = 0;

function startDrift() {
  drift = new Drift(garden, pool);
  $('note-title').textContent = garden.series.title;
  $('btn-pause').setAttribute('aria-pressed', 'false');
  const hint = $('hint');
  hint.classList.toggle('gone', !!storage('monet-rowed'));
  clearTimeout(hintTimer);
  hintTimer = window.setTimeout(() => hint.classList.add('gone'), 9000);
}

function enterDrift(immediate = false) {
  if (mode === 'drift') return;
  mode = 'drift';
  if (!drift) startDrift();
  setModeParam();
  if (immediate || reduced) {
    app.dataset.mode = 'drift';
    return;
  }
  // Lean into the canvas toward the bridge, then let the garden take over.
  app.classList.add('stepping');
  setTimeout(() => {
    if (mode === 'drift') app.dataset.mode = 'drift';
  }, 1100);
}

function leaveDrift() {
  if (mode === 'easel') return;
  mode = 'easel';
  drift?.clearKeys();
  app.dataset.mode = 'easel';
  setModeParam();
  requestAnimationFrame(() => app.classList.remove('stepping'));
}

function setModeParam() {
  const u = new URL(location.href);
  if (mode === 'drift') u.searchParams.set('mode', 'drift');
  else u.searchParams.delete('mode');
  history.replaceState(null, '', u);
}

function togglePause() {
  if (!drift) return;
  drift.paused = !drift.paused;
  $('btn-pause').setAttribute('aria-pressed', String(drift.paused));
  toast(drift.paused ? 'oars resting' : 'drifting on');
}

function rowed() {
  if (storage('monet-rowed')) return;
  storage('monet-rowed', '1');
  $('hint').classList.add('gone');
}

// ——— Keeping and sharing ———

async function savePicture() {
  if (mode === 'drift') {
    download(driftCanvas, `monet-${seed}-reach-${(drift?.reach ?? 0) + 1}.png`);
    return;
  }
  if (!finished) {
    toast('still wet: wait for the last touches');
    return;
  }
  await document.fonts.ready;
  const out = document.createElement('canvas');
  out.width = picture.width;
  out.height = picture.height;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(picture, 0, 0);
  // The signature is set in a web font, so it is drawn here on the page rather than in a worker.
  const size = Math.round(out.width * 0.045);
  ctx.font = `${size}px 'Mrs Saint Delafield', cursive`;
  ctx.fillStyle = 'rgba(142, 59, 63, 0.9)';
  ctx.textAlign = 'right';
  ctx.fillText(`Claude Monet ${seed}`, out.width * 0.965, out.height * 0.968);
  download(out, `monet-${seed}.png`);
}

function download(c: HTMLCanvasElement, name: string) {
  c.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('kept, in your downloads');
  });
}

async function share() {
  const u = new URL(location.href);
  u.searchParams.set('seed', seed);
  try {
    await navigator.clipboard.writeText(u.toString());
    toast('link copied');
  } catch {
    toast(u.toString());
  }
}

let toastTimer = 0;
function toast(msg: string) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 2200);
}

function setAnimate(on: boolean) {
  animate = on;
  $('btn-animate').setAttribute('aria-pressed', String(on));
  if (!on) lifeCtx.clearRect(0, 0, lifeCanvas.width, lifeCanvas.height);
}

// ——— Controls ———

$('btn-new').onclick = () => setSeed(randomSeed());
$('btn-drift').onclick = () => enterDrift();
$('btn-back').onclick = () => leaveDrift();
$('btn-pause').onclick = () => togglePause();
$('btn-animate').onclick = () => setAnimate(!animate);
$('btn-save').onclick = () => savePicture();
$('btn-snap').onclick = () => savePicture();
$('btn-share').onclick = () => share();
$('btn-about').onclick = () => $<HTMLDialogElement>('about').showModal();
$('about-classic').onclick = () => {
  $<HTMLDialogElement>('about').close();
  setSeed(CLASSIC_SEED);
};
seedInput.addEventListener('input', () => seedInput.style.setProperty('--len', String(seedInput.value.length)));
seedInput.addEventListener('change', () => {
  if (seedInput.value.trim() !== seed) setSeed(seedInput.value);
});
seedInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') seedInput.blur();
  e.stopPropagation();
});

const DRIFT_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || $<HTMLDialogElement>('about').open) return;
  if (mode === 'drift') {
    if (DRIFT_KEYS.has(e.code)) {
      e.preventDefault();
      drift?.key(e.code, true);
      if (e.code === 'KeyW' || e.code === 'ArrowUp') rowed();
      return;
    }
    if (e.code === 'Escape' || e.code === 'KeyE') leaveDrift();
    else if (e.code === 'Space') { e.preventDefault(); togglePause(); }
    else if (e.code === 'KeyP') savePicture();
    else if (e.code === 'KeyC') share();
    return;
  }
  switch (e.code) {
    case 'KeyN': setSeed(randomSeed()); break;
    case 'KeyD': enterDrift(); break;
    case 'KeyA': setAnimate(!animate); break;
    case 'KeyS': savePicture(); break;
    case 'KeyC': share(); break;
    case 'KeyI': case 'Slash': $<HTMLDialogElement>('about').showModal(); break;
  }
});
addEventListener('keyup', (e) => drift?.key(e.code, false));
addEventListener('blur', () => drift?.clearKeys());

// In the boat the eye follows the mouse; on a touch screen, hold to row and drag to steer.
let touchStart: { x: number; id: number } | null = null;
driftCanvas.addEventListener('pointermove', (e) => {
  if (!drift) return;
  if (e.pointerType === 'mouse') drift.look((e.clientX / innerWidth) * 2 - 1);
  else if (touchStart && e.pointerId === touchStart.id) drift.touch(1, (e.clientX - touchStart.x) / (innerWidth * 0.22));
});
driftCanvas.addEventListener('pointerdown', (e) => {
  if (!drift || e.pointerType === 'mouse') return;
  touchStart = { x: e.clientX, id: e.pointerId };
  drift.touch(1, 0);
  rowed();
});
const release = (e: PointerEvent) => {
  if (touchStart && e.pointerId === touchStart.id) {
    touchStart = null;
    drift?.touch(0, 0);
  }
};
driftCanvas.addEventListener('pointerup', release);
driftCanvas.addEventListener('pointercancel', release);
driftCanvas.addEventListener('pointerleave', (e) => {
  if (e.pointerType === 'mouse') drift?.look(0);
});

addEventListener('resize', () => layout());

// ——— The loop ———

let last = performance.now(), t = 0, frameMs = 16, slowFor = 0, res = 0.8, noteAt = 0;

function frame(now: number) {
  const ms = now - last, dt = Math.min(0.05, ms / 1000);
  last = now;
  t += dt;

  if (mode === 'easel' || app.classList.contains('stepping')) {
    pool.request(tileJobs());
    if (animate && mode === 'easel') {
      life.update(dt);
      lifeCtx.setTransform(1, 0, 0, 1, 0, 0);
      lifeCtx.clearRect(0, 0, lifeCanvas.width, lifeCanvas.height);
      if (finished) {
        lifeCtx.setTransform(lifeCanvas.width / W, 0, 0, lifeCanvas.height / H, 0, 0);
        life.draw(lifeCtx, t);
      }
    }
  }

  if (drift && mode === 'drift') {
    // Render below full resolution: the painted cards are soft anyway, and it keeps the frame rate up.
    const dpr = Math.min(devicePixelRatio || 1, 2), w = Math.round(innerWidth * dpr * res), h = Math.round(innerHeight * dpr * res);
    if (driftCanvas.width !== w || driftCanvas.height !== h) {
      driftCanvas.width = w;
      driftCanvas.height = h;
    }
    drift.request();
    drift.update(dt);
    drift.draw(driftCtx, t, w, h);

    frameMs = frameMs * 0.95 + ms * 0.05;
    slowFor = frameMs > 30 ? slowFor + dt : 0;
    if (slowFor > 2 && res > 0.45) {
      res *= 0.85;
      drift.life.quality = Math.max(0.3, drift.life.quality * 0.8);
      slowFor = 0;
    }
    if (now - noteAt > 300) {
      noteAt = now;
      $('note-line').textContent = `Reach ${drift.reach + 1} · ${Math.round(drift.distance)} m rowed`;
    }
  }
  requestAnimationFrame(frame);
}

setSeed(seed, !!params.get('seed'));
setAnimate(animate);
if (params.get('mode') === 'drift') enterDrift(true);
requestAnimationFrame(frame);
