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

- `campaignActions.js` — the dirty flag (Save indicator, leave-page guard), header campaign controls (Save/Undo/Redo/New/Load example/Export/Import), cross-tab save adoption; provides `markDirty`/`setDirty`. When another tab saves, a Play-mode tab with nothing unsaved adopts that campaign in place through `rehydrate.js` (below) instead of reloading; Build and Library mode, and any failure to adopt, fall back to the reload.
- `mapWiring.js` — the map mounts and location syncs: the canvas, breadcrumb, both world trees, palette, fog controls, Build-rail tools; provides the map-facing actions (`goTo`-style syncs, `onModeChanged`/`onRoleChanged`) and the shared `MapEnv` context. The gesture layers live beside it: `mapAuthoring.js` (Build-mode paint/erase/region strokes, drop-paint, the tile inspector, `snapshotEdit`/`undoStroke`) and `mapTravel.js` (Play-mode cell clicks, teleports, POI discovery, NPC meets, the hover tooltip).
- `generateAction.js` — the Generate dialog flow and its non-destructive apply.
- `nodeActions.js` — node create/edit/delete (predates the split; same context-object pattern).
- `partyWiring.js` — roster, character sheet, inventory, Time panel; provides `refreshSelectedCharacter` and the `partyPanels` view, which re-reads everything those panels show at once.
- `rehydrate.js` — writes a loaded campaign over the running one: the grid's contents, the party position, the node in view, the ten campaign fields on `app.state`, then every campaign-backed view. It takes an already-built `Campaign` rather than reading storage, so migrations, asset restore, tile decode, and entity defaults stay stated once in `Campaigns.loadInitialCampaign` and shared with a page load. `mode` and `role` are deliberately not adopted: both are per-tab view state, so a display pinned to the Player view does not follow the GM tab into Build mode. A new campaign field has to join `SYNCED_STATE_KEYS`, which a test holds against the `Campaign` shape. This is what makes a follower tab's update cost a repaint rather than a page load — the parse never was the expensive part, and after the tile codec it is well under a millisecond.
- `encounterWiring.js` — Encounters and Initiative panels, the Build-rail encounter authoring list, walked-into-an-encounter alert; owns transient combat state. The shared create/edit dialog (name, HP, level/tier, placement via `locationFields`) lives in `encounterForm.js` and backs both panels' add and edit actions; edits go through the pure `Encounter.editEncounter`, which keeps live state (current HP clamped to a new max, stat block, conditions) and resets the `noticed` flag when the encounter moves. The bestiary spawn dialog is `encounterForm.js`'s `addFromBestiary`; the 5e attack resolution the Initiative panel triggers is `weaponAttack.js`, and spell resolution is `spellCast.js`. Both build on `combatants.js`, the one place that resolves a participant id across the three combatant collections: `findCombatant(app, id)` returns `{ entity, kind, store }` (the `store` writes an update back to the owning collection with its panel refreshes), `combatantsAsTargets` assembles a foe/ally target list from the running order, and `applyToTarget` is the single damage/heal write path with the defeat and drop-to-0 transitions each logged exactly once. New combat features should route entity resolution and HP application through these rather than re-writing the character/encounter/NPC cascade. The authoring dialogs share their field groups the same way: `gearFields.js` (weapon/armor picker options plus the None/preset/hand-tuned read-back cascade), `statFields.js` (the modal stat-block fields and clamped read-back; the inline-form equivalent is `formFields.statInputRows`), and `casterFields.js` (class/level/spell picker, `refilterSpellsOnChange`) each back both the campaign dialog and the Library template form for their area — a change to one of these shapes lands in the shared module, never in one form.
- `storyWiring.js` — travelogue (provides `logEvent`), NPCs, quests, handouts.
- `libraryWiring.js` — the Library mode's three template lists (equipment, bestiary, NPCs) and the custom-library file controls (export/import/reset, startup auto-load). The custom library is deliberately not campaign state: `library/Library.js` holds the built-in defaults, the pure merge logic (a custom entry whose name — and for equipment, type — matches a default overrides it in place; others append), and a small module-level "active library" registry that the preset consumers (the item form's pickers, the enemy gear selects, "From bestiary") read at call time, since they mount far from the wiring that loads customizations. Inside the wiring, every list's remove flow goes through one `makeRemoveHandler(noun, apply)` (the revert-override vs delete-custom confirm wording lives there alone) and the name-keyed lists (bestiary, spells) store edits through one `makeKeyedStore` (id derivation, rename-retires-the-old-key) — a fifth library kind (the planned feat catalog) should reuse both rather than pasting a fourth copy.
- `sessionControls.js` — mode/role switches (role guarded by the cross-tab GM lock), sidebar tabs and collapse; provides `setMode`. Mode is a three-way Play / Build / Library toggle; Library mode hides the map column entirely and shows only the template lists.
- `shortcuts.js`, `onboarding.js` — global keyboard shortcuts and the first-run overlay.

Per-module UI state (selected tile, active brush, fog tool, edit history, selected character, combat, dirty) stays private inside the module that owns it; only the campaign data lives on `app.state`.

Everything is a native ES module loaded directly by the browser — no bundler, no transpilation. `tsconfig.json` sets `allowJs`/`checkJs` so `tsc --noEmit` typechecks the `.js` files against the `.ts` declarations without emitting anything.

## The map hierarchy

`MapNode` (see `src/types/map.ts`) is a rectangular grid of `Tile`s. Nodes form a tree via `parentId`: a world node's tiles can each optionally carry a `childNodeId` pointing at a region node, whose tiles can point at sub-region nodes, and so on. `TileGrid` (`src/map/TileGrid.js`) is just a `Map<id, MapNode>` registry with helpers to add/get/update nodes, walk the `parentId` chain for a breadcrumb, and resolve a tile's zoom target. `replaceNodes` swaps the whole registry's contents while keeping the grid object's identity, which is how a running tab adopts another world: the navigator, the party tracker, and the canvas each hold the grid they were constructed with.

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

### The character foundation

A `Character` is more than stats and inventory: it carries a class list, a race, a background, proficiency lists, hit dice, and a level-up flow, each a pure module beside `Character.js` following the same take-a-value-return-a-value shape. The catalogs are plain data — `data/classes.js` (hit die, saving-throw/armor/weapon proficiencies, skill choices, caster type, subclass level, ASI levels, features-by-level), `data/races.js`, `data/backgrounds.js`, and `data/skills.js` (the 18 skills' abilities) — with `types/class.ts`/`race.ts` declaring their shapes. `entities/Classes.js` reads the class catalog and derives the caster surface (`spellSaveDC`/`spellAttackBonus`, cantrip/prepared limits). `entities/Multiclass.js` is the class-list accessor: `getClasses` returns the memberships (folding an older save's scalar `class`/`subclass` into a one-entry list at read time), `withClasses` sanitizes writes, and `primaryClass`/`classLevelOf`/`pendingLevels` read across the list — everything class-aware goes through it rather than touching `character.classes` directly, which keeps the single-class and multiclass paths identical. `entities/Races.js` and `entities/Backgrounds.js` resolve a stored id to its definition, `resolveRace` preferring the live catalog and falling back to a stored `raceTraits` snapshot so a hand-typed or since-deleted race still round-trips.

`entities/Proficiencies.js` assembles the six proficiency lists plus expertise from class + race + background (`assembleProficiencies`) and applies or hand-edits them (`withProficiencies`, which keeps expertise a subset of skills); the `isProficient*`/`hasExpertise` predicates default cleanly for a legacy character with no lists. `entities/HitDice.js` derives max HP from the class hit die + CON modifier per level (`classMaxHP`, the 5e average rule) and models hit dice as spendable resource pools sized to the assigned class levels (`withHitDice` creates them, `syncHitDice` re-derives them keeping the spent count, `spendHitDie` heals on a short rest). `entities/LevelUp.js` and `entities/LevelAssign.js` run the level-up flow: `addXP` leaves each earned level *pending* for a classed character rather than applying it silently, and `assignLevel` commits a pending level to a chosen class — growing HP, adding a hit die, and advancing spell slots — while crossing a class ASI level leaves a pending improvement spent by `applyASI` or `takeFeat`. `entities/Character.js`'s `withDefaults` is the load-time migration seam that folds all of this onto an older save (legacy scalar class to a list, empty proficiency scaffold, race string preserved); `campaign/Campaigns.js` maps every loaded character through it.

`ui/CharacterSheet.js`, `ui/InventoryPanel.js`, and `ui/EncounterPanel.js` are the DOM-wiring layer over those entity modules, following the same mount-function pattern as `ui/DiceTray.js`: each holds a local mutable copy of its entity, re-renders after every interaction, and reports the updated value through an `onChange` callback for a caller (eventually `main.js`, persisting via `SaveManager`) to pick up. The sheet's progression surface — class rows with subclass, the pending-level class assignment, pending ASI/feat choices, unlocked features, and the hit-dice pool — is built by `ui/CharacterProgress.js` and mounted into the sheet; the background name and the assembled proficiency lists are stored but not yet rendered there, deferred into later saving-throw/skill blocks rather than built as a static list first.

## Persistence

`storage/SaveManager.js` serializes an entire campaign as one JSON blob, per `types/storage.ts`'s `CampaignState` (a flat `nodes` array — `TileGrid`'s node map flattened — plus `party`, `characters`, `encounters`). `buildState`/`serialize`/`deserialize`/`toTileGrid` are pure: `toTileGrid` rebuilds a working hierarchy by re-adding each node, since a `MapNode` already carries its own `parentId`, and `deserialize` defaults any missing top-level field to an empty value instead of throwing, so an older/smaller save shape still loads. `deserialize` is also the one validation seam a save passes through, and it coerces every field whose *shape* the load path trusts — collections to lists of records, the party position and a running combat to their required members — because Import persists what it reads and then reloads, so a malformed field that survives here becomes the stored save of an app that no longer boots. `withNodeDefaults` (`map/TileGrid.js`) does the same for nodes and their tiles, dropping tiles it cannot read. As a backstop, `Campaigns.loadInitialCampaignSafe` is what `main.js` boots through: a save that still cannot be read yields a blank campaign plus a notice, leaving the stored save and the history log untouched so Undo can step back to the one before it. `trySaveToLocalStorage`/`loadFromLocalStorage`/`downloadState`/`readStateFromFile` are thin wrappers around those pure functions using the actual browser APIs (`localStorage`, `Blob`, `FileReader`); the save wrapper reports its outcome rather than throwing, since a quota failure must reach the GM instead of passing for a save.

The GM's custom library persists separately in `storage/LibraryStore.js`, under its own localStorage key (`campaign-builder:library`) so New/Import/Load example never touch it. The browser copy is the working state; `downloadLibrary`/`readLibraryFromFile` round-trip it through a portable JSON file, and `fetchLibraryFile` seeds an empty browser from `library/campaign-library.json` (a gitignored path served from the project root) at startup. `normalizeLibrary` (in `library/Library.js`) makes every load tolerant, dropping invalid entries instead of throwing.

The on-disk shape is not the in-memory shape: `serialize` packs every tile, omitting each field that equals its default (`overlayRef: null`, `revealed: false`, `childNodeId: null`, `span: 1`, and any default `metadata` member, plus the `metadata` object itself once empty). Default tile boilerplate was 62% of the example campaign's characters — almost every tile of a painted map is plain unrevealed terrain with no POI — and the undo history of the day multiplied whatever the save costs ten times over, so the example campaign's save went from 358,413 to 134,907 characters. The inverse is `withTileDefaults` (`map/TileGrid.js`), which fills exactly those fields from absence and which every load already ran, so nothing states twice what a default is; `deserialize` runs `withNodeDefaults` at the seam rather than leaving the unpack to `toTileGrid`. `packTile` deletes keys from a copy of the tile rather than picking named fields into a fresh object, so a `Tile` member added later survives a save even if the packer never learns about it, and packed tiles exist only inside the serialized string — the renderer reads `tile.metadata` unguarded, so one must never reach live state. An explicit `span: 1` comes back absent, which the `Tile` type defines as the same value.

The entity collections pack the same way, one level up, through `storage/EntityPack.js`. `packEntity(entity, withDefaults)` omits a field only after showing that the entity's own `withDefaults` restores that exact value — it deletes the field from a copy, runs `withDefaults`, and keeps the omission only when the result is structurally identical to the loaded form of the original. Nothing states what a default is, which is the point: `Encounter.withDefaults` resolves `weapon` and `armor` from the encounter's own level and tier, so a table of per-type defaults would omit a level-7 boss's weapon because it matches what a level-1 mob would be given, and loading would hand the boss different gear. Validating each omission against the real unpacker makes packing and loading unable to disagree by construction. `SaveManager`'s one `ENTITY_DEFAULTS` table names the four pairs — `characters`, `encounters`, `npcs`, `handouts` — and both directions read it, so the halves cannot drift; `quests` and `bestiary` are absent because neither has a `withDefaults` to pack against, and both measured at zero default-valued bytes. This is also why `deserialize` runs the entity `withDefaults` rather than leaving them to `Campaigns.loadInitialCampaign`: a stored character legitimately carries no `spellbook` key now, and `undoHistory` and `readStateFromFile` hand their result to callers that do no defaulting of their own. The omission is per field and flat — recursing into a nested record would have to know whether it is filled member-wise (`stats`) or whole (`equipment`), which the `withDefaults` contract does not say. Measured on the example campaign: 133,948 characters to 129,715, with the encounter collection alone dropping 49%; the win scales with the roster rather than the map, so it is small next to the tile packing and grows with a campaign that has hundreds of mobs.

Image payloads are hoisted the same way, by `storage/Assets.js`: `hoistAssets` replaces every inline `data:` URL with an `asset:<key>` reference into an `assets` table keyed by a hash of the payload's content, and `restoreAssets` inlines them again inside `deserialize`. A tile's art (`imageRef`, and `overlayRef` as a single ref or a stack) and a handout's `image` are the payload-bearing fields, listed in one traversal there so a third site is a single line. Stored inline, one imported tile painted across a 30x30 region costs its whole base64 payload once per cell — 18.5 MB of save for a 20 KB image, which the table takes to 58 KB — and a handout photo the same way. The table is rebuilt from the refs actually present on every serialize, so it prunes itself and an image-free campaign gets no `assets` field at all; keys collide by comparing the stored payload and probing a suffix, so a collision costs a longer key and never the wrong image. A reference the table cannot resolve is left verbatim rather than blanked: the prefix is one character from the built-in tile root (`assets/tiles/...`), and the worst case of leaving it is the placeholder the renderer already draws for a ref that will not load. Like a packed tile, the table is on-disk only — `deserialize` builds its return value field by field, so live state never holds one. The dedupe is within one save, which is all it needs to be: history is a log of deltas over parsed state, so a step that inserts a handout carries its payload inline once and a step that merely retitles one carries no image at all.

In localStorage, that table does not travel inside the save at all. `storage/AssetStore.js` keeps it under its own key (`campaign-builder:assets`): `trySaveToLocalStorage` splits it off the packed state with `detachAssets`, writes the payloads first, then writes the campaign, and reports the two outcomes separately as `ok` and `assetsOk`. The split is what makes structure and blobs fail independently — a full origin costs the GM a handout picture instead of their map — and it keeps a history snapshot from carrying a picture it did not change. The write order is what limits the failure to that one shape: a campaign referencing a payload the sidecar lacks renders the placeholder the renderer already draws, while the reverse order can persist structure that references nothing. It also settles the cross-tab case, since `isExternalSaveEvent` fires on the campaign key and the payloads are already stored by then. Only the localStorage path splits: `downloadState` still serializes the whole save, so an exported campaign is one self-contained document, and import needs no special handling because the persist-then-reload path hands the inline payloads straight back to the same writer. `deserialize`'s optional second argument is the read half, supplying payloads the string does not carry, with a table inside the string winning over it; the two readers of a stored string, `loadFromLocalStorage` and `HistoryLog`'s cache of the last persisted state, are the only callers that pass one. Retention spans every stored string rather than the current save, so a payload is dropped exactly when the last state referencing it becomes unreachable. Those references are collected by matching `asset:` keys against the raw text (`referencedAssetKeys`, in `Assets.js` beside the key alphabet it has to match) rather than by walking parsed state, because after the tile codec below a tile's reference lives inside an encoded node's palette, which a state walk cannot see without decoding first. The scan is skipped outright when there is nothing to keep, which is every campaign that has never held an image.

The last packing layer attacks what the three above cannot reach. A packed tile is essentially `{"id":"12,34","imageRef":"assets/tiles/grass/grass-1.svg"}`, and neither field is a default, so no omission rule can drop either — while the node list is the only part of a save that grows without bound, since authoring adds tiles and `revealAround` is monotonic, so fog is never reclaimed. `storage/TileCodec.js` encodes a node's tiles positionally instead: `refs` is the node's distinct art entries, an entry being the `(imageRef, overlayRef)` pair since every tile carries both; `cells` is a row-major run-length stream of indices into it, so a tile's id is implicit in its position and its art costs an index rather than a path; `fog` is `revealed` as its own run-length stream of alternating run lengths, kept separate because it is the one field play changes and a reveal is a disc, which run-lengths compress almost perfectly; and `tiles` keeps only what is left over, keyed by id. Measured: the example campaign's save from 129,111 characters to 34,963, its node list from 115,430 to 21,282, and a dense 40x40 region from 93,880 to 3,621 — the same region fully explored costs 15 more characters rather than the 25,600 the per-cell form adds.

Two properties keep that codec unable to lose data. It is opt-in per node: a node qualifies only when its dimensions are usable and every tile id is a canonical in-bounds `"x,y"` with no duplicate position, and `encodeNodeTiles` returns the *same object* otherwise, so a hierarchy fixture or a hand-edited id falls back to the per-cell form rather than being coerced into the grid. And the leftover list is built by deleting the four fields the codec represents itself, exactly as `packTile` does, so a `Tile` member added later rides out of line instead of being dropped. Sparse-but-gridded nodes (interiors legitimately are — `barrow` is 94 tiles in a 14x14) encode through a reserved `-1` index. The palette is built by row-major traversal rather than by `tiles` array order, which matters because `isExternalSaveEvent` compares raw strings: re-serializing an unchanged campaign has to produce the same string. Decoding degrades rather than throwing — an unreadable palette entry skips its cell, an unreadable run ends the stream — because Import persists what it reads before reloading, so a throw here is a save that cannot boot. The codec runs last in `packState`, after the asset hoist, and first in `deserialize`, before the asset restore: the hoist's traversal walks `node.tiles[].imageRef`, which an encoded node no longer has, and that order means the palette holds already-hoisted `asset:` refs and `Assets.js` needs no knowledge of the encoding. Decoding ahead of `withNodeDefaults` likewise leaves a decoded tile still packed, so the codec states nothing about what a default is. This is the first change whose *reader* branches on a field's presence rather than filling one from absence, so both forms are read indefinitely; `StateDiff` works on parsed state and never sees `cells` or `fog`.

A save carries a schema `version`, stamped by `buildState` and read by `deserialize`, with the step transforms in `storage/Migrations.js`: `MIGRATIONS[n]` turns a version-n save into a version-n+1 one, a missing version reads as 0 (every save written before the field existed), and the chain runs on the raw parsed object *before* `deserialize`'s coercion, since a step exists precisely to repair a shape that coercion would flatten or drop. A version bump with no payload change registers an identity step rather than being left absent, so a unit test can assert the table covers every step and a transform filed under the wrong key cannot silently do nothing. The chain also runs ahead of the asset restore, so a step sees hoisted refs and has to resolve a payload through the table itself. A save stamped newer than the app runs no steps and is read best-effort. Any future change to the meaning of a stored field — as opposed to adding one, which the `withDefaults` seams already absorb — belongs in that table rather than in a new absence check.

Undo and redo are a log of invertible deltas against that persisted save, in `storage/HistoryLog.js`. `saveCampaign` is the one save path: it writes the campaign, then appends one delta produced by `storage/StateDiff.js`'s `diffState` over the previous and new parsed states. An op records both its old and its new value, so `invertOps` is a swap and undo and redo are the same walk in opposite directions — `undoCampaign` applies the inverse of the delta at the cursor, `redoCampaign` applies the delta ahead of it, and a new edit made behind the head deletes the redo tail. Both header controls step the cursor and then reload, so every module re-initializes from the restored state through the ordinary load path, and both grey out from `historyDepth` when that direction is empty. The layout is one key per record: an index at `campaign-builder:history` holding `{ version, deltas, cursor }`, and one `campaign-builder:history:d<seq>` per delta, so a step is one small `setItem` rather than a rewrite of the log. Measured on the example campaign, fifty party steps cost 27,304 bytes of log where the previous ten-snapshot ring cost 699,980 for ten, and a save writes 70,488 bytes rather than 139,996.

There is deliberately no base snapshot: undo and redo only ever apply a delta to the *current* state, so the canonical save already is the base, and the cap drops the oldest deltas instead of folding them into a base that would have to be rewritten synchronously on every cap hit. Bringing one back is what the deferred idea of replaying base plus log at load — and so not writing the canonical save at all — would need. Three rules keep the log unable to corrupt a campaign. A delta is never migrated, since it was written against one schema version's `CampaignState` shape, so the index carries `version` and a log stamped with anything else is discarded whole (which is also how the previous ring's keys are reclaimed, by prefix scan). Every history write happens after the campaign write, on both the save and the cursor-stepping paths, so the index can never describe a state that was not stored. And a full origin degrades depth-first — drop the oldest step and retry, then the whole log, reporting `{ ok, evictedAll }` either way — because Undo silently becoming single-step is the defect that reporting exists for; hitting the ordinary byte cap is the design and reports no loss. The previous state a diff needs is the one property the ring had that this cannot keep, since a diff needs a value rather than a string: `HistoryLog` caches it, stamped with the raw string it was parsed from, so the steady state costs a string compare and a tab that declined the cross-tab reload prompt cannot diff against a save another tab replaced.

Both stores' file paths route through `storage/fileIO.js` — `downloadJSON` and `readFileText`, the only two places the app touches `Blob`/object URLs/`FileReader`. New export/import features should call these rather than re-rolling the browser plumbing; the planned Tauri desktop build swaps this one file for native dialogs and the fs plugin.

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
  WeakMap-cached layout per node: `tileAt(node, id)` resolves an id and
  `tileAtXY(node, x, y)` a grid coordinate, both O(1) and neither allocating.
  The cache is safe because nodes are replaced immutably on every tile mutation
  — a stale node object can never serve fresh reads. Any new code that resolves
  tiles in a loop (painting, fog, hit-testing) should use these instead of
  scanning the flat `tiles` array; conversely, any new mutation path must keep
  replacing the node rather than mutating tiles in place, or the layout breaks.

  What the layout holds is deliberately positional — an id-to-position map plus
  a flat cell-to-position buffer over the node's extent — and holds no tiles at
  all, because that is what lets a mutation hand the new node the previous
  node's maps rather than re-index from scratch. `withTileReplaced`,
  `withTilesReplaced`, and `withTileAppended` are the three helpers that carry
  the layout forward, and `setTile` plus the fog writers are built on them, so a
  paint or fog drag costs O(cells crossed) across the whole stroke instead of a
  full re-index per cell — measured on a 40-cell drag, 1.74 ms to 0.05 ms at
  30x30 and 30.0 ms to 0.10 ms at 100x100. A mutation that *removes* a tile
  shifts every later position and so still rebuilds. Appends are recorded in
  override maps private to the new node, never written into the shared base, so
  two nodes branching off one parent (which is exactly what a stroke plus its
  pre-stroke undo snapshot are) can never see each other's tiles. New mutation
  helpers should either route through those three or hand their finished list to
  `withNodeTiles`, which leaves the new node uncached — always correct, and it
  merely costs one rebuild.

  The invariant those five caches rest on is enforced rather than assumed.
  `src/map/TileFreeze.js` freezes a tile as it enters a node, so a later write to
  it is a `TypeError` at the write instead of a render that silently disagrees
  with state: the three carry helpers freeze the tile they were handed, and
  `withNodeTiles` freezes the list and its contents. Freezing a *tile* is
  bounded work; freezing an *array* walks its elements, which is why the per-cell
  helpers deliberately leave the list writable, and why membership protection
  exists only at the node-entry seam.

  Freezing covers the tile's `metadata` record and an `overlayRef` stack too,
  since both are handed out by reference. `createTile` does not freeze: the
  generators build a layout by mutating freshly created tiles and only then hand
  the list over, which stays legal because no node holds those tiles yet. It is
  on in development and off elsewhere, since a throw reaching a GM mid-session is
  worse than the stale render it replaces; `setTileFreezing` overrides the
  detection.
- **Per-node derived data is WeakMap-cached, never recomputed per frame.**
  The revealed-id set (`MapRenderer.js`), span blocks (`TilePaint.spanBlocks`),
  region groups (`RegionGroups.findRegionGroups`), and group image chunks
  (`groupImageChunks`, keyed `(node, group)` — group objects are stable because
  the group cache makes them so) all follow the TileIndex pattern: a pure
  function of an immutable node caches its result keyed by the node object.
  Anything derivable from a node alone that a hot path recomputes should join
  this pattern; the returned arrays/sets are shared, so treat them as
  read-only. The tile pass itself iterates only the visible cell range (invert
  the view transform once, look cells up by coordinate) — O(visible), never
  O(total tiles), never a regex parse per tile per frame, and never an id string
  built and hashed per visible cell per frame. The same pattern covers
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
  radius's bounding square by coordinate and copies the tile array once — and
  returns the *same* node object when nothing newly revealed, so the WeakMap
  caches above stay warm on a party step through explored ground. Mutation
  helpers on hot paths should preserve identity on no-op the same way.
- **Persistence writes the change, not the campaign.** A save writes the
  campaign string once and appends one delta describing the edit
  (`storage/HistoryLog.js`), where the ring it replaced copied the previous
  save's whole string to a second key first — 70,488 bytes per save against
  139,996 for the example campaign. The previous state a delta needs is cached
  in memory, stamped with the raw string it was parsed from, so the steady state
  costs one `getItem` and one string compare rather than a parse. Code touching
  save/history paths should keep that shape: never parse-and-restringify a whole
  campaign per write, and respect the byte cap and quota fallbacks (drop the
  oldest steps, then the log) already in place.
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
  read-only, since they are shared. The four built-in catalogs behind them
  (`defaultEquipmentTemplates()`, `DEFAULT_BESTIARY`, `DEFAULT_NPC_TEMPLATES`,
  `DEFAULT_SPELLS`) are `deepFreeze`d (`src/util/deepFreeze.js`), so that
  contract is enforced rather than documented: a path that instead copies
  library data into campaign state has to say so, which is what
  `Encounter.fromTemplate`, `Library.activeEnemyArmor`,
  `EquipmentPresets.copyEnemyWeapon`, and `Character.copySpellbook` are for.

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
- **Every destructive action confirms first.** Plain entity deletes use
  `confirmDelete(name, detail?)` (`Modal.js`), which owns the `Delete "X"?`
  wording and the danger-styled Delete button, so no site restates the
  options object. Deletes whose message doesn't fit that shape (a node's
  "and everything inside it", the library's revert-vs-delete pair) and
  non-delete destruction (Discard, Replace, Reset) still go through
  `confirmModal` with `danger: true` and an imperative `confirmLabel`, with
  the affected thing named in the message. Anything that throws away more
  state than one click created qualifies — including bulk variants
  (remove-all, clear) of otherwise safe single-step actions.
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
- **Damage is a minus, healing is a cross** (`icon('minus')`/`icon('heal')`),
  wherever HP moves — the character sheet's steppers and the encounter panel's
  amount buttons share the pair, danger-red and success-green respectively. A
  pictorial glyph (a sword) was tried for damage and reverted: subtract/add
  reads instantly, iconography doesn't. The sword stays reserved for attack
  actions (the initiative panel's weapon strip), not HP arithmetic.
- **Recurring widget shapes are shared classes in `base.css`, not per-feature
  copies.** `.seg-switch` is the segmented toggle (mode/theme/role switches,
  the dice tray's d20 mode), `.row-select` the selectable list row (world
  tree, roster), `.section-label` the in-panel sub-heading (uppercase,
  tracked, muted — the one treatment for the role), `.empty-state` the
  "nothing here" paragraph. Each replaced two to four byte-identical or
  drifted per-feature blocks; a new switch, list row, or group heading should
  reuse the class and keep only layout (margins, grid placement) in its own
  component class. Badges everywhere pad `0 var(--space-1)`.
- **Over-map chrome uses the `--overlay-*` tokens** (`--overlay-bg`,
  `--overlay-text`, `--overlay-npc` in `base.css`), which are deliberately
  pinned dark in both themes: map controls, toasts, tooltips, and the
  onboarding scrim float over map art, not the page surface, so they don't
  follow `light-dark()`. Translucent variants derive via `color-mix` from the
  same tokens rather than restating the hex.

## Testability pattern

The recurring split across this codebase: **pure logic takes its side effects (RNG, current time, etc.) as arguments and returns data**, so it can be unit tested with `node --test` and no DOM. Thin wrapper code then wires that logic to the DOM/canvas and is verified visually instead of via unit test. Examples: `roll(selection, rng)` vs `ui/DiceTray.js`; `MapNavigator`/`RegionGroups`/`FogOfWar`/`PartyTracker` vs `MapCanvas`'s event handlers; `Encounter`/`Resource`/`Character` vs `ui/CharacterSheet.js`/`ui/InventoryPanel.js`/`ui/EncounterPanel.js`; `SaveManager`'s serialize/deserialize/toTileGrid vs its localStorage/download/file wrappers.
