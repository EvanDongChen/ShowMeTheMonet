// Monet painted the footbridge again and again in different light. Each seed paints in one of
// these "series": a palette for the garden plus the colour of the air (used for mist and haze).
import { hex, palette, type RGB } from '../core/color';

export type SeriesName = 'green' | 'rose' | 'mist' | 'evening' | 'autumn';

export interface Series {
  name: SeriesName;
  title: string;
  /** Dark → light ramps. */
  foliage: RGB[];
  water: RGB[];
  pad: RGB[];
  bridge: RGB[];
  reed: RGB[];
  /** Pale glints of sky caught on the water. */
  glint: RGB[];
  flower: RGB[];
  /** Complementary touches laid among the main colours: violet in the shade, warm notes in the light. */
  accent: RGB[];
  /** The colour of the air: haze, mist, distance. */
  air: RGB;
  /** Base wash behind everything, top and bottom. */
  washTop: RGB;
  washBottom: RGB;
  /** How strongly the air veils the picture, 0..1. */
  mist: number;
}

function series(name: SeriesName, title: string, cols: Record<'foliage' | 'water' | 'pad' | 'bridge' | 'reed' | 'glint' | 'flower' | 'accent', string[]>,
  air: string, washTop: string, washBottom: string, mist: number): Series {
  return { name, title, ...palette(cols), air: hex(air), washTop: hex(washTop), washBottom: hex(washBottom), mist };
}

export const SERIES: Record<SeriesName, Series> = {
  green: series('green', 'Harmony in Green', {
    foliage: ['#1f3a2a', '#2f5536', '#4b7a3e', '#79a04a', '#b4c766', '#e3dc8c'],
    water: ['#203c3a', '#2f5650', '#4a7468', '#6f9483', '#9db8a2'],
    pad: ['#2e5a2f', '#467a38', '#6c9a45', '#9fbf5c', '#cfdc87'],
    bridge: ['#3b5f58', '#5e8a73', '#87ad8a', '#b5cf9c', '#e6e2a2'],
    reed: ['#24402a', '#3c6433', '#6a8f3e', '#a9b85a'],
    glint: ['#c9d8d8', '#e4e6d2', '#f4f0dc', '#d9c9dc'],
    flower: ['#f3eef2', '#f2c4cf', '#e88aa0', '#d4515e', '#f7e7b0'],
    accent: ['#5c5f9e', '#7d6fae', '#d98f9c', '#e9cf6a', '#4f8a8c'],
  }, '#d8e2c9', '#2a4a30', '#3a5f55', 0.12),
  rose: series('rose', 'Harmony in Rose', {
    foliage: ['#4a2f2a', '#7a4636', '#b06a46', '#d6955a', '#e9bd7c', '#f4dca6'],
    water: ['#4d3442', '#76505a', '#a07068', '#c99a84', '#e5c3a6'],
    pad: ['#4e5a32', '#7a7640', '#a9984e', '#d1b866', '#ecd896'],
    bridge: ['#6a4a5a', '#9a6a72', '#c99288', '#e6b8a0', '#f6dcc0'],
    reed: ['#4a3a2a', '#7a5a36', '#a98448', '#d2b066'],
    glint: ['#f6dcc8', '#f4e6d6', '#fbf0e0', '#e8c8d8'],
    flower: ['#fbeee8', '#f6c0b8', '#ec8a8a', '#d8505a', '#ffe0a0'],
    accent: ['#7a5a9a', '#5a6a9e', '#f0a070', '#e8d070', '#c86a7a'],
  }, '#f1d6c4', '#6a3e34', '#8a5a5a', 0.18),
  mist: series('mist', 'Morning Mist', {
    foliage: ['#4c5a6e', '#66788a', '#8296a0', '#a4b4b4', '#c6cfc6', '#e2e4da'],
    water: ['#5a6a80', '#728498', '#8ea0b0', '#aebcc6', '#cdd6da'],
    pad: ['#5a7262', '#728a72', '#8ea488', '#adbea0', '#ccd8bc'],
    bridge: ['#6a7a8a', '#8496a2', '#a2b2b8', '#c2ccca', '#e0e4dc'],
    reed: ['#56665e', '#6e8274', '#8ca08a', '#aebea6'],
    glint: ['#e6e6ee', '#eeeef2', '#f6f4f2', '#e2dcec'],
    flower: ['#f6f2f6', '#eed6e2', '#dcb0c8', '#c8909e', '#f0e8cc'],
    accent: ['#8a7cae', '#a88ab8', '#d8b4c4', '#e8dcae', '#7a9ab0'],
  }, '#dfe3e8', '#6a7a8c', '#8c9cac', 0.42),
  evening: series('evening', 'Evening Light', {
    foliage: ['#1e2440', '#353a5c', '#5a4e6a', '#9a6a5e', '#d89a5a', '#f2cc7c'],
    water: ['#1c2440', '#2e3a60', '#4e5478', '#8a6a78', '#d49a6a'],
    pad: ['#24382e', '#3a5236', '#5a6e3e', '#8e8a48', '#c8b05e'],
    bridge: ['#2e3654', '#4c5070', '#7a6878', '#b88a70', '#ecc07a'],
    reed: ['#1c2a26', '#2e4030', '#4e5a36', '#86803e'],
    glint: ['#f2c27a', '#f6d89a', '#fbe8b8', '#e8a088'],
    flower: ['#f6e6e0', '#f4b8a8', '#e8806e', '#c84a4a', '#ffd88a'],
    accent: ['#6a4a8a', '#3a4a8a', '#f0905a', '#f6c860', '#c85a6a'],
  }, '#e8b88a', '#262c4a', '#3a3a5c', 0.2),
  autumn: series('autumn', 'Autumn Pond', {
    foliage: ['#3a2a1c', '#6a3e1e', '#9a5a22', '#c8822e', '#e2b04a', '#f2d68a'],
    water: ['#2a2e2a', '#46463a', '#6a6040', '#948050', '#c2a870'],
    pad: ['#4a4a22', '#6e6628', '#94822e', '#bca03e', '#dcc46a'],
    bridge: ['#3e4a3e', '#5e6a4e', '#8a8a5a', '#b8a868', '#e2d08a'],
    reed: ['#3a3220', '#5e4e28', '#8a7234', '#b89a48'],
    glint: ['#e8dcc0', '#f0e6cc', '#f8f0dc', '#e2c8a8'],
    flower: ['#f6eee0', '#f2cca8', '#e89a6a', '#c85a3a', '#f8dc8a'],
    accent: ['#6a5a8a', '#4a6a7a', '#d8603a', '#f0c050', '#8a9a4a'],
  }, '#e6d2a8', '#4a3420', '#4a4630', 0.16),
};

export const SERIES_NAMES = Object.keys(SERIES) as SeriesName[];
