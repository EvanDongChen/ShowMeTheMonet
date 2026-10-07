# Show Me the Monet

An endlessly varied, procedurally painted *Bridge over a Pond of Water Lilies* (after Claude Monet, 1899), with a rowboat you can take into the painting.

- **Easel**: every seed paints its own variation of the Japanese footbridge over the lily pond, in one of Monet's series of light: Harmony in Green, Harmony in Rose, Morning Mist, Evening Light or Autumn Pond. Seed `1899` paints Monet's own composition.
- **Drift**: step through the canvas into a rowboat and row on through an endless water garden built of painted cutouts. Willows, reeds, irises, footbridges and lily pads stand at different depths like the flats of a lit diorama, and slide past one another as you go.

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # single self-contained dist/index.html
```

Plain TypeScript, Vite and canvas 2D, with no runtime dependencies. The build is one HTML file (scripts, styles and the painting worker inlined) that can be hosted anywhere or opened straight from disk.

## Using it

| | Easel | Drift |
| --- | --- | --- |
| Palette | new canvas, **drift in**, ripple, keep it, share, about | to the easel, rest the oars, sketch this |
| Keys | `N` new · `D` drift in · `A` animate · `S` save · `C` copy link · `I` about | `W`/`↑` row · `S`/`↓` back-paddle · `A` `D` steer · `Space` rest · `P` save view · `Esc` step out |
| Pointer | click the signature to type a seed | the eye follows the mouse; on touch, hold to row and drag to steer |

URL parameters: `?seed=…`, `&mode=drift` to start in the boat, `&animate=0` to keep the easel still.

## How it works

```
src/core/    rng (hash, mulberry32) · noise (Perlin, fbm) · color · math · dab (the impressionist brush)
src/world/   garden.ts (seed → series, bridge, banks, lily rafts) · giverny.ts (seed 1899) · series.ts (palettes)
src/paint/   plan.ts · tiles.ts · foliage/water/lilies/bridge.ts (easel planners) · cards.ts (drift cutouts)
             pool.ts + worker.ts (painting off the main thread)
src/drift/   river.ts (the channel, cut into reaches) · camera.ts (the boat) · render.ts (the diorama) · drift.ts
src/anim/    life.ts (easel: trembling light, rings, petals, a dragonfly) · drift-life.ts (oar rings, pollen, petals)
src/main.ts  the easel, the palette and the loop
```

### The brush

Monet builds a surface from many small touches rather than long flowing strokes. `dab()` paints a tapered comma (a round head thinning into a tail), and `touch()` lays one over a soft, wide scumble with a thin sliver of a neighbouring colour dragged along one side. That sliver is what makes the colour read as *broken* up close and blend at a distance. Every touch in the easel and in every cutout is made this way.

### The easel

A `Garden` is everything a seed decides: the series (palette and colour of the air), the arch of the footbridge, where the far bank meets the water, the willows and reeds at the edges, and the rafts of lilies. Each raft lays its pads in rows that recede in perspective, small and squashed far away and broad near the foot of the canvas. Seed `1899` takes all of this from `giverny.ts`: hand-set fractions describing Monet's composition (nothing traced).

The picture is painted in eight tiles, shared out to a pool of workers that paint into CPU-backed `OffscreenCanvas`es in time slices and send partial bitmaps back, so the picture can be watched forming. Tiles join without seams because:

- every dab is seeded from its global grid cell (`hash(seed, layer, i, j)`) and sorted by a global key, so neighbouring tiles agree on each dab's shape, colour and order;
- each tile is painted with a margin and cropped, since the rasteriser treats paths that cross the canvas edge slightly differently.

Layers, back to front: wash · foliage wall · willows · bank · water (the bank mirrored, darkened and broken into ripples; vertical streaks under the willows) · glints of sky · the bridge's reflection · lily pads · flowers · the bridge · the veil of air · reeds · canvas weave.

### The drift

The drift is a diorama of flat painted cards, made in the spirit of *Shroom and Gloom*'s layered dungeons:

- **The river** is a channel whose centre and width wander with noise, opening into ponds now and then. It is cut into 30 m **reaches**. Each reach's contents are seeded by `hash(seed, reach, slot)`, so a seed's river is always the same: rows of cards behind each bank (reeds and irises at the edge, shrubs, willows and poplars, a far backdrop), rafts of pads with the odd bloom, glints and ripples on the water, and sometimes a footbridge spanning the channel (never two reaches in a row). Reach 0 always has a bridge square ahead, so stepping into the easel lands you in front of one.
- **Cards** are painted in the workers with the same brush and the seed's palette, from `hash(seed, kind, variant)`: a few variants per kind, streamed nearest first.
- **Rendering** stands every card up as a billboard, projects it (`scale = f / depth`), sorts far to near and paints them over each other, so nearer flats cover farther ones and slide past faster. Lily pads lie flat: they are squashed by how steeply you look down at them.
  - **Depth** comes from slabs. Each time drawing crosses a slab boundary, a thin veil of the series' air is laid over everything drawn so far, so each layer back is a little paler and mistier.
  - **The water** is a mirror. Every standing card is drawn again upside down into a half-resolution buffer, which is pasted below the horizon in rippling strips and tinted by the pond.
- **The boat** gets bursts of momentum from each oar stroke, steers with A/D, drifts on when left alone, and leans gently back toward open water near the banks. It heaves and rolls slightly, and its bow sits at the foot of the view.

### Determinism

The same seed always paints the same easel picture and the same river. Painting and world code never call `Math.random()`. The animation layers do, but they only draw over the finished picture or scene. `debug-determinism.html` (gitignored, like all `debug-*` pages) paints seeds twice and tiled vs whole, and compares the pixels.
