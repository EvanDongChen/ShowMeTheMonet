// A postcard of whatever is on the canvas or in the boat: the picture set in a paper border with a
// handwritten caption (which series, where, at what hour) and the seed. This is page code, not
// painting code: it only frames a picture that has already been painted, and its paper grain is
// seeded so the same postcard always comes out the same.
import { Rng, hashString } from './core/rng';

export interface PostcardInfo {
  /** The series, e.g. "Harmony in Green". */
  title: string;
  /** Where and when: "after Monet, 1899", or "Reach 3 · 96 m rowed · a golden afternoon". */
  line: string;
  seed: string;
}

export async function makePostcard(src: HTMLCanvasElement, info: PostcardInfo): Promise<HTMLCanvasElement> {
  // The caption is set in web fonts: make sure they're in before drawing, but never hang on them.
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load("italic 48px 'Fraunces'"),
        document.fonts.load("32px 'Kalam'"),
      ]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch {
    // Fall back to whatever the system has.
  }

  const w = src.width, h = src.height, m = Math.round(Math.max(w, h) * 0.045), cap = Math.round(m * 2.7);
  const out = document.createElement('canvas');
  out.width = w + m * 2;
  out.height = h + m + cap;
  const c = out.getContext('2d')!;

  // Paper, warm white, with a faint fibre grain.
  c.fillStyle = '#fbf8f1';
  c.fillRect(0, 0, out.width, out.height);
  const rng = new Rng(hashString(info.seed + info.title));
  for (let i = 0; i < Math.round((out.width * out.height) / 900); i++) {
    c.fillStyle = rng.chance(0.5) ? 'rgba(120, 100, 70, 0.05)' : 'rgba(255, 255, 255, 0.5)';
    c.fillRect(rng.random() * out.width, rng.random() * out.height, rng.range(1, 3.5), rng.range(0.6, 1.6));
  }

  // The picture, lying on the paper with a soft shadow, and a hairline of ink around it.
  c.save();
  c.shadowColor = 'rgba(40, 34, 24, 0.32)';
  c.shadowBlur = m * 0.45;
  c.shadowOffsetY = m * 0.1;
  c.drawImage(src, m, m);
  c.restore();
  c.strokeStyle = 'rgba(47, 59, 51, 0.22)';
  c.lineWidth = Math.max(1, m * 0.02);
  c.strokeRect(m - 0.5, m - 0.5, w + 1, h + 1);

  // The caption, left; the name and the seed, right.
  const base = h + m + cap * 0.52, titleSize = Math.round(cap * 0.36), lineSize = Math.round(cap * 0.25);
  c.fillStyle = '#2f3b33';
  c.textBaseline = 'alphabetic';
  c.textAlign = 'left';
  c.font = `italic 400 ${titleSize}px 'Fraunces', Georgia, serif`;
  c.fillText(info.title, m, base);
  c.fillStyle = 'rgba(47, 59, 51, 0.68)';
  c.font = `${lineSize}px 'Kalam', 'Segoe Print', cursive`;
  // Long lines (a drifting postcard names the reach and the hour) shrink to fit the left half.
  const room = w * 0.62;
  let size = lineSize;
  while (c.measureText(info.line).width > room && size > lineSize * 0.6) {
    size -= 1;
    c.font = `${size}px 'Kalam', 'Segoe Print', cursive`;
  }
  c.fillText(info.line, m, base + lineSize * 1.45);

  c.textAlign = 'right';
  c.fillStyle = 'rgba(47, 59, 51, 0.82)';
  c.font = `italic 300 ${Math.round(cap * 0.3)}px 'Fraunces', Georgia, serif`;
  c.fillText('Show Me the Monet', out.width - m, base);
  c.fillStyle = 'rgba(47, 59, 51, 0.6)';
  c.font = `${lineSize}px 'Kalam', 'Segoe Print', cursive`;
  c.fillText(`seed ${info.seed}`, out.width - m, base + lineSize * 1.45);
  return out;
}
