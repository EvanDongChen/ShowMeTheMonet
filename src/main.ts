// The page: the easel with its painting, the palette of controls, and the drift behind the canvas.
import './styles.css';
import { Life } from './anim/life';
import { Ambience } from './anim/sound';
import { css } from './core/color';
import { clamp } from './core/math';
import { daylight, hourColor, hourName } from './drift/daylight';
import { Drift } from './drift/drift';
import { makePostcard } from './postcard';
import { PaintPool } from './paint/pool';
import { picturePixels, tileRect, TILES } from './paint/tiles';
import type { Job } from './paint/worker';
import { Garden, H, W } from './world/garden';
import { SERIES, SERIES_NAMES, type SeriesName } from './world/series';
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
const sound = new Ambience();
sound.muted = storage('monet-muted') === '1';
const tendCursor = $('tend-cursor');
let scale = 1;
let animate = params.get('animate') !== '0' && !reduced;
let mode: 'easel' | 'drift' = 'easel';
let finished = false;
/** The series the person has chosen for this canvas, or null for the seed's own. */
let light: SeriesName | null = SERIES_NAMES.includes(params.get('light') as SeriesName) ? (params.get('light') as SeriesName) : null;

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
  canvasFig.classList.toggle('ready', finished);
  const invite = finished && !storage('monet-stepped');
  $('invite').classList.toggle('show', invite);
  $('btn-drift').classList.toggle('pulse', invite);
  state.textContent = finished
    ? (garden.classic ? 'after Monet, 1899' : 'a canvas of your own')
    : p < 0.25 ? 'laying in the first touches…' : p < 0.6 ? 'working the water…' : p < 0.9 ? 'placing the lilies…' : 'the last touches…';
}

/** Fit the canvas on the easel, and repaint it if the size it needs has changed. */
function layout() {
  const small = innerWidth <= 720;
  const maxH = innerHeight * (small ? 0.56 : 0.7), maxW = small ? innerWidth - 66 : Math.min(innerWidth - 400, innerWidth * 0.66);
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

function setSeed(next: string, push = true, keepLight = false) {
  next = next.trim().slice(0, 24) || randomSeed();
  if (!keepLight) light = null;
  pool?.dispose();
  seed = next;
  garden = new Garden(seed, light);
  pool = new PaintPool(seed, onPainted, light);
  life = new Life(garden);
  drift = null;
  seedInput.value = seed;
  seedInput.style.setProperty('--len', String(seed.length));
  $('series').textContent = garden.series.title;
  syncLights();
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
    if (light) u.searchParams.set('light', light);
    else u.searchParams.delete('light');
    history.replaceState(null, '', u);
  }
  if (mode === 'drift') {
    startDrift();
    showTitle();
  }
}

// ——— Choosing the light ———

/** Monet painted the bridge again and again in different light. Each swatch repaints this canvas in one of those series. */
function buildLights() {
  const row = $('lights-row');
  for (const name of SERIES_NAMES) {
    const s = SERIES[name], b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.dataset.light = name;
    b.title = s.title;
    b.setAttribute('aria-label', s.title);
    b.style.setProperty('--a', css(s.foliage[3]));
    b.style.setProperty('--b', css(s.water[2]));
    b.style.setProperty('--c', css(s.name === 'rose' || s.name === 'autumn' ? s.accent[2] : s.flower[1]));
    b.onclick = () => { setLight(name); toggleLights(false); };
    b.onmouseenter = () => ($('lights-title').textContent = s.title);
    b.onmouseleave = () => ($('lights-title').textContent = garden.series.title);
    row.append(b);
  }
}

function syncLights() {
  $('lights-title').textContent = garden.series.title;
  for (const b of document.querySelectorAll<HTMLElement>('.swatch')) b.setAttribute('aria-pressed', String(b.dataset.light === garden.series.name));
}

function setLight(name: SeriesName) {
  if (garden.series.name === name && light === name) return;
  light = name;
  setSeed(seed, true, true);
  toast(SERIES[name].title);
}

function cycleLight() {
  setLight(SERIES_NAMES[(SERIES_NAMES.indexOf(garden.series.name) + 1) % SERIES_NAMES.length]);
}

function toggleLights(open = !$('lights').classList.contains('open')) {
  $('lights').classList.toggle('open', open);
  $('btn-light').setAttribute('aria-expanded', String(open));
}

// ——— Tending the pond ———

/** Where the pointer is on the painting, in painting units. */
function onPaint(e: PointerEvent | MouseEvent) {
  const r = picture.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H, cx: e.clientX - r.left, cy: e.clientY - r.top };
}

/** The pointer has left the painting. */
function tendOut() {
  life.pointerOut();
  life.tending = false;
  tendCursor.classList.remove('on');
}

/** The pond is live (the A button): the painting moves, and it can be tended. Switching it off stills it. */
function toggleLive() {
  setAnimate(!animate);
  toast(animate ? 'the pond is live: move through it to plant lilies and scatter petals' : 'the pond is still');
}

canvasFig.addEventListener('pointermove', (e) => {
  if (!animate || !finished || mode !== 'easel') return;
  const p = onPaint(e);
  tendCursor.style.transform = `translate(${p.cx}px, ${p.cy}px) translate(-50%, -50%)`;
  tendCursor.classList.add('on');
  life.tending = true;
  life.pointer(p.x, p.y);
});
canvasFig.addEventListener('pointerleave', tendOut);
canvasFig.addEventListener('pointerup', (e) => {
  if (e.pointerType !== 'mouse') tendOut();
});

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
  storage('monet-stepped', '1');
  $('invite').classList.remove('show');
  $('btn-drift').classList.remove('pulse');
  sound.start();
  if (!drift) startDrift();
  setModeParam();
  if (immediate || reduced) {
    app.dataset.mode = 'drift';
    showTitle();
    return;
  }
  // Lean into the canvas toward the bridge, then let the garden take over.
  app.classList.add('stepping');
  setTimeout(() => {
    if (mode === 'drift') {
      app.dataset.mode = 'drift';
      showTitle();
    }
  }, 1100);
}

function leaveDrift() {
  if (mode === 'easel') return;
  mode = 'easel';
  sound.stop();
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

function toggleSound() {
  sound.setMuted(!sound.muted);
  storage('monet-muted', sound.muted ? '1' : '0');
  toast(sound.muted ? 'sound off' : 'sound on');
}

/** The name of the place, written across the view as the boat slips in. */
function showTitle() {
  const card = $('title-card');
  $('tc-title').textContent = garden.series.title;
  $('tc-line').textContent = garden.classic ? 'after Monet, 1899' : `canvas no. ${seed}`;
  card.classList.remove('show');
  void card.offsetWidth;
  card.classList.add('show');
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
    if (!drift) return;
    const reach = drift.reach + 1, hour = hourName(daylight(drift.boat.z));
    const card = await makePostcard(driftCanvas, { title: garden.series.title, line: `Reach ${reach} · ${Math.round(drift.distance)} m rowed · ${hour}`, seed });
    download(card, `monet-${seed}-reach-${reach}.png`);
    return;
  }
  if (!finished) {
    toast('still wet: wait for the last touches');
    return;
  }
  // What has been planted in the pond goes on the postcard too.
  const comp = document.createElement('canvas');
  comp.width = picture.width;
  comp.height = picture.height;
  const cctx = comp.getContext('2d')!;
  cctx.drawImage(picture, 0, 0);
  cctx.scale(picture.width / W, picture.height / H);
  life.paintPlanted(cctx);
  const card = await makePostcard(comp, { title: garden.series.title, line: garden.classic ? 'after Monet, 1899' : `canvas no. ${seed}`, seed });
  download(card, `monet-${seed}.png`);
}

function download(c: HTMLCanvasElement, name: string) {
  c.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('a postcard, in your downloads');
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
  canvasFig.classList.toggle('live', on);
  canvasFig.style.touchAction = on ? 'none' : '';
  if (!on) tendOut();
  $('btn-animate').setAttribute('aria-pressed', String(on));
  if (!on) lifeCtx.clearRect(0, 0, lifeCanvas.width, lifeCanvas.height);
}

// ——— Controls ———

$('btn-new').onclick = () => setSeed(randomSeed());
$('btn-drift').onclick = () => enterDrift();
$('btn-back').onclick = () => leaveDrift();
$('btn-pause').onclick = () => togglePause();
$('btn-animate').onclick = () => toggleLive();
$('btn-light').onclick = () => toggleLights();
$('btn-save').onclick = () => savePicture();
$('btn-snap').onclick = () => savePicture();
$('btn-share').onclick = () => share();
$('btn-about').onclick = () => $<HTMLDialogElement>('about').showModal();
$('about-classic').onclick = () => {
  $<HTMLDialogElement>('about').close();
  setSeed(CLASSIC_SEED);
};
// Tending needs no clicking: moving through the pond does it. A click steps inside.
canvasFig.addEventListener('click', () => {
  if (mode === 'easel' && finished) enterDrift();
});
addEventListener('pointerdown', (e) => {
  if (!(e.target as HTMLElement).closest('.palette')) toggleLights(false);
});
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
    else if (e.code === 'KeyM') toggleSound();
    else if (e.code === 'KeyC') share();
    return;
  }
  switch (e.code) {
    case 'KeyN': setSeed(randomSeed()); break;
    case 'KeyD': enterDrift(); break;
    case 'KeyA': toggleLive(); break;
    case 'KeyL': cycleLight(); break;
    case 'KeyR':
      if (life.count) {
        life.clear();
        toast('the pond is clear again');
      }
      break;
    case 'Escape': toggleLights(false); break;
    case 'KeyS': savePicture(); break;
    case 'KeyC': share(); break;
    case 'KeyI': case 'Slash': $<HTMLDialogElement>('about').showModal(); break;
  }
});
addEventListener('keyup', (e) => drift?.key(e.code, false));
// Opening the drift from the address bar has no click to start the sound with; the first one does.
for (const type of ['pointerdown', 'keydown'] as const) addEventListener(type, () => { if (mode === 'drift') sound.start(); }, { once: true });
addEventListener('blur', () => drift?.clearKeys());

// In the boat the eye follows the mouse; on a touch screen, hold to row and drag to steer.
let touchStart: { x: number; id: number } | null = null;
driftCanvas.addEventListener('pointermove', (e) => {
  if (!drift) return;
  if (e.pointerType === 'mouse') drift.look((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
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
  if (e.pointerType === 'mouse') drift?.look(0, 0);
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
    sound.update(dt, drift.boat);
    for (const msg of drift.takeEvents()) toast(msg);
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
      const d = daylight(drift.boat.z);
      $('hour-name').textContent = hourName(d);
      $('hour-dot').style.setProperty('--hour', hourColor(d));
    }
  }
  requestAnimationFrame(frame);
requestAnimationFrame(() => requestAnimationFrame(() => app.classList.remove('preload')));
}

buildLights();
setSeed(seed, !!params.get('seed'), true);
setAnimate(animate);
if (params.get('mode') === 'drift') enterDrift(true);
requestAnimationFrame(frame);
requestAnimationFrame(() => requestAnimationFrame(() => app.classList.remove('preload')));
