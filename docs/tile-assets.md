# Tile assets

Built-in tile art lives under `assets/tiles/<type>/`, one subfolder per tile type (`grass/`, `forest/`, `mountain/`, `water/`, `desert/`, `road/`, `settlement/`, `dungeon/`). `TilePalette` (`src/map/TilePalette.js`) is the single source of truth for the catalog and the paths it expects — see `VARIANT_COUNTS`, `ROAD_KINDS`, and `MARKER_TYPES` there before adding or renaming files.

## Terrain variants

Each terrain type ships 3 variants (`grass-1.svg`, `grass-2.svg`, `grass-3.svg`, etc.), selected via `palette.pickVariant(type, rng)` so adjacent tiles of the same type don't look identical. For variants to abut cleanly in the grid:

- All variants of a type share the exact same background fill color.
- Decorative details (grass tufts, trees, rocks, waves, dunes) stay inset from the tile edges — nothing touches or crosses a border.
- Variants differ only in the count/placement/arrangement of those inset details, never in background color or overall tone.

## Road connector pieces

Road tiles are not random variants — each is a distinct connector shape, looked up by name via `palette.getRoadPiece(kind)`: `h`, `v`, `cross`, the four `corner-*`, and the four `end-*` (dead-end stub) pieces. A caller doing autotiling picks the piece whose open edges match which neighbors are also road tiles. All road pieces share:

- The same background fill as `grass` (roads are grass-adjacent terrain, not a separate background color) — a mismatch here shows up as a visible seam where road tiles meet grass tiles.
- The same path stroke width and centerline position, so a straight piece's path lines up with a corner or cross piece's path at the shared edge.

## Adding a new tile

1. Add the SVG(s) under `assets/tiles/<type>/`, following the background/inset-detail conventions above if it's a terrain type with variants.
2. Register it in `TilePalette.js` (`VARIANT_COUNTS`/`ROAD_KINDS`/`MARKER_TYPES`, or via `addCustom` for a runtime-loaded tile).
3. Update `tests/TilePalette.test.js` if you added a new built-in.
4. Check it renders and abuts correctly in `tests/tile-preview.html` (see `docs/testing.md` for how to visually verify).
