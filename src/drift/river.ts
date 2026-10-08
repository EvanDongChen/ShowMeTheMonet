// The drift's endless water garden: a winding channel through Monet's garden, cut into reaches.
//
// World units are metres. z runs forward along the river, x across it, y up from the water. Each
// reach's scenery (cards on both banks, rafts of lilies, now and then a footbridge) is seeded by
// hash(seed, reach, slot), so the river is the same every time a seed is rowed, in either direction.
import { lerp, smoothstep } from '../core/math';
import { hashFloat } from '../core/rng';
import { CARDS, type CardKind } from '../paint/cards';
import type { Garden } from '../world/garden';

/** Length of a reach in metres. */
export const REACH = 30;
/** No feature reaches more than this many reaches from the one that owns it. */
export const RANGE = 2;

export interface Placed {
  kind: CardKind; variant: number;
  x: number; z: number;
  /** Size in metres. */
  w: number; h: number;
  /** Lies flat on the water (pads) rather than standing up. */
  flat: boolean;
  /** Mirrored left to right. */
  flip: boolean;
  /** Height of the card's bottom edge above the water, for branches hanging overhead. */
  elev?: number;
}

export interface Glint { x: number; z: number; len: number; tone: number; dark: boolean; }

/** A patch of sunlight falling through the leaves onto the water. */
export interface Dapple { x: number; z: number; r: number; tone: number; }

export interface Reach {
  k: number;
  cards: Placed[];
  glints: Glint[];
  dapples: Dapple[];
  bridge: Placed | null;
}

export class River {
  private reaches = new Map<number, Reach>();

  constructor(readonly g: Garden) {}

  /** Centre of the channel at z. The first stretch runs straight so the first bridge is square on. */
  center(z: number) {
    return this.g.noise.fbm(z / 95, 51.3, 3) * 14 * smoothstep(25, 70, Math.abs(z));
  }

  /** Half the channel's width at z: a canal most of the time, opening into ponds now and then. */
  half(z: number) {
    const n = this.g.noise, canal = 5 + 2.5 * (0.5 + 0.5 * n.fbm(z / 70, 77.1, 2));
    const pond = Math.max(0, n.fbm(z / 220, 99.4, 2) - 0.15) * 26;
    return lerp(6, canal + pond, smoothstep(30, 60, Math.abs(z)));
  }

  /** Direction the channel runs at z, as a yaw angle. */
  heading(z: number) {
    return Math.atan2(this.center(z + 2) - this.center(z - 2), 4);
  }

  static reachOf(z: number) {
    return Math.floor(z / REACH);
  }

  private bridgeRaw(k: number) {
    return k === 0 || (Math.abs(k) >= 2 && hashFloat(this.g.s, k, 0xb41d6e) < 0.24);
  }

  /** At most one bridge in any two neighbouring reaches. */
  hasBridge(k: number) {
    return this.bridgeRaw(k) && (k === 0 || !this.bridgeRaw(k - 1));
  }

  reach(k: number): Reach {
    let r = this.reaches.get(k);
    if (!r) {
      r = this.build(k);
      this.reaches.set(k, r);
    }
    return r;
  }

  /** Drop reaches far from k to keep memory bounded. */
  prune(k: number, keep = 8) {
    for (const key of this.reaches.keys()) if (Math.abs(key - k) > keep) this.reaches.delete(key);
  }

  private card(kind: CardKind, variant: number, x: number, z: number, scale: number, flip: boolean, flat = false, elev = 0): Placed {
    const spec = CARDS[kind];
    return { kind, variant, x, z, w: spec.w * scale, h: spec.h * scale, flat, flip, elev: elev || undefined };
  }

  private build(k: number): Reach {
    const g = this.g, z0 = k * REACH, cards: Placed[] = [], glints: Glint[] = [], dapples: Dapple[] = [];
    let bridge: Placed | null = null, bz = NaN;

    if (this.hasBridge(k)) {
      const r = g.rng(0x7e4c, k, 99);
      bz = k === 0 ? 16 : z0 + r.range(9, 21);
      const span = this.half(bz) * 2 + 3.5, sx = span / CARDS.bridge.w;
      bridge = this.card('bridge', r.int(0, CARDS.bridge.variants - 1), this.center(bz), bz, 1, false);
      bridge.w = span;
      bridge.h = CARDS.bridge.h * lerp(1, sx, 0.35);
      cards.push(bridge);
    }

    // Banks: rows of cards at increasing distance behind each bank, nearest row lowest. The first
    // row stands in the shallows; the garden is planted thick, as Monet's was.
    const rows: { step: number; off: [number, number]; pick: (r: number) => CardKind | null; scale: [number, number]; elev?: [number, number] }[] = [
      { step: 2.4, off: [-1.9, -0.6], pick: (r) => (r < 0.3 ? 'reeds' : r < 0.45 ? 'iris' : null), scale: [0.6, 1] },
      { step: 1.1, off: [-0.3, 0.6], pick: (r) => (r < 0.3 ? 'reeds' : r < 0.5 ? 'iris' : r < 0.75 ? 'grass' : r < 0.9 ? 'flowers' : null), scale: [0.75, 1.25] },
      { step: 2.2, off: [0.8, 3], pick: (r) => (r < 0.6 ? 'shrub' : r < 0.9 ? 'flowers' : 'grass'), scale: [0.8, 1.35] },
      { step: 4.6, off: [1.5, 6], pick: (r) => (r < 0.55 ? 'willow' : r < 0.67 ? 'poplar' : r < 0.9 ? 'shrub' : null), scale: [0.7, 1.1] },
      { step: 11, off: [10, 17], pick: () => 'backdrop', scale: [1, 1.4] },
      // Branches arching overhead, reaching out over the water.
      { step: 5, off: [-2.8, 1.2], pick: (r) => (r < 0.85 ? 'canopy' : null), scale: [0.9, 1.5], elev: [1.8, 2.8] },
    ];
    for (const side of [-1, 1]) {
      rows.forEach((row, ri) => {
        const r = g.rng(0x7e4c, k, side, ri), n = Math.ceil(REACH / row.step);
        for (let i = 0; i < n; i++) {
          const z = z0 + (i + r.random()) * row.step, kind = row.pick(r.random());
          const off = r.range(row.off[0], row.off[1]), scale = r.range(row.scale[0], row.scale[1]);
          const variant = r.int(0, 99), flip = r.chance(0.5), elev = row.elev ? r.range(row.elev[0], row.elev[1]) : 0;
          // Keep the banks clear where a bridge lands, except for its far backdrop (and the bridge's own sky).
          if (!kind || ((ri < 4 || kind === 'canopy') && Math.abs(z - bz) < (kind === 'canopy' ? 5 : 2.5))) continue;
          // Now and then a branch reaches clear across, so there is something overhead as we pass.
          const across = kind === 'canopy' && r.chance(0.12);
          const x = across ? this.center(z) + r.range(-3, 3) : this.center(z) + side * (this.half(z) + off + (kind === 'backdrop' || ri === 0 ? 0 : CARDS[kind].w * scale * 0.3));
          cards.push(this.card(kind, variant % CARDS[kind].variants, x, z, scale, flip, false, across ? elev + 0.7 : elev));
        }
      });
    }

    // Seed 1899 starts in Monet's spot: willows hanging at both sides of the view of the bridge.
    if (k === 0 && g.classic) {
      cards.push(this.card('willow', 0, this.center(7) - this.half(7) - 1.2, 7, 1.1, false));
      cards.push(this.card('willow', 1, this.center(9) + this.half(9) + 1.4, 9, 1.05, true));
    }

    // Rafts of lilies drifting all over the pond, thickest near the banks, with open water between.
    const r = g.rng(0x7e4c, k, 0x1a9);
    for (let c = r.int(12, 19); c > 0; c--) {
      const cz = z0 + r.random() * REACH, u = (r.chance(0.55) ? r.range(0.4, 0.95) : r.range(-0.8, 0.8)) * (r.chance(0.5) ? 1 : -1);
      const half = this.half(cz), cx = this.center(cz) + u * half, rad = r.range(1.5, 5);
      for (let n = r.int(18, 46); n > 0; n--) {
        const a = r.random() * Math.PI * 2, d = Math.sqrt(r.random()) * rad;
        const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d * 1.4;
        const size = r.range(0.45, 1.3), variant = r.int(0, CARDS.pad.variants - 1), bloom = r.chance(0.3), bv = r.int(0, 99);
        if (Math.abs(x - this.center(z)) > this.half(z) - 0.3 || Math.abs(z - bz) < 1) continue;
        cards.push(this.card('pad', variant, x, z, size, r.chance(0.5), true));
        if (bloom) cards.push(this.card('bloom', bv % CARDS.bloom.variants, x, z + 0.01, size, false));
      }
    }

    // Single pads strewn over the open water, so the near stretch is never bare.
    for (let n = 36; n > 0; n--) {
      const z = z0 + r.random() * REACH, x = this.center(z) + r.range(-0.9, 0.9) * this.half(z);
      const size = r.range(0.4, 1), variant = r.int(0, CARDS.pad.variants - 1), bloom = r.chance(0.2), bv = r.int(0, 99), flip = r.chance(0.5);
      if (Math.abs(z - bz) < 1) continue;
      cards.push(this.card('pad', variant, x, z, size, flip, true));
      if (bloom) cards.push(this.card('bloom', bv % CARDS.bloom.variants, x, z + 0.01, size, false));
    }

    // Glints of sky on the open water.
    for (let i = 0; i < 60; i++) {
      const z = z0 + r.random() * REACH, u = r.range(-0.95, 0.95);
      glints.push({ x: this.center(z) + u * this.half(z), z, len: r.range(0.3, 1.4), tone: r.random(), dark: r.chance(0.55) });
    }

    for (let i = 0; i < 26; i++) {
      const z = z0 + r.random() * REACH;
      dapples.push({ x: this.center(z) + r.range(-0.95, 0.95) * this.half(z), z, r: r.range(0.9, 2.6), tone: r.random() });
    }

    return { k, cards, glints, dapples, bridge };
  }
}
