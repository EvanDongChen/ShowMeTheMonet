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
src/drift/   river.ts (the channel, cut into reaches) · camera.ts (the boat) · render.ts (the diorama)
             water.ts (the painted water, sky and weave) · drift.ts
src/anim/    life.ts (easel: trembling light, rings, petals, a dragonfly) · drift-life.ts (oar rings, pollen, petals)
src/main.ts  the easel, the palette and the loop
```

### The brush

Monet builds a surface from many small touches rather than long flowing strokes. Each one is the mark of a flat hog-hair brush:

- `flat()` lays the body, with long sides that wander and swell, and ends cut square but ragged.
- `touch()` adds an occasional thin scumble beneath, streaks of single bristles dragged through the stroke, and a ridge of light along the edge facing the sun, as thick paint catches it.

Neighbouring touches are jittered in colour, and a few are swapped for the series' **accents** (violet in the shade, warm yellow or pink in the light). That makes the colour read as broken up close and blend at a distance. Every touch in the easel and in every cutout is made this way.

### The easel

A `Garden` is everything a seed decides: the series (palette and colour of the air), the arch of the footbridge, where the far bank meets the water, the willows and reeds at the edges, and the rafts of lilies. Each raft lays its pads in rows that recede in perspective, small and squashed far away and broad near the foot of the canvas. Seed `1899` takes all of this from `giverny.ts`: hand-set fractions describing Monet's composition (nothing traced).

The picture is painted in eight tiles, shared out to a pool of workers that paint into CPU-backed `OffscreenCanvas`es in time slices and send partial bitmaps back, so the picture can be watched forming. Tiles join without seams because:

- every dab is seeded from its global grid cell (`hash(seed, layer, i, j)`) and sorted by a global key, so neighbouring tiles agree on each dab's shape, colour and order;
- each tile is painted with a margin and cropped, since the rasteriser treats paths that cross the canvas edge slightly differently.

Layers, back to front:

1. wash and a loose underpainting
2. foliage wall, with sunlit touches
3. willow fronds fringing the top
4. bank, with irises and grasses growing along it
5. water: the bank mirrored and broken into vertical and horizontal strokes
6. glints of sky
7. the bridge's reflection
8. lily pads, each a few horizontal strokes rather than a drawn leaf
9. flowers
10. the bridge
11. a few fronds hanging in front of it
12. the veil of air
13. reeds
14. canvas weave

### The drift

The drift is a diorama of flat painted cards, made in the spirit of *Shroom and Gloom*'s layered dungeons:

- **The river** is a channel whose centre and width wander with noise, opening into ponds now and then. It is cut into 30 m **reaches**. Each reach's contents are seeded by `hash(seed, reach, slot)`, so a seed's river is always the same: rows of cards behind each bank (reeds standing in the shallows; reeds, irises, grass and flower beds at the edge; shrubs and more flowers; willows and poplars; a far backdrop), rafts of pads with the odd bloom, glints and ripples on the water, and sometimes a footbridge spanning the channel (never two reaches in a row). Reach 0 always has a bridge square ahead, so stepping into the easel lands you in front of one.
- **Cards** are painted in the workers with the same brush and the seed's palette, from `hash(seed, kind, variant)`: a few variants per kind, streamed nearest first.
- **Rendering** stands every card up as a billboard, projects it (`scale = f / depth`), sorts far to near and paints them over each other, so nearer flats cover farther ones and slide past faster. Lily pads lie flat: they are squashed by how steeply you look down at them.
  - **Depth** comes from slabs. Each time drawing crosses a slab boundary, a thin veil of the series' air is laid over everything drawn so far, so each layer back is a little paler and mistier.
  - **The water** is a mirror, painted over:
    - Every standing card is drawn again upside down into a half-resolution buffer, which is pasted below the horizon in rippling strips and tinted by the pond.
    - Over that goes a tile of half-transparent horizontal brushwork, painted once per seed. It is laid on the water plane in perspective one screen row at a time, each row a pattern fill scaled for its depth.
    - Near the boat the tile is laid at finer world scales, blended across depth, so the strokes stay brush-sized instead of blowing up into smears.
  - **The sky** above the trees is painted strokes too, and the canvas weave lies faintly over the whole view.
- **The boat** is the camera, and you never see it. Rowing eases it up to speed and the water slowly takes the speed back. It steers with A/D, glides on when left alone, and leans back toward open water near the banks. It sits steady: a glide, not a bob.

### Determinism

The same seed always paints the same easel picture and the same river. Painting and world code never call `Math.random()`. The animation layers do, but they only draw over the finished picture or scene. `debug-determinism.html` (gitignored, like all `debug-*` pages) paints seeds twice and tiled vs whole, and compares the pixels.
