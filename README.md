# Show Me the Monet

An endlessly varied, procedurally painted *Bridge over a Pond of Water Lilies* (after Claude Monet, 1899), with a rowboat you can take into the painting.

- **Easel**: click the painting to step into it, or choose the light and every canvas is painted over in another of Monet's series. Every seed paints its own variation of the Japanese footbridge over the lily pond, in one of Monet's series of light: Harmony in Green, Harmony in Rose, Morning Mist, Evening Light or Autumn Pond. Seed `1899` paints Monet's own composition.
- **Drift**: step through the canvas into a rowboat and row on through an endless water garden built of painted cutouts. Willows, reeds, irises, footbridges and lily pads stand at different depths like the flats of a lit diorama, and slide past one another as you go. Branches arch overhead, the hour turns as you row (a golden afternoon, a violet dusk with fireflies, a pink dawn mist), and there is always something to row toward: a boat tied up at the bank, a stone lantern, a footbridge, a sunlit clearing. Quiet procedural sound comes with it (`M` mutes).

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # single self-contained dist/index.html
```

Plain TypeScript, Vite and canvas 2D, with no runtime dependencies. The build is one HTML file (scripts, styles and the painting worker inlined) that can be hosted anywhere or opened straight from disk.

## Using it

| | Easel | Drift |
| --- | --- | --- |
| Palette | new canvas, **choose the light**, **drift in**, ripple, make a postcard, share, about | to the easel, rest the oars, postcard |
| Keys | `N` new · `D` drift in · `A` animate · `L` change the light · `S` postcard · `C` copy link · `I` about | `W`/`↑` row · `S`/`↓` back-paddle · `A` `D` steer · `Space` rest · `M` sound · `P` postcard · `Esc` step out |
| Pointer | click the painting to step in; type a seed on the tag under the easel | the eye follows the mouse, left and right and up (into the canopy) and down (at the water); on touch, hold to row and drag to steer |

URL parameters: `?seed=…`, `&light=green|rose|mist|evening|autumn` to choose the series, `&mode=drift` to start in the boat, `&animate=0` to keep the easel still.

**Choosing the light** repaints the same seed in another series (the composition stays, the palette and air change), and the choice travels in the link. **Postcards** frame the finished canvas, or the view from the boat, in a paper border with a handwritten caption (the series, the reach rowed and the hour) and the seed. In the boat, a title card names the place as you slip in, and landmarks are whispered as they come into view.

## How it works

```
src/core/    rng (hash, mulberry32) · noise (Perlin, fbm) · color · math · dab (the impressionist brush)
src/world/   garden.ts (seed → series, bridge, banks, planting zones, lily rafts) · giverny.ts (seed 1899) · series.ts (palettes)
src/paint/   plan.ts · tiles.ts · foliage/water/lilies/bridge.ts (easel planners) · cards.ts (drift cutouts: foliage, canopy, bridge, boat, lantern, pads, blooms)
             pool.ts + worker.ts (painting off the main thread)
src/drift/   river.ts (the channel, cut into reaches; landmarks, clearings) · camera.ts (the boat and where it looks)
             render.ts (the diorama) · water.ts (the painted water, sky and weave) · daylight.ts (the hour) · drift.ts
src/anim/    life.ts (easel: trembling light, rings, petals, a dragonfly) · drift-life.ts (rings, pollen and fireflies, petals, insects, birds)
             sound.ts (the drift's ambience, synthesised)
src/main.ts  the easel, the palette (and its choice of light) and the loop
src/postcard.ts  frames a painted canvas as a postcard
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

The far bank is not one mass of leaves but separate **plantings**, picked by `garden.plants(x, y)`: weeping willow hanging down the left (long, thin, vertical strokes in cool greens), dark mottled shrubs behind the bridge (short, blobby touches at every angle in olive, rust and near-black), and pale feathery bush to the right (flicks leaning up and to the right in cream, lilac and pink among the yellow-greens, with dark gaps). The edges between stands wander with noise. `plantTouch()` in `foliage.ts` makes the stroke for each, and the drift's cards use it too. Flecks of colour differ by planting as well.

Layers, back to front:

1. wash and a loose underpainting
2. foliage wall, with sunlit touches
3. willow fronds fringing the top
4. bank, with irises and grasses growing along it
5. water: the bank mirrored and broken into vertical and horizontal strokes, then the open water between the rafts worked up in small, high-contrast touches (bright mirrored leaves, violet-blue shade, pale patches of sky)
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

The drift is a diorama of flat painted cards, made in the spirit of *Shroom and Gloom*'s layered dungeons, and lit and furnished so that it feels like standing in the garden rather than looking at it.

- **The river** is a channel whose centre and width wander with noise, opening into ponds now and then. It is cut into 30 m **reaches**. Each reach's contents are seeded by `hash(seed, reach, slot)`, so a seed's river is always the same:
  - rows of cards behind each bank: reeds standing in the shallows; reeds, irises, grass and flower beds at the edge; shrubs and more flowers; willows and poplars; a far backdrop;
  - **canopy** cards, branches hanging overhead (see below);
  - rafts of pads with the odd bloom, singles scattered over the open water, and glints, ripples and dapples of sun on the water;
  - sometimes a footbridge spanning the channel (never two reaches in a row). Reach 0 always has a bridge square ahead, so stepping into the easel lands you in front of one.
- **Landmarks** give a long row something to row toward. Also by reach hash: a **rowboat** tied up at a bank, a **stone lantern** on the shore, and now and then a **clearing**, a whole reach with no branches overhead, the tall trees thinned, flower beds thick on the banks and the light turned up. Bridges are the fourth landmark. `River.openness(z)` eases a clearing in and out across its ends.
- **The hour** turns as you row. `daylight(z)` (`src/drift/daylight.ts`) is a pure function of distance rowed: a bright morning to begin with, then a golden afternoon, a violet dusk (the pollen turns to fireflies) and a pink dawn mist, over 800 m, then round again. The renderer lays the colour of the hour over the finished view, and the sun's bloom and light shafts follow it and the openness of the sky.
- **Cards** are painted in the workers with the same brush and the seed's palette, from `hash(seed, kind, variant)`: a few variants per kind, streamed nearest first. Foliage cards use the same plantings as the easel (`plantTouch`), with their accent colours turned down, since strokes this big would read as blotches. Pads are painted with a rounded body and outline, so they hold up close.
  - **Canopy cards** hang above the water (`Placed.elev` is the height of the card's bottom edge). They are leaves all the way up with fronds hanging from the underside, and the top and sides **dissolve**: a floating card must never show an edge, or it reads as a bush hanging in the air. A few reach clear across the channel, and none are placed near a bridge.
- **Rendering** stands every card up as a billboard, projects it (`scale = f / zr`), sorts far to near and paints them over each other, so nearer flats cover farther ones and slide past faster. Lily pads lie flat: they are squashed by how steeply you look down at them.
  - **Order, fog and fades use distance from the boat (`d`), never depth along the view (`zr`).** `zr` places a card on screen. `d` does not change when the view turns, so steering never reshuffles the walls or flickers their haze. Cards ease in over under a second once painted and fade out at the nearest and farthest limits, so nothing pops.
  - **Depth** comes from fine slabs, about 45 of them. Each time drawing crosses one, a thin veil of the series' air is laid over what has been drawn so far (with `source-atop`, so only over cards and water), so each layer back is a little paler and mistier, in steps too small to see.
  - **The water** is a mirror, painted over:
    - Every standing card is drawn again upside down into a half-resolution buffer, which is pasted below the horizon in rippling strips and tinted by the pond. Elevated cards mirror about the water, so a branch reflects as hanging below its own height.
    - Over that goes a tile of half-transparent horizontal brushwork, painted once per seed. It is laid on the water plane in perspective one screen row at a time, each row a pattern fill scaled for its depth.
    - Near the boat the tile is laid at finer world scales, blended across depth, so the strokes stay brush-sized instead of blowing up into smears.
    - The sky lies in the water too, under the reflected garden, and patches of sun (dapples) sit on it, anchored in the world so they sweep past as you row.
  - **The sky** is painted once per seed on a tile that wraps sideways: a wash that warms toward the horizon, soft puffs of cloud with violet shade, a low sun, and a hazy three-layer **treeline** along the bottom that closes the horizon, so the sky is only what shows above and between the trees. It pans at the true angular rate of the view, as if at infinity, and is composited **last, behind everything** (`destination-over`), so the fog can't wash it out. Birds cross it behind the trees.
  - **Light** falls through the leaves: soft slanted shafts, strongest in a clearing and at golden hour. The canvas weave lies faintly over the whole view.
- **The boat** is the camera, and you never see it. Rowing eases it up to speed and the water slowly takes the speed back. It steers with A/D, glides on when left alone, and leans back toward open water near the banks. It sits steady: a glide, not a bob. **The mouse looks around**: left and right turns the eye, up looks up into the canopy and down looks at the water.
- **Life** (`src/anim/drift-life.ts`): rings from the oars and the bow and now and then a rising fish, pollen that becomes fireflies at dusk, drifting petals, dragonflies, butterflies over the shallows, and flocks of birds in the sky.
- **Sound** (`src/anim/sound.ts`) is made of noise and a few sine chirps, with no audio files: water that swells as you speed up, wind in the leaves, birds calling from somewhere off in the trees, a fish now and then, a splash on each oar stroke. It starts when you step into the boat (browsers won't start audio before a click or key press) and fades when you step out. `M` mutes it, and the choice is remembered.

### Determinism

The same seed always paints the same easel picture and the same river, down to which reaches are clearings and where the boats and lanterns lie. Painting, card and world code (including `river.ts`) never call `Math.random()`: everything is drawn from `hash(seed, …)`. The hour is a pure function of distance rowed. The animation layers (`src/anim/`: ripples, life, sound) do use `Math.random()`, but they only draw over the finished picture or scene, or make sound. `debug-determinism.html` (gitignored, like all `debug-*` pages) paints seeds twice and tiled vs whole, and compares the pixels.
