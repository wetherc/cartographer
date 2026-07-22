# Architecture

## Module layout

```
src/
  main.js              entry point, wires modules, mounts app
  types/               .ts declaration files, no runtime code (checked via JSDoc + tsc)
  map/                 tile grid, hierarchy, canvas rendering, region grouping, fog of war
  dice/                dice roll logic
  entities/            encounter/resource/character models
  party/               party position tracking, triggers fog reveal
  storage/             whole-campaign serialization + localStorage/file persistence
  ui/                  thin DOM-wiring widgets (DiceTray, Breadcrumb, CharacterSheet, InventoryPanel, EncounterPanel)
```

`index.html`/`style.css`/`main.js` wiring all of the above into one app is the only piece not yet built — see `PLAN.md`.

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

### Fog of war and the party

`FogOfWar.js` (`src/map/FogOfWar.js`) is pure functions over a `MapNode`: `revealAround(node, centerId, radius)` parses `centerId` as an `"x,y"` grid coordinate (same convention as `MapCanvas`/`RegionGroups`) and reveals every tile within a Euclidean radius of it. Revealing is monotonic — a tile that's already revealed, or outside the radius, is left untouched, so moving away from an area never re-fogs it. `hideAll(node)` resets a node back to fully unrevealed (for a reset/debug path); `revealedCount(node)` is a small helper for "percent explored"-style readouts.

`PartyTracker` (`src/party/PartyTracker.js`) owns the party's `PartyPosition` (nodeId + tileId) and is the only thing that should move the party: `moveTo(nodeId, tileId)` updates that position and calls `revealAround` on the target node, writing the result straight back into the `TileGrid` it was constructed with. The constructor also reveals around the initial position, so a party never starts fogged in on their own tile. `moveTo`'s `nodeId` can differ from the party's current node, so crossing between a parent map and a zoomed-in region (via `MapNavigator`) works the same way as moving within one node — each node's revealed state is independent.

## Entities

`entities/Encounter.js`, `entities/Resource.js`, and `entities/Character.js` (types in `src/types/entities.ts`) are all plain immutable-update modules: every function takes a value and returns a new one rather than mutating (`applyDamage`/`heal` on an `Encounter`, `spend`/`restore`/`setMax` on a `ResourcePool`, `addXP`/`setStat`/`addItem`/`removeItem` on a `Character`), consistent with `TileGrid.js`'s `setTile`/`updateTileMetadata`. HP and resource pools clamp to `[0, max]` on every operation rather than validating separately. `Character.addXP` uses an `N * XP_PER_LEVEL` (100) cost curve and loops internally so one large XP award can cross several level thresholds in a single call. A character's resources and inventory are looked up by id from within `Character.js` (`spendResource`/`restoreResource` delegate to the matching `ResourcePool` via `Resource.js`; `addItem`/`removeItem` merge/split inventory stacks by item id, dropping a stack once its quantity hits 0).

`ui/CharacterSheet.js`, `ui/InventoryPanel.js`, and `ui/EncounterPanel.js` are the DOM-wiring layer over those entity modules, following the same mount-function pattern as `ui/DiceTray.js`: each holds a local mutable copy of its entity, re-renders after every interaction, and reports the updated value through an `onChange` callback for a caller (eventually `main.js`, persisting via `SaveManager`) to pick up.

## Persistence

`storage/SaveManager.js` serializes an entire campaign as one JSON blob, per `types/storage.ts`'s `CampaignState` (a flat `nodes` array — `TileGrid`'s node map flattened — plus `party`, `characters`, `encounters`). `buildState`/`serialize`/`deserialize`/`toTileGrid` are pure: `toTileGrid` rebuilds a working hierarchy by re-adding each node, since a `MapNode` already carries its own `parentId`, and `deserialize` defaults any missing top-level field to an empty value instead of throwing, so an older/smaller save shape still loads. `saveToLocalStorage`/`loadFromLocalStorage`/`downloadState`/`readStateFromFile` are thin wrappers around those pure functions using the actual browser APIs (`localStorage`, `Blob`, `FileReader`).

## Testability pattern

The recurring split across this codebase: **pure logic takes its side effects (RNG, current time, etc.) as arguments and returns data**, so it can be unit tested with `node --test` and no DOM. Thin wrapper code then wires that logic to the DOM/canvas and is verified visually instead of via unit test. Examples: `roll(selection, rng)` vs `ui/DiceTray.js`; `MapNavigator`/`RegionGroups`/`FogOfWar`/`PartyTracker` vs `MapCanvas`'s event handlers; `Encounter`/`Resource`/`Character` vs `ui/CharacterSheet.js`/`ui/InventoryPanel.js`/`ui/EncounterPanel.js`; `SaveManager`'s serialize/deserialize/toTileGrid vs its localStorage/download/file wrappers.
