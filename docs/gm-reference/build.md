---
---
# Build mode

*Reference. Part of the [GM reference](../gm-reference.md). For the steps of a task, read the [GM guide](../gm-guide.md).*

Build mode is where you author the world. The World tree rail is on the
left, the map is in the center, and the Build rail is on the right.

| Build rail tab | Cards |
| --- | --- |
| Paint | Generate, Tools, and Palette |
| Tile | The tile inspector for the selected cell |
| Encounters | Two subtabs: Foes for hostile creatures, and NPCs for friendly and neutral people |

A map with no tiles shows a card over the canvas. **Paint tiles** opens the
Paint tab and puts focus on the palette. **Generate map** opens the Generate
dialog. The card goes away after the first tile is painted.

In Play mode, a map with no tiles draws no grid and no coordinate labels.
A plain card names the empty map. For the GM, its **Open Build mode** button
switches to Build mode. A Player tab shows only the name.

## Node kinds

The world is a tree of nodes. The top node is the world map. Regions and
interiors sit beneath it.

| Kind | Palette it gets |
| --- | --- |
| Region | The full terrain, road, river, coast, and building palette |
| Interior | Interior pieces and furnishings only: floors, walls, doors, stairs, and furniture |

## Node settings

**Add a child** and **Edit settings** in the World tree open the same
fields.

| Field | Default | Values |
| --- | --- | --- |
| Name | New region | Any text. **Create** and **Save** stay disabled while the name is blank |
| Width (tiles, 1 to 64) | 6 | A whole number from 1 to 64 |
| Height (tiles, 1 to 64) | 6 | A whole number from 1 to 64 |
| Kind | Region | Region or Interior |
| Environment | (none) | For a region: grassland, forest, mountain, desert, water, coast, swamp, tundra, or cave. For an interior: shop, inn, tavern, and other interior tags. The list follows Kind, so a change of Kind refills it and clears a tag of the other kind |
| Lock | No lock | No lock, Locked, or Unlocked |
| Key item (name) | (blank) | The name of the item that opens the lock. The field suggests the names of the library items and of the items that characters carry. The field is off while Lock is No lock |

A width or height outside that range keeps the dialog open, and a message
above the buttons names the field. A map imported with an edge over 64 tiles
keeps its size when you edit its other settings.

The environment tag is a description only. It has no effect on painting,
generation, or rules.

A smaller width or height that removes tiles asks first. **Cancel** on that
confirm opens the settings again with the values you typed. The party, a
split character, or a placed creature that stood outside the new size moves
to the nearest walkable tile inside it. In the same way,
**Cancel** on the confirm that replaces every tile after **Generate map**
opens the Generate dialog again with the same choices and seed.

A locked node stops every move of the party or a character into it: a
click on a tile that links to it, a walk across a border into it, and a
teleport from the World panel. The GM view still zooms into a locked node
where nobody moves. In a GM tab, a dialog names the key item and the
character who carries it, for example "Locked. Requires the warding key;
Aldric carries it." The match is on the item name, without regard to
case, across all characters. Click **Unlock** to open the lock and go on,
or **Unlock anyway** when nobody carries the key. Unlocking sets the lock
to Unlocked and writes a travelogue line. Click **Stay out** to keep the
lock shut. On a walk of the whole party to a linked tile, the party then
stops on the last tile before the link and spends the time of that walk.
On a border crossing or a teleport, the party stays where it was. A
Player tab shows the toast "The way into the Barrow is locked." and
nobody moves.

If the key item matches no library item and no item that a character
carries, a message after **Save** says that no item opens the lock yet.
The lock still saves, so you can name an item before you make it.

In Build mode, the World tree row of a locked node shows a lock icon, and
its tooltip names the key. The region name on the parent
map starts with a lock. The Tile inspector shows "Locked (needs Silver
Key)" under **Zooms into** for a tile that links to the node. An unlocked
node shows no mark.

## World tree

The World tree in the Build rail and the World panel in Play mode show the
same node tree. Each tree scrolls in its own box. On a window wider than
about 1090 px, Build mode fits the window and the page does not scroll. The
World tree, each Build rail tab, and the palette swatches scroll in their own
box, and only when their content is taller than the window. A wider window
gives the Build rail more width, so the palette shows more swatches in a row.

| Control | What it does |
| --- | --- |
| Chevron | Opens or closes the nodes under a row |
| Find a place | Shows only the nodes whose names contain the text, and the rows above them. Each match shows the name of its parent after a comma, as in "Temple, Ashogate". It shows when the world has 12 or more nodes. Escape clears it |
| Row name | In Build mode, opens that map. In Play mode, see [Play layout](play.md#play-layout) |
| Actions button (three dots) | Build mode only. Opens a menu with Add a child, Edit settings, and Delete. A right-click on the row opens the same menu. Delete shows in red below a rule. Its confirm counts the maps it removes, the creatures that become unplaced, the handouts that become campaign-wide, and the quest links that go with the maps. It also says whether Undo in the header can bring the map back. Undo can do that only when the last save has the map |

A branch is closed when the tree first shows it. The exceptions are the top
node and the rows above the current map. When the map in view changes, the
tree opens the rows above it and scrolls to its row.

The tree takes one Tab stop. Inside it, Up and Down move between rows, and
Home and End go to the first and last row. Right opens a closed row or
moves into an open one, and Left closes an open row or moves to its
parent row. Enter opens the map of the row. In Build mode, Shift+F10 or the
Menu key opens the actions menu of the row.

## Palette tools

The Palette card has four tool buttons and five sections of swatches. A
click on a swatch picks it as the brush, and a drag paints it on every cell
that the pointer crosses. The name of the picked swatch shows above the swatch
sections, for example **Brush: Grass (random variant)**.
While Inspect, Link, Erase path, or Erase tile is the tool, the swatches
fade. A click on a swatch still picks it as the brush.

A brush paints only while the Paint tab is open. On the Tile and Encounters
tabs, a click on the map selects the cell, the same as Inspect. A chip at the
right end of the map toolbar names the tool that a click uses, such as
**Painting: Grass**, **Linking to Briarwick**, or **Inspect**.

| Tool | What a click or drag does |
| --- | --- |
| Inspect | Selects one cell and opens it in the Tile tab. This is the starting tool |
| Link | Links every cell that the pointer crosses to the node in **Links to**, and moves the cell out of any other region. It skips site entrances and says how many it skipped. While the Link tool is active, the cells that already link to the node in **Links to** show a stronger tint and a wider border |
| Erase path | Removes the road or path overlay of a cell. The terrain, the metadata, and the region link stay |
| Erase tile | Clears the whole cell back to empty |

| Swatch section | Contents |
| --- | --- |
| Terrain | Ground types. This section opens by default |
| Overlays | Roads, paths, rivers, coasts, docks, town walls, and the lighthouse |
| Buildings | Settlement and site markers |
| Interior | Floors, walls, doors, and stairs |
| Furnishings | Furniture and decoration |

The Art size row (1x, 2x, 3x) sets how large the next painted tile draws. At 2x
or 3x, one click stamps one tile whose image stretches across a 2x2 or 3x3
block. A scaled stamp places one block per click, and roads always paint at
1x.

The block is visual only. The covered cells keep their own terrain, roads
across the block stay tile-sized, and fog reveals the block cell by cell.

A terrain type with several variants, such as grass or mountain, has one
swatch in the Terrain section. That swatch mixes the variants, so a large
area does not repeat one image. The position of a cell on the map sets its
variant, so the same cell always gets the same variant from this swatch.

To paint one exact image, select **Show variants**. The swatches then show
one swatch for each variant. If the active brush is a terrain swatch, the
brush stays on the same terrain when you change the checkbox. The browser
keeps the choice.

Roads overlay the terrain under them. If you repaint the terrain under a
road, the road stays on top.

## Map tools row

The **Generate map...** and **Export PNG** buttons share one row above the
Palette card on the Paint tab, and the **Place labels** checkbox sits under
them.

| Control | What it does |
| --- | --- |
| Generate map... | Opens the Generate dialog. See [Map generation](#map-generation) |
| Export PNG | Downloads the current map at 64 pixels per tile, with fog ignored. A margin on the top and left shows the column and row numbers. A map with no tiles downloads nothing, and a message says so |
| Place labels | Shows or hides the name of each linked map on the map in Build mode. It starts ticked, and each browser stores its own choice. Play mode and the PNG export always show the names |

If a map is too large for 64 pixels per tile, Export PNG uses a smaller
size and names the size it used. If no size fits, the app refuses the
export.

## Place names on the map

The name of each linked map draws on a plate centered over the tiles that
link to it. When the center is taken, the name tries the space just above
those tiles and then just below them. In a town, a name is often wider than
its building. A name that would cover much of a nearby building, another
name, the party, or a creature marker at all three spots is left out at
that zoom. Zoom in and the name shows again once it fits. In Play mode, a
hover on the tiles of a place whose name is left out names the place.

## Stroke undo and redo

In Build mode, the header shows **Undo stroke** and **Redo stroke** to the
left of **Previous save** and **Next save**. That pair is the Undo and
Redo of the other modes, and it steps between saves. In a window from 901
to 1360 pixels wide, the stroke pair shows only a back arrow and a forward
arrow, so the header fits on one row. The tooltip and the screen-reader name
of each arrow still say Undo stroke and Redo stroke.

| Control | What it does |
| --- | --- |
| Undo stroke | Reverts the last edit on the map. A whole drag, a tile link, a region link, and a generation each count as one edit. Ctrl/Cmd+Z presses it |
| Redo stroke | Applies the last undone edit again. Ctrl/Cmd+Shift+Z presses it. A new edit empties the redo list |

The tooltip of each button names the edit and its map, such as "Undo the
paint stroke on Briarwick Vale". A button is disabled when it has no edit
to change.

Undo stroke reverts only the cells and fields that the edit changed. Fog
that the party revealed and notes written after the edit stay. A tile link
to a node that was deleted after the edit comes back as no link. A tile
outside the current width and height of the map does not come back, so a
stroke undone after a shrink leaves the map at its new size.

An undo or redo asks first when it removes maps, such as the sub-maps of a
generation, or when the edit is on a map other than the one in view. On a
removed map, a character rejoins the party, a creature becomes unplaced, a
handout becomes campaign-wide, and a quest link goes, as for a deleted map.
The party moves back to where it stood before the edit only while it still
stands where the edit left it, or stands in a map that the undo removes.
When the place it stood before is gone, the party comes out beside the
removed map, as it does for a deleted map. If no map is left to land in,
the undo refuses.

Deleting a map in the World tree drops every stroke edit on that map from
the lists. The stroke lists are separate from the header Undo and Redo,
and they end when the page reloads.

## Tile inspector fields

The inspector heading shows the art of the selected tile and its name, for example "Forest", or "Grass, Road (h)" for a tile with an overlay. Under the name, it names the cell, for example "Column 11, row 11". Columns and rows count from 1, the same as the numbers along the map edges.

| Field | Meaning |
| --- | --- |
| Marker | The point-of-interest marker on the tile. None is the default |
| Discoverable | The point of interest stays hidden until the party steps onto its tile, or walks through the tile into the sub-map that it links to. The hint under the checkbox reads "Hidden until the party steps here." |
| Notes | Text for the GM. The GM sees it on hover in Play mode. The Player view does not show it, but the text is in the saved campaign |
| Zooms into | The child node that this tile leads to. Nothing is the default |
| Set party start here | Places the spawn tile of the party |
| New handout on this tile | Opens the new-handout dialog with this tile as its place |

## Tile menu

In a GM tab in Build mode, a right-click on a map cell selects the cell and
opens the tile menu, if the pointer did not drag. Shift+F10 or the Menu key opens the same menu at the
keyboard cursor.

| Item | What it does |
| --- | --- |
| New foe here | Opens the creature dialog as a level-1 hostile on this cell |
| New NPC here | Opens the creature dialog as an unleveled neutral on this cell |
| Edit (name) | Opens the creature dialog for a creature that already stands on this cell. One item shows for each creature |

## Map generation

The **Generate map...** button fills the current map with a generated layout. The
dialog shows a preview of the exact layout before it changes anything.
The preview numbers the columns and rows when the tiles are large enough,
and it outlines each block that Generate links to a sub-map, such as each
region of the World archetype.

| Field | Default | Values |
| --- | --- | --- |
| Archetype | The first in the list. From **Generate a world** on the Welcome card: world | For a region: wilderness, highlands, frontier, desert, wetlands, island, town, or world. For an interior: dungeon, cave, castle, or building. For a level that stairs down lead to: dungeon, cave, or cellar. For a floor that stairs up lead to: upper floor |
| Size | The size that fits the parent tiles that link to the node, or medium when none do | small (8x8), medium (14x14), large (22x22), huge (32x32), or vast (48x48) |
| Levels | 1 | For a dungeon or a cave only: 1 to 10. A stack has at most 10 levels, so a deeper level allows fewer |
| Sub-maps | None. From **Generate a world** on the Welcome card: Every level | For a region archetype only: None, One level down, or Every level |
| Seed | A random number | The number that reproduces the layout. **Reroll** picks a new seed |

### Links to the parent map

Every generated layout can reach its parent map.

| Archetype | Way in |
| --- | --- |
| Dungeon or cave | An entrance tunnel with a door on the map edge |
| Castle or building | A door in the south wall |
| Town | A street from the south edge, and more streets to other edges |

If nothing on the parent map links to the node, generation places an
entrance tile near the center of the parent and reports where. If a parent
tile already links to the node, the tile stays where it is. Its marker
changes to the marker of the new archetype, for example from a dungeon
entrance to a cave entrance.

The art of a particular place, such as an inn, stays if the new archetype
has the same point-of-interest type. A wilderness takes no marker, so its
old marker becomes grass.

### Names after regeneration

A region block on a world map has no marker, and the name of the region is
its label on the world map. If a generated name follows the pattern of an
archetype, the node takes the pattern of the new archetype with the same
word.

For example, "The Ashford Hills" regenerated as a desert becomes "The
Ashford Sands". "The Crypt of Dunholt" regenerated as a cave becomes
"Dunholt Caves".

These names do not change: a name that you typed, a name of one word, the
name of a building, and the name of a level in a stack. Undo restores the
old name.

### Parent tiles after regeneration

The parent tiles that link to a regenerated wilderness, highlands,
frontier, desert, or wetlands take the ground of that climate. For example,
a region block regenerated as highlands becomes mostly hills and mountains.

These parent tiles keep their art: water, coast tiles, points of interest,
and tiles that link to another map. A river keeps its course, and a block
that already reads as the new climate keeps its art. Each tile keeps its
fog state and its notes.

A region regenerated as a town, an island, or a world keeps its ground and
gets no marker, because the world generator places no settlements. Undo
restores the old tiles.

### Outdoor archetypes

The six outdoor archetypes differ in climate.

| Archetype | Terrain |
| --- | --- |
| Wilderness | Temperate: grass, forest, lakes, and some hills |
| Highlands | Ranges of hills and mountains |
| Frontier | Cold: snow and snowy forest |
| Desert | Hot and dry |
| Wetlands | Lakes, swamp, and many rivers |
| Island | Land with sea around the whole border |

In each outdoor archetype, the north edge is colder than the south edge.
Rivers run down from the hills to water or to the map edge. Landmarks such
as ruins, mines, and camps stand on open ground.

An oasis stands only in the desert. A lighthouse stands only on a shoreline
that faces open water, over the coast piece of its cell. A
watchtower usually stands beside a road. The climate can also give jungle,
savanna, taiga, glacier, badlands, snowy hills and peaks, volcanic peaks,
and deep sea, each with its own tiles.

An outdoor map also gets settlements, with farmland around them.

| Map size | Settlements and sites |
| --- | --- |
| Any | Settlements. Some later settlements are villages, and a settlement beside open water is a port |
| Medium or larger | A hidden dungeon far from the settlements |
| Large or larger | A keep |
| Huge or vast | The first settlement is a city |

Roads join the settlements and the keep. The roads leave the map at one
edge, or at two edges on a huge or vast map. A road crosses a river on a
bridge near a settlement and on a ford farther out.

### Towns

A town has a core of streets and buildings around a central crossroads.
The inn, the tavern, the blacksmith, the general store, and the temple
stand nearest the crossroads, around a cobbled plaza. A well or a fountain
stands near them, and a large town adds a market and a town hall.

A larger town then adds other shops and trades, houses near the center, and
cottages near the edge. Farms and fields lie outside the core, with a
windmill among the fields. Some towns have a graveyard.

Some towns have a river. The streets cross it on bridges, and a watermill
stands on its bank.

| Town size | Ways out |
| --- | --- |
| Small | 2 |
| Medium | 3 |
| Large or larger | 4 |

About one large town in two gets a stone wall, with a gate on each street
and a water gate where the river passes. A gate is open ground. The party
never lands on the town wall when it enters the town, and a new link never
goes on the wall.

### Ports

The town map of a port has the sea along its north, east, or west edge,
with a sandy shore. The party still enters by the street from the south
edge. No street leaves into the sea, so a large port has three ways out.

A river in a port flows into the sea, and a small port has no river. A large
port gets a wall as often as an inland town. The wall of a port is open on
the sea side, and its two ends stop at the shore.

A port has one pier, or two on a large, huge, or vast map. Each pier starts
at a timber quay on a straight part of the shore and runs straight out to a
pier head. A street links each quay to the other streets, and the party can
walk out to the pier head.

### Interior archetypes

The four interior archetypes differ in layout.

| Archetype | Layout |
| --- | --- |
| Dungeon | Rooms joined by corridors, with some round rooms and more than one way through. Some large rooms have pillars |
| Cave | Winding caverns of uneven width, with rough rock walls, pools, and a cave mouth on the border |
| Castle | Halls and chambers behind a wall ring. The largest room is a great hall with a throne and pillars. Stairs up lead to an upper floor of chambers, and stairs down lead to a dungeon level beneath the keep |
| Building | A few small rooms and no stairs. About one building in three has a trapdoor down to a small cellar |

A dungeon or a cave has rubble. The bottom level keeps a chest on the floor
cell farthest from the way in.

The room behind the door of a house has a hearth and a table. The other
rooms of a castle or a house are bedrooms, dining rooms, libraries,
storerooms, or empty rooms, and a castle can also have chapels.

A town building takes its furnishings from what it is.

| Building | Furnishings |
| --- | --- |
| Inn | A kitchen, a pantry, a bar, and a common room of tables. Stairs up lead to a guest floor of bedrooms |
| Tavern | A taproom with a hearth and long tables, and a bar along one wall. A kitchen and a storeroom sit behind the bar |
| Temple | One open nave with an altar and pillars |
| Barracks | Rows of beds |
| Shop | A storeroom behind a counter, and shelves on the sales floor |
| Academy | Bookshelves |
| Warehouse | Barrels and chests |

### Obstacles, doors, and stairs

A pillar, a table, a bed, a bookshelf, a shelf, and a counter are
obstacles. The party never lands on an obstacle or a wall when it enters
a map, and a new link never goes on one. The party also does not land on
deep water when it enters or leaves a region, unless the map has no other
floor or land.

The party enters an interior on the outer door nearest the side that it
comes from. In an interior with no outer door, the party lands on the
nearest floor.

A generated map never puts an obstacle beside a door or a staircase, or
where it cuts off part of the floor. A generated staircase or trapdoor
never sits directly inside a door. The party never has to cross a staircase
or a trapdoor to reach the rest of the floor.

A trapdoor leads down like stairs down. A generated building links its
trapdoor to its cellar. On a map that you paint, link the trapdoor to the
level below, and that level returns through its stairs up.

### Level stacks

Each level of a multi-level dungeon or cave becomes a child node.

- The first level has no stairs up, because its door is the way in.
- The stairs down of one level lead to the stairs up of the level below.
- The stairs down stand as far from the stairs up as the level allows.
- The bottom level has no stairs down.

If you generate a node that its parent reaches by a staircase, the node
keeps the staircase back. A level below its parent gets stairs up where the
first level has its door. A floor above its parent offers the upper floor
alone.

The new levels below a regenerated level take the name of the top of the
stack, for example "Ashford Barrow (level 3)".

### Worlds

A world is a continent in a sea, split into up to nine regions. Each region
is a block of land tiles that all link to one region map. A small island is
in no region.

A region map is a larger, more detailed copy of its block. Its coasts,
ranges, forests, and rivers sit where the world map shows them, and small
hills, lakes, and streams fill in between. The map takes the outline of its
block where it meets a neighbor region, and the land of that neighbor stays
blank. A coast keeps its sea out to the edge of the map. A larger block gets a larger map, from small
(8 x 8) for a block of one tile to vast (48 x 48) for a block 25 tiles
across. An edge exit arrow shows when the party is near the edge of the
painted land, not only near the border of the grid.

A map that you generate again from the Generate dialog follows its block in
the same way. This applies to each open-terrain archetype (wilderness,
highlands, frontier, desert, wetlands, and island) under any parent map. A
wilderness that links from a few tiles of a hand-painted map then draws the
land of those tiles. A climate archetype first repaints the block (see
[Parent tiles after regeneration](#parent-tiles-after-regeneration)), and
the new map follows the repainted block. A region regenerated as a desert
then draws desert inside the coasts of its block. An island follows the
block too, so an island on a block of inland tiles has no sea around it. A
town and a world do not follow the block. The Size field starts on the size
that fits the block, and the preview shows the map that follows it.

The terrain of a block sets the archetype of its region map.

| Block terrain | Region archetype |
| --- | --- |
| Mountains and hills | Highlands |
| Snow | Frontier |
| Sand | Desert |
| Swamp | Wetlands |
| Other land | Wilderness |

A world has rivers but no roads or settlements, because each region gets
those on its own map.

### Sub-maps

The Sub-maps field shows for every region archetype. It sets which places
on the new map get maps of their own.

| Value | Effect |
| --- | --- |
| None | Changes the map alone |
| One level down | Also gives each place on the map its own map |
| Every level | Also gives the places on those maps their own maps, down to the buildings of each town |

The places are the regions of a world, the buildings of a town, and these
sites of an outdoor map: settlements, the keep, the dungeon, cave entrances,
mines, and ruins. A well, a fountain, a market, and a graveyard have no
inside. All four cells of a town building link to its inside.

Each sub-map gets a generated name and its own seed. The seed comes from
the seed of the map above it, so the preview is the same for every Sub-maps
value. A dungeon or a cave sub-map gets one to three levels.

One generation creates at most 300 sub-maps. A place past that limit keeps
its marker with no link, and the message after the generation counts those
places. One undo removes the new map and every new sub-map.

Generation always makes these maps, whatever the Sub-maps value:

- the levels of a dungeon or a cave
- the upper floor and the dungeon of a castle
- the guest floor of an inn
- the cellar under a trapdoor

So a generated staircase or trapdoor always leads to a real map.

A world generated on the top map moves the party start next to the first
town, inside the region that contains that town. The party then starts on
land, on a tile with no marker and no link. A character split off on the
world map rejoins the party there, and a character on any other map keeps
its place. Undo puts the party and those characters back where they stood.
If the new world has no town with open land beside it, the party does not
move.

**Generate a world** on the Welcome card goes to the top map first, so it
always replaces the world, even when a sub-region is in view. After it, a
second card offers **Create a character** and **Check the party start**.
Both switch to Play mode, and the first also opens the New character form.
The card says whether the party moved to a start beside a town.

## Link warnings

Build mode shows a warning below the tool tabs when the node in view has no
way in or no way out. The World tree marks each node with a problem with a
warning triangle. A closed branch shows a triangle and the number of nodes
inside it that have a warning.

| Warning | Meaning |
| --- | --- |
| Nothing leads here | No tile on the parent map links to this node. The "Link from (parent)" button opens the parent on the Paint tab with the Link tool set to this node |
| No way out | The node is linked, but it has no outer door, no usable staircase, and no painted parent tile beside its block |

Neither problem strands a party. A node without an authored way out offers
a plain "Return to (parent)" button.

## Encounters tab

The Encounters tab of the Build rail stages creatures on the map in view.
The Foes subtab lists foes, and the NPCs subtab lists friendly and neutral
people. The NPCs subtab has **New NPC** and **From bestiary**, and its
bestiary dialog lists the neutral and friendly templates first.

| Control | What it does |
| --- | --- |
| New creature | Opens the creature dialog for a new foe |
| From bestiary | Opens the **Add from bestiary** dialog. Type part of a name in **Filter by name** to narrow the list. Enter in the filter does not add a copy. Then pick a template, a count, and a map and tile, and click **Add** to place that many full-health copies. **Pick on map** fills the map and tile from one click on the map |
| Remove template | Removes one campaign template from the bestiary, after a confirmation. It shows while the campaign bestiary has a template |
| Clear defeated (count) | Removes the defeated foes on the map in view, after one confirmation |
| Edit, Delete on a row | Edits or deletes that creature |

The Template list groups every campaign template and every library template
by disposition and then by source, for example "Hostile, this campaign" and
"Friendly, library", each sorted by name. From the Foes subtab the hostile
groups come first, and from an NPCs list the neutral groups come first. Each
copy keeps the disposition of its template, so an Innkeeper arrives as a
friendly NPC. The count adds up to 20 copies. Two or more copies get numbers
after the name ("Gray Wolf 1" to "Gray Wolf 4"), and a later spawn continues
from the highest number in use. With **Spread over nearby tiles** ticked, the
first copy goes on the chosen tile and the others go on the nearest open
tiles around it, never on a wall, deep water, or an empty cell. When the
open area runs out, the rest share the chosen tile. The location defaults to the
selected cell of the map in view, or to the middle of the map when no cell
is selected.

A defeated foe stays in the campaign until you remove it. **Clear
defeated** counts the hostile creatures at 0 HP that stand on the map in
view. It removes all of them, except a foe in the order of a running fight.

Clear defeated leaves foes on other maps and unplaced foes. It also takes
the removed foes off any quest links, and one travelogue note counts them,
for example "Cleared 4 defeated foes: Goblin x3, Wolf." Undo brings them
back.
