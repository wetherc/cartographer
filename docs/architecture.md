# Architecture

## Module layout

```
src/
  main.js              composition root: builds the AppContext, calls each app/ wiring module
  app/                 wiring modules, one per feature area (see below)
  types/               .ts declaration files, no runtime code (checked via JSDoc + tsc)
  campaign/            campaign construction: blank/example campaign builders + initial load
  map/                 tile grid, hierarchy, canvas rendering, region grouping, fog of war
  dice/                dice roll logic
  entities/            encounter/resource/character models
  party/               party position tracking, triggers fog reveal
  storage/             whole-campaign serialization + localStorage/file persistence
  ui/                  thin DOM-wiring widgets (DiceTray, Breadcrumb, CharacterSheet, InventoryPanel, EncounterPanel)
```

`index.html`/`style.css` plus `main.js` and `src/app/` wire all of the above into one app. `style.css` only `@import`s the feature-scoped sheets in `styles/` (base tokens/primitives first, the responsive overrides last), so the cascade order is fixed in one place. The wiring holds only wiring — state singletons, mount calls, and event handlers; anything constructible without the DOM (campaign generation in `campaign/Campaigns.js`, region-entry resolution in `map/EntryPoint.js`) lives in a module instead.

### The app/ wiring layer

`main.js` constructs one **AppContext** (`src/types/app.ts`): the engine objects (`palette`, `grid`, `navigator`, `partyTracker`, `toasts`), a mutable `state` record holding the campaign data a save serializes plus the mode/role switches, and two registries — `views` (mounted panels other modules refresh) and `actions` (cross-module operations) — that start empty and are filled in by the wiring modules as they run. Everything on the context is read at call time inside event handlers, never captured, so a module mounted early can safely call a view or action a later module registers.

One module per feature area, each a `wireX(app)` factory:

- `campaignActions.js` — the dirty flag (Save indicator, leave-page guard), header campaign controls (Save/Undo/New/Load example/Export/Import), cross-tab reload-on-save; provides `markDirty`/`setDirty`.
- `mapWiring.js` — the canvas and its gestures, breadcrumb, both world trees, tile inspector, palette + drag-drop, fog controls, stroke-level undo, Build-rail tools; provides the map-facing actions (`goTo`-style syncs, `snapshotEdit`, `undoStroke`, `onModeChanged`/`onRoleChanged`).
- `generateAction.js` — the Generate dialog flow and its non-destructive apply.
- `nodeActions.js` — node create/edit/delete (predates the split; same context-object pattern).
- `partyWiring.js` — roster, character sheet, inventory, Time panel; provides `refreshSelectedCharacter`.
- `encounterWiring.js` — Encounters and Initiative panels, the Build-rail encounter authoring list, bestiary, walked-into-an-encounter alert; owns transient combat state. A shared create/edit dialog (name, HP, level/tier, placement via `locationFields`) backs both panels' add and edit actions; edits go through the pure `Encounter.editEncounter`, which keeps live state (current HP clamped to a new max, stat block, conditions) and resets the `noticed` flag when the encounter moves.
- `storyWiring.js` — travelogue (provides `logEvent`), NPCs, quests, handouts.
- `sessionControls.js` — mode/role switches (role guarded by the cross-tab GM lock), sidebar tabs and collapse; provides `setMode`.
- `shortcuts.js`, `onboarding.js` — global keyboard shortcuts and the first-run overlay.

Per-module UI state (selected tile, active brush, fog tool, edit history, selected character, combat, dirty) stays private inside the module that owns it; only the campaign data lives on `app.state`.

Everything is a native ES module loaded directly by the browser — no bundler, no transpilation. `tsconfig.json` sets `allowJs`/`checkJs` so `tsc --noEmit` typechecks the `.js` files against the `.ts` declarations without emitting anything.

## The map hierarchy

`MapNode` (see `src/types/map.ts`) is a rectangular grid of `Tile`s. Nodes form a tree via `parentId`: a world node's tiles can each optionally carry a `childNodeId` pointing at a region node, whose tiles can point at sub-region nodes, and so on. `TileGrid` (`src/map/TileGrid.js`) is just a `Map<id, MapNode>` registry with helpers to add/get/update nodes, walk the `parentId` chain for a breadcrumb, and resolve a tile's zoom target.

There is deliberately no separate "region" entity — a region is just a `MapNode` reached through one or more tiles' `childNodeId`.

### Grid coordinates

`Tile.id` has no dedicated x/y field. Tiles placed in a grid (as opposed to hierarchy-test fixtures that just need *a* unique id) use `"x,y"` as their id, e.g. `"3,4"`. `parseCoords`/`tileRect`/`screenToTile` in `src/map/MapGeometry.js` are the pure functions that convert between grid coordinates and screen pixels; anything that needs a tile's position parses its id rather than reading a stored field. Ids that don't match `"x,y"` are simply skipped by grid-aware code (see `RegionGroups.findRegionGroups`), so non-grid tiles (used in `TileGrid.test.js` hierarchy fixtures) are unaffected.

### Region grouping

A region can be entered from more than one tile: any set of 4-neighbor-contiguous tiles sharing the same non-null `childNodeId` count as one region block. `RegionGroups.findRegionGroups(node)` (`src/map/RegionGroups.js`) is a pure flood-fill that returns `{ childNodeId, tileIds, minX, minY, maxX, maxY }` per group — no schema change was needed to support this, since multiple tiles simply carry the same `childNodeId` value. `MapCanvas` recomputes groups whenever a node loads and draws a tint + outline over each group's bounding box, optionally labeled via a `getNodeName` callback.

On outdoor (`kind: 'region'`) maps, a multi-tile region block also renders as scaled images instead of per-tile art: `groupImageChunks(node, group)` partitions a filled-rectangle group into blocks of at most 2x2 tiles, each represented by one image (`groupImageRef` — a POI-marked tile's art wins, else the top-left-most tile's), and `MapRenderer._renderGroupImages` draws each chunk's image stretched across its block, with the per-tile pass skipping the covered base images. Fog rects and path overlays still draw per tile on top, so a partially explored block reveals piecewise and a road through a region stays tile-sized. Ragged (non-rectangular) groups and interiors keep plain per-tile rendering.

### Rendering and navigation

- `MapCanvas` (`src/map/MapCanvas.js`) owns the `<canvas>`: draws tiles (fog rect if `!tile.revealed`, otherwise the image at `tile.imageRef`) and region group overlays, and handles pointer-drag pan + cursor-anchored wheel zoom. A pointerup is treated as a tile click only if total drag distance stayed below a small threshold, so panning never also triggers a zoom-in.
- `MapNavigator` (`src/map/MapNavigator.js`) is pure logic (no DOM) tracking which node is "current" and exposing `zoomIn(tileId)` / `zoomOut()` / `goTo(nodeId)` / `getBreadcrumb()` over a `TileGrid`. `MapCanvas`'s `onTileClick` callback and `ui/Breadcrumb.js`'s click handler both just call into a `MapNavigator` and re-render.
- `TilePalette` (`src/map/TilePalette.js`) is the built-in tile catalog: terrain types have multiple interchangeable variants (`pickVariant(type, rng)`, RNG injected for testability), road pieces are named connector shapes rather than random variants (`getRoadPiece(kind)`), and callers can register custom tiles (`addCustom`/`removeCustom`) without being able to override built-ins.

### Fog of war and the party

`FogOfWar.js` (`src/map/FogOfWar.js`) is pure functions over a `MapNode`: `revealAround(node, centerId, radius)` parses `centerId` as an `"x,y"` grid coordinate (same convention as `MapCanvas`/`RegionGroups`) and reveals every tile within a Euclidean radius of it. Revealing is monotonic — a tile that's already revealed, or outside the radius, is left untouched, so moving away from an area never re-fogs it. `hideAll(node)` resets a node back to fully unrevealed (for a reset/debug path); `revealedCount(node)` is a small helper for "percent explored"-style readouts. `withinRadius(tileId, centerId, radius)` exposes the same Euclidean cutoff as a predicate: `MapRenderer` uses it to gate the encounter/NPC/POI markers to a detection range — twice the fog reveal radius (`MapView.markerRange`, wired from `PartyTracker.revealRadius`) around the party tile and every character token — so a marker can be sensed slightly beyond the fog edge but never across the map, and a node the party isn't in shows no markers at all outside Build mode.

`PartyTracker` (`src/party/PartyTracker.js`) owns the party's `PartyPosition` (nodeId + tileId) and is the only thing that should move the party: `moveTo(nodeId, tileId)` updates that position and calls `revealAround` on the target node, writing the result straight back into the `TileGrid` it was constructed with. The constructor also reveals around the initial position, so a party never starts fogged in on their own tile. `moveTo`'s `nodeId` can differ from the party's current node, so crossing between a parent map and a zoomed-in region (via `MapNavigator`) works the same way as moving within one node — each node's revealed state is independent.

`CharacterTokens.js` (`src/party/CharacterTokens.js`) layers individual characters over that shared position: a `Character.location` of null means "with the party" (the token renders on the party's tile), while a non-null location is the character's own tile. `characterTokens(characters, partyPosition, nodeId)` resolves the named tokens to draw in a rendered node, `moveCharacter` relocates one character, `recallAll` drops every individual location — the whole-party teleport — and `isSplit`/`characterPosition` back the regroup flow below. Movement permissions reuse `CharacterBinding.partyPermissions`: the GM moves the party (map clicks, which recall everyone) and any single character (the roster's place action); a bound player tab moves only its own character, whose steps reveal fog via the same `revealAround`.

All of that individual movement sits behind the persisted `splitParty` flag (on `CampaignState`, default false), toggled by a GM-only switch in the Party panel (`partyWiring.js`). While it's off, `syncPartyMarker` passes no tokens to the canvas (only the shared marker renders), the roster hides its place action, and a bound player's map click is a no-op — the party moves simultaneously, by GM clicks alone. Turning the switch off while `isSplit` reports scattered characters first regroups the party at a GM-chosen member's `characterPosition` (a `PartyTracker.moveTo` plus `recallAll`); cancelling the picker leaves the switch on.

## Entities

`entities/Encounter.js`, `entities/Resource.js`, and `entities/Character.js` (types in `src/types/entities.ts`) are all plain immutable-update modules: every function takes a value and returns a new one rather than mutating (`applyDamage`/`heal` on an `Encounter`, `spend`/`restore`/`setMax` on a `ResourcePool`, `addXP`/`setStat`/`addItem`/`removeItem` on a `Character`), consistent with `TileGrid.js`'s `setTile`/`updateTileMetadata`. HP and resource pools clamp to `[0, max]` on every operation rather than validating separately. `Character.addXP` uses an `N * XP_PER_LEVEL` (100) cost curve and loops internally so one large XP award can cross several level thresholds in a single call. A character's resources and inventory are looked up by id from within `Character.js` (`spendResource`/`restoreResource` delegate to the matching `ResourcePool` via `Resource.js`; `addItem`/`removeItem` merge/split inventory stacks by item id, dropping a stack once its quantity hits 0).

`ui/CharacterSheet.js`, `ui/InventoryPanel.js`, and `ui/EncounterPanel.js` are the DOM-wiring layer over those entity modules, following the same mount-function pattern as `ui/DiceTray.js`: each holds a local mutable copy of its entity, re-renders after every interaction, and reports the updated value through an `onChange` callback for a caller (eventually `main.js`, persisting via `SaveManager`) to pick up.

## Persistence

`storage/SaveManager.js` serializes an entire campaign as one JSON blob, per `types/storage.ts`'s `CampaignState` (a flat `nodes` array — `TileGrid`'s node map flattened — plus `party`, `characters`, `encounters`). `buildState`/`serialize`/`deserialize`/`toTileGrid` are pure: `toTileGrid` rebuilds a working hierarchy by re-adding each node, since a `MapNode` already carries its own `parentId`, and `deserialize` defaults any missing top-level field to an empty value instead of throwing, so an older/smaller save shape still loads. `saveToLocalStorage`/`loadFromLocalStorage`/`downloadState`/`readStateFromFile` are thin wrappers around those pure functions using the actual browser APIs (`localStorage`, `Blob`, `FileReader`).

## Testability pattern

The recurring split across this codebase: **pure logic takes its side effects (RNG, current time, etc.) as arguments and returns data**, so it can be unit tested with `node --test` and no DOM. Thin wrapper code then wires that logic to the DOM/canvas and is verified visually instead of via unit test. Examples: `roll(selection, rng)` vs `ui/DiceTray.js`; `MapNavigator`/`RegionGroups`/`FogOfWar`/`PartyTracker` vs `MapCanvas`'s event handlers; `Encounter`/`Resource`/`Character` vs `ui/CharacterSheet.js`/`ui/InventoryPanel.js`/`ui/EncounterPanel.js`; `SaveManager`'s serialize/deserialize/toTileGrid vs its localStorage/download/file wrappers.
