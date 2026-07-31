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

## Getting back out

Zooming in is a tile's `childNodeId` plus `EntryPoint.computeRegionEntryTile`.
Leaving again is `src/map/MapExits.js`, a pure module whose entry point is
`findExits(node, parent)`. It returns a list of `MapExit` values
(`src/types/map.ts`), which come in three shapes:

- `edge` — a side of the map the party can walk off, one per side of the parent
  block that touches usable parent terrain. Outdoor children only.
- `tile` — a door or a staircase that leads out, carrying the `tileId` and a
  `via` of `door`, `stairs-up`, or `stairs-down`. Interiors only.
- `fallback` — no authored way out was found. Returned as a single exit rather
  than an empty list, so a party can always leave a space they walked into.

The block a child occupies in its parent comes from `blockFor`, a lookup over
`RegionGroups.findRegionGroups`. For an `edge` exit a side counts when any cell
of that block has an orthogonal neighbour in the parent that carries an
`imageRef` and is not part of the block itself. Diagonal contact past a corner
does not count, because the party would have nothing to step onto.

An interior's doors qualify when they open outward: on the grid border, or
beside a cell the map leaves empty, which is the void a generated dungeon leaves
around its rooms. That test cannot tell the void from an unpainted courtyard
inside a hand-authored structure, so a door onto such a courtyard also reads as
a way out; paint the courtyard if it should not.

### Stairways run both ways

`stairwayTo(parent, childNodeId)` answers which of the parent's tiles reaches a
child, and which tile kind in the child comes back along it. A parent that links
through its own stairs down is the level above, so the child leaves through its
stairs up; a parent that links through stairs up is the level below, the way a
keep's ground floor is to its upper storey, and the child leaves through its
stairs down. Any other kind of link, such as a town's door into a keep, is not a
stacked level and has no stairway back at all.

One answer drives everything that depends on the direction: which tiles
`interiorExits` treats as a way out, where `computeRegionEntryTile` lands the
party when they take the stairs, where `computeParentReturnTile` puts them when
they come back, which way the badge's chevron points in `MapMarkers`, and what
the Build warning tells the GM to paint.

A parent that links the same child from both a stairs-down and a stairs-up tile
has authored two contradictory connections. The descent wins, because a level
below is much the more common shape and it is what such a map resolved to before
the ascent was modelled.

One return staircase per level is what the model expresses. Every tile in the
child of the kind that runs back counts as an exit to the parent, and they all
land on the parent's one linking stair tile; the entry landing likewise picks
the first matching stair in tile order. A second staircase meant to go somewhere
else needs its own link to a child node, which takes it out of the exit list.

### Return landing

`EntryPoint.computeParentReturnTile(parent, child, exit, position)` mirrors
`computeRegionEntryTile`. Off an edge, the party's coordinate along that side of
the child maps back onto the block's extent and then one cell further out, onto
the parent terrain the side abuts. Through a door, the same projection from the
door's own coordinate. Along a stairway, the parent's tile at the other end of
it.

The first two snap through `resolveReturnTile`, the parent-side counterpart of
`resolveEntryTile`: nearest painted, non-wall tile that does not belong to the
block just left, since landing back on the block reads as never having left. The
stairway case deliberately skips the snap, because the parent's staircase *is* a
tile of that block and the snapper would reject it for exactly that reason.

### Drawing and taking an exit

`MapView` carries `exits`, set through `MapCanvas.setExits`. Three surfaces read
it:

- `MapDecorations` draws an outward chevron and a "Return to {name}" label in the
  gutter beyond each `edge` exit, and `MapMarkers` draws a small chevron badge on
  each `tile` exit.
- `MapCanvasPointer` hit-tests the same bands on a click. `MapCanvasKeyboard`
  arms an exit when a cursor key would leave the cursor clamped at a border that
  carries one: the band brightens, a live region says to press again, and only a
  second discrete press of the same arrow travels. Key repeats neither arm nor
  confirm, so holding an arrow key sails the cursor to the border and stops
  there instead of teleporting the party. Any other interaction (a cursor
  move, another key, a pointer touch, losing focus, the exits changing)
  withdraws the arming (`MapCanvas.disarmExit`).
- `ui/ExitList.js` mounts the same exits as real buttons over the viewport,
  hidden until one takes focus. They are how a keyboard or a screen reader travels.
  A list holding only a `fallback` exit stays pinned open instead, because the
  canvas draws no arrow and no badge for a fallback: without the pin a pointer
  user in a sealed interior would see no way out anywhere. A list that changes
  while one of its buttons holds focus moves focus to the first surviving button
  rather than dropping it.

The band's rect is computed once, by `exitBandGeometry` plus `edgeExitBand`, and
both the renderer and the pointer call it. The arrow the GM sees and the rect
their click is tested against therefore cannot drift apart. The band is a bounded
pill centred on the party's row or column, clamped to the canvas so panning the
map's border out of view pins the arrow at the viewport edge instead of scrolling
it away.

`mapTravel.js`'s `exitToParent` does the travel, and it moves whoever a click
moves: the whole party for the GM, one character while the split-party toggle is
on, and no one from a spectator tab, which follows the camera out. A `tile` exit
also stays an ordinary tile to walk onto, so it only leads out once whoever the
click moves is already standing on it. Otherwise the party could never stand in a
doorway. The exit buttons take the same door in one press.

`mapWiring.js`'s `syncExits` is the one place that recomputes the list, feeding
the canvas and the button list together. It hangs off `syncPartyMarker`, which
every path that changes the node in view already calls, plus `resyncMapViews`,
the three authoring paths in `mapAuthoring.js`, the zoom-in branch of
`onCellClick`, and the mode switch. `travel.currentExits` returns an empty list
outside Play mode: authoring a map is not travelling it.

### The Build warning

`syncExits` also refreshes `authoringWarning(node, parent)`, which is what Build
mode tells the GM about the node in view. It answers the same question from the
other side, and it reports three problems, in the order they have to be solved:

1. No parent tile links here at all, so the node is unreachable and players never
   see it whatever is painted inside.
2. A linked outdoor child whose block sits in blank parent terrain: no side has
   anything to walk off onto, so the fix is painted on the parent, beside the
   tiles that link here, not anywhere in the child.
3. An interior is linked but sealed: nothing painted to leave through.

The link comes first because it also decides the later answers. A staircase
counts as a way out only in the direction the link runs, so stair advice before
there is a link would be a guess. Once there is one, the warning names that
direction and no other: a crypt level is told about its stairs up, an upper
storey about its stairs down, and a keep entered through a town door about a
door alone.

All of these are warnings about an unfinished map, not a stranded party.
`findExits` hands Play a fallback either way, and nothing is written to the
node. The `#build-warning` element is a permanent `role="status"` live region,
hidden by CSS while empty, and writes are deduped against the last text because
`syncExits` runs on every party step and every paint stroke.

The Build world tree asks the same question about every node. A row whose
`authoringWarning` is non-null gets a warning badge with the sentence as its
tooltip and accessible name, so unlinking a tile flags the orphaned child at the
moment of the break rather than when the GM next views it. The warning is part
of the tree's redraw signature, which is why `syncExits` also refreshes the
tree: a stroke on the parent can seal or unseal a child without changing the
rail warning for the node in view. Outside Build the check returns null, so a
Play-mode party step never pays for a world scan.
