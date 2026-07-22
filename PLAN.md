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
- [ ] Hierarchy zoom nav (world → region → subregion → POI) + breadcrumb
- [ ] `map/FogOfWar.js` — reveal/hide logic + tests
- [ ] `party/PartyTracker.js` — position, movement, triggers reveal
- [ ] `entities/Encounter.js` — enemy/encounter HP tracking
- [ ] `entities/Resource.js` — item/mana/expendable tracking
- [ ] `entities/Character.js` — stats, level, progression
- [ ] `ui/` panels — character sheet, inventory, encounter panel, dice tray
- [ ] `storage/SaveManager.js` — serialize/deserialize + localStorage + export/import + round-trip tests
- [ ] `index.html` / `style.css` — app shell
- [ ] `main.js` — wire all modules together
