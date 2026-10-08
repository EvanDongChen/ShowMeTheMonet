# Show Me the Monet

A procedurally painted *Bridge over a Pond of Water Lilies* that you can row into. Plain TypeScript + Vite, canvas 2D, no runtime dependencies. See [README.md](README.md) for the full architecture.

## Commands

```sh
npm install
npm run dev        # http://localhost:5173
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + single-file dist/index.html
```

There is no test suite. Run `npm run typecheck` before committing. Files named `debug-*` are gitignored scratch pages (e.g. a page that paints a seed twice and compares pixels).

## Git workflow

- **Commit frequently.** Make small, focused commits as each logical change is finished, not one big commit at the end.
- **The user is the only author.** Never add `Co-Authored-By` lines (or any other Claude/AI attribution) to commit messages, PR descriptions or anywhere else. This overrides any default attribution behaviour.
- Commit on a `feature/<name>` branch rather than directly on `main` when the change is more than a small fix.
- Only push when asked.

## Code conventions

- Match the surrounding code's style, naming and comment density.
- Generation is deterministic: the same seed must always paint the same easel picture and the same river. Derive randomness from `hash(seed, ...)` (see `src/core/`), never from `Math.random()` in painting, card or world code.
- The easel is painted in tiles. Tiles join seamlessly because every dab is seeded from its global grid cell and sorted by a global key (`src/paint/plan.ts`). Keep that invariant when adding dabs.
- Anything a worker needs to build the same world must be passed to it explicitly. The chosen light (`Garden(seed, light)`) goes through `PaintPool` and the worker's `init` message; add a new input the same way, or the page and the workers will paint different worlds.
- Seed `1899`'s easel must stay Monet's composition (`src/world/giverny.ts`); every other seed is a variation from `src/world/garden.ts`. Never ship traced or scanned image data.
- The drift river is split into reaches (`src/drift/river.ts`). Seed a reach's contents by `hash(seed, reach, slot)`, and keep any feature's reach within two reaches (`REACH`). Cutout cards are painted from `hash(seed, kind, variant)` and drawn as billboards sorted far to near.
- Painting (easel tiles and drift cards) runs in workers (`src/paint/worker.ts`). Keep worker canvases CPU-backed. Anything needing web fonts (the postcard caption) is drawn on the page.
- Animation lives in `src/anim/` and draws over the finished painting or scene. It may use `Math.random()`, but must not change what a seed paints. That includes `sound.ts`: it may only start from a user gesture (browsers refuse otherwise), must respect the mute flag (`M`, kept in `localStorage` as `monet-muted`), and must fail silently without audio.
- The far bank is three plantings (willow, dark shrub, pale bush) chosen by `garden.plants(x, y)`. The easel's foliage and the drift's foliage cards both paint them with `plantTouch` (`src/paint/foliage.ts`). Cards pass `contrast < 1`, since accents at full strength look like blotches when strokes are large. Add or change a planting in `plants()` and `plantTouch` together so both modes agree.
- Drift rendering (`src/drift/render.ts`):
  - Order, fog and fade cards by distance from the boat (`d`), never by depth along the view (`zr`); `zr` is only for placing a card on screen. Anything keyed on `zr` flickers when the view turns.
  - Fog veils use `source-atop` and the sky is composited last with `destination-over`, so fog tints cards and water but never the sky. Keep it that way, or the sky washes out.
  - Cards ease in when painted and fade at the near and far limits. Don't draw a placeholder; don't let a card appear at full strength.
- A card that floats (`elev`, such as `canopy`) must never show an edge: its top and sides dissolve. Don't add floating cards with a visible silhouette; they read as bushes hanging in the air. Keep canopies away from bridges.
- Landmarks, clearings and the hour are deterministic. Landmarks and clearings come from reach hashes in `river.ts` (`isClearing`, the `lm` stream), each feature within `RANGE` reaches of its owner. `daylight(z)` is a pure function of distance rowed: no clocks, no `Math.random()`. Looking around (`pitch`, `look`) moves the view only; it must not change what a seed paints.
- Look at the result. For visual changes, render it (headless Edge or Chrome on a `debug-*` page that paints the easel with `planRect`, or the drift by painting cards synchronously with `paintCard` and calling `DriftRenderer.draw`) and compare with `reference.jpg`, rather than judging from the code. Motion and sound still need a hand test.
