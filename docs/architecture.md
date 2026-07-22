# Architecture

## Module layout

```
src/
  main.js              entry point, wires modules, mounts app
  types/               .ts declaration files, no runtime code (checked via JSDoc + tsc)
  map/                 tile grid, hierarchy, canvas rendering, region grouping
  dice/                dice roll logic
  entities/            encounter/resource/character models (in progress)
  party/               party position tracking (in progress)
  storage/             save/load (in progress)
  ui/                  thin DOM-wiring widgets (DiceTray, Breadcrumb, ...)
```

Everything is a native ES module loaded directly by the browser — no bundler, no transpilation. `tsconfig.json` sets `allowJs`/`checkJs` so `tsc --noEmit` typechecks the `.js` files against the `.ts` declarations without emitting anything.

## The map hierarchy

`MapNode` (see `src/types/map.ts`) is a rectangular grid of `Tile`s. Nodes form a tree via `parentId`: a world node's tiles can each optionally carry a `childNodeId` pointing at a region node, whose tiles can point at sub-region nodes, and so on. `TileGrid` (`src/map/TileGrid.js`) is just a `Map<id, MapNode>` registry with helpers to add/get/update nodes, walk the `parentId` chain for a breadcrumb, and resolve a tile's zoom target.

There is deliberately no separate "region" entity — a region is just a `MapNode` reached through one or more tiles' `childNodeId`.

### Grid coordinates

`Tile.id` has no dedicated x/y field. Tiles placed in a grid (as opposed to hierarchy-test fixtures that just need *a* unique id) use `"x,y"` as their id, e.g. `"3,4"`. `parseCoords`/`tileRect`/`screenToTile` in `src/map/MapCanvas.js` are the pure functions that convert between grid coordinates and screen pixels; anything that needs a tile's position parses its id rather than reading a stored field. Ids that don't match `"x,y"` are simply skipped by grid-aware code (see `RegionGroups.findRegionGroups`), so non-grid tiles (used in `TileGrid.test.js` hierarchy fixtures) are unaffected.

### Region grouping

A region can be entered from more than one tile: any set of 4-neighbor-contiguous tiles sharing the same non-null `childNodeId` count as one region block. `RegionGroups.findRegionGroups(node)` (`src/map/RegionGroups.js`) is a pure flood-fill that returns `{ childNodeId, tileIds, minX, minY, maxX, maxY }` per group — no schema change was needed to support this, since multiple tiles simply carry the same `childNodeId` value. `MapCanvas` recomputes groups whenever a node loads and draws a tint + outline over each group's bounding box, optionally labeled via a `getNodeName` callback.

### Rendering and navigation

- `MapCanvas` (`src/map/MapCanvas.js`) owns the `<canvas>`: draws tiles (fog rect if `!tile.revealed`, otherwise the image at `tile.imageRef`) and region group overlays, and handles pointer-drag pan + cursor-anchored wheel zoom. A pointerup is treated as a tile click only if total drag distance stayed below a small threshold, so panning never also triggers a zoom-in.
- `MapNavigator` (`src/map/MapNavigator.js`) is pure logic (no DOM) tracking which node is "current" and exposing `zoomIn(tileId)` / `zoomOut()` / `goTo(nodeId)` / `getBreadcrumb()` over a `TileGrid`. `MapCanvas`'s `onTileClick` callback and `ui/Breadcrumb.js`'s click handler both just call into a `MapNavigator` and re-render.
- `TilePalette` (`src/map/TilePalette.js`) is the built-in tile catalog: terrain types have multiple interchangeable variants (`pickVariant(type, rng)`, RNG injected for testability), road pieces are named connector shapes rather than random variants (`getRoadPiece(kind)`), and callers can register custom tiles (`addCustom`/`removeCustom`) without being able to override built-ins.

## Testability pattern

The recurring split across this codebase: **pure logic takes its side effects (RNG, current time, etc.) as arguments and returns data**, so it can be unit tested with `node --test` and no DOM. Thin wrapper code then wires that logic to the DOM/canvas and is verified visually instead of via unit test. Examples: `roll(selection, rng)` vs `ui/DiceTray.js`; `MapNavigator`/`RegionGroups` vs `MapCanvas`'s event handlers.
