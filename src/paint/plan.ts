// Shared types for planning a tile of the easel picture as an ordered list of draw operations.
//
// Tiles are painted independently (often in different workers) and pasted side by side. To make
// them join with no seams, every dab is generated from global coordinates and gets a global sort
// key: two tiles that both reach a dab near their shared edge draw it with the same shape, the
// same colour, and in the same order relative to its neighbours.
import type { Ctx } from '../core/dab';
import type { Garden } from '../world/garden';

export type Op = (ctx: Ctx) => void;

export const L = {
  WASH: 0, UNDER: 0.5, FOLIAGE_BASE: 1, FOLIAGE: 2, FOLIAGE_LIGHT: 2.5, WILLOW: 3, BANK: 4, BANK_PLANTS: 4.5,
  WATER_BASE: 5, WATER: 6, GLINT: 7, BRIDGE_REFLECT: 8,
  PAD: 9, FLOWER: 10, BRIDGE_SHADE: 11, BRIDGE: 12, WILLOW_FRONT: 12.5, VEIL: 13, REED: 14,
} as const;

export interface Item { layer: number; key: number; op: Op; }

export interface TilePlan {
  g: Garden;
  /** Tile rectangle in painting units, plus padding wide enough for any dab that could reach inside. */
  x0: number; y0: number; x1: number; y1: number; pad: number;
  items: Item[];
}

/** Global grid cells whose jittered point could land within the padded tile. */
export function cells(p: TilePlan, sx: number, sy = sx) {
  return {
    i0: Math.floor((p.x0 - p.pad) / sx) - 1, i1: Math.ceil((p.x1 + p.pad) / sx) + 1,
    j0: Math.floor((p.y0 - p.pad) / sy) - 1, j1: Math.ceil((p.y1 + p.pad) / sy) + 1,
  };
}

/** Does the box around (x, y) with these half-extents reach the padded tile? */
export const near = (p: TilePlan, x: number, y: number, rx: number, ry = rx) =>
  x + rx >= p.x0 - p.pad && x - rx <= p.x1 + p.pad && y + ry >= p.y0 - p.pad && y - ry <= p.y1 + p.pad;

/** A random stream and a global sort key for one grid cell of one layer. */
export function cellRng(p: TilePlan, layer: number, i: number, j: number) {
  const rng = p.g.rng(layer * 7919, i, j);
  return { rng, key: rng.random() };
}

export function push(p: TilePlan, layer: number, key: number, op: Op) {
  p.items.push({ layer, key, op });
}
