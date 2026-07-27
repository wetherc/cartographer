# The map

*Back to the [architecture overview](../architecture.md).*

The map is the heart of the app: a tiled world the GM paints in Build mode and
the party explores in Play mode. Underneath it sits a small data model — nodes
and tiles — and everything else on this page (the hierarchy, regions,
rendering, fog of war, party movement) builds on that model, so start with the
first section even if you came for something later.

## Nodes and tiles

A **MapNode** (`src/types/map.ts`) is one map: a rectangular grid of **Tile**s.
A world map is a node; so is a region inside it, a town inside that, and a
dungeon under the town. Nodes form a tree two ways at once:

- Each node carries a `parentId` pointing up.
- A tile can carry a `childNodeId` pointing down at another node — "zoom in
  here and you get that map."

```
  world (MapNode, kind: 'world')
    |
    |  tile "3,4" has childNodeId: 'darkwood'
    v
  darkwood (MapNode, kind: 'region', parentId: 'world')
    |
    |  tiles "1,2" and "2,2" both have childNodeId: 'barrow'
    v
  barrow (MapNode, kind: 'interior', parentId: 'darkwood')
```

There is deliberately no separate "region" entity. A region is just a MapNode
reached through one or more tiles' `childNodeId`.

`TileGrid` (`src/map/TileGrid.js`) is the registry holding all of this: a
`Map<id, MapNode>` with helpers to add/get/update nodes, walk the `parentId`
chain for a breadcrumb, and resolve a tile's zoom target. One method matters
for cross-tab sync: `replaceNodes` swaps the whole registry's contents while
keeping the grid *object's* identity, which is how a running tab adopts a
campaign another tab saved — the navigator, the party tracker, and the canvas
each hold the grid they were constructed with, and none of them need to be
rebuilt.

### Grid coordinates

A tile's id doubles as its position: tiles placed in a grid use `"x,y"` as
their id, e.g. `"3,4"`. There is no separate x/y field. The pure functions
`parseCoords`, `tileRect`, and `screenToTile` in `src/map/MapGeometry.js`
convert between grid coordinates and screen pixels; anything that needs a
tile's position parses its id.

Ids that don't match `"x,y"` are simply skipped by grid-aware code (see
`RegionGroups.findRegionGroups`). That is intentional: hierarchy-test fixtures
use non-grid ids and are unaffected by grid logic.

## Region grouping and multi-tile art

A region can be entered from more than one tile. Any set of
4-neighbor-contiguous tiles sharing the same non-null `childNodeId` counts as
one region block. `RegionGroups.findRegionGroups(node)`
(`src/map/RegionGroups.js`) is a pure flood-fill returning
`{ childNodeId, tileIds, cells, minX, minY, maxX, maxY }` per group, where
`cells` holds each member's grid coordinates in `tileIds` order. No schema change
was needed to support this — multiple tiles simply carry the same
`childNodeId` value. `MapCanvas` recomputes groups whenever a node loads and
draws a tint plus outline over each group's bounding box, optionally labeled
via a `getNodeName` callback.

On outdoor (`kind: 'region'`) maps, a multi-tile region block also renders as
scaled images instead of per-tile art. `groupImageChunks(node, group)`
partitions a filled-rectangle group into blocks of at most 2x2 tiles, each
represented by one image (`groupImageRef` — a POI-marked tile's art wins, else
the top-left-most tile's), and `MapRenderer._renderGroupImages` draws each
chunk's image stretched across its block, with the per-tile pass skipping the
covered base images. Fog rects and path overlays still draw per tile on top,
so a partially explored block reveals piecewise and a road through a region
stays tile-sized. Ragged (non-rectangular) groups and interiors keep plain
per-tile rendering.

Independent of region links, a tile can carry an optional `span` (set by
`paintTile(node, tileId, imageRef, overlay, span)` when the Build palette's
Size row is at 2x/3x): its image draws stretched across a span-by-span block
anchored at the tile, shifted up/left near the far edges so it stays in
bounds. `spanBlocks(node)` in `TilePaint.js` enumerates these blocks
pure-geometrically and `MapRenderer._renderSpanImages` draws them right after
the region-block chunks, feeding the same cover set so the tile pass skips
covered base images while fog and overlays stay per tile. Unlike region
chunks, span art renders on interiors too, and covered cells keep their own
tiles untouched — repainting the anchor at 1x clears the span.

## Rendering and input

The canvas work is split so that each file owns one concern:

```
  MapCanvas (src/map/MapCanvas.js)
    owns the <canvas> and the view state: node, pan/zoom,
    markers, selection
    |
    +-- MapRenderer ......... terrain / fog / region passes
    |     +-- MapMarkers ....... party, encounter, NPC, token markers
    |     +-- MapDecorations ... cursor, marquee, selection, POI,
    |                            coordinate chrome
    |
    +-- MapCanvasPointer .... right-drag/touch pan, cursor-anchored wheel
    |                         and pinch zoom, authoring strokes, hover
    |                         tracking, context click
    +-- MapCanvasKeyboard ... arrow-key cursor, Enter/Space activation,
                              +/- zoom, focus outline
```

The two input controllers mutate the view state back through the host
reference. One subtlety: a pointerup counts as a tile click only if the total
drag distance stayed below a small threshold, so panning never also triggers a
zoom-in.

For each tile, the renderer draws a fog rect if `!tile.revealed`, otherwise
the image at `tile.imageRef`.

**Navigation** is pure logic with no DOM: `MapNavigator`
(`src/map/MapNavigator.js`) tracks which node is "current" and exposes
`zoomIn(tileId)` / `zoomOut()` / `goTo(nodeId)` / `getBreadcrumb()` over a
`TileGrid`. `MapCanvas`'s `onTileClick` callback and `ui/Breadcrumb.js`'s
click handler both just call into a navigator and re-render.

## The tile catalog and generation

`TilePalette` (`src/map/TilePalette.js`) is the built-in tile catalog. Terrain
types have multiple interchangeable variants — `pickVariant(type, rng)` takes
the RNG as an argument for testability — while road pieces are named connector
shapes rather than random variants (`getRoadPiece(kind)`). Callers can
register custom tiles (`addCustom`/`removeCustom`) without being able to
override built-ins.

`Autotile.js` (`src/map/Autotile.js`) picks connector overlay pieces from a
terrain grid, pure and RNG-injected: `smoothCoastline` widens water until
every shore shape has a matching coast piece, `coastOverlays`/`coastKind` name
the shoreline overlay per land cell, and `riverCourse` walks a meandering
channel from the north edge south, returning the river piece per tile.

Two consumers build on it: the generator archetypes (wilderness/town in
`src/map/GeneratorRegions.js`, dispatched from `MapGenerator`; dungeon/castle
in `src/map/GeneratorInteriors.js`) and the example world in
`campaign/ExampleWorld.js`.

A tile's `overlayRef` can hold a single ref or a draw-ordered stack
(normalized by `TileGrid.overlayList`). Where a river drains into a lake or
the sea, the mouth tile stacks the channel over its shoreline piece so neither
overlay displaces the other.

## Fog of war

`FogOfWar.js` (`src/map/FogOfWar.js`) is pure functions over a MapNode:

- `revealAround(node, centerId, radius)` parses `centerId` as an `"x,y"` grid
  coordinate and reveals every tile within a Euclidean radius of it.
  Revealing is monotonic — a tile that is already revealed, or outside the
  radius, is left untouched, so moving away from an area never re-fogs it.
- `hideAll(node)` resets a node to fully unrevealed (a reset/debug path).
- `revealedCount(node)` backs "percent explored"-style readouts.
- `withinRadius(tileId, centerId, radius)` exposes the same Euclidean cutoff
  as a predicate.

That last one gates the markers: `MapMarkers` uses it to limit the
encounter/NPC/POI markers to a detection range — twice the fog reveal radius
(`MapView.markerRange`, wired from `PartyTracker.revealRadius`) around the
party tile and every character token. A marker can be sensed slightly beyond
the fog edge but never across the map, and a node the party isn't in shows no
markers at all outside Build mode.

## The party

`PartyTracker` (`src/party/PartyTracker.js`) owns the party's `PartyPosition`
(nodeId + tileId) and is the only thing that should move the party.
`moveTo(nodeId, tileId)` updates the position and calls `revealAround` on the
target node, writing the result straight back into the `TileGrid` it was
constructed with. The constructor also reveals around the initial position, so
a party never starts fogged in on their own tile.

`moveTo`'s `nodeId` can differ from the party's current node, so crossing
between a parent map and a zoomed-in region (via `MapNavigator`) works the
same way as moving within one node — each node's revealed state is
independent.

### Individual character tokens and the split party

`CharacterTokens.js` (`src/party/CharacterTokens.js`) layers individual
characters over that shared position. A `Character.location` of null means
"with the party" (the token renders on the party's tile); a non-null location
is the character's own tile.

- `characterTokens(characters, partyPosition, nodeId)` resolves the named
  tokens to draw in a rendered node.
- `moveCharacter` relocates one character.
- `recallAll` drops every individual location — the whole-party teleport.
- `isSplit`/`characterPosition` back the regroup flow below.

Movement permissions reuse `CharacterBinding.partyPermissions`: the GM moves
the party (map clicks, which recall everyone) and any single character (the
roster's place action); a bound player tab moves only its own character, whose
steps reveal fog via the same `revealAround`.

All of that individual movement sits behind the persisted `splitParty` flag
(on `CampaignState`, default false), toggled by a GM-only switch in the Party
panel (`partyWiring.js`). While it is off, `syncPartyMarker` passes no tokens
to the canvas (only the shared marker renders), the roster hides its place
action, and a bound player's map click is a no-op — the party moves
simultaneously, by GM clicks alone. Turning the switch off while `isSplit`
reports scattered characters first regroups the party at a GM-chosen member's
`characterPosition` (a `PartyTracker.moveTo` plus `recallAll`); cancelling the
picker leaves the switch on.
