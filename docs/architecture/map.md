# The map

*Back to the [architecture overview](../architecture.md).*

The map is a tiled world the GM paints in Build mode and
the party explores in Play mode. Underneath it sits a small data model made of
nodes and tiles. Everything else on this page (the hierarchy, regions,
rendering, fog of war, party movement) builds on that model, so read the first
section even if you came here for something later.

## Nodes and tiles

Start with the two core types, both declared in `src/types/map.ts`:

- A **Tile** is one square of a map. It carries an id, an art reference
  (`imageRef`), an optional overlay, a `revealed` flag for fog of war, and
  metadata such as a point-of-interest label.
- A **MapNode** is one whole map: a rectangular grid of tiles plus a name, a
  kind (`'world'`, `'region'`, or `'interior'`), and dimensions.

The part that surprises most readers: there is no separate "world"
type, "region" type, or "dungeon" type. A world map is a MapNode. A region
inside it is also a MapNode. So is a town inside that region, and a dungeon
under the town. What differs is how they connect, and they connect in two
directions at once:

- Each node carries a `parentId` pointing up at the map that contains it.
- A tile can carry a `childNodeId` pointing down at another node. Clicking
  that tile in Play mode means "zoom in here and you get that map."

A concrete example, using the example campaign's names:

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

Reading this top to bottom: the world map has a tile at position (3,4) that
zooms into the Darkwood region. Inside Darkwood, two adjacent tiles both zoom
into the same barrow. That is legal and common; a large landmark can occupy
several tiles of its parent map, and any of them takes you inside.

There is deliberately no separate "region" entity to keep in sync with the
tiles. A region is just a MapNode that one or more tiles point at through
`childNodeId`.

### TileGrid, the node registry

`TileGrid` (`src/map/TileGrid.js`) holds all the nodes: a `Map<id, MapNode>`
with helpers to add, get, and update nodes, walk the `parentId` chain to build
a breadcrumb, and resolve a tile's zoom target.

Cross-tab sync depends on `replaceNodes`, which swaps out the entire
registry's contents while keeping the grid *object's* identity. Several
long-lived objects (the navigator, the party tracker, the canvas) each hold a
reference to the grid they were constructed with. When another browser tab
saves the campaign, the running tab adopts the new campaign by replacing the
grid's contents in place, and none of those holders need to be rebuilt or
re-pointed.

### Grid coordinates

A tile's id doubles as its position. Tiles placed in a grid use `"x,y"` as
their id, for example `"3,4"` for the tile at column 3, row 4. There is no
separate x/y field to keep consistent with the id.

The pure functions `parseCoords`, `tileRect`, and `screenToTile` in
`src/map/MapGeometry.js` convert between grid coordinates and screen pixels.
Anything that needs a tile's position parses its id.

Ids that don't match the `"x,y"` pattern are simply skipped by grid-aware code
(see `RegionGroups.findRegionGroups` for an example). That is intentional: the
hierarchy tests use fixture nodes with ids like `"entrance"`, and grid logic
leaves them alone rather than failing on them.

## Region grouping and multi-tile art

As the barrow example above showed, a region can be entered from more than one
tile. The rule for what counts as one landmark: any set of tiles that share
the same non-null `childNodeId` and are contiguous (touching along an edge,
not just diagonally) forms one **region group**.

`RegionGroups.findRegionGroups(node)` (`src/map/RegionGroups.js`) computes
these groups. It is a pure flood-fill over the node's tiles, and for each
group it returns:

```js
{ childNodeId, tileIds, cells, minX, minY, maxX, maxY }
```

`cells` holds each member tile's parsed grid coordinates, in the same order as
`tileIds`, so downstream code never has to re-parse the ids. `minX` through
`maxY` describe the group's bounding box.

No schema change was needed to support multi-tile regions. Multiple tiles simply
carry the same `childNodeId` value,
and grouping is derived from that. `MapCanvas` recomputes the groups whenever
a node loads and draws a tint plus an outline over each group's bounding box,
optionally labeled with the region's name via a `getNodeName` callback.

### Group images

On outdoor maps (`kind: 'region'`), a multi-tile region group also changes how
its art draws. Instead of each tile drawing its own small image, the group
renders as larger scaled images, so a two-by-two castle looks like one castle
rather than four copies of a castle tile.

`groupImageChunks(node, group)` does the partitioning. It splits a
filled-rectangle group into chunks of at most 2x2 tiles, and each chunk draws
one image stretched across its block. The image chosen for a chunk
(`groupImageRef`) is the art of a tile marked as a point of interest if the
chunk has one, otherwise the top-left-most tile's art.
`MapRenderer._renderGroupImages` draws these chunks, and the ordinary per-tile
pass then skips the base images of the covered cells.

Fog rectangles and path overlays still draw per tile on top of the stretched
image. That is what lets a partially explored block reveal piece by piece, and
what keeps a road running through a region drawn at tile size rather than
stretched with the landmark art.

Groups that are ragged (not a filled rectangle) and groups on interior maps
keep plain per-tile rendering.

### Spans: one tile's art drawn large

Independent of region links, a single tile can carry an optional `span`. The
Build palette's Size row sets it (2x or 3x), and `paintTile(node, tileId,
imageRef, overlay, span)` records it. A spanned tile's image draws stretched
across a span-by-span block anchored at that tile. Near the right or bottom
edge of the map, the block shifts up or left as needed so it stays in bounds.

`spanBlocks(node)` in `TilePaint.js` enumerates these blocks with pure
geometry, and `MapRenderer._renderSpanImages` draws them right after the
region-group chunks. Span blocks feed the same "covered cells" set, so the
per-tile pass skips the base images underneath while fog and overlays stay per
tile, exactly as with group images.

Unlike a region chunk, span art renders on interior maps too, not only outdoor
ones, and the covered cells keep their own tile data untouched. The span is purely
a rendering effect of the anchor tile, so repainting the anchor at 1x clears it.

## Rendering and input

The canvas code is split so that each file owns one concern:

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

`MapCanvas` is the host. The renderer and decoration modules read the view
state and draw; the two input controllers (pointer and keyboard) mutate the
view state back through the host reference.

The core of the render pass is simple: for each tile, draw a fog rectangle if
the tile is not revealed, otherwise draw the image at `tile.imageRef`. The
group, span, and marker passes described elsewhere on this page layer on top
of that.

A pointerup counts as a tile click only if the total drag
distance stayed below a small threshold. Without that check, ending a pan
gesture on a region tile would also zoom into it.

**Navigation** is pure logic with no DOM. `MapNavigator`
(`src/map/MapNavigator.js`) tracks which node is currently in view and exposes
`zoomIn(tileId)`, `zoomOut()`, `goTo(nodeId)`, and `getBreadcrumb()` over a
`TileGrid`. The canvas's `onTileClick` callback and the breadcrumb's click
handler (`ui/Breadcrumb.js`) both just call into a navigator and re-render.
Because the navigator has no DOM dependency, all of the zoom and breadcrumb
behavior is covered by plain unit tests.

## The tile catalog and generation

`TilePalette` (`src/map/TilePalette.js`) is the built-in tile catalog. It
distinguishes two kinds of art:

- Terrain types (grass, water, mountains, and so on) have multiple
  interchangeable variants, so a painted field doesn't look like a wallpaper
  pattern. `pickVariant(type, rng)` chooses one, taking the random number
  generator as an argument so tests can pass a deterministic one.
- Road pieces are named connector shapes (a straight, a corner, a tee), not
  random variants. `getRoadPiece(kind)` looks one up by name.

Callers can register custom tiles with `addCustom`/`removeCustom`. Custom
tiles cannot override built-ins; they only extend the catalog.

A few pieces mean something to the rules and not only to the eye: the party
cannot stand on a wall, a door is the authored way into a space, and stairs
connect one dungeon level to the next. `kindOf(imageRef)` answers what a given
image means, and it is the only place that knows. It matches whole references
against the catalog rather than looking for a word in a file name, so a GM's
own art called `interior-wall-h.svg` is still just art, and renaming a built-in
asset cannot quietly change where the party can walk. Everything outside the
interior set — terrain, markers, custom images — is `plain`.

`Autotile.js` (`src/map/Autotile.js`) handles the fiddly part of generated
terrain: picking connector overlay pieces so that coastlines and rivers join
up visually. It is pure and RNG-injected like the palette:

- `smoothCoastline` widens water until every shore shape is one the art set
  has a matching coast piece for.
- `coastOverlays` and `coastKind` name the shoreline overlay for each land
  cell along the water.
- `riverCourse` walks a meandering channel from the north edge south and
  returns the right river piece for each tile along the way.

The generator archetypes (wilderness and town in `src/map/GeneratorRegions.js`,
dispatched from `MapGenerator`; dungeon and castle in
`src/map/GeneratorInteriors.js`) build on these helpers, as does the example world
in `campaign/ExampleWorld.js`.

A tile's `overlayRef` can hold either a single
reference or a draw-ordered stack of them (`TileGrid.overlayList` normalizes
the two forms). The stack exists for places like a river mouth, where the tile
needs both its shoreline piece and the river channel drawn on top of it, and
neither overlay should displace the other.

## Fog of war

Play mode hides the parts of a map the party has not been near. The state
behind that is just the `revealed` flag on each tile, and `FogOfWar.js`
(`src/map/FogOfWar.js`) is a set of pure functions over a MapNode that manage
it:

- `revealAround(node, centerId, radius)` parses `centerId` as an `"x,y"` grid
  coordinate and reveals every tile within a Euclidean radius of it, so the
  revealed area is a disc rather than a square. Revealing is monotonic: a tile
  that is already revealed, or outside the radius, is left untouched. Moving
  away from an area never re-fogs it.
- `hideAll(node)` resets a node to fully unrevealed. It backs reset and debug
  paths.
- `revealedCount(node)` backs "percent explored" style readouts.
- `withinRadius(tileId, centerId, radius)` exposes the same Euclidean cutoff
  as a standalone predicate.

That last function also gates the markers. `MapMarkers` uses it to limit the
encounter, NPC, and point-of-interest markers to a detection range around the
party tile and around every individual character token. The range
(`MapView.markerRange`, wired from `PartyTracker.revealRadius`) is twice the
fog reveal radius, so a marker can be sensed slightly beyond the fog edge but
never from across the map. A node the party isn't currently in shows no
markers at all outside Build mode.

## The party

`PartyTracker` (`src/party/PartyTracker.js`) owns the party's `PartyPosition`,
which is a nodeId plus a tileId, and it is the only thing that should move the
party. `moveTo(nodeId, tileId)` updates the position and calls `revealAround`
on the target node, writing the revealed tiles straight back into the
`TileGrid` it was constructed with. The constructor also reveals around the
initial position, so a party never starts the campaign fogged in on their own
tile.

`moveTo`'s `nodeId` can differ from the party's current node. Crossing between
a parent map and a zoomed-in region (via `MapNavigator`) therefore works the
same way as moving within one node, and each node's revealed state stays
independent: exploring the barrow reveals nothing about Darkwood.

### Individual character tokens and the split party

Usually the party moves as one marker. `CharacterTokens.js`
(`src/party/CharacterTokens.js`) layers individual characters over that shared
position for the times they split up. The convention: a `Character.location`
of null means "with the party", and the character's token renders on the
party's tile. A non-null location is the character's own tile.

- `characterTokens(characters, partyPosition, nodeId)` resolves the named
  tokens to draw on a rendered node.
- `moveCharacter` relocates one character.
- `recallAll` drops every individual location, which amounts to teleporting
  everyone back to the shared party position.
- `isSplit` and `characterPosition` back the regroup flow described below.

Movement permissions reuse `CharacterBinding.partyPermissions`. Which character
a map click moves is `mapTravel.js`'s `clickSubject`: while the party is split,
the GM's clicks move the character selected in the Party roster and a tab bound
to one player moves that player's character. A moved character's steps reveal
fog through the same `revealAround` path. The GM can also place any single
character on any node through the roster's place action, which reaches nodes
that are not on screen.

Picking a character in the roster brings them into view while the party is
split: `partyWiring.js`'s `followCharacter` resolves their
`characterPosition` and hands it to `mapWiring.js`'s `centerOnLocation`, which
navigates to that node if the view is elsewhere and centres the canvas on the
tile at the current zoom. It is the lighter half of `focusLocation` — no tile
selection, no inspector — so it stays out of the way in Play mode.

All of this individual movement sits behind the `splitParty` flag, persisted
on `CampaignState` and false by default, toggled by a GM-only switch in the
Party panel (`app/splitParty.js`). While the switch is off, the app behaves as if
individual movement did not exist: `syncPartyMarker` passes no tokens to the
canvas (only the shared marker renders), the roster hides its place action,
picking a character leaves the view alone, a GM's map click moves the whole
party and recalls everyone to it, and a bound player's map click is a no-op.

Turning the switch off while characters are scattered first regroups the
party: the GM picks a member, and the party position moves to that member's
`characterPosition` (a `PartyTracker.moveTo` plus `recallAll`). Cancelling the
picker leaves the switch on, so the app never ends up with the switch off and
the party still split.
