# The map

*Explanation. Back to the [architecture overview](../architecture.md).*

The map is a tiled world. The GM paints it in Build mode. The party explores
it in Play mode. A small data model of nodes and tiles sits underneath it.
Everything else on this page builds on that model: the hierarchy, regions,
drawing, fog of war, and party movement. The first section is a base for the
rest of this page, even for a reader who came here for a later topic.

## Nodes and tiles

Two core types form the base of the model. Both types are declared in
`src/types/map.ts`.

- A **Tile** is one square of a map. It carries an id, an art reference
  (`imageRef`), an optional overlay, a `revealed` flag for fog of war, and
  metadata such as a point-of-interest label.
- A **MapNode** is one whole map: a rectangular grid of tiles, plus a name, a
  kind (`'world'`, `'region'`, or `'interior'`), and dimensions.

There is no separate "world" type, "region" type, or "dungeon" type. A world
map is a MapNode. A region inside it is also
a MapNode. A town inside that region is a MapNode too, and so is a dungeon
under the town. The difference between them is how they connect, and they
connect in two directions at once:

- Each node carries a `parentId` that points up at the map that contains it.
- A tile can carry a `childNodeId` that points down at another node. A click
  on that tile in Play mode means "zoom in here, and you get that map."

Here is a concrete example, using the names from the example campaign:

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

This diagram reads from top to bottom. The world map has a tile at position
(3,4) that zooms into the Darkwood region. Inside Darkwood, two adjacent
tiles both zoom into the same barrow. This pattern is legal and common. A
large landmark can occupy several tiles of its parent map, and any of those
tiles takes the party inside.

The model has no separate "region" entity to keep in sync with the tiles. A
region is only a MapNode that one or more tiles point at through
`childNodeId`.

### TileGrid, the node registry

`TileGrid` (`src/map/TileGrid.js`) holds all the nodes: a `Map<id, MapNode>`
with helpers that add, get, and update nodes, walk the `parentId` chain to
build a breadcrumb, and resolve a tile's zoom target.

Cross-tab sync depends on `replaceNodes`, which swaps out the entire
registry's contents but keeps the grid *object's* identity. Several
long-lived objects (the navigator, the party tracker, the canvas) each hold a
reference to the grid they were constructed with. When another browser tab
saves the campaign, the running tab adopts the new campaign. It replaces the
grid's contents in place, so none of those holders need a rebuild or a new
reference.

### Grid coordinates

A tile's id doubles as its position. Tiles placed in a grid use `"x,y"` as
their id, for example `"3,4"` for the tile at column 3, row 4. There is no
separate x/y field to keep consistent with the id.

The pure functions `parseCoords`, `tileRect`, and `screenToTile` in
`src/map/MapGeometry.js` convert between grid coordinates and screen pixels.
Anything that needs a tile's position parses its id.

Grid-aware code skips ids that do not match the `"x,y"` pattern (see
`RegionGroups.findRegionGroups` for an example). This behavior is
intentional. The hierarchy tests use fixture nodes with ids such as
`"entrance"`, and grid logic leaves them alone instead of failing on them.

## Region grouping and multi-tile art

As the barrow example above showed, a region can have more than one entry
tile. The rule for what counts as one landmark: any set of tiles that share
the same non-null `childNodeId`, and are contiguous (touching along an edge,
not only at a corner), forms one **region group**.

`RegionGroups.findRegionGroups(node)` (`src/map/RegionGroups.js`) computes
these groups. It is a pure flood-fill over the node's tiles, and for each
group it returns:

```js
{ childNodeId, tileIds, cells, minX, minY, maxX, maxY }
```

`cells` holds each member tile's parsed grid coordinates, in the same order
as `tileIds`, so downstream code never needs to parse the ids again. `minX`
through `maxY` describe the group's bounding box.

Multi-tile regions need no schema change. Multiple tiles carry the same
`childNodeId` value, and the model derives the grouping from that.
`MapCanvas` recomputes the groups every time a node loads, and draws a tint
plus an outline over each group's bounding box, with an optional label for
the region's name through a `getNodeName` callback.

### Group images

On outdoor maps (`kind: 'region'`), a multi-tile region group also changes how
its art draws. Instead of each tile drawing its own small image, the group
draws as larger scaled images, so a two-by-two castle looks like one castle
instead of four copies of a castle tile.

`groupImageChunks(node, group)` does the partitioning. It splits a
filled-rectangle group into chunks of at most 2x2 tiles, and each chunk draws
one image stretched across its block. The image chosen for a chunk
(`groupImageRef`) is the art of a tile marked as a point of interest, if the
chunk has one. Otherwise the chunk uses the top-left-most tile's art.
`MapRenderer._renderGroupImages` draws these chunks, and the ordinary
per-tile pass then skips the base images of the covered cells.

Fog rectangles and path overlays still draw per tile, on top of the
stretched image. This layering lets a partially explored block reveal piece
by piece, and keeps a road that runs through a region drawn at tile size
instead of stretched with the landmark art.

Groups that are ragged (not a filled rectangle), and groups on interior
maps, keep plain per-tile drawing.

### Spans: one tile's art drawn large

Independent of region links, a single tile can carry an optional `span`. The
Build palette's Size row sets it (2x or 3x), and `paintTile(node, tileId,
imageRef, overlay, span)` records it. A spanned tile's image draws stretched
across a span-by-span block anchored at that tile. Near the right or bottom
edge of the map, the block shifts up or left as needed to stay in bounds.

`spanBlocks(node)` in `TilePaint.js` lists these blocks with pure geometry,
and `MapRenderer._renderSpanImages` draws them right after the region-group
chunks. Span blocks feed the same "covered cells" set, so the per-tile pass
skips the base images underneath, while fog and overlays stay per tile, in
the same way as with group images.

Unlike a region chunk, span art draws on interior maps too, not only on
outdoor ones, and the covered cells keep their own tile data untouched. The
span is only a drawing effect of the anchor tile, so a repaint of the anchor
at 1x clears it.

## Drawing and input

The canvas code splits so that each file owns one concern:

```
  MapCanvas (src/map/MapCanvas.js)
    owns the <canvas> and the view state: node, pan/zoom,
    markers, selection
    |
    +-- MapRenderer ......... terrain / fog / grid / region passes
    |     +-- TileRaster ....... tile art, rasterized once per drawn size
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
state and draw. The two input controllers (pointer and keyboard) change the
view state back through the host reference.

Every drawing layer takes its colors from `INK` in `src/map/CanvasInk.js` and
its captions from `src/map/CanvasText.js`. Canvas accepts a color string, not a
CSS custom property, so the map cannot read the stylesheet's tokens, and `INK`
is the canvas side of that vocabulary: one named entry per role, so a color two
layers share is written once. `CanvasText` holds the label rule that the
coordinate digits, character names, exit labels, and region names share:
`labelSize(size, { factor, min, max })` scales a font from the on-screen tile
size, and `drawPlatedLabel(ctx, text, x, y, opts)` sets the font and alignment,
draws the pill or rectangle behind the text, and restores the context. Each
caller keeps its own scale, because the bounds differ by what the label sits
over: coordinate digits run large on empty canvas, and a character name stays
small over tile art.

The draw pass does one thing for each tile. It draws a fog rectangle if
the tile is not revealed. Otherwise, it draws the image at `tile.imageRef`. The
group, span, and marker passes described elsewhere on this page add to that
base.

Tile art does not come straight from the SVG file. `TileRaster`
(`src/map/TileRaster.js`) draws each image ref once into an offscreen canvas at
the size the map draws it, and every later frame copies those pixels. A canvas
re-rasterizes an SVG on every `drawImage` call, and Build mode draws every tile
in the node, so a 40x40 map used to run about 1,600 rasterizations per frame.
That cost 769 ms of script for one paint stroke across the example world, and it
now costs 29 ms.

The raster is the same size as the tile on screen, down to the pixel. An earlier
version rounded the size up to a power of two to hold fewer rasters. That
averaged away the hairline strokes in the art, such as the grid lines on grass
and the ripples on water, and the whole map went flat at the zoom that fits it
on screen. A destination wider than 256 pixels skips the cache and draws the
vector art, so one large landmark stays crisp at high zoom, and the cache drops
itself once it holds 32 MB.

The one-pixel grid along the cell boundaries is drawn by
`MapRenderer._renderCellGrid`. It was not always drawn. The SVG rasterizer left
the outermost pixel row of each tile partly transparent, so the dark map
backdrop showed through at every boundary, and the grid was a side effect of
that. A cached raster fills those pixels, so the grid is explicit now. The pass
is clipped to the revealed cells, because a flat fog rectangle never showed the
backdrop through and so never carried a grid. Where tiles still draw from the
vector art, which is the PNG export and any zoom past the raster size ceiling,
the natural boundary is still there, so the pass skips itself rather than
darken every boundary with a second line.

A pointerup counts as a tile click only if the total drag distance stays
below a small threshold. Without that check, a pointer that ends a pan
gesture on a region tile also zooms into it.

**Navigation** is pure logic with no DOM. `MapNavigator`
(`src/map/MapNavigator.js`) tracks which node is currently in view, and
exposes `zoomIn(tileId)`, `zoomOut()`, `goTo(nodeId)`, and `getBreadcrumb()`
over a `TileGrid`. The canvas's `onTileClick` callback, and the breadcrumb's
click handler (`ui/Breadcrumb.js`), both call into a navigator and redraw the
view. Because the navigator has no DOM dependency, plain unit tests cover
all of the zoom and breadcrumb behavior.

## The tile catalog and generation

`TilePalette` (`src/map/TilePalette.js`) is the built-in tile catalog. It
distinguishes two kinds of art:

- Terrain types (grass, water, mountains, and other kinds) have multiple
  interchangeable variants, so a painted field does not look like a
  wallpaper pattern. `pickVariant(type, rng)` chooses one, and takes the
  random number generator as an argument so tests can pass a deterministic
  one.
- Road pieces are named connector shapes (a straight, a corner, a tee), not
  random variants. `getRoadPiece(kind)` looks one up by name.

Callers can register custom tiles with `addCustom`/`removeCustom`. Custom
tiles cannot override built-in tiles. They only extend the catalog.

A few pieces of art mean something to the rules, not only to the eye: the
party cannot stand on a wall, a door is the authored way into a space, and
stairs connect one dungeon level to the next. `kindOf(imageRef)` answers what
a given image means, and it is the only place in the code that knows this.
It matches whole references against the catalog, instead of looking for a
word in a file name, so a GM's own art called `interior-wall-h.svg` stays
plain art. Renaming a built-in asset cannot quietly change where the party
can walk. Everything outside the interior set (terrain, markers, custom
images) is `plain`.

`Autotile.js` (`src/map/Autotile.js`) handles the detailed part of generated
terrain: it picks connector overlay pieces so that coastlines and rivers
join up visually. It is pure and RNG-injected, like the palette:

- `smoothCoastline` widens water until every shore shape matches a coast
  piece in the art set.
- `coastOverlays` and `coastKind` name the shoreline overlay for each land
  cell along the water.
- `riverCourse` walks a meandering channel from the north edge south, and
  returns the correct river piece for each tile along the way.

The generator archetypes build on these helpers: wilderness and town in
`src/map/GeneratorRegions.js`, dispatched from `MapGenerator`, and dungeon
and castle in `src/map/GeneratorInteriors.js`. So does the example world in
`campaign/ExampleWorld.js`.

A tile's `overlayRef` can hold either a single reference or a draw-ordered
stack of them (`TileGrid.overlayList` normalizes the two forms). The stack
exists for places such as a river mouth, where the tile needs both its
shoreline piece and the river channel drawn on top of it, and neither
overlay displaces the other.

## Fog of war

Play mode hides the parts of a map the party has not been near. The state
behind this is only the `revealed` flag on each tile. `FogOfWar.js`
(`src/map/FogOfWar.js`) is a set of pure functions over a MapNode that manage
it:

- `revealAround(node, centerId, radius)` parses `centerId` as an `"x,y"`
  grid coordinate, and reveals every tile within a Euclidean radius of it, so
  the revealed area is a disc instead of a square. Revealing is monotonic: a
  tile that is already revealed, or outside the radius, stays untouched.
  Moving away from an area never re-fogs it.
- `hideAll(node)` resets a node to fully unrevealed. It backs reset and debug
  paths.
- `revealedCount(node)` backs "percent explored" style readouts.
- `withinRadius(tileId, centerId, radius)` exposes the same Euclidean cutoff
  as a standalone predicate.

That last function also gates the markers. `MapMarkers` uses it to limit
the encounter, NPC, and point-of-interest markers to a detection range
around the party tile, and around every individual character token. The
range (`MapView.markerRange`, wired from `PartyTracker.revealRadius`) is
twice the fog reveal radius, so a marker can be sensed slightly beyond the
fog edge, but never from across the map. A node the party is not currently
in shows no markers at all outside Build mode.

`markerAnchors` and `withinMarkerRange` in `MapMarkers.js` are the pure
halves of that rule, and `MapCanvas.markerVisible(tileId)` answers it for
code outside the render loop. The Play-mode hover tooltip in `mapTravel.js`
calls it before it names the POI type or the NPCs on a tile. The tooltip runs
for a pointer hover and for the keyboard cursor alike, so without that call
either one would read out what the map deliberately leaves unmarked. GM notes
are not gated, because they are not drawn on the map at all.

## The party

`PartyTracker` (`src/party/PartyTracker.js`) owns the party's
`PartyPosition`, which is a nodeId plus a tileId, and it is the only object
that moves the party. `moveTo(nodeId, tileId)` updates the position and
calls `revealAround` on the target node, and writes the revealed tiles
straight back into the `TileGrid` it was constructed with. The constructor
also reveals around the initial position, so a party never starts the
campaign fogged in on its own tile.

`moveTo`'s `nodeId` can differ from the party's current node. Crossing
between a parent map and a zoomed-in region (through `MapNavigator`) works
the same way as moving within one node, and each node's revealed state stays
independent: exploring the barrow reveals nothing about Darkwood.

### Individual character tokens and the split party

Usually the party moves as one marker. `CharacterTokens.js`
(`src/party/CharacterTokens.js`) layers individual characters over that
shared position for the times they split up. The convention: a
`Character.location` of null means "with the party", and the character's
token draws on the party's tile. A non-null location is the character's own
tile.

- `characterTokens(characters, partyPosition, nodeId)` resolves the named
  tokens to draw on a node.
- `moveCharacter` relocates one character.
- `recallAll` removes every individual location, which amounts to bringing
  everyone back to the shared party position.
- `isSplit` and `characterPosition` back the regroup flow described below.

Movement permissions reuse `CharacterBinding.partyPermissions`.
`mapTravel.js`'s `clickSubject` decides which character a map click moves:
while the party is split, the GM's clicks move the character selected in the
Party roster, and a tab bound to one player moves that player's character. A
moved character's steps reveal fog through the same `revealAround` path. The
GM can also place any single character on any node through the roster's
place action, which reaches nodes that are not on screen.

A pick of a character in the roster brings them into view while the party is
split. `partyWiring.js`'s `followCharacter` resolves their
`characterPosition` and hands it to `mapWiring.js`'s `centerOnLocation`,
which navigates to that node if the view is elsewhere, and centers the
canvas on the tile at the current zoom. This is the lighter half of
`focusLocation`: no tile selection, no inspector, so it stays out of the way
in Play mode.

All of this individual movement sits behind the `splitParty` flag,
persisted on `CampaignState` and false by default, and toggled by a GM-only
switch in the Party panel (`app/splitParty.js`). While the switch is off, the
app behaves as if individual movement did not exist: `syncPartyMarker`
passes no tokens to the canvas (only the shared marker draws), the roster
hides its place action, a pick of a character leaves the view alone, a GM's
map click moves the whole party and brings everyone back to it, and a bound
player's map click has no effect.

Turning the switch off while characters are scattered first regroups the
party: the GM picks a member, and the party position moves to that member's
`characterPosition` (a `PartyTracker.moveTo` plus `recallAll`). A cancelled
pick leaves the switch on, so the app never ends up with the switch off and
the party still split. A character placed on a node that no longer exists
(deleted, or gone from a save that another tab adopted) is left out of the
pick through `regroupCandidates`, and counts as standing with the party.
When nobody is left to pick, the party regroups at its own marker.

## Getting back out

Zooming in uses a tile's `childNodeId` plus
`EntryPoint.computeRegionEntryTile`. Leaving again uses
`src/map/MapExits.js`, a pure module whose entry point is
`findExits(node, parent)`. It returns a list of `MapExit` values
(`src/types/map.ts`), in three kinds:

- `edge`: a side of the map the party can walk off, one per side of the
  parent block that touches usable parent terrain. Outdoor children only.
- `tile`: a door or a staircase that leads out, carrying the `tileId` and a
  `via` of `door`, `stairs-up`, or `stairs-down`. Interiors only.
- `fallback`: no authored way out was found. `findExits` returns this as a
  single exit instead of an empty list, so a party can always leave a space
  it walked into.

The block a child occupies in its parent comes from `blockFor`, a lookup
over `RegionGroups.findRegionGroups`. A parent can link one child from two
blocks that do not touch, such as a cave with two mouths. `blockFor` takes
an optional zoom-through tile for that case and returns the block that holds
it. Without the tile it returns the first block. `findExits` takes the same
tile: it reports the sides of the block that holds the tile, and the sides
of every block when no tile is given.

That tile comes from the entry memory in `src/map/EntryMemory.js`. The
memory holds one parent tile for each child node, and it is part of the
save, under `entryTiles`. `mapTravel.js` writes an entry when a tab that
moves somebody zooms in, and drops the entry when the party teleports in,
because a teleport arrives through no block. Deleting or regenerating a node
drops the entries of the nodes that go with it.

For an `edge` exit, a side counts when any cell of that block has an
orthogonal neighbor in the parent that carries an `imageRef` and is not part
of the block itself. Diagonal contact past a corner does not count, because
it leaves the party nothing to step onto.

An interior's doors qualify when they open outward: on the grid border, or
beside a cell the map leaves empty, which is the void a generated dungeon
leaves around its rooms. That test cannot tell the void from an unpainted
courtyard inside a hand-authored structure, so a door onto such a courtyard
also reads as a way out. If the courtyard must not be a way out, the GM
must paint it.

### Stairways run both ways

`stairwayTo(parent, childNodeId)` answers which of the parent's tiles reaches
a child, and which tile kind in the child comes back along it. A parent that
links through its own stairs down is the level above, so the child leaves
through its stairs up. A parent that links through stairs up is the level
below, in the same way a keep's ground floor is to its upper story, and the
child leaves through its stairs down. Any other kind of link, such as a
town's door into a keep, is not a stacked level, and has no stairway back at
all.

Everything that depends on the direction reads this one answer. It decides
which tiles `interiorExits` treats as a way out, where
`computeRegionEntryTile` lands the party when it takes the stairs, where
`computeParentReturnTile` puts the party when it comes back, which way the
badge's chevron points in `MapMarkers`, and what the Build warning tells the
GM to paint.

A parent that links the same child from both a stairs-down tile and a
stairs-up tile has authored two contradictory connections. The descent wins,
because a level below is the much more common case, and it is what such a
map resolved to before the model added the ascent.

The model expresses one return staircase per level. Every tile in the child
of the kind that runs back counts as an exit to the parent, and all of them
land on the parent's one linking stair tile. The entry landing, in the same
way, picks the first matching stair in tile order. A second staircase meant
to go somewhere else needs its own link to a child node, which takes it out
of the exit list.

### Return landing

`EntryPoint.computeParentReturnTile(parent, child, exit, position)` mirrors
`computeRegionEntryTile`. Off an edge, the party's coordinate along that side
of the child maps back onto the block's extent, and then one cell further
out, onto the parent terrain the side touches. Through a door, the model
uses the same projection from the door's own coordinate. Along a stairway,
it uses the parent's tile at the other end of the stairway. A block that
sits on the parent's own north or west edge projects to a coordinate of -1.
The function clamps the coordinate into the grid before the snap, so the
party lands beside the block instead of at the origin.

The first two cases snap through `resolveReturnTile`, the parent-side
counterpart of `resolveEntryTile`: the nearest painted, non-wall tile that
does not belong to the block just left, since landing back on the block
reads as never having left. The stairway case deliberately skips the snap.
The parent's staircase *is* a tile of that block, and the snap logic
rejects any tile from that block for that same reason.

### Drawing and taking an exit

`MapView` carries `exits`, set through `MapCanvas.setExits`. Three surfaces
read it:

- `MapDecorations` draws an outward chevron and a "Return to {name}" label
  in the gutter beyond each `edge` exit, and `MapMarkers` draws a small
  chevron badge on each `tile` exit.
- `MapCanvasPointer` hit-tests the same bands on a click. `MapCanvasKeyboard`
  arms an exit when a cursor key leaves the cursor clamped at a border
  that carries one: the band brightens, a live region says to press again,
  and only a second discrete press of the same arrow moves the party. Key
  repeats neither arm nor confirm an exit, so holding an arrow key sends the
  cursor to the border and stops it there, instead of moving the party
  across it. Any other interaction (a cursor move, another key, a pointer
  touch, a loss of focus, a change in the exits) withdraws the arming
  (`MapCanvas.disarmExit`).
- `ui/ExitList.js` mounts the same exits as real buttons over the viewport,
  hidden until one takes focus. These buttons are how a keyboard or a screen
  reader travels. A list that holds only a `fallback` exit stays pinned open
  instead, because the canvas draws no arrow and no badge for a fallback. If
  the list held no pin, a pointer user in a sealed interior sees no way out
  anywhere. A list that changes while one of its buttons holds focus moves
  focus to the first surviving button, instead of dropping it.

The band's rectangle is computed once, by `exitBandGeometry` plus
`edgeExitBand`, and both the drawing code and the pointer call it. The arrow
the GM sees, and the rectangle their click is tested against, therefore
cannot drift apart. The band is a bounded pill centered on the party's row
or column, clamped to the canvas, so panning the map's border out of view
pins the arrow at the viewport edge instead of scrolling it away.

`mapTravel.js`'s `exitToParent` does the travel, and it moves whoever a
click moves: the whole party for the GM, one character while the
split-party toggle is on, and no one from a spectator tab, which follows the
camera out instead. A `tile` exit also stays an ordinary tile to walk onto,
so it only leads out once whoever the click moves is already standing on
it. Otherwise the party can never stand in a doorway. The exit buttons
take the same door in one press.

`mapWiring.js`'s `syncExits` is the one place that recomputes the list, and
it feeds the canvas and the button list together. It runs from
`syncPartyMarker`, which every path that changes the node in view already
calls, plus `resyncMapViews`, the three authoring paths in
`mapAuthoring.js`, the zoom-in branch of `onCellClick`, and the mode switch.
`travel.currentExits` returns an empty list outside Play mode: authoring a
map is not the same as traveling it.

### The Build warning

`syncExits` also refreshes `authoringWarning(node, parent)`, which is what
Build mode tells the GM about the node in view. It looks at the same links
from the parent's side, and it reports three problems, in the order they must
be solved:

1. No parent tile links here at all, so the node is unreachable, and players
   never see it, whatever is painted inside.
2. A linked outdoor child whose block sits in blank parent terrain: no side
   has anything to walk off onto, so the fix belongs on the parent, beside
   the tiles that link here, not anywhere in the child.
3. An interior is linked, but sealed: nothing painted to leave through.

The link comes first because it also decides the later answers. A staircase
counts as a way out only in the direction the link runs, so stair advice
before a link exists is a guess. Once there is a link, the warning
names that direction and no other: a crypt level is told about its stairs
up, an upper story about its stairs down, and a keep entered through a town
door about a door alone.

All of these are warnings about an unfinished map, not a stranded party.
`findExits` hands Play mode a fallback either way, and nothing is written to
the node. The `#build-warning` element is a permanent `role="status"` live
region, hidden by CSS while empty, and its writes are deduplicated against
the last text, because `syncExits` runs on every party step and every paint
stroke.

The Build world tree asks the same question about every node. A row whose
`authoringWarning` is non-null gets a warning badge with the sentence as its
tooltip and accessible name, so an unlinked tile flags the orphaned child at
the moment of the break, instead of when the GM next views it. The warning
is part of the tree's redraw signature, which is why `syncExits` also
refreshes the tree: a stroke on the parent can seal or unseal a child
without a change to the rail warning for the node in view. Outside Build
mode the check returns null, so a Play-mode party step never pays for a
world scan.
