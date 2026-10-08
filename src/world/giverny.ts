// Seed 1899: the composition of Monet's *Bridge over a Pond of Water Lilies* (1899), set by hand
// as fractions of the canvas. These are a painter's notes on where things sit, not traced data:
// the arch of the footbridge across the upper third, the far bank meeting the water just below
// it, and the lily rafts drifting in alternating bands down to the foot of the canvas.

export const CLASSIC_SEED = '1899';

export interface RaftNote { y: number; x0: number; x1: number; tilt: number; rows: number; }

export const GIVERNY = {
  series: 'green' as const,
  bridge: { cx: 0.5, span: 1.16, apex: 0.215, end: 0.385, thick: 0.034, railH: 0.085, rails: 2, post: 0.055 },
  waterTop: 0.47,
  willowL: 0.32,
  willowR: 0,
  reedL: 0.1,
  reedR: 0.12,
  rafts: [
    { y: 0.495, x0: -0.05, x1: 1.05, tilt: 0, rows: 2 },
    { y: 0.545, x0: -0.05, x1: 0.6, tilt: 0.03, rows: 2 },
    { y: 0.59, x0: 0.44, x1: 1.05, tilt: -0.025, rows: 2 },
    { y: 0.655, x0: -0.05, x1: 0.52, tilt: 0.04, rows: 2 },
    { y: 0.715, x0: 0.34, x1: 1.05, tilt: 0, rows: 2 },
    { y: 0.795, x0: -0.05, x1: 0.68, tilt: 0.03, rows: 2 },
    { y: 0.865, x0: 0.56, x1: 1.05, tilt: -0.03, rows: 1 },
    { y: 0.935, x0: -0.05, x1: 0.42, tilt: 0.02, rows: 1 },
    { y: 0.975, x0: 0.62, x1: 1.05, tilt: 0, rows: 1 },
  ] as RaftNote[],
};
