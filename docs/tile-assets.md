---
---
# Tile assets

*Reference. To draw and register a new tile, follow
[Adding a tile](adding-a-tile.md).*

The built-in tile art lives under `assets/tiles/`, in one folder for each
tile family or type. Each tile is a 64 by 64 unit SVG file. The registry
tables in `src/map/TileCatalog.js` and `src/map/TileKinds.js` define which
files the app loads, so read those tables before you add or rename a file.

| Folder | Contents |
| --- | --- |
| `grass/`, `forest/`, `mountain/`, `water/`, `desert/`, `swamp/`, `snow/`, `hills/`, `farmland/` | The core terrain types |
| `deep-water/`, `jungle/`, `taiga/`, `savanna/`, `badlands/`, `volcanic/`, `glacier/`, `snow-hills/`, `snow-mountain/` | The other biomes of the climate model |
| `plaza/` | The cobbled town square |
| `road/`, `river/`, `coast/`, `dock/` | The connector and transition overlays |
| `lighthouse/` | The lighthouse overlay, which stands on a coast piece |
| One folder for each POI marker, such as `castle/` and `tavern/` | The single-image markers |
| `town/` | The town buildings and the town wall pieces |
| `interior/` | The interior pieces and the furnishings |

## Terrain variants

Most terrain types have 3 variants, for example `grass-1.svg`,
`grass-2.svg`, and `grass-3.svg`. The exceptions are in this table:

| Type | Variants | Reason |
| --- | --- | --- |
| `mountain`, `snow-mountain`, `badlands` | 5 | The landforms are large, so 3 repeated layouts show as rows |
| `taiga` | 4 | The trees are large, for the same reason |
| `plaza` | 5 | The variants share one cobble layout and differ only in the worn stones |

`VARIANT_COUNTS` in `TileCatalog.js` sets the count for each type.
`variantIdAt(type, x, y)` picks a variant from a hash of the cell position,
so adjacent tiles of the same type do not look identical. The generators
and the Build-mode palette use this pick.

The default swatch for a terrain type is a `palette.anyVariant(type)`
brush, which paints the hashed pick on each cell. A save stores a cell that
has this pick as its type name alone. For this reason, a new variant for a
type changes the art of most cells of that type in every saved map.

The variants of a type join without a visible line when they follow these
rules:

- All variants of a type use the same background fill color. `farmland`
  uses the grass background, `#5a9b4a`, so fields join the grass tiles
  around settlements.
- Decorative details, such as grass tufts, trees, rocks, and sparkles, stay
  inset from the tile edges. No decorative detail touches or crosses an
  edge.
- A type can include a motif that crosses an edge only if the motif is the
  same in all variants of the type and continuous at the edges.
- Variants differ only in the count, placement, and arrangement of the
  inset details. They never differ in background color or overall tone.
- A reusable element, such as a grass tuft or a tree, is defined once in
  `<defs>` and stamped with `<use href="#id" transform=...>`. The canvas
  `drawImage` method draws these elements correctly.

### Motifs that cross an edge

A *periodic path* is one type of edge-crossing motif. The dune crests of
`desert` and the mid-ground ridge band of `mountain` are periodic paths.
The path passes through the same point with the same tangent at x=0 and
x=64, for example as a `Q .. T ..` chain whose period divides 64.

A *wrapped stamp* is the other type. The edge-canopy clusters of `forest`
and the edge outcrops of `mountain` are wrapped stamps. A wrapped stamp is
a `<use>` element that straddles an edge. The tile repeats it at the
opposite edge with the same transform plus a 64-unit offset:

- A stamp that crosses x=0 repeats at x+64.
- A stamp that crosses y=0 repeats at y+64.
- A stamp on a corner repeats at all four corners.

The centers of wrapped stamps sit a few units off the edge line, and their
forms and offsets vary from edge to edge. Identical stamps exactly on each
edge form a straight row at each shared edge, and the rows show as a
64-pixel grid across the whole map.

`water` has no edge-crossing motif. Its wave crests are inset stamps. A row
of waves that crosses each edge joins the rows of the neighboring tiles,
and it draws continuous stripes across open water.

## Road connector pieces

Each road tile is a separate connector piece, not a random variant.
`palette.getRoadPiece(kind)` finds a piece by its kind. The fifteen kinds
are `h`, `v`, `cross`, the four `tee-*` pieces, the four `corner-*`
pieces, and the four `end-*` dead-end pieces. The autotiling code picks the
piece whose open edges match the neighboring road tiles.

A tee is named for its single arm, so `tee-n` runs east-west with a branch
to the north. A corner is named for its two open edges, so `corner-ne`
connects north and east.

Road pieces are transparent overlays (`isOverlayType`), so a road can
cross grass, sand, or snow. Every road piece uses the same cross-section. A `#bb9c70` path 16
units wide runs on the centerline of the tile, with a `#7c6448` border 2
units wide on each side. For this reason, the path of a
straight piece lines up with the path of a corner, a tee, or a cross at the
shared edge.

## River connector pieces

River pieces follow the pattern of the road pieces.
`palette.getRiverPiece(kind)` finds the same fifteen connector kinds. River
pieces are transparent overlays, so a channel can cross grass, sand, or
snow.

Four more pieces show a road across a straight channel:

| Piece | Road | River |
| --- | --- | --- |
| `bridge-h`, `ford-h` | East-west | North-south |
| `bridge-v`, `ford-v` | North-south | East-west |

Each crossing piece draws its own copy of the road. It replaces both the
river piece and the road piece of its cell.

## Coast transition pieces

`coast/` contains twelve shoreline pieces. `palette.getCoastPiece(kind)`
finds a piece by its kind:

- Four straights, `n`, `s`, `e`, and `w`. Each is named for the edge whose
  half is water.
- Four outer corners, `corner-ne`, `corner-nw`, `corner-se`, and
  `corner-sw`. Water wraps the two named edges around a tip of land.
- Four inner corners, `inner-ne`, `inner-nw`, `inner-se`, and `inner-sw`.
  Water fills only the named quadrant, which is the inside of a turn in a
  bay.

Coast pieces are transparent overlays, like the road and river pieces. The
water side uses `#33719f`, the base color of the water terrain, with a wavy
`#c2a36c` sand strand and an `#8ac2e6` foam line. The land side is fully
transparent.

The terrain under the piece, such as grass, desert, snow, or mountain,
supplies the color of the shore. One set of twelve pieces serves every
biome, so the catalog needs no separate piece for each pair of water and
land.

## Dock pieces

`dock/` contains ten pier and quay pieces. `palette.getDockPiece(kind)`
finds a piece by its kind. Dock pieces are overlays with a transparent
ground, like the coast pieces, so one set serves every water variant and
every shore biome.

| Kind | Where it goes | What it draws |
| --- | --- | --- |
| `pier-v`, `pier-h` | A water tile | A straight run of pier |
| `pier-head-n`, `pier-head-e`, `pier-head-s`, `pier-head-w` | A water tile at the end of a pier | A wide landing, two bollards, and a moored rowboat |
| `quay-n`, `quay-e`, `quay-s`, `quay-w` | A shore tile, over the straight coast piece of the same name | A wharf deck over the waterline, a street from the land edge, and the start of the pier at the water edge |

A pier head and a quay are both named for the side that the pier runs out
to. So `quay-n` goes over `coast-n`, and `pier-head-n` ends a pier that runs
north.

Every dock piece uses one cross-section:

- A `#8a6f4a` deck 16 units wide, centered on the tile.
- Two `#5f4529` stringers, one on each side of the deck.
- `#6f583a` plank joints on a 4-unit period.
- `#4a3a26` pile heads on a 32-unit period.

The deck and timber colors match `river-bridge-h`. A pier crosses the tile
edge at the same place on every piece, so a straight run joins its quay and
its head. The street of a quay matches `road-v` or `road-h` at the land
edge.

The shadow is a soft `#1f3b4d` contact pad around the footprint of the
timber, with no offset in any direction. A piece can turn a quarter turn,
and its shadow still fits. The `e`, `s`, and `w` pieces are the `n` piece
inside a `rotate` group, and `pier-h` is `pier-v` turned the same way.

No dock piece has a rule meaning, so each one is `plain`, and the party can
walk out along a pier. When a GM paints a dock piece, it stacks over the
coast and road overlays of its tile. See `stackOverlay` in
`src/map/TilePaint.js`.

## Lighthouse

`lighthouse/lighthouse.svg` is an overlay with a transparent ground. It
draws a stone tower with a signal fire on a rock footing, and a soft
contact shadow under the footing. The footing sits at the middle of the
tile. Every coast piece draws its strand or the land beside it there, so
the tower stands on the shoreline of any straight, corner, or inner corner
piece, over any terrain. `stackOverlay` draws the lighthouse above every
other overlay family, and painting a second lighthouse on a tile replaces
the first. The lighthouse is `plain`, so the party can walk onto its tile.

The wilderness generator puts a lighthouse only on a land cell whose only
overlay is a coast piece and that has open water within two cells. See
`placeLandmarks` in `src/map/GeneratorWilds.js`.

## POI markers

The single-image markers (`MARKER_TYPES`) are `settlement`, `dungeon`,
`castle`, `ruined-castle`, `tavern`, `burned-tavern`, `inn`, `burned-inn`,
`blacksmith`, `burned-blacksmith`, `general-store`, `burned-general-store`,
`alchemist`, `temple`, `shrine`, `wizard-tower`, `ruined-wizard-tower`,
`academy`, `barracks`, `ruins`, `cave-entrance`, `mine`, `port`, `farm`,
`burned-farm`, `graveyard`, `camp`, `standing-stones`, `village`, `city`,
`oasis`, `watchtower`, and `burned-watchtower`.

The `burned-` and `ruined-` markers show a building after an attack. Each
one uses the footprint, palette, and stroke widths of its intact marker, so
a GM can swap the intact tile for the destroyed one in the same place.
Each town building except `well` and `fountain` has a `burned-` version
that follows the same rule. `burned-market` shows a square after looters
have wrecked and burned the stalls. For a destroyed temple, use `ruins`.

Each marker sits on the standard grass background, `#5a9b4a`, with the
usual mottle ellipses and a dirt clearing under the building. For this
reason, each marker joins grass terrain with no visible line. All building
art stays inset from the tile edges.

The exceptions to the grass background are these:

- `dungeon` has a stone background, `#565064`.
- `port` fills its south half with water.

A new marker uses the grass background.

A marker on desert or snow shows a square of grass. In the desert, the
square looks like an oasis, but in the snow it looks wrong. A set of
markers with transparent backgrounds, drawn as overlays over the terrain,
would remove this limit. The catalog has no such set.

## Town pieces

`town/` contains the town buildings (`TOWN_BUILDINGS`): `house`,
`burned-house`, `cottage`, `burned-cottage`, `market`, `burned-market`,
`well`, `fountain`, `town-hall`, `burned-town-hall`, `guildhall`,
`burned-guildhall`, `bakery`, `burned-bakery`, `warehouse`,
`burned-warehouse`, `stables`, `burned-stables`, `windmill`,
`burned-windmill`, `watermill`, and `burned-watermill`. The town
generator places only the intact buildings. Each building is a marker on
the grass background. Its art stretches over a 2x2 block, and the town
generator paints it at span 2.

The town wall pieces (`TOWN_WALL_KINDS`) are overlays with a transparent
background. `palette.getTownWallPiece(kind)` finds a piece by its kind.

| Kind | What it draws | Rule meaning |
| --- | --- | --- |
| `wall-h`, `wall-v` | A straight run of wall. Every detail repeats on an 8-unit period, so a run joins at the tile edges | `wall` |
| `wall-corner-ne`, `wall-corner-nw`, `wall-corner-se`, `wall-corner-sw` | A corner tower, named for its two open edges | `wall` |
| `gate-h` | A north-south street through an east-west wall | `plain` |
| `gate-v` | An east-west street through a north-south wall | `plain` |
| `water-gate-h`, `water-gate-v` | A river under the wall, in the same two directions | `plain` |

A corner is named for its open edges, like the interior wall corners. So
`wall-corner-se` connects south and east, and it caps the north-west
corner of a ring.

Each gate draws its own copy of `road-v` or `road-h`, so it works with or
without a road overlay under it. Each water gate draws its own copy of the
river, so it joins the river tiles on both sides.

## Interior pieces

`interior/` contains the tiles for building interiors, such as castle halls
and shops. `palette.getInteriorPiece(kind)` finds a piece by its kind, like
the road lookup.

Every piece except the cave pieces uses one flagstone floor base. The fill
is `#a89f8d`, with a `#8f8776` grout grid on a 16-unit pitch. The base has
half-width grout strokes centered on the tile edges, so the grid continues
across each shared edge.

| Kind | What it draws |
| --- | --- |
| `floor-1`, `floor-2`, `floor-3` | Floor variants. They differ only in inset cracks, pebbles, and tinted inner grid cells, and no tint touches a tile edge |
| `wall-h`, `wall-v`, and the four `wall-corner-*` pieces | A stone wall band 16 units wide, centered on the tile |
| The four `wall-tee-*` pieces and `wall-cross` | Three-way and four-way junctions on the same cross-section |
| `door-h`, `door-v` | A wall with a framed wooden door leaf in the gap |
| `stairs-up`, `stairs-down` | Treads that get lighter toward the top and darker toward the bottom, with a direction chevron |
| `cave-floor-1`, `cave-floor-2` | Rough rock floor variants for a cave |
| `cave-wall` | One rough rock piece for every wall cell of a cave |
| `cave-mouth-h`, `cave-mouth-v` | The way into a cave from the map border, with rock on both sides of an open passage |

The floor variants are counted in `FLOOR_VARIANT_COUNTS` in
`TileCatalog.js`: 3 for `interior-floor` and 2 for `interior-cave-floor`.
The interior generators pick a floor variant for each cell with the same
position hash as the terrain variants.

All wall pieces share one cross-section, so straight pieces, corners, and
junctions join cleanly:

- The fill is `#6f6a60`, with dark `#4c4841` edges.
- A `#55514a` course line runs along the band.
- An `#8a857a` highlight sits one unit inside the top or left face.

A corner is named for its open edges, so `wall-corner-ne` connects north
and east, and it caps the south-west corner of a room. A tee is named for
its single arm, like the road tees, so `wall-tee-n` runs east-west with a
branch to the north.

`cave-wall` has no connector kinds, because a cave wall has no straight
runs to join. `cave-mouth-h` takes a passage north-south, like `door-h`.

## Furnishings

The furnishings are also in `interior/`, and `palette.getInteriorPiece(kind)`
finds them too. Their palette type is `furnishing`. Each furnishing has a
transparent ground and draws as an overlay on a floor tile.

| Kind | Meaning | Where the generators put it |
| --- | --- | --- |
| `altar` | `plain` | A castle chapel, and some dungeon rooms |
| `chest` | `plain` | The farthest cell of the bottom level of a dungeon or a cave, and some storerooms |
| `pillar` | `obstacle` | Two rows in some large dungeon rooms and in the great hall of a castle |
| `throne` | `plain` | The north wall of the great hall of a castle |
| `bed` | `obstacle` | A bedroom |
| `table` | `obstacle` | A dining room, and the room behind the door of a building |
| `hearth` | `plain` | The north wall of the room behind the door of a building |
| `bookshelf` | `obstacle` | The north wall of a library |
| `shelf` | `obstacle` | The side walls of the sales floor of a shop |
| `counter` | `obstacle` | The plain sections of the counter across the sales floor of a shop |
| `counter-till` | `obstacle` | One section in the middle of the counter of a shop |
| `counter-end-e` | `obstacle` | The east end of the counter of a shop |
| `counter-end-w` | `obstacle` | No generator puts it. A GM paints it at the west end of a counter |
| `barrel` | `plain` | The corners of a storeroom |
| `rubble` | `plain` | Random floor cells of a dungeon or a cave |
| `pool` | `plain` | Small groups of cells in a cave |
| `trapdoor` | `stairs-down` | No generator puts it. A GM paints it over a floor |

The `shelf` shows goods for sale: jars, bolts of cloth, sacks, and a basket.
The `counter` and `counter-till` pieces draw their top and their front
panel from edge to edge, so a row of them joins into one long counter. The
till section adds a brass scale, a ledger, and a coin box. An end piece
closes the side that its name gives, so `counter-end-e` sits at the east
end of a row and joins the section to its west. The palette has no way to
rotate or mirror a furnishing, so each end is its own tile.

## Rule meanings

The game rules read the meaning of three kinds of art: the interior
pieces, the furnishings, and the town wall pieces. `INTERIOR_KINDS`,
`FURNISHING_KINDS`, and `TOWN_WALL_KINDS` in `src/map/TileKinds.js` list
each piece with its meaning. The rest of the app asks for the meaning of a
tile through `tileKind(tile)`.

| Meaning | Effect |
| --- | --- |
| `wall`, `obstacle` | The party cannot land on the tile, and a new link does not go on it |
| `door` | The authored way into a space |
| `stairs-up`, `stairs-down` | The connection from one level to the next |
| `floor` | Walkable interior floor |
| `plain` | Scenery that the party can walk across |

Any other art has the meaning `plain`. This includes outdoor terrain, POI
markers, and each custom or `data:` image that a GM supplies.

`tileKind` reads the overlays of a tile before its base image. The topmost
overlay with a meaning other than `plain` decides. So a pillar on a floor is
an obstacle, and a trapdoor on a floor leads down like `stairs-down`. A
`plain` furnishing, such as a chest, keeps the meaning of the floor under
it. `kindOf(imageRef)` gives the meaning of one image.

## Registry tables

A tile exists for the app only when its family table names it.

| Table | File | What it registers |
| --- | --- | --- |
| `VARIANT_COUNTS` | `TileCatalog.js` | The number of variants of each terrain type |
| `FLOOR_VARIANT_COUNTS` | `TileCatalog.js` | The number of variants of each interior floor family |
| `ROAD_KINDS` | `TileCatalog.js` | The fifteen road connector kinds |
| `RIVER_KINDS` | `TileCatalog.js` | The fifteen river connector kinds, two bridges, and two fords |
| `COAST_KINDS` | `TileCatalog.js` | The twelve shoreline pieces |
| `DOCK_KINDS` | `TileCatalog.js` | The ten pier, pier head, and quay pieces |
| `MARKER_TYPES` | `TileCatalog.js` | The 34 single-image POI markers |
| `TOWN_BUILDINGS` | `TileCatalog.js` | The 22 span-2 town buildings |
| `TOWN_WALL_KINDS` | `TileKinds.js` | The ten town wall, gate, and water gate pieces, each with its rule meaning |
| `INTERIOR_KINDS` | `TileKinds.js` | The 23 interior pieces, each with its rule meaning |
| `FURNISHING_KINDS` | `TileKinds.js` | The 17 furnishings, each with its rule meaning |

`TilePalette.addCustom` registers a tile that a GM loads at runtime. A
runtime tile is not in these tables, and it cannot replace a built-in tile.
