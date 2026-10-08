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
- Seed `1899`'s easel must stay Monet's composition (`src/world/giverny.ts`); every other seed is a variation from `src/world/garden.ts`. Never ship traced or scanned image data.
- The drift river is split into reaches (`src/drift/river.ts`). Seed a reach's contents by `hash(seed, reach, slot)`, and keep any feature's reach within two reaches (`REACH`). Cutout cards are painted from `hash(seed, kind, variant)` and drawn as billboards sorted far to near.
- Painting (easel tiles and drift cards) runs in workers (`src/paint/worker.ts`). Keep worker canvases CPU-backed. Anything needing web fonts (the signature) is drawn on the page.
- Animation lives in `src/anim/` and draws over the finished painting or scene. It may use `Math.random()`, but must not change what a seed paints.
