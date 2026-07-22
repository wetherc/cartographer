# Campaign Builder — Implementation Plan

Plain HTML/CSS/JS, no framework, no bundler. Native ES modules. Types via `.ts`
declaration files + JSDoc in `.js`, checked with `tsc --noEmit` (see tsconfig.json).

## File structure

```
src/
  main.js              entry, wires modules, mounts app
  types/
    map.ts
    entities.ts
    dice.ts
  map/
    MapCanvas.js         canvas render + pan/zoom
    TileGrid.js          tile data structure, hierarchy (world→region→subregion→POI)
    FogOfWar.js          reveal/hide logic based on party position
    TilePalette.js       built-in + custom tile image loading
  entities/
    Encounter.js         enemy/encounter model, HP tracking
    Resource.js          item/mana/expendable tracking
    Character.js         stats, level, progression
  dice/
    DiceRoller.js         parse "2d6+3" notation, roll, result breakdown
  party/
    PartyTracker.js       current position, movement, triggers fog reveal
  storage/
    SaveManager.js        serialize/deserialize campaign state (JSON, localStorage + export/import)
  ui/
    *.js                 DOM panels: character sheet, inventory, encounter panel, dice tray
index.html
style.css
tests/
  *.test.js
```

## Data model (types/*.ts)

- `Tile`: id, image ref, metadata (POI type, discoverable flag, notes), children (nested tiles for zoom)
- `MapNode`: hierarchical container (world/region/subregion), holds Tile grid + zoom-in target
- `Encounter`: name, maxHP, currentHP, stats block
- `ResourcePool`: name, type (item-count | mana | custom), current, max
- `Character`: stats, level, XP, resources[], inventory[]
- `DiceExpr`: parsed notation, roll result, per-die breakdown

## Key mechanics

1. **Map hierarchy** — tree of `MapNode`. Zoom-in = navigate to child node, render its own tile grid. Breadcrumb for zoom-out.
2. **Fog of war** — each tile has `revealed: boolean`. Party position tracked in `PartyTracker`; on move, reveal tiles within radius. Persist revealed state per node.
3. **Tile metadata editor** — click tile in edit mode → side panel form → writes metadata onto `Tile` object.
4. **Dice roller** — structured selection object (counts per die type: d4/d6/d8/d10/d12/d20/d100 + flat modifier), driven by a +/- button UI. No text parsing. Pure `roll(selection, rng)` function, unit-testable via injected RNG.
5. **Persistence** — single JSON blob (whole campaign) via `SaveManager`, export/import buttons + localStorage autosave.

## Build order

1. Type declarations + DiceRoller (self-contained, testable)
2. TileGrid + MapCanvas render (static, no interactivity)
3. Hierarchy zoom nav
4. FogOfWar + PartyTracker
5. Encounter/Resource/Character models + UI panels
6. SaveManager persistence last (ties everything together)

## Testing / typecheck

- Unit tests: `node --test`, no deps. Cover DiceRoller parsing, FogOfWar reveal radius, SaveManager round-trip.
- Typecheck: `tsc --noEmit` (checkJs catches JSDoc mismatches in .js files).

---

## Status — Done

- [x] `types/dice.ts` — structured DiceSelection/DiceResult types
- [x] `dice/DiceRoller.js` — structured roll(selection, rng), no string parsing
- [x] `ui/DiceTray.js` — +/- button widget per die type + modifier + roll button
- [x] `tests/DiceRoller.test.js` — 6 passing tests, injected RNG
- [x] `index.html` / `style.css` / `main.js` — app shell, wired to DiceTray

## Status — To Do

- [x] **Visual test DiceTray in browser** — Playwright: navigated `localhost:8934/index.html`, incremented d6 x2, d20 x1, modifier x1, clicked Roll. Result line rendered correctly: `d6[6,2]=8 + d20[10]=10 + modifier=1 -> total: 19`. Only console error is harmless `favicon.ico` 404.
- [x] `types/map.ts`, `types/entities.ts` — type declarations
- [x] `map/TileGrid.js` — tile data structure, hierarchy (parentId chain + breadcrumb + zoom-target resolution)
- [x] `map/TilePalette.js` — built-in tile catalog (5 terrain types x 3 variants + 11 road connector pieces + 2 POI markers, SVG assets under `assets/tiles/<type>/`) with `pickVariant`/`getRoadPiece` lookups, plus custom tile registration (addCustom/removeCustom), refuses to override built-in ids
- [x] `map/MapCanvas.js` — canvas render, pan (pointer drag) + zoom (wheel, anchored at cursor); grid tiles addressed by `"x,y"` id convention (parsed via `parseCoords`); unrevealed tiles draw as flat fog rects
- [x] Hierarchy zoom nav (world → region → subregion → POI) + breadcrumb — `map/MapNavigator.js` (pure logic: zoomIn/zoomOut/goTo/getBreadcrumb over TileGrid) wired to `MapCanvas`'s new `onTileClick` option and a plain-DOM `ui/Breadcrumb.js` trail
- [x] Region grouping — multiple contiguous tiles zoom to the same child node (they just share one `childNodeId`, no Tile/type schema change needed) so a region can occupy a block instead of a single POI tile:
  - [x] `map/RegionGroups.js` — pure flood-fill helper: groups contiguous tiles (4-neighbor adjacency via parsed `x,y` ids) sharing the same non-null `childNodeId` into `{ childNodeId, tileIds, minX, minY, maxX, maxY }` groups; 5 unit tests, no DOM
  - [x] `map/MapCanvas.js` — renders each group's bounding outline + translucent tint overlay, with an optional `getNodeName` callback to draw the target node's name as a label; click-to-zoom needed no changes since every tile in a group already carries its own `childNodeId`
  - [x] `tests/map-canvas-preview.html` updated to a 2x2 region block; verified via Playwright (outline + "Northmarch Region" label render, and clicking any tile in the block, not just one corner, zooms in)
- [x] `map/FogOfWar.js` — pure functions over a MapNode: `revealAround(node, centerId, radius)` (Euclidean distance from a parsed "x,y" tile id, never un-reveals a tile), `hideAll(node)`, `revealedCount(node)`; 6 tests
- [x] `party/PartyTracker.js` — holds a `PartyPosition` (nodeId + tileId), `moveTo(nodeId, tileId)` writes the new position and calls `FogOfWar.revealAround` on that node (radius configurable, default 2), writing the revealed node back into the `TileGrid`; throws on an unknown node; 6 tests
- [x] `entities/Encounter.js` — `createEncounter`/`applyDamage`/`heal`/`isDefeated`, immutable (returns a new Encounter rather than mutating), HP clamped to `[0, maxHP]`; 5 tests
- [x] `entities/Resource.js` — `createResource`/`spend`/`restore`/`setMax`/`isEmpty`, immutable, `current` clamped to `[0, max]` (and re-clamped by `setMax` if capacity drops below current); 7 tests
- [x] `entities/Character.js` — `createCharacter` (level 1, 0 xp), `addXP` (auto-levels up, possibly multiple times per call, on an N*100-xp-per-level curve, carrying remainder xp), `setStat`, `addResource`/`spendResource`/`restoreResource` (delegate to `entities/Resource.js` by matching `resources[].id`), `addItem`/`removeItem` (merges/splits inventory stacks by id, drops a stack once its quantity hits 0); 9 tests
- [x] `ui/` panels — `CharacterSheet.js` (name/level/xp header, add-XP control, editable per-stat inputs), `InventoryPanel.js` (item list with remove button, add-item form; item id derived from name so re-adding the same name stacks quantity via `Character.addItem`'s existing merge behavior), `EncounterPanel.js` (HP readout per encounter, damage/heal buttons, defeated encounters styled via a CSS class rather than removed); dice tray already done. All three follow `DiceTray.js`'s mount-function/createElement pattern (local mutable state + `onChange` callback), no unit tests (DOM wrappers, verified visually per `docs/testing.md`) — checked via `tests/ui-panels-preview.html` in a browser: damage reduced Goblin's HP correctly, adding "Rope" created a new inventory row
- [x] `storage/SaveManager.js` — `types/storage.ts` adds `CampaignState` (flat `nodes` array + party + characters + encounters); `buildState`/`serialize`/`deserialize`/`toTileGrid` are pure and round-trip tested (4 tests, including hierarchy/zoom-target integrity after rebuild and default-filling missing fields on load); `saveToLocalStorage`/`loadFromLocalStorage`/`downloadState`/`readStateFromFile` are thin browser-API wrappers around those, verified visually (not unit tested, consistent with the DOM-wrapper convention) — `tests/save-manager-preview.html` confirmed a save-then-load round trip preserves revealed state and character xp/level
- [x] `index.html` / `style.css` — app shell: header with Save/Export/Import, a map column (breadcrumb + canvas), and a sidebar of panels (character sheet, inventory, encounter, dice tray)
- [x] `main.js` — wires every module together: builds a small default 2-node campaign (world + one region, one character, one encounter) if `localStorage` has no save, otherwise rebuilds via `SaveManager.toTileGrid`; `MapCanvas`'s `onTileClick` zooms in via `MapNavigator` for a tile with a `childNodeId`, otherwise moves the party there via `PartyTracker` (added `MapCanvas.refreshNode`, a pan/zoom-preserving sibling to `setNode`, so a party move doesn't jolt the view, and `MapCanvas.setPartyTile`/`_renderPartyMarker` to draw the party's position); `CharacterSheet`/`InventoryPanel` are kept in sync via a `setCharacter` method added to both, since they share one underlying `Character` but each held its own copy; Import saves the uploaded file's state to `localStorage` and reloads rather than re-wiring every closure by hand. Verified end-to-end in a browser: clicking a tile moved the party and expanded fog, clicking the region block zoomed in and the breadcrumb zoomed back out, and Save followed by a full page reload restored the exact party position and revealed-tile state

---

## GM playtesting notes (2026-07-22)

First hands-on pass with the wired-up app surfaced 7 issues. Diagnosed below as **[Bug]** (existing code behaves incorrectly) or **[Gap]** (behavior is correct as built, but the feature/clarity was never built). None of these are fixed yet — this section is the diagnosis and the pointer to where the fix lands in the overhaul plan below.

1. **[Bug] Clicking the map moves the party to what looks like a random tile.**
   Root cause: `#map-canvas` has a fixed internal pixel buffer (`width="720" height="480"` attributes) but is styled `max-width: 100%` inside a flex sidebar layout, so its **rendered CSS size** shrinks to fit the column and no longer matches its internal buffer size. `MapCanvas`'s pointer handlers (`_onPointerUp`, `_onPointerMove`, `_onWheel`) convert `event.clientX/clientY` to canvas-local coordinates via `getBoundingClientRect()` alone, with no correction for the ratio between CSS size and buffer size (`canvas.width / rect.width`, `canvas.height / rect.height`). Since `tileRect`/`screenToTile` operate in buffer-pixel space (`tileSize = 48` raw canvas units), every click, drag delta, and wheel-zoom anchor point is silently off by that ratio — worse the more the sidebar layout has shrunk the canvas. Fix: scale client coordinates by the buffer/CSS ratio in all three handlers before doing any tile math. → Overhaul Phase B.

2. **[Bug/Gap] No indication when you're at the edge of the world.**
   The canvas background (`#000`, from `style.css`'s `#map-canvas` rule) is nearly indistinguishable from the unrevealed-fog fill (`#1a1a1a` in `MapCanvas.render`), and nothing is ever drawn to mark a node's actual `width × height` extent — so "panned off the edge of the real map" and "a fogged tile that's part of the map" look almost identical, and there's no boundary line at all. Fix: draw an explicit border/backdrop for the node's full extent, and pick a fog color clearly distinct from the empty-canvas background. → Overhaul Phase B.

3. **[Gap] Unclear which of "World" / "Northmarch Region" is the parent, which is the child, or which one is currently being viewed.**
   The breadcrumb (`ui/Breadcrumb.js`) is root-to-current order with the current node bold (`aria-current`), which is *technically* enough information, but it's not legible enough in practice: a bare `/` separator doesn't read as "contains," there's no persistent view of the whole tree (only the path to the current node), and the region-block overlay on the parent map (outline + name label) isn't visually tied back to the breadcrumb trail. There is no single authoritative "here is the whole hierarchy, here is where you are in it" view. → Overhaul Phase B (breadcrumb polish) and Phase C (a real world-tree nav view).

4. **[Gap] No way for a GM to design their own world.**
   This was actually planned — `PLAN.md`'s original "Key mechanics" §3 ("Tile metadata editor — click tile in edit mode → side panel form → writes metadata onto `Tile` object") — but that mechanic was never turned into a Build-order/Status checklist item, so it silently never got built. Today there is *no* authoring UI at all: no way to create/delete a `MapNode`, no way to place/replace/remove a tile in a grid, no way to draw a region link (a block of tiles sharing a `childNodeId`), and no way to edit a tile's metadata (POI type, discoverable flag, notes) — the only way any of this happens is by hand-writing it in `main.js`. This is the biggest real gap for a GM. → Overhaul Phase C (this is most of what Phase C is).

5. **[Gap] No way to create, remove, or edit player characters.**
   `entities/Character.js` fully supports this at the data layer (`createCharacter`, `setStat`, `addXP`, etc.), but there is no UI for it: `main.js` hardcodes exactly one `Character` (`characters[0]`) and permanently wires `CharacterSheet`/`InventoryPanel` to that one slot. There's no roster, no "new character" button, no delete, no switcher. → Overhaul Phase D.

6. **[Gap, mostly a UI illusion] "Why don't characters have their own individual inventories?"**
   They do, at the data layer — `Character.inventory` is a per-`Character` field (see `types/entities.ts`), and `entities/Character.js`'s `addItem`/`removeItem` already operate on one character's inventory in isolation. It *looks* global only because #5 means there's only ever one character to look at, so there's nothing to contrast it against. Fixing #5 (a real character roster) resolves this automatically — no data-layer change needed. → Overhaul Phase D (same work as #5).

7. **[Gap] Why is there always a Goblin encounter onscreen?**
   `main.js`'s `buildDefaultCampaign()` hardcodes one demo character and one demo encounter so the app isn't blank on first run, but there's (a) no add/remove-encounter UI — `EncounterPanel` can damage/heal but not create or delete a row — and (b) no "start a genuinely blank campaign" flow, so the placeholder demo data has no way to be distinguished from or cleared in favor of real GM-authored content. → Overhaul Phase D (encounter roster CRUD) + Phase E (explicit "new campaign" flow replacing the implicit demo-data fallback).

---

## UI/UX overhaul plan

Everything shipped so far is functionally wired but visually and interactionally minimal: default browser widgets, ad hoc inline-ish CSS per component, no shared design language, no drag-and-drop, no dialogs, ad hoc plain-text buttons. The goal now is a rich, cohesive experience for two distinct audiences using the *same* app: **players/GM running a live session**, and **a GM building/editing a world** between or ahead of sessions. This is a substantial addition to scope beyond the original MVP checklist above, so it's broken into phases below rather than one big undifferentiated task.

### Goals

- One consistent visual language across the map, every sidebar panel, and the new authoring screens — not four independently-styled widgets sharing a page.
- Two modes in one app, not two apps: a **Play mode** (map + party + dice + live encounters, read/act-focused) and a **Build mode** (world/character/encounter authoring, edit-focused), switched via the header rather than requiring separate tooling.
- Stay at zero dependencies: everything below is buildable in plain CSS (custom properties for theming), the native `<dialog>` element for modals, inline SVG for icons (matching the hand-authored tile SVGs already in the project), and plain drag-and-drop (`draggable` + `dragstart`/`dragover`/`drop` events) — no framework, no bundler, no icon library, no CSS framework.
- Fix the concrete bugs/gaps from the playtesting notes above as part of the relevant phase, rather than as a separate detour.

### Visual language

- **Color**: a small CSS custom-property palette (surface/background layers, text, accent, a danger/health-red for damage, a success/heal-green for healing, a muted/disabled tone), each with a light and dark value, replacing today's bare `currentColor` borders and unstyled buttons. Respect `prefers-color-scheme` (already declared via `color-scheme: light dark`) but actually theme against it instead of relying on browser defaults.
- **Type scale**: a handful of named sizes (display, heading, body, label, and a monospace variant for dice/numeric readouts) instead of one-off `rem` values scattered per component's CSS block.
- **Spacing scale**: a small set of spacing tokens (custom properties) instead of hand-picked `0.25rem`/`0.5rem`/`0.75rem` values repeated across `DiceTray`/`CharacterSheet`/`InventoryPanel`/`EncounterPanel`'s CSS.
- **Iconography**: a small inline-SVG icon set for recurring actions (zoom/pan, party marker, damage, heal, add, remove, edit, save, export, import, mode switch) to replace plain-text buttons like "Damage"/"Heal"/"Add item".
- **Surfaces**: give panels an actual "card" treatment (subtle elevation/border-radius/background distinct from the page background) so "map chrome," "sidebar panel," and "modal overlay" read as three distinct visual layers instead of one flat page of bordered boxes.

### Information architecture

- **App shell**: header (campaign name, Play/Build mode switch, Save/Export/Import) stays, but the body layout reflows by mode:
  - **Play mode** (today's default layout, refined): map as the primary/largest element, a right rail with party/character quick-glance, dice tray, and active encounters.
  - **Build mode**: a left rail showing the **world tree** (a nested, expandable list mirroring `TileGrid`'s `parentId` hierarchy — the direct fix for playtesting note #3, since it's always-visible instead of only showing the path to the current node), a center panel with the selected node's tile grid in an editable state, and a right rail with the tile palette (drag source) plus a tile inspector (the originally-planned metadata editor from note #4).
- The breadcrumb from Play mode and the world tree from Build mode are two views over the same `TileGrid`/`MapNavigator` data — not two separate hierarchy concepts — so "which one is the parent, which is the child" only ever has one source of truth to look at.

### Key flows

**GM / Build mode:**
- Create/delete a `MapNode` (name, width, height, optional parent).
- Paint tiles: select a palette entry (terrain variant, road piece, or POI marker), then click/drag across the grid to place it, instead of the grid only ever being populated by hand-written `main.js` code.
- Tile inspector: click a tile in Build mode → side-panel form for `TileMetadata` (POI type, discoverable flag, notes) — the mechanic originally planned and never built.
- Region-link authoring: select a contiguous block of tiles, then "link to" an existing child node or "create new region" — the authoring-side counterpart to the `RegionGroups`/`childNodeId` model that's already built for rendering.
- Character roster: list, create, delete characters; selecting one opens the existing `CharacterSheet`/`InventoryPanel` scoped to that character instead of a hardcoded `characters[0]`.
- Encounter roster: list, create, delete encounters (fixes note #7 directly); a new campaign starts with an empty roster instead of a hardcoded Goblin.
- "New campaign" flow: explicit blank-start instead of the implicit `buildDefaultCampaign()` fallback whenever `localStorage` is empty — the demo campaign becomes an explicit "load example" option, not silent default content indistinguishable from a GM's real work.

**Players / Play mode:**
- View the map with fog/party marker, roll dice, view (their own) character sheet. Per-seat/multi-user access control (so each player only sees their own sheet) is a real future consideration but explicitly out of scope for this phase — flagging it here so it isn't forgotten, not committing to it now.

### Component-level plan

- `ui/Modal.js`: one small reusable wrapper around the native `<dialog>` element (open/close/focus handling) used for "confirm delete," "new character," "new node," "import conflict," etc., instead of ad hoc per-feature markup.
- A `ModeSwitch` control (Play/Build) in the header driving which app-shell layout is active.
- `ui/WorldTree.js`: nested disclosure list (`<details>`/`<ul>`) over `TileGrid`'s `parentId` structure; read-only navigation in Play mode, adds rename/delete/add-child affordances in Build mode.
- Tile palette becomes a real drag source (`draggable` + `dragstart`) with the map grid as a drop target in Build mode, instead of palette entries only ever being read programmatically.
- Shared `.btn` / `.field` / `.card` CSS classes so `DiceTray`, `CharacterSheet`, `InventoryPanel`, `EncounterPanel`, and the new Build-mode components all pull from the same primitives instead of each hand-rolling button/input styling (or, in most cases today, not styling them at all).

### Phased build order

- **Phase A — Design system foundation.** CSS custom properties (color/spacing/type), shared `.btn`/`.field`/`.card` classes, an inline SVG icon set. Retrofit the existing panels (`DiceTray`, `CharacterSheet`, `InventoryPanel`, `EncounterPanel`, `Breadcrumb`) onto it with no behavior change — a pure visual pass, so it can be verified against the existing Playwright checks with no new interaction to test.
- **Phase B — Correctness + clarity.** Fix the canvas pointer-coordinate scaling bug (note #1), add a map-bounds indicator (note #2), and polish the breadcrumb (note #3, partial — full fix is Phase C's world tree).
- **Phase C — GM authoring.** Tile inspector/metadata editor, tile painting (place/replace/remove via the palette), `MapNode` create/delete, region-link authoring, and the `WorldTree` Build-mode nav (note #3, full fix; note #4, full fix).
- **Phase D — Roster management.** Character roster CRUD + selector (notes #5 and #6), encounter roster CRUD + selector (note #7, partial).
- **Phase E — Mode split + polish.** The header Play/Build mode switch and layout reflow, an explicit "new campaign" flow replacing the implicit demo-data fallback (note #7, full fix), and a pass over any remaining rough edges surfaced by the earlier phases.

Each phase should land as its own set of commits (following the existing per-module commit convention), get its own unit tests where there's new pure logic (e.g. world-tree data derivation, tile-painting validation), and get visually verified in a browser per `docs/testing.md` for anything DOM/canvas-facing — same conventions as everything built so far, just applied to a larger scope.

## Status — To Do (UI overhaul)

- [x] **Phase A** — design tokens (color/spacing/type/radius/elevation custom properties in `style.css` `:root`, with a `prefers-color-scheme: dark` override), shared `.btn` (+ `--primary`/`--danger`/`--success`/`--icon` variants), `.field`, and `.card` (+ `.card__title`) classes, and an inline-SVG icon set (`src/ui/icons.js`, `icon(name)` builds a detached 24x24 stroke SVG in `currentColor`). Retrofitted `DiceTray` (icon steppers + primary Roll), `CharacterSheet`/`InventoryPanel` (`.field` inputs, icon add/remove buttons), `EncounterPanel` (danger/success icon damage/heal), header actions, and the sidebar sections (now `.card`s with titles) with no behavior change. Breadcrumb restyled via CSS only (no JS change). Typecheck clean, 77 tests still pass, visually verified in-browser (no console errors)
- [x] **Phase B** — fixed the `MapCanvas` pointer-coordinate scaling bug (note #1): a new pure `clientToBuffer(clientX, clientY, rect, bufferW, bufferH)` helper scales client coords by the buffer/CSS ratio, now used by `_onPointerUp` and `_onWheel`, and `_onPointerMove` scales its drag delta the same way (3 unit tests, incl. a CSS-shrunk canvas and a zero-size-rect guard). Added a map-bounds indicator (note #2): `render` now fills the node's full width x height extent with a backdrop before tiles and strokes a light border after, and unrevealed tiles use a fog fill (`#48412f`) distinct from both the backdrop and the empty-canvas background, so the world edge and unexplored-but-real tiles are both unambiguous. Breadcrumb polish (note #3, partial): a leading map icon plus a chevron separator that reads as "contains" (full hierarchy view is Phase C's world tree). Typecheck clean, 80 tests pass; verified in-browser by clicking a computed tile on a 2.09x CSS-shrunk canvas and confirming the party marker landed on the exact intended tile (no console errors)
- [x] **Phase C** — GM authoring in a new Build mode, gated by a header Play/Build `ModeSwitch` that reflows the layout (world-tree left rail + palette/inspector right rail in Build; play sidebar in Play). `map/WorldTree.js` derives the node hierarchy (roots/orphans/cycle-safe) and `collectSubtreeIds` backs `TileGrid.removeNode` (cascade delete + dangling `childNodeId` cleanup); 6 tests. `ui/WorldTree.js` renders the always-visible tree with select/add-child/delete affordances. `ui/TileInspector.js` edits `TileMetadata` (POI type, discoverable, notes) and authors region links (`childNodeId`) to existing or newly-created child nodes; built to render read-only for the eventual Play-mode metadata surface (gap #9). `map/TilePaint.js` (5 tests) place/replace/remove tiles, driven by `ui/PalettePanel.js` (brush swatches + Inspect/Erase tools, drag source); `MapCanvas` gains a `revealAll` Build flag, `onCellClick` (fires on empty cells so erased cells repaint), and a selection outline. `ui/Modal.js` wraps native `<dialog>` for the new-node and confirm-delete flows. Typecheck clean, 91 tests. Verified in-browser: metadata edit + region link persist and re-read from the grid; painting/erasing (incl. repaint of an erased cell); node create via tree/modal; cascade delete auto-clearing a dangling tile link; palette/inspector hidden in Play
- [ ] **Phase D** — character roster CRUD + selector (replacing hardcoded `characters[0]`); encounter roster CRUD + selector (replacing hardcoded demo Goblin)
- [ ] **Phase E** — explicit "new campaign" flow (demo data becomes an opt-in "load example," not a silent default) and a polish pass over rough edges. (The header Play/Build `ModeSwitch` + layout reflow originally scoped here landed early in Phase C, since Build-mode authoring needed a shell to live in.)
- [ ] **Phase F** — Play-mode sidebar density pass (see below)

### Phase F — Play-mode sidebar density

Every Play sidebar panel is maximized all the time. Most don't need to be. The sidebar should default to a compact, glanceable state and expand on demand, so a live session shows the map first and detail only when asked.

Data-model prereqs (touch `types/entities.ts` + `entities/Character.js`, add unit tests + `SaveManager` round-trip coverage, and default-fill on load for back-compat with existing saves):
- `Character` gains a `race` field (string) — the collapsed card shows name / race / healthbar; race does not exist in the model today.
- `Character` needs current/max HP for the healthbar. Model as a conventional `ResourcePool` (e.g. reserved id `"hp"`, `type: 'custom'`) reusing the existing `spend`/`restore`/`setMax` machinery rather than adding a parallel HP field, so damage/heal on a character works like every other resource. Card reads the `"hp"` pool; absence renders no bar.

UI work:
- **Character cards collapse.** `ui/CharacterSheet.js` (or a new `ui/CharacterCard.js` wrapper) gets a collapsed state: name / race / HP healthbar only, expanding to the full sheet (stats, XP, resources) on click. Collapsed by default; accessible disclosure (`aria-expanded`, keyboard-operable, `<button>` header), matching the design tokens from Phase A.
- **Inventory collapses and scopes to one character.** `ui/InventoryPanel.js` shows the inventory of the currently selected character only (ties to the Phase D roster/selector — one character active at a time), collapsed by default. Stacks with `quantity > 1` get a per-unit "consume" control that decrements the stack by one (distinct from the existing remove-whole-stack button), via `Character.removeItem` decrement semantics.
- **Encounters are location-scoped, not ever-present.** An encounter binds to a map location (a node id + tile id on `Encounter`, a data-model addition). `ui/EncounterPanel.js` renders only encounters at the party's current node/tile instead of the whole roster always onscreen; no active-location encounters means no panel. (Authoring/binding an encounter to a location is Phase D roster work; this phase is the Play-mode filtered display.)
- **Dice roller collapses to a D20.** `ui/DiceTray.js` collapses to a single illustrated D20 icon (new inline SVG in `src/ui/icons.js`, matching the existing icon set) that expands to the full +/- die-selection tray on click. Collapsed by default.

### Phase G — Layout, map, and theme polish

Surfaced by a hands-on UI/UX screenshot pass (2026-07-22, Play + Build at 1440x900). Phase F compacts the sidebar; these fix the map column, the empty space, and the theme story that Phase F does not touch. Independent of Phase F — could land before or after.

- **Responsive map column.** `#map-canvas` is a fixed 720x480 buffer sitting in a fluid page, so at desktop widths the map is a small island with a large dead backdrop to its right, and the reclaimed width from Phase F's sidebar compaction won't be used. Size the canvas buffer to its container (observe container size, set buffer to `clientWidth/Height x devicePixelRatio`, redraw) so the map grows to fill the column. Coordinate math already goes through `clientToBuffer` (Phase B), so pointer handling is unaffected.
- **Fit-to-content / zoom-to-extents.** On node load the view should frame the node's actual tile extent rather than showing a small map adrift in backdrop. Add a pure "compute pan/zoom to fit extent W x H into buffer" helper (unit-testable) and call it on `setNode`; expose it as a "recenter/fit" on-canvas control.
- **On-canvas map controls.** No visible affordance says the map pans/zooms. Add zoom-in / zoom-out / fit buttons (reusing the icon set) overlaid on the canvas, plus a current zoom-level readout. Ties into the accessibility gap #10 (these give keyboard-reachable zoom controls the wheel-only interaction lacks today).
- **Tile / POI legend.** The map draws unlabeled markers (yellow and purple dots = POI markers from `TilePalette`); nothing tells a GM or player what they mean. Add a small legend, or on-hover/on-click labels reading the tile's `TileMetadata`. Overlaps campaign-lifecycle gap #9 (surfacing `TileMetadata` during play) — build them together.
- **Dark-theme audit.** Phase A declared `color-scheme: light dark` and a `prefers-color-scheme: dark` token override, but it has never been visually verified — the app has only been screenshotted in light. Do a real dark-mode pass across header, cards, canvas backdrop/fog, and palette swatches; fix contrast regressions.
- **Empty states.** Inventory, encounter, and (post-Phase-D) character-roster panels show only their add-forms with no "nothing here yet" copy, so an empty campaign reads as broken. Add explicit empty states to each.
- **Icon disambiguation.** The encounter edit control renders as a red pencil, which reads as destructive (delete) rather than edit; danger-red should be reserved for genuinely destructive actions. Audit icon color/shape semantics across panels (edit vs. delete vs. damage) for a consistent language.
- **Favicon.** Add one (currently a 404 on every load — cosmetic, but it's the only console error and trivially removed).

---

## Campaign-lifecycle gaps (beyond the UI overhaul)

Phases A-E make what's already built usable and pretty. They don't add the mechanics a full session-to-session 5e-style campaign needs. Gaps below, ranked by how much they block real play, not by ease of build.

1. **GM/player screen separation — currently a hard blocker for real use.** One browser tab shows one truth: `EncounterPanel` renders exact current/max HP, tile metadata notes would show plot secrets, and there's one `localStorage` key for the whole campaign. A real table has a GM screen (full HP, secret notes, undiscovered POIs) and a player screen (bloodied/healthy/dying instead of exact HP, only revealed tiles, no notes). No amount of dice/inventory polish matters if the GM can't safely show players the map without narrating past every secret out loud. Needs a `viewerRole: 'gm' | 'player'` render mode threaded through `MapCanvas`, `EncounterPanel`, and the tile inspector, independent of the Play/Build mode split above.
2. **No live multi-device sync.** State lives in one browser's `localStorage`; export/import is a manual file hand-off. A real session has the GM on one device and players looking at a shared display or their own devices. Without sync, "player view" from #1 has nowhere to render. Minimum viable version: a second browser tab/window reading the same origin's `localStorage` via the `storage` event, so a GM laptop can drive a second player-facing tab — no server needed, stays at zero dependencies.
3. **No initiative/turn tracker.** `entities/Encounter.js` tracks HP but not turn order, and there's no combat-round concept anywhere. Running actual 5e combat needs an initiative list (party + encounters interleaved, sorted, current-turn pointer, round counter) — currently a GM would have to track this on paper next to the app.
4. **No status/condition tracking.** Neither `Character` nor `Encounter` has a conditions list (poisoned, prone, concentrating, etc.) or duration counter. This is core 5e state that resets/matters every round.
5. **No rest/recovery model.** `Resource.restore` exists but nothing calls it on a short/long rest, and there's no in-game clock to hang a rest on. Needs a lightweight in-game time/calendar concept (even just "day N, short rest / long rest" buttons) that resources and HP can hook into.
6. **NPCs conflated with hostile encounters.** `Encounter` is modeled as "enemy with HP," but a campaign needs friendly/neutral NPCs too: name, notes, location, disposition/faction, without necessarily having HP or being a combat participant. Currently the only way to represent an NPC is misusing `Encounter`.
7. **No quest/session log.** Nothing persists "what happened" or "what's outstanding" across sessions — no quest list (active/completed), no session notes/recap. `SaveManager`'s `CampaignState` would need a new top-level field; this is pure data + a simple panel, low risk.
8. **No handout/lore delivery to players.** No way to attach an image, a read-aloud box, or a lore snippet to a tile/node and reveal it to players at the right moment — separate from the tile's own map image.
9. **Tile metadata editor writes data nobody can see yet.** Phase C plans the *editor*; nothing today displays `TileMetadata` (POI type, notes) back to a GM during play, e.g. on hover/click outside Build mode. Worth folding into Phase C rather than treating as a separate gap.
10. **No accessibility pass despite it being the README's stated top priority.** The whole map is a `<canvas>` with mouse/wheel-only interaction — no keyboard pan/zoom/tile-select, no ARIA/text alternative for canvas content, no focus management in the (planned) `<dialog>`-based modals. This cuts against "Place a heavy focus on clean, intuitive, and accessible visual styles" in `CLAUDE.md` and should be a named phase, not an afterthought bolted onto Phase A.
11. **No undo or save history.** `SaveManager` overwrites the one `localStorage` slot on every save; a bad edit (wrong tile painted, wrong character deleted) has no way back except re-importing an older export, if one happens to exist. Even a small ring buffer of recent snapshots would cover most real mistakes.

None of this is scheduled into a phase yet — flagging for prioritization alongside Phases A-E above, not folded into them, since several of these (1-3 especially) are more load-bearing for actually running a session than the visual/authoring polish in Phase A-E.

## Status — To Do (campaign-lifecycle gaps)

- [ ] GM/player view-role split across `MapCanvas`, `EncounterPanel`, tile inspector (HP abstraction, hidden notes, unrevealed tiles)
- [ ] Cross-tab live sync via the `storage` event, as the minimum viable multi-device story
- [ ] Initiative/turn-order tracker spanning party + encounters
- [ ] Status/condition tracking on `Character` and `Encounter`
- [ ] In-game time/calendar concept + short/long rest actions wired to `Resource.restore`
- [ ] `entities/NPC.js` (or generalize `Encounter`) for non-hostile characters
- [ ] Quest/session log as a new `CampaignState` field + panel
- [ ] Handout/lore attachment on tiles/nodes, revealed to players on demand
- [ ] Surface `TileMetadata` to a GM during play, not just in the Build-mode editor
- [ ] Accessibility pass: keyboard map nav, ARIA/text alternative for canvas content, modal focus management
- [ ] Save history / undo — small ring buffer of recent snapshots in `SaveManager`
