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
  library/             built-in default templates (equipment/bestiary/NPCs) + custom-library merge logic
  party/               party position tracking, triggers fog reveal
  storage/             whole-campaign serialization + localStorage/file persistence; the custom library's own store
  ui/                  thin DOM-wiring widgets (DiceTray, Breadcrumb, CharacterSheet, InventoryPanel, EncounterPanel)
```

`index.html`/`style.css` plus `main.js` and `src/app/` wire all of the above into one app. `style.css` only `@import`s the feature-scoped sheets in `styles/` (base tokens/primitives first, the responsive overrides last), so the cascade order is fixed in one place. The wiring holds only wiring — state singletons, mount calls, and event handlers; anything constructible without the DOM (campaign generation in `campaign/Campaigns.js` — the example world's maps in `campaign/ExampleWorld.js`, its populace in `campaign/ExampleContent.js` — region-entry resolution in `map/EntryPoint.js`) lives in a module instead.

### The app/ wiring layer

`main.js` constructs one **AppContext** (`src/types/app.ts`): the engine objects (`palette`, `grid`, `navigator`, `partyTracker`, `toasts`), a mutable `state` record holding the campaign data a save serializes plus the mode/role switches, and two registries — `views` (mounted panels other modules refresh) and `actions` (cross-module operations) — that start empty and are filled in by the wiring modules as they run. Everything on the context is read at call time inside event handlers, never captured, so a module mounted early can safely call a view or action a later module registers.

One module per feature area, each a `wireX(app)` factory:

- `campaignActions.js` — the dirty flag (Save indicator, leave-page guard), header campaign controls (Save/Undo/New/Load example/Export/Import), cross-tab reload-on-save; provides `markDirty`/`setDirty`.
- `mapWiring.js` — the map mounts and location syncs: the canvas, breadcrumb, both world trees, palette, fog controls, Build-rail tools; provides the map-facing actions (`goTo`-style syncs, `onModeChanged`/`onRoleChanged`) and the shared `MapEnv` context. The gesture layers live beside it: `mapAuthoring.js` (Build-mode paint/erase/region strokes, drop-paint, the tile inspector, `snapshotEdit`/`undoStroke`) and `mapTravel.js` (Play-mode cell clicks, teleports, POI discovery, NPC meets, the hover tooltip).
- `generateAction.js` — the Generate dialog flow and its non-destructive apply.
- `nodeActions.js` — node create/edit/delete (predates the split; same context-object pattern).
- `partyWiring.js` — roster, character sheet, inventory, Time panel; provides `refreshSelectedCharacter`.
- `encounterWiring.js` — Encounters and Initiative panels, the Build-rail encounter authoring list, walked-into-an-encounter alert; owns transient combat state. The shared create/edit dialog (name, HP, level/tier, placement via `locationFields`) lives in `encounterForm.js` and backs both panels' add and edit actions; edits go through the pure `Encounter.editEncounter`, which keeps live state (current HP clamped to a new max, stat block, conditions) and resets the `noticed` flag when the encounter moves. The bestiary spawn dialog is `encounterForm.js`'s `addFromBestiary`; the 5e attack resolution the Initiative panel triggers is `weaponAttack.js`, and spell resolution is `spellCast.js`. Both build on `combatants.js`, the one place that resolves a participant id across the three combatant collections: `findCombatant(app, id)` returns `{ entity, kind, store }` (the `store` writes an update back to the owning collection with its panel refreshes), `combatantsAsTargets` assembles a foe/ally target list from the running order, and `applyToTarget` is the single damage/heal write path with the defeat and drop-to-0 transitions each logged exactly once. New combat features should route entity resolution and HP application through these rather than re-writing the character/encounter/NPC cascade — phase 9's NPC HP/AC lands by extending `combatants.js`, not by finding every copy.
- `storyWiring.js` — travelogue (provides `logEvent`), NPCs, quests, handouts.
- `libraryWiring.js` — the Library mode's three template lists (equipment, bestiary, NPCs) and the custom-library file controls (export/import/reset, startup auto-load). The custom library is deliberately not campaign state: `library/Library.js` holds the built-in defaults, the pure merge logic (a custom entry whose name — and for equipment, type — matches a default overrides it in place; others append), and a small module-level "active library" registry that the preset consumers (the item form's pickers, the enemy gear selects, "From bestiary") read at call time, since they mount far from the wiring that loads customizations.
- `sessionControls.js` — mode/role switches (role guarded by the cross-tab GM lock), sidebar tabs and collapse; provides `setMode`. Mode is a three-way Play / Build / Library toggle; Library mode hides the map column entirely and shows only the template lists.
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

Independent of region links, a tile can carry an optional `span` (set by `paintTile(node, tileId, imageRef, overlay, span)` when the Build palette's Size row is at 2x/3x): its image draws stretched across a span x span block anchored at the tile (shifted up/left near the far edges so it stays in bounds). `spanBlocks(node)` in `TilePaint.js` enumerates these blocks pure-geometrically and `MapRenderer._renderSpanImages` draws them right after the region-block chunks, feeding the same cover set so the tile pass skips covered base images while fog and overlays stay per tile. Unlike region chunks, span art renders on interiors too, and covered cells keep their own tiles untouched — repainting the anchor at 1x clears the span.

### Rendering and navigation

- `MapCanvas` (`src/map/MapCanvas.js`) owns the `<canvas>`: it holds the view state (node, pan/zoom, markers, selection), draws tiles (fog rect if `!tile.revealed`, otherwise the image at `tile.imageRef`) and region group overlays via `MapRenderer` (which keeps the terrain/fog/region passes itself and delegates the marker layer to `MapMarkers` in `src/map/MapMarkers.js` and the cursor/marquee/selection/POI/coordinate chrome to `MapDecorations` in `src/map/MapDecorations.js`), and delegates input to two controllers that mutate that state back through the host reference — `MapCanvasPointer` (`src/map/MapCanvasPointer.js`: right-drag/touch pan, cursor-anchored wheel and pinch zoom, authoring strokes, hover tracking, context click) and `MapCanvasKeyboard` (`src/map/MapCanvasKeyboard.js`: arrow-key cursor, Enter/Space activation, +/- zoom, focus outline). A pointerup is treated as a tile click only if total drag distance stayed below a small threshold, so panning never also triggers a zoom-in.
- `MapNavigator` (`src/map/MapNavigator.js`) is pure logic (no DOM) tracking which node is "current" and exposing `zoomIn(tileId)` / `zoomOut()` / `goTo(nodeId)` / `getBreadcrumb()` over a `TileGrid`. `MapCanvas`'s `onTileClick` callback and `ui/Breadcrumb.js`'s click handler both just call into a `MapNavigator` and re-render.
- `TilePalette` (`src/map/TilePalette.js`) is the built-in tile catalog: terrain types have multiple interchangeable variants (`pickVariant(type, rng)`, RNG injected for testability), road pieces are named connector shapes rather than random variants (`getRoadPiece(kind)`), and callers can register custom tiles (`addCustom`/`removeCustom`) without being able to override built-ins.
- `Autotile.js` (`src/map/Autotile.js`) picks connector overlay pieces from a terrain grid, pure and RNG-injected: `smoothCoastline` widens water until every shore shape has a matching coast piece, `coastOverlays`/`coastKind` name the shoreline overlay per land cell, and `riverCourse` walks a meandering channel from the north edge south, returning the river piece per tile. The wilderness/town archetypes (`src/map/GeneratorRegions.js`, dispatched from `MapGenerator`; the dungeon/castle archetypes live in `src/map/GeneratorInteriors.js`) and the example world in `campaign/ExampleWorld.js` both build on it. A tile's `overlayRef` can hold a single ref or a draw-ordered stack (normalized by `TileGrid.overlayList`); where a river drains into a lake or the sea, the mouth tile stacks the channel over its shoreline piece so neither overlay displaces the other.

### Fog of war and the party

`FogOfWar.js` (`src/map/FogOfWar.js`) is pure functions over a `MapNode`: `revealAround(node, centerId, radius)` parses `centerId` as an `"x,y"` grid coordinate (same convention as `MapCanvas`/`RegionGroups`) and reveals every tile within a Euclidean radius of it. Revealing is monotonic — a tile that's already revealed, or outside the radius, is left untouched, so moving away from an area never re-fogs it. `hideAll(node)` resets a node back to fully unrevealed (for a reset/debug path); `revealedCount(node)` is a small helper for "percent explored"-style readouts. `withinRadius(tileId, centerId, radius)` exposes the same Euclidean cutoff as a predicate: `MapMarkers` (the renderer's marker layer) uses it to gate the encounter/NPC/POI markers to a detection range — twice the fog reveal radius (`MapView.markerRange`, wired from `PartyTracker.revealRadius`) around the party tile and every character token — so a marker can be sensed slightly beyond the fog edge but never across the map, and a node the party isn't in shows no markers at all outside Build mode.

`PartyTracker` (`src/party/PartyTracker.js`) owns the party's `PartyPosition` (nodeId + tileId) and is the only thing that should move the party: `moveTo(nodeId, tileId)` updates that position and calls `revealAround` on the target node, writing the result straight back into the `TileGrid` it was constructed with. The constructor also reveals around the initial position, so a party never starts fogged in on their own tile. `moveTo`'s `nodeId` can differ from the party's current node, so crossing between a parent map and a zoomed-in region (via `MapNavigator`) works the same way as moving within one node — each node's revealed state is independent.

`CharacterTokens.js` (`src/party/CharacterTokens.js`) layers individual characters over that shared position: a `Character.location` of null means "with the party" (the token renders on the party's tile), while a non-null location is the character's own tile. `characterTokens(characters, partyPosition, nodeId)` resolves the named tokens to draw in a rendered node, `moveCharacter` relocates one character, `recallAll` drops every individual location — the whole-party teleport — and `isSplit`/`characterPosition` back the regroup flow below. Movement permissions reuse `CharacterBinding.partyPermissions`: the GM moves the party (map clicks, which recall everyone) and any single character (the roster's place action); a bound player tab moves only its own character, whose steps reveal fog via the same `revealAround`.

All of that individual movement sits behind the persisted `splitParty` flag (on `CampaignState`, default false), toggled by a GM-only switch in the Party panel (`partyWiring.js`). While it's off, `syncPartyMarker` passes no tokens to the canvas (only the shared marker renders), the roster hides its place action, and a bound player's map click is a no-op — the party moves simultaneously, by GM clicks alone. Turning the switch off while `isSplit` reports scattered characters first regroups the party at a GM-chosen member's `characterPosition` (a `PartyTracker.moveTo` plus `recallAll`); cancelling the picker leaves the switch on.

## Entities

`entities/Encounter.js`, `entities/Resource.js`, and `entities/Character.js` (types in `src/types/entities.ts`) are all plain immutable-update modules: every function takes a value and returns a new one rather than mutating (`applyDamage`/`heal` on an `Encounter`, `spend`/`restore`/`setMax` on a `ResourcePool`, `addXP`/`setStat`/`addItem`/`removeItem` on a `Character`), consistent with `TileGrid.js`'s `setTile`/`updateTileMetadata`. HP and resource pools clamp to `[0, max]` on every operation rather than validating separately. `Character.addXP` uses an `N * XP_PER_LEVEL` (100) cost curve and loops internally so one large XP award can cross several level thresholds in a single call. A character's resources and inventory are looked up by id from within `Character.js` (`spendResource`/`restoreResource` delegate to the matching `ResourcePool` via `Resource.js`; `addItem`/`removeItem` merge/split inventory stacks by item id, dropping a stack once its quantity hits 0).

`ui/CharacterSheet.js`, `ui/InventoryPanel.js`, and `ui/EncounterPanel.js` are the DOM-wiring layer over those entity modules, following the same mount-function pattern as `ui/DiceTray.js`: each holds a local mutable copy of its entity, re-renders after every interaction, and reports the updated value through an `onChange` callback for a caller (eventually `main.js`, persisting via `SaveManager`) to pick up.

## Persistence

`storage/SaveManager.js` serializes an entire campaign as one JSON blob, per `types/storage.ts`'s `CampaignState` (a flat `nodes` array — `TileGrid`'s node map flattened — plus `party`, `characters`, `encounters`). `buildState`/`serialize`/`deserialize`/`toTileGrid` are pure: `toTileGrid` rebuilds a working hierarchy by re-adding each node, since a `MapNode` already carries its own `parentId`, and `deserialize` defaults any missing top-level field to an empty value instead of throwing, so an older/smaller save shape still loads. `saveToLocalStorage`/`loadFromLocalStorage`/`downloadState`/`readStateFromFile` are thin wrappers around those pure functions using the actual browser APIs (`localStorage`, `Blob`, `FileReader`).

The GM's custom library persists separately in `storage/LibraryStore.js`, under its own localStorage key (`campaign-builder:library`) so New/Import/Load example never touch it. The browser copy is the working state; `downloadLibrary`/`readLibraryFromFile` round-trip it through a portable JSON file, and `fetchLibraryFile` seeds an empty browser from `library/campaign-library.json` (a gitignored path served from the project root) at startup. `normalizeLibrary` (in `library/Library.js`) makes every load tolerant, dropping invalid entries instead of throwing.

## Efficiency practices

The performance posture is deliberate minimalism: most collections (characters,
encounters, NPCs, quests, handouts, library templates) are small-n, and their
linear scans are cheap in absolute terms — leave them alone rather than
optimizing preemptively. Cost concentrates in a handful of places, each with an
established pattern that new code touching the same area should follow:

- **Canvas redraws coalesce through one `requestAnimationFrame`.**
  `MapCanvas.render()` only schedules a frame; bursts of pointermove/wheel
  events and multi-setter updates (e.g. the party-marker sync) collapse into a
  single redraw. Within a frame, `MapRenderer` gathers shared derived data
  into one `frame` object that every render pass reads. A new render pass
  should pull from that object — or extend it — rather than re-scanning
  `node.tiles`. Per-frame DOM chrome hanging off the render loop
  (`MapControls.update` via `onViewChange`) compares against what it last
  wrote and bails before touching the DOM when nothing changed.
- **Per-tile lookups go through `TileIndex`** (`src/map/TileIndex.js`), a
  WeakMap-cached id-to-tile/position index per node. The cache is safe because
  nodes are replaced immutably on every tile mutation — a stale node object can
  never serve fresh reads. Any new code that resolves tile ids in a loop
  (painting, fog, hit-testing) should use it instead of scanning the flat
  `tiles` array; conversely, any new mutation path must keep replacing the node
  rather than mutating tiles in place, or the index breaks.
- **Per-node derived data is WeakMap-cached, never recomputed per frame.**
  The revealed-id set (`MapRenderer.js`), span blocks (`TilePaint.spanBlocks`),
  region groups (`RegionGroups.findRegionGroups`), and group image chunks
  (`groupImageChunks`, keyed `(node, group)` — group objects are stable because
  the group cache makes them so) all follow the TileIndex pattern: a pure
  function of an immutable node caches its result keyed by the node object.
  Anything derivable from a node alone that a hot path recomputes should join
  this pattern; the returned arrays/sets are shared, so treat them as
  read-only. The tile pass itself iterates only the visible cell range (invert
  the view transform once, look cells up by id) — O(visible), never O(total
  tiles), and never a regex parse per tile per frame. The same pattern covers
  the combat rosters: `combatants.js` memoizes an id-index Map per
  characters/encounters array (safe because every mutation goes through
  `replaceById`, which replaces the array), so participant lookups during a
  fight are O(1) without any explicit invalidation.
- **Strokes defer derived work to the stroke's end.** A paint/erase/fog drag
  updates per cell through `MapCanvas.refreshNodeTiles` (node swap + redraw
  only); region-group recompute and the screen-reader map description settle
  once in `onStrokeEnd` (`mapAuthoring.js`). New per-cell gesture work should
  ask whether anyone can observe it mid-drag; if not, defer it the same way.
- **Fog reveals walk the disc, not the map.** `revealAround` iterates the
  radius's bounding square via TileIndex and copies the tile array once — and
  returns the *same* node object when nothing newly revealed, so the WeakMap
  caches above stay warm on a party step through explored ground. Mutation
  helpers on hot paths should preserve identity on no-op the same way.
- **Persistence never re-serializes what it already has.** The autosave history
  ring (`snapshotRawHistory`, `src/storage/SaveManager.js`) stores one raw
  snapshot string per localStorage key with a small numeric index; a push
  writes only the new string, skips a duplicate of the newest, and evicts old
  keys. Code touching save/history paths should move strings around, not
  parse-and-restringify a whole campaign, and should respect the quota
  fallbacks (shrink the ring, then drop it) already in place.
- **Growing lists render incrementally.** The travelogue panel builds its DOM
  skeleton once and prepends only entries newer than the last-rendered id
  (pure `entriesAfter`, `src/log/Travelogue.js`), rebuilding only when that
  anchor id vanishes (log cleared or replaced). A future panel over an
  append-mostly list should copy this diff-by-anchor-id pattern instead of
  clearing and rebuilding per event.
- **Derived merged lists are memoized at their single mutation point.** The
  library's `active*` getters cache their merged defaults+customs lists in
  module state, invalidated only by `setActiveLibrary`
  (`src/library/Library.js`), which every mutation path already routes
  through — and the projections over them (entry-only lists, per-type filters,
  the spell id index) live in the same cache object, so a getter never
  re-allocates on a repeat call. New derived collections (the planned feat
  catalog) should hang off the same cache-and-invalidate point rather than
  re-merging per call — and callers must treat the returned arrays as
  read-only, since they are shared.

## UI and style conventions

Patterns that keep the UI consistent. Each earned its place by drifting at
least once; new code should follow them rather than re-deciding locally:

- **CSS custom properties are the only source of color, spacing, radius, and
  type values, and they all live in `styles/base.css`.** Never write an inline
  fallback (`var(--border, rgba(...))`): a fallback silently masks a typo'd or
  missing token — a `var(--surface-2)` that doesn't exist renders as *nothing*,
  and a fallback would have hidden that bug instead of surfacing it. If a
  needed token doesn't exist (e.g. a contrast color for a new accent), add it
  to `base.css` as a `light-dark()` pair next to its relatives; every `*`
  accent token has a matching `*-contrast` token for text drawn on top of it.
- **Dialog discipline.** `confirmModal` is only for questions with two real
  answers. Pure notifications use `alertModal` (blocking, needs
  acknowledgment) or `app.toasts.show` (non-blocking, self-dismissing) — never
  a confirm with a dead Cancel button. The same event should get the same
  surface everywhere: a no-op undo is a toast, whichever undo stack it came
  from.
- **Every destructive action confirms first**, via `confirmModal` with
  `danger: true` and an imperative `confirmLabel` (`Delete`, `Discard`), with
  the affected thing named in the message (`Delete "Goblin camp"?`). Anything
  that throws away more state than one click created qualifies — including
  bulk variants (remove-all, clear) of otherwise safe single-step actions.
- **Buttons and empty states build through `src/ui/buttons.js`, never by
  hand.** `iconButton` and `textButton` own the `btn` class assembly, always
  set an aria-label on icon-only buttons, and default the hover `title` to it —
  the ~40 hand-rolled copies they replaced had drifted on exactly those
  attributes. `emptyState(message)` is the one "nothing here" paragraph. A new
  panel should have no `document.createElement('button')` of its own unless it
  is genuinely a different control (a tab, a chip, a select-like row).
- **Destructive controls are danger-styled and always visible.** A delete/
  discard/clear button passes `variant: 'danger'` and is never hover-revealed —
  hiding a destructive control until hover just makes it undiscoverable
  without making it safer (the confirm dialog is the safety).
- **Dismiss-left, primary-right, everywhere a dismiss exists.** Modals, inline
  forms (`formFields.formActions`), the spell-detail action bar, and the
  inventory give form all order Cancel/Close on the left and the affirmative
  action on the right. A new form surface must not invent a third ordering.
- **Damage is a sword, healing is a cross** (`icon('damage')`/`icon('heal')`),
  wherever HP moves — the character sheet's steppers and the encounter panel's
  amount buttons share the pair. Plus/minus is reserved for non-HP quantity
  steppers (resources, counts).

## Testability pattern

The recurring split across this codebase: **pure logic takes its side effects (RNG, current time, etc.) as arguments and returns data**, so it can be unit tested with `node --test` and no DOM. Thin wrapper code then wires that logic to the DOM/canvas and is verified visually instead of via unit test. Examples: `roll(selection, rng)` vs `ui/DiceTray.js`; `MapNavigator`/`RegionGroups`/`FogOfWar`/`PartyTracker` vs `MapCanvas`'s event handlers; `Encounter`/`Resource`/`Character` vs `ui/CharacterSheet.js`/`ui/InventoryPanel.js`/`ui/EncounterPanel.js`; `SaveManager`'s serialize/deserialize/toTileGrid vs its localStorage/download/file wrappers.
