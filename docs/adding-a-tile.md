# Adding a tile

*How-to guide. For the art rules of each tile family, read
[Tile assets](tile-assets.md).*

Follow these steps to add built-in tile art. A GM who loads their own image
at runtime needs none of this.

## 1. Read the family rules first

Open [Tile assets](tile-assets.md) and read the section for the family you
are adding: terrain variants, road pieces, river pieces, coast pieces, POI
markers, or interior pieces. Each family has its own rule for backgrounds
and edges. A tile that breaks the rule draws a seam against its neighbors.

## 2. Draw the SVG

1. Put the file under `assets/tiles/<type>/`.
2. Name a terrain variant `<type>-<n>.svg`, for example `grass-4.svg`.
   Name a connector piece after its kind, for example `corner-ne.svg`.
3. Use a 64-unit tile box.
4. Keep every decorative detail inset from the edges, unless the family
   rules allow an edge-crossing motif.
5. Define a repeated shape once in `<defs>` and stamp it with
   `<use href="#id" transform=...>`. The `drawImage` method of the canvas
   draws these correctly.

## 3. Register the tile

Open `src/map/TilePalette.js` and add the tile to the table for its family:

| Family | Table | What to add |
| --- | --- | --- |
| Terrain | `VARIANT_COUNTS` | Raise the count for the type |
| Road | `ROAD_KINDS` | The kind name |
| River | `RIVER_KINDS` | The kind name |
| Coast | `COAST_KINDS` | The kind name |
| POI marker | `MARKER_TYPES` | The marker name |
| Interior | `INTERIOR_KINDS` | The kind name and its rule meaning |

An interior piece needs a rule meaning: `wall`, `door`, `stairs-up`,
`stairs-down`, or `floor`. Every other piece takes the meaning `plain`. The
rest of the app reads this meaning through `kindOf(imageRef)`, so the rules
treat a piece without one as scenery.

## 4. Update the palette test

Add the new tile to `tests/TilePalette.test.js`, then run:

```bash
node --test tests/TilePalette.test.js
```

## 5. Look at the tile

1. Serve the project root:

   ```bash
   python3 -m http.server 8934
   ```

2. Open `http://localhost:8934/tests/tile-preview.html`.
3. Find the new tile and check that the background matches its family,
   that no detail touches an edge, and that the tile abuts its neighbors
   with no seam.
4. If the tile is a connector, check that its path lines up with a straight
   piece and with a corner piece at the shared edge.

See [Testing a change](testing.md) for the rest of the browser checks.
