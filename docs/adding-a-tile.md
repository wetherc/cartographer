---
---
# Adding a tile

*How-to guide. For the art rules of each tile family, read
[Tile assets](tile-assets.md).*

Use these steps to add built-in tile art that ships with the app. You draw
an SVG file, register it in the tile catalog, update the palette test, and
check the art in the tile preview page.

A GM who loads an image at runtime does not need these steps.
`TilePalette.addCustom` registers that image without a code change.

## Prerequisites

- A clone with `pnpm install` done.
- `python3`, to serve the preview page.

## 1. Read the family rules

Open [Tile assets](tile-assets.md) and read the section for your tile
family. The families are terrain variants, road pieces, river pieces, coast
pieces, dock pieces, POI markers, town pieces, interior pieces, and
furnishings.

Each family has its own rule for the background and the edges. A tile that
breaks the rule shows a visible line against its neighbors on the map.

## 2. Draw the SVG

1. Use a `viewBox="0 0 64 64"` tile box.
2. Keep each decorative detail inset from the edges, unless the family
   rules allow a motif that crosses an edge.
3. Define a repeated element once in `<defs>`, and stamp it with
   `<use href="#id" transform=...>`. The canvas `drawImage` method draws
   these elements correctly.
4. Save the file at the path that the catalog expects for its family:

| Family | Path | Example |
| --- | --- | --- |
| Terrain variant | `assets/tiles/<type>/<type>-<n>.svg` | `assets/tiles/grass/grass-4.svg` |
| Road piece | `assets/tiles/road/road-<kind>.svg` | `assets/tiles/road/road-corner-ne.svg` |
| River piece | `assets/tiles/river/river-<kind>.svg` | `assets/tiles/river/river-ford-h.svg` |
| Coast piece | `assets/tiles/coast/coast-<kind>.svg` | `assets/tiles/coast/coast-inner-sw.svg` |
| Dock piece | `assets/tiles/dock/dock-<kind>.svg` | `assets/tiles/dock/dock-quay-n.svg` |
| POI marker | `assets/tiles/<marker>/<marker>.svg` | `assets/tiles/tavern/tavern.svg` |
| Town building | `assets/tiles/town/<building>.svg` | `assets/tiles/town/bakery.svg` |
| Town wall piece | `assets/tiles/town/town-<kind>.svg` | `assets/tiles/town/town-gate-h.svg` |
| Interior piece or furnishing | `assets/tiles/interior/interior-<kind>.svg` | `assets/tiles/interior/interior-chest.svg` |

## 3. Register the tile

**Warning:** A new terrain variant or floor variant changes the look of saved
maps. A save stores a cell whose variant matches the position hash as its
family name alone. The hash then picks from the new count, so most cells of
that family in every saved map draw a different variant.

A tile exists for the app only when a registry table names it. Add the
tile to the table for its family:

| Family | Table | File | What to add |
| --- | --- | --- | --- |
| Terrain | `VARIANT_COUNTS` | `src/map/TileCatalog.js` | Raise the count for the type |
| Interior floor | `FLOOR_VARIANT_COUNTS` and `INTERIOR_KINDS` | `src/map/TileCatalog.js` and `src/map/TileKinds.js` | Raise the count for the floor family, and add the kind with the meaning `floor` |
| Road | `ROAD_KINDS` | `src/map/TileCatalog.js` | The kind name |
| River | `RIVER_KINDS` | `src/map/TileCatalog.js` | The kind name |
| Coast | `COAST_KINDS` | `src/map/TileCatalog.js` | The kind name |
| Dock | `DOCK_KINDS` | `src/map/TileCatalog.js` | The kind name |
| POI marker | `MARKER_TYPES` | `src/map/TileCatalog.js` | The marker name |
| Town building | `TOWN_BUILDINGS` | `src/map/TileCatalog.js` | The building name |
| Town wall | `TOWN_WALL_KINDS` | `src/map/TileKinds.js` | The kind name and its rule meaning |
| Interior | `INTERIOR_KINDS` | `src/map/TileKinds.js` | The kind name and its rule meaning |
| Furnishing | `FURNISHING_KINDS` | `src/map/TileKinds.js` | The kind name and its rule meaning |

An interior piece, a furnishing, or a town wall piece needs a rule meaning.
The valid meanings are `wall`, `obstacle`, `door`, `stairs-up`,
`stairs-down`, `floor`, and `plain`. The rest of the app reads the meaning
through `tileKind(tile)`. A piece that is not in these three tables has
the meaning `plain`, so the party can walk across it.

## 4. Update the tests

1. Open `tests/TilePalette.test.js`.
2. Update the count or the name list in the test for your family. For
   example, a new road piece raises the expected road count from 15 to 16.
3. If the tile has a rule meaning, add an assertion to
   `tests/TileKinds.test.js`.
4. Run the two files:

   ```bash
   node --test tests/TilePalette.test.js tests/TileKinds.test.js
   ```

The test "every built-in entry points at a file that exists" fails if the
registered path has no file. If it fails, compare the path in the error
with the path table in step 2.

## 5. Add the tile to the preview page

`tests/tile-preview.html` lists its tiles by hand. Add your tile to the
list for its family. For example, a new POI marker goes into the marker
list, and a terrain type with more than 3 variants goes into `VARIANTS`.

## 6. Look at the tile

1. From the project root, serve the files:

   ```bash
   python3 -m http.server 8934
   ```

2. Open `http://localhost:8934/tests/tile-preview.html`.
3. Find the new tile, and check these points:
   - The background matches the family rule.
   - No detail touches an edge, unless the family allows it.
   - The tile joins its neighbors with no visible line.
4. If the tile is a connector, check that its path lines up with a straight
   piece and with a corner piece at the shared edge.
5. Stop the server with Ctrl+C.

See [Testing a change](testing.md) for the other browser checks.
