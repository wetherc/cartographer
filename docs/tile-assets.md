# Tile assets

*Reference. To draw and register a new tile, follow
[Adding a tile](adding-a-tile.md).*

Built-in tile art lives under `assets/tiles/<type>/`. Each tile type has its own subfolder: `grass/`, `forest/`, `mountain/`, `water/`, `desert/`, `swamp/`, `snow/`, `hills/`, `farmland/`, `road/`, `river/`, `coast/`, `interior/`, and one folder for each POI marker, for example `settlement/`, `castle/`, `tavern/`. `TilePalette` (`src/map/TilePalette.js`) defines the catalog and the paths that it expects. Anyone who adds or renames files must first read `VARIANT_COUNTS`, `ROAD_KINDS`, `RIVER_KINDS`, `COAST_KINDS`, `MARKER_TYPES`, and `INTERIOR_KINDS` in that file.

## Terrain variants

Each terrain type includes 3 variants, for example `grass-1.svg`, `grass-2.svg`, and `grass-3.svg`. `palette.pickVariant(type, rng)` selects one variant so adjacent tiles of the same type do not look identical. The variants must abut cleanly in the grid, under these rules:

- All variants of a type use the same background fill color. `farmland` reuses the grass background, like `road`, so fields abut grass tiles around settlements.
- Decorative details, for example grass tufts, trees, rocks, and sparkles, stay inset from the tile edges. No decorative detail touches or crosses a border.
- One exception exists. A type can carry a motif that crosses an edge, if the motif is byte-identical across all variants of the type and continuous in geometry at the borders.

  A *periodic path* is one type of edge-crossing motif: water's wave rows, desert's dune crests, and the mountain mid-ground ridge band. This path must pass through the same point with the same tangent at x=0 and x=64. For example, use a `Q .. T ..` chain whose period divides 64.

  A *wrapped stamp* is the other type: forest's edge-canopy clusters and mountain's edge outcrops. A wrapped stamp is a `<use>` element that straddles a border. The tile duplicates the stamp at the opposite border with the same transform, except for a 64-unit offset. Anything that crosses x=0 repeats at +64. Anything that crosses y=0 repeats in the same way. Corners repeat at all four positions.

  Wrapped-stamp centers must sit a few units off the border line. Their shapes and offsets must vary per edge. Identical stamps that sit exactly on every border form a straight row of shapes at each seam. The result is a visible 64-pixel lattice across the map.

  Either type of motif lets any variant abut any other variant without a seam. Such a motif must not vary between variants. Variants differ only in their inset details.
- Variants differ only in the count, placement, and arrangement of inset details. They never differ in background color or in overall tone.
- Reusable elements, for example a grass tuft or a tree, are defined once in `<defs>`. Each element is stamped with `<use href="#id" transform=...>`. The canvas `drawImage` method draws these correctly.

## Road connector pieces

Road tiles are not random variants. Each road tile is a distinct connector shape. `palette.getRoadPiece(kind)` looks up a piece by name: `h`, `v`, `cross`, the four `corner-*` pieces, and the four `end-*` (dead-end stub) pieces. Code that performs autotiling picks the piece whose open edges match the neighboring road tiles. All road pieces share:

- The same background fill as `grass`. Roads are grass-adjacent terrain, not a separate background color. A mismatch here produces a visible seam where road tiles meet grass tiles.
- The same path stroke width and the same centerline position. As a result, the path of a straight piece lines up with the path of a corner or cross piece at the shared edge.

## River connector pieces

Rivers follow the same pattern as roads. `palette.getRiverPiece(kind)` looks up the same fifteen connector kinds. Rivers are painted as transparent overlays (`overlayRef`), so a channel can cross grass, sand, or snow.

## Coast transition pieces

`coast/` holds twelve shoreline pieces, found through `palette.getCoastPiece(kind)`:

- Four straights (`n/s/e/w`), named for the edge whose half is water.
- Four outer corners (`corner-ne/nw/se/sw`). Water wraps the two named edges around a land tip.
- Four inner corners (`inner-ne/nw/se/sw`). Water fills only the named quadrant, the inside of a turn in a bay.

Like roads and rivers, coast pieces are transparent overlays (`isOverlayType`). The water side uses the water terrain base color `#33719f`, with a wavy `#c2a36c` sand strand and an `#8ac2e6` foam line. The land side is fully transparent. The terrain beneath, for example grass, desert, snow, or mountain, supplies the shore color. One set of twelve pieces therefore serves every biome. No tile combination of water and another terrain is needed.

## POI markers

Single-image markers (`MARKER_TYPES`) sit on the standard grass background (`#5a9b4a`), with the usual mottle ellipses and a dirt clearing under the building. This lets each marker abut grass terrain without a seam. All building art stays inset from the tile edges.

The set covers `settlement`, `dungeon`, `castle`, `tavern`, `inn`, `blacksmith`, `general-store`, `alchemist`, `temple`, `shrine`, `wizard-tower`, `academy`, `barracks`, `ruins`, `cave-entrance`, `mine`, `port`, `farm`, `graveyard`, `camp`, and `standing-stones`.

`dungeon` predates the grass-base rule, so it keeps its stone background. Every marker added after `dungeon` sits on grass.

## Interior pieces

`interior/` holds building-interior tiles, for example castle halls and shops. `palette.getInteriorPiece(kind)` selects a tile by kind, in the same pattern as road pieces. Every piece shares a byte-identical flagstone floor base: fill `#a89f8d` with a `#8f8776` grout grid on a 16-pixel pitch. This base includes half-width grout strokes centered on the tile edges, so the grid continues across any seam. The kinds are:

- `floor-1` through `floor-3`: floor variants. They differ only in inset cracks, pebbles, and tinted inner grid cells. Tints never touch a tile edge.
- `wall-h`, `wall-v`, and `wall-corner-*`: a 16-pixel stone wall band centered on the tile. These pieces share one cross-section: fill `#6f6a60`, dark `#4c4841` edges, a `#55514a` course line, and an `#8a857a` highlight one unit inside the top or left face. This shared cross-section lets straight pieces and corner pieces join cleanly. Corner names describe the open edges. For example, `wall-corner-ne` connects north and east, so it caps the south-west corner of a room.
- `wall-tee-*` and `wall-cross`: three-way and four-way junctions on the same cross-section. Like the road tees, a tee is named for its single arm. For example, `wall-tee-n` runs east-west with a branch to the north.
- `door-h` and `door-v`: a wall with a framed wooden door leaf in the gap.
- `stairs-up` and `stairs-down`: treads that lighten toward the top and darken toward the bottom, with a direction chevron.

Interior pieces are the only art that the game rules read. `INTERIOR_KINDS` in `TilePalette.js` lists each piece with its meaning: `wall`, `door`, `stairs-up`, `stairs-down`, or `floor`. The rest of the app asks for this meaning through `kindOf(imageRef)`. To add an interior piece, you must give it a meaning in `INTERIOR_KINDS`. Every other piece gets the meaning `plain`.

## Registry tables

`TilePalette.js` holds one table per tile family. A tile exists for the app
only when its family table names it.

| Table | What it registers |
| --- | --- |
| `VARIANT_COUNTS` | How many variants each terrain type has |
| `ROAD_KINDS` | The fifteen road connector kinds |
| `RIVER_KINDS` | The fifteen river connector kinds |
| `COAST_KINDS` | The twelve shoreline pieces |
| `MARKER_TYPES` | The single-image POI markers |
| `INTERIOR_KINDS` | Each interior piece with its rule meaning |

`addCustom` registers a tile that a GM loads at runtime. A runtime tile is
not in these tables.
