# Tile assets

Built-in tile art lives under `assets/tiles/<type>/`, one subfolder per tile type (`grass/`, `forest/`, `mountain/`, `water/`, `desert/`, `swamp/`, `snow/`, `hills/`, `farmland/`, `road/`, `interior/`, plus one folder per POI marker such as `settlement/`, `castle/`, `tavern/`). `TilePalette` (`src/map/TilePalette.js`) is the single source of truth for the catalog and the paths it expects — see `VARIANT_COUNTS`, `ROAD_KINDS`, `MARKER_TYPES`, and `INTERIOR_KINDS` there before adding or renaming files.

## Terrain variants

Each terrain type ships 3 variants (`grass-1.svg`, `grass-2.svg`, `grass-3.svg`, etc.), selected via `palette.pickVariant(type, rng)` so adjacent tiles of the same type don't look identical. For variants to abut cleanly in the grid:

- All variants of a type share the exact same background fill color. (`farmland` deliberately reuses the grass background, like roads do, so fields abut grass seamlessly around settlements.)
- Decorative details (grass tufts, trees, rocks, sparkles) stay inset from the tile edges — nothing one-off touches or crosses a border.
- The one allowed exception: a type may carry an edge-crossing motif, provided it is byte-identical across all variants of the type and geometrically continuous at the borders. Two forms exist. A *periodic path* (water's wave rows, desert's dune crests, mountain's mid-ground ridge band) must pass through the same point with the same tangent at x=0 and x=64 (e.g. a `Q .. T ..` chain whose period divides 64). A *wrapped stamp* (forest's edge-canopy clusters, mountain's edge outcrops) is a `<use>` element straddling a border, duplicated at the opposite border with the same transform except the 64-unit offset — anything crossing x=0 repeats at +64, anything crossing y=0 likewise, corners at all four. Stagger wrapped-stamp centers a few units off the border line and vary their shapes/offsets per edge — identical stamps sitting exactly on every border read as a straight row of blobs at each seam and produce a visible 64px lattice. Either way, any variant abuts any variant seamlessly. Never vary such a motif per variant; variants differ only in their inset details.
- Variants differ only in the count/placement/arrangement of those inset details, never in background color or overall tone.
- Reusable elements (a grass tuft, a tree) are defined once in `<defs>` and stamped with `<use href="#id" transform=...>`; canvas `drawImage` renders these fine.

## Road connector pieces

Road tiles are not random variants — each is a distinct connector shape, looked up by name via `palette.getRoadPiece(kind)`: `h`, `v`, `cross`, the four `corner-*`, and the four `end-*` (dead-end stub) pieces. A caller doing autotiling picks the piece whose open edges match which neighbors are also road tiles. All road pieces share:

- The same background fill as `grass` (roads are grass-adjacent terrain, not a separate background color) — a mismatch here shows up as a visible seam where road tiles meet grass tiles.
- The same path stroke width and centerline position, so a straight piece's path lines up with a corner or cross piece's path at the shared edge.

## POI markers

Single-image markers (`MARKER_TYPES`) sit on the standard grass background (`#5a9b4a`, with the usual mottle ellipses and a dirt clearing under the building) so they abut grass terrain seamlessly. All building art stays inset from the tile edges. The set covers `settlement`, `dungeon`, `castle`, `tavern`, `inn`, `blacksmith`, `general-store`, `alchemist`, `temple`, `shrine`, `wizard-tower`, `academy`, `barracks`, `ruins`, `cave-entrance`, `mine`, `port`, `farm`, `graveyard`, `camp`, and `standing-stones`. (`dungeon` predates the grass-base rule and keeps its stone background; every marker since sits on grass.)

## Interior pieces

`interior/` holds building-interior tiles (castle halls, shops) selected by kind via `palette.getInteriorPiece(kind)`, mirroring the road-piece pattern. Every piece shares a byte-identical flagstone floor base: fill `#a89f8d` with a `#8f8776` grout grid on a 16px pitch, including half-width grout strokes centered on the tile edges so the grid continues across any seam. Kinds:

- `floor-1..3` — floor variants; differ only in inset cracks/pebbles and tinted inner grid cells (tints never touch a tile edge).
- `wall-h`, `wall-v`, `wall-corner-*` — a 16px stone wall band centered on the tile, sharing one cross-section (fill `#6f6a60`, dark `#4c4841` edges, `#55514a` course line, `#8a857a` highlight one unit inside the top/left face) so straights and corners join cleanly. Corner names describe the open edges: `wall-corner-ne` connects north and east, so it caps a room's *south-west* corner.
- `door-h`, `door-v` — a wall with a framed wooden door leaf in the gap.
- `stairs-up`, `stairs-down` — treads lightening toward the ascent / darkening into the descent, with a direction chevron.

## Adding a new tile

1. Add the SVG(s) under `assets/tiles/<type>/`, following the background/inset-detail conventions above if it's a terrain type with variants.
2. Register it in `TilePalette.js` (`VARIANT_COUNTS`/`ROAD_KINDS`/`MARKER_TYPES`, or via `addCustom` for a runtime-loaded tile).
3. Update `tests/TilePalette.test.js` if you added a new built-in.
4. Check it renders and abuts correctly in `tests/tile-preview.html` (see `docs/testing.md` for how to visually verify).
