---
---
# GM reference

*Reference. For the steps of a task, read the [GM guide](gm-guide.md).*

This reference describes every mode, panel, control, and game rule of the
app. It assumes no knowledge of the code. Each section starts with what the
area is for, then lists its controls in a table, then gives its rules and
limits.

If a control named here does not show, check the mode switch and the role
switch first. Most controls depend on these two settings.

## Modes

The mode switch in the header sets the whole layout. Its options are Play,
Build, and Library. Only a GM tab shows the mode switch.

| Mode | Layout | Purpose |
| --- | --- | --- |
| Play | The map, the Party and Dice Tray cards in the dock beside it, and a sidebar of session panels and the character sheet | Run a session: party movement, fog, encounters, and combat |
| Build | The World tree rail, the editable map, and the Build rail with the Paint, Tile, and Encounters tabs | Author the world: maps, points of interest, regions, and staged creatures |
| Library | No map. Four tabs of templates | Curate the reusable templates that the preset pickers offer |

While a fight is open, the combat screen replaces the Play layout and takes
the full width. See [Combat screen](#combat-screen).

## Roles

The role switch sits at the right end of the header. Its accessible name is
Viewer, and its options are GM and Player. The first switch to Player in a
browser shows the toast "Player view. Click GM to return.", because the
Player view hides the mode switch and the campaign controls. A tab that
another tab forces out of the GM view does not show this toast.

| Role | Sees | Can change |
| --- | --- | --- |
| GM | Exact foe HP, tile notes, the whole map, and every quest, handout, and NPC | Everything |
| Player | Foe health as a band (Unharmed, Bloodied, Down), the fog-revealed map, and only what the GM revealed | Nothing, unless the tab is bound to a character |

A Player tab hides the mode switch, the Campaign, History, and Transfer
buttons, the fog controls, the Time panel buttons, and the party-split
switch. It also hides the Encounters card while no fight runs, so the card does
not tell the players that an area is safe.
A Player tab bound to a character opens on the Sheet tab, so the player sees
the map and that character's sheet side by side.

The role applies to one browser tab. Only one tab at a time can hold the GM
view. While a GM tab is open, every other tab of the same origin opens as a
Player tab and stays a Player tab.

The GM claim expires 15 seconds after the GM tab closes or crashes. The
claim stops two tabs from editing the campaign at the same time by
accident. It is not a security control. See
[Limits of the Player view](#limits-of-the-player-view).

Every save in the GM tab, including an autosave, reaches the other tabs. A
Play-mode tab applies the change without a reload, so it keeps its scroll
position, its open panel, and its map zoom and pan.

### Player tab options

| Option | Effect |
| --- | --- |
| `?role=player` on the URL | The tab opens as a Player tab and hides the role switch. The tab shows the GM view again only after you remove the parameter from the URL |
| The padlock beside the role switch | Locks the tab to the Player view after a confirmation. The padlock shows only in a Player tab. The lock lasts until you close the tab |
| `?character=<id>` on the URL | Binds the tab to one character. The id is the name of the character in lower case, with hyphens in place of spaces |
| The Playing as dropdown in the Party card | Sets the same binding from inside the tab. A tab opened from a link with `?character=` locks the dropdown on its character, so the player cannot switch to another sheet. If the tab loses that character, because another tab takes it over or the GM deletes it, the dropdown unlocks |

In a GM tab, the Party card has a link on each character row and a
Spectator tab button. Each one opens a Player tab. See
[Party roster](#party-roster).

### Bound and spectator tabs

A bound tab plays one character. An unbound Player tab is a spectator.

| Action | Bound tab | Spectator tab |
| --- | --- | --- |
| Spend a spell slot or another resource | Own character | No |
| Restore a spell slot or another resource | No | No |
| Add or clear a condition chip | Own character | No |
| Use, give away, or discard a carried item | Own character | No |
| Add an inventory item | No | No |
| Edit stats, XP, Bonus HP, or Base AC | No | No |
| Change HP with the steppers | No | No |
| Roll a save or a skill from the sheet | Own character | No |
| Move a token | Own character, while the party is split | No |
| Name on a roll in the log | The character name | "A player" |

Recovery of a resource is a GM action. For this reason, a player can spend a
slot but cannot restore one, and the HP steppers are GM-only.

A binding is exclusive, and it uses the same claim-and-expire rule as the
GM view. The GM tab ignores bindings and can edit every character.

### Limits of the Player view

The Player view is a display setting on the same browser data. It hides
these items from the screen:

- the exact HP of a foe (the view shows a health band instead)
- the GM-only lines of the travelogue and the combat log: the total of an HP
  pool, the reason that an HP pool or an HP limit gives for each target, the
  save bonus of a creature, and the HP readout of a creature after you set
  its damage by hand. The Player view shows a version of each line without
  the number
- the notes on a tile
- the handouts and quests that you have not revealed
- the notes, the links, and the GM-only objectives of every quest
- a revealed handout that is for other characters, or for a tile where the
  party does not stand
- the fogged part of the map
- the Campaign, History, and Transfer buttons and the mode switch
- the Build-mode world tree. A Player tab does not build it, so the names
  of undiscovered maps are not in the page

The Player view does not protect any of these items. Every tab of the same
browser reads the same saved campaign from the storage of that browser. A
person at that browser can open the developer tools and read the whole
save, including every item in the list above.

The app draws a partly revealed map in full and then covers it with fog, so
the hidden art is also in the browser. The same person can remove
`?role=player` from the URL to leave the Player view.

The GM claim is a plain record in the same storage, and any tab of the same
origin can overwrite it. The claim stops two tabs from editing the campaign
at the same time by accident. It does not stop a determined player.

Put a Player tab only on hardware that you control. A second screen on the
GM laptop is safe, and so is a laptop that you own and place on the table.
If the campaign contains text that a player must not read, do not give that
player the address on their own device.

## Theme

The theme switch sets the light or dark color scheme for the whole UI. Its
options are System (a monitor icon), Light (a sun), and Dark (a moon).

| Option | Effect |
| --- | --- |
| System | Follows the setting of the operating system. This is the default |
| Light | Always light |
| Dark | Always dark |

The app stores the choice per browser. A dark GM laptop and a light table
display can run at the same time.

## Campaign controls

The header buttons create, save, and move the whole campaign. They show in
a GM tab only. On a phone-width window, the header buttons and the theme and role
switches fold into the **Menu** button beside the title. A press on a
button in the menu closes it, and so do Escape and a click outside the
header.

| Control | What it does |
| --- | --- |
| Welcome | Opens the Welcome card on the map, with its three ways to start: build by hand, generate a world, or load the example campaign. The card opens by itself only on the first visit with a blank campaign |
| New | Resets to the blank campaign after a confirmation |
| Load example | Replaces the campaign with the example campaign after a confirmation. See [The example campaign](#the-example-campaign) |
| Save | Writes the campaign to the local storage of the browser. The line under the title reads "No unsaved changes" after the page loads, "Unsaved changes" while changes wait for a write, and "Saved just now", "Saved 5 min ago", or "Saved 2 h ago" after a manual save or an autosave from this tab. The button keeps an outline while changes are unsaved |
| Undo, Redo | Steps back to the state before the last Save, New, Load example, or Import, and forward again. Their tooltips say "previous save" and "next save", because they step between saves, not between single edits. If changes are unsaved, the app asks first, because the step discards them. The toast after the step names the parts of the campaign that changed, such as characters or the clock. The tab keeps the mode, the selected character, the open tabs, and an open full sheet |
| Export | Its accessible name is "Export campaign". Downloads the whole campaign as a `.json` file, with your library customizations bundled in |
| Import | Its accessible name is "Import campaign". Loads a campaign from a `.json` file. If the current campaign is not blank, the app asks first. If the file has library customizations, a prompt offers to replace yours. The campaign imports whichever answer you give |

A save from a stepped-back position discards the steps that were left to
redo.

New, Load example, and Import each keep a copy of the campaign that they
replace, as one undo step. The confirmation says that Undo in the header
restores the current campaign. If browser storage has no room for the copy,
the confirmation says instead that Undo may not restore it. To keep a
copy in that case, export the campaign first.

### Autosave

The app saves on its own only through autosave.

| Parameter | Value |
| --- | --- |
| Quiet time before an autosave | 10 seconds with no edit |
| Longest time that edits stay unsaved during nonstop editing | 120 seconds |

### Storage

Everything lives in the storage of one browser, under one origin. There is
no server and no account.

| Store | Contents | Limit |
| --- | --- | --- |
| Local storage | The campaign, the undo history, and the preference flags | About 5 MB for the origin. The tooltip of the Save button shows how much is in use |
| Undo history in local storage | The edits since earlier saves | 512 KB for edit steps. A copy kept by New, Load example, or Import counts against the room that is left instead |
| IndexedDB | Handout pictures and custom tile images | A share of the disk, set by the browser. It does not count toward the local storage limit |

When local storage is full, a save drops the oldest undo steps to make room
for the campaign, and a notice says so. If the save still fails with no
undo steps left, an error notice shows once. Autosave then does not try
again until you make another change.

The first stored image can make the browser ask whether the site can keep
its data. The answer has no effect on the app. If a browser cannot open
IndexedDB, as in some private windows, the images go into local storage and
count toward its limit.

If the browser does not store an image, the save still stores the map and
everything else. A notice says that the pictures were not stored, and the
next save tries the image again.

### Campaign size limits

The app loads at most 10,000 map areas and 2,000,000 tiles in all. A
campaign that is over a limit loads shortened. The app leaves out the areas
past the first 10,000, and the areas past the tile limit load with no tiles.

| Situation | What happens |
| --- | --- |
| Import of a file that is over a limit | A prompt says what does not load. **Import the shortened map** stores the shortened map, and Cancel keeps the current campaign. The file does not change |
| Start with a stored campaign that is over a limit | A prompt says what did not load, and saving pauses, so the full campaign stays stored. **Keep the shortened map** turns saving back on. **Keep saving paused** leaves autosave off for the session |
| Save while saving is paused | A prompt asks first. **Save the shortened map** stores it and turns saving back on |

## The example campaign

Load example replaces the campaign with a complete demo. The demo comes
from one fixed seed, so every load gives the same maps and the same
furnishings.

| Part | Contents |
| --- | --- |
| World map | The Marches, a 48x48 continent from the world generator, split into nine regions |
| Map areas | 149 in all. Each region has its own towns, keep, dungeon, and caves |
| Interiors | Furnished buildings in Briarwick and in the port of Saltmere. The Barrow of the Old King has three levels |
| Party | Four level-4 characters: Ser Aldric, Mirelle, Wren Tallowby, and Brannoc Hollowell |
| Quests | Seventeen: nine that lead to the barrow and eight side quests |
| Handouts | Eighteen. Fourteen start hidden, and four are personal letters |
| People | Eleven NPCs, including a staffed inn, smithy, and temple in Briarwick, and a smuggler and a harbormaster in Saltmere |
| Foes | Field enemies in every biome, minor bosses, a major boss, and a bestiary of twelve reusable templates. Two Thornhold guards stay neutral beside the Castellan until she is unmasked |

The party starts in Briarwick Vale, and only that region is revealed on the
world map. Every land tile of the world map leads into its region. To
travel to another region, the party walks off the edge of its region map
where that region borders the next one. The party arrives at the matching
spot of the next region.

The story is about King Ostrand, who has risen in his barrow. Castellan
Irenne Vane of Thornhold secretly works to free him. Each side quest gives
a clue about the Castellan or a tool for the fight in the barrow.

The Barrow of the Old King starts locked. Its lock needs an item named
Warding Key. The hermit Odo gives the key, or the smith Sella recasts the
counter-key from the crates of Dorn into one. When the party gets it, add
an item of that name to the inventory of one character. You can also unlock
the barrow at any time.

King Ostrand is the one legendary creature of the example. He takes two
legendary actions each round and has one use of legendary resistance each
day. His notes open with the wardstone rule and then say how his legendary
row works in the fight.

Five quests start revealed: Rumors at the Waystation, Wolves on the Vale
Road, and the personal quests of Mirelle, Wren, and Brannoc. When you
complete a quest, the app offers to reveal the quests that it unlocks. For
example, Rumors at the Waystation unlocks The Goblin Raids, The Hermit of
Graypeak, and Dorn's Sealed Cargo. The quests of Harbormaster Petra and the
mire hag Grelka unlock from no quest, so reveal them when the party meets
them. Every quest pays XP to each character. With the fights of the main line,
the quests before the barrow bring each character to about 6,500 XP, the
start of level 5. Wolves on the Vale Road also pays 25 gp each, and Dead
Water pays 10 gp each.

The quest steps that would expose the Castellan stay hidden from the
players until you reveal them. Her secret is only in GM notes. The party
already knows four contacts: Dorn, Corvin, Lord Aldemar, and the Castellan.

Most hidden handouts sit on the tile where the party finds them. Each
character starts with one personal letter, and only the player tab of that
character shows it.

The party shows these character features:

- a feat and an ability score increase
- the Expertise of the Rogue
- the Arcane Trickster and Eldritch Knight subclasses
- a fighter who multiclasses into wizard

The undead and beasts have damage resistances and trained saves. The
Castellan, one of her cultists, and King Ostrand cast spells. Snagtooth, Skalvyr,
the Grave Wight, King Ostrand, the Bandit Captain, and the Thornhold guards
attack more than once a turn with Multiattack.

## Build mode

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

### Node kinds

The world is a tree of nodes. The top node is the world map. Regions and
interiors sit beneath it.

| Kind | Palette it gets |
| --- | --- |
| Region | The full terrain, road, river, coast, and building palette |
| Interior | Interior pieces and furnishings only: floors, walls, doors, stairs, and furniture |

### Node settings

**Add a child** and **Edit settings** in the World tree open the same
fields.

| Field | Default | Values |
| --- | --- | --- |
| Name | New region | Any text |
| Width (tiles) | 6 | 1 or more |
| Height (tiles) | 6 | 1 or more |
| Kind | Region | Region or Interior |
| Environment | (none) | For a region: grassland, forest, mountain, desert, water, coast, swamp, tundra, or cave. For an interior: shop, inn, tavern, and other interior tags. The list follows Kind, so a change of Kind refills it and clears a tag of the other kind |
| Lock | No lock | No lock, Locked, or Unlocked |
| Key item (name) | (blank) | The name of the item that opens the lock. The field is off while Lock is No lock |

The environment tag is a description only. It has no effect on painting,
generation, or rules.

A smaller width or height that removes tiles asks first. **Cancel** on that
confirm opens the settings again with the values you typed. In the same way,
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

### World tree

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
| Row name | In Build mode, opens that map. In Play mode, see [Play layout](#play-layout) |
| Actions button (three dots) | Build mode only. Opens a menu with Add a child, Edit settings, and Delete. A right-click on the row opens the same menu. Delete shows in red below a rule. Its confirm counts the maps it removes, the creatures that become unplaced, the handouts that become campaign-wide, and the quest links that go with the maps. It also says whether Undo in the header can bring the map back. Undo can do that only when the last save has the map |

A branch is closed when the tree first shows it. The exceptions are the top
node and the rows above the current map. When the map in view changes, the
tree opens the rows above it and scrolls to its row.

The tree takes one Tab stop. Inside it, Up and Down move between rows, and
Home and End go to the first and last row. Right opens a closed row or
moves into an open one, and Left closes an open row or moves to its
parent row. Enter opens the map of the row. In Build mode, Shift+F10 or the
Menu key opens the actions menu of the row.

### Palette tools

The Palette card has four tool buttons and five sections of swatches. A
click on a swatch picks it as the brush, and a drag paints it on every cell
that the pointer crosses. The name of the picked swatch shows above the swatch
sections, for example **Brush: Grass (random variant)**.
While Inspect, Region, Erase path, or Erase tile is the tool, the swatches
fade. A click on a swatch still picks it as the brush.

A brush paints only while the Paint tab is open. On the Tile and Encounters
tabs, a click on the map selects the cell, the same as Inspect. A chip at the
right end of the map toolbar names the tool that a click uses, such as
**Painting: Grass**, **Painting: Briarwick region**, or **Inspect**.

| Tool | What a click or drag does |
| --- | --- |
| Inspect | Selects one cell and opens it in the Tile tab. This is the starting tool |
| Region | Links every cell that the pointer crosses to the node in **Paint region**, and moves the cell out of any other region. It skips site entrances and says how many it skipped. While the Region tool is active, the cells that already link to the node in **Paint region** show a stronger tint and a wider border |
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

### Tools card

| Control | What it does |
| --- | --- |
| Undo stroke | Reverts the last edit. A whole drag, a region link, and a generation each count as one edit. The header shows a second Undo stroke button in Build mode, left of Undo, and Ctrl/Cmd+Z presses it |
| Export PNG | Downloads the current map at 64 pixels per tile, with fog ignored. A map with no tiles downloads nothing, and a message says so |

Undo stroke reverts only the cells and fields that the edit changed. Fog
that the party revealed and notes written after the edit stay. A tile link
to a node that was deleted after the edit comes back as no link.

The stroke history is separate from the header Undo and Redo. It has no
redo, and it ends when the page reloads.

If a map is too large for 64 pixels per tile, Export PNG uses a smaller
size and names the size it used. If no size fits, the app refuses the
export.

### Tile inspector fields

The inspector heading shows the art of the selected tile and its name, for example "Forest", or "Grass, Road (h)" for a tile with an overlay. Under the name, it names the cell, for example "Column 11, row 11". Columns and rows count from 1, the same as the numbers along the map edges.

| Field | Meaning |
| --- | --- |
| Marker | The point-of-interest marker on the tile. None is the default |
| Discoverable | The point of interest stays hidden until the party steps onto its tile, or walks through the tile into the sub-map that it links to. The hint under the checkbox reads "Hidden until the party steps here." |
| Notes | Text for the GM. The GM sees it on hover in Play mode. The Player view does not show it, but the text is in the saved campaign |
| Zooms into | The child node that this tile leads to. Nothing is the default |
| Set party start here | Places the spawn tile of the party |
| New handout on this tile | Opens the new-handout dialog with this tile as its place |

### Tile menu

In a GM tab in Build mode, a right-click on a map cell selects the cell and
opens the tile menu, if the pointer did not drag. Shift+F10 or the Menu key opens the same menu at the
keyboard cursor.

| Item | What it does |
| --- | --- |
| New foe here | Opens the creature dialog as a level-1 hostile on this cell |
| New NPC here | Opens the creature dialog as an unleveled neutral on this cell |
| Edit (name) | Opens the creature dialog for a creature that already stands on this cell. One item shows for each creature |

### Map generation

The Generate card fills the current node with a generated layout. The
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

#### Links to the parent map

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

#### Names after regeneration

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

#### Parent tiles after regeneration

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

#### Outdoor archetypes

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

#### Towns

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

#### Ports

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

#### Interior archetypes

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

#### Obstacles, doors, and stairs

A pillar, a table, a bed, a bookshelf, a shelf, and a counter are
obstacles. The party never lands on an obstacle or a wall when it enters
a map, and a new link never goes on one.

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

#### Level stacks

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

#### Worlds

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

#### Sub-maps

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

### Link warnings

Build mode shows a warning below the tool tabs when the node in view has no
way in or no way out. The World tree marks each node with a problem with a
warning triangle. A closed branch shows a triangle and the number of nodes
inside it that have a warning.

| Warning | Meaning |
| --- | --- |
| Nothing leads here | No tile on the parent map links to this node. The "Link from (parent)" button opens the parent on the Paint tab with the Region brush set to this node |
| No way out | The node is linked, but it has no outer door, no usable staircase, and no painted parent tile beside its block |

Neither problem strands a party. A node without an authored way out offers
a plain "Return to (parent)" button.

### Encounters tab

The Encounters tab of the Build rail stages creatures on the map in view.
The Foes subtab lists foes, and the NPCs subtab lists friendly and neutral
people.

| Control | What it does |
| --- | --- |
| New creature | Opens the creature dialog for a new foe |
| From bestiary | Opens the **Add from bestiary** dialog. Type part of a name in **Filter by name** to narrow the list. Enter in the filter does not add a copy. Then pick a template, a count, and a map and tile, and click **Add** to place that many full-health copies. **Pick on map** fills the map and tile from one click on the map |
| Remove template | Removes one campaign template from the bestiary, after a confirmation. It shows while the campaign bestiary has a template |
| Clear defeated (count) | Removes the defeated foes on the map in view, after one confirmation |
| Edit, Delete on a row | Edits or deletes that creature |

The Bestiary lists the campaign templates under "This campaign" and the
hostile templates of the library under "Library", each sorted by name. The
count adds up to 20 copies. The combat log and the setup dialog number copies
that share a name, such as "Gray Wolf 2". The location defaults to the
selected cell of the map in view, or to the middle of the map when no cell
is selected.

A defeated foe stays in the campaign until you remove it. **Clear
defeated** counts the hostile creatures at 0 HP that stand on the map in
view. It removes all of them, except a foe in the order of a running fight.

Clear defeated leaves foes on other maps and unplaced foes. It also takes
the removed foes off any quest links, and one travelogue note counts them,
for example "Cleared 4 defeated foes: Goblin x3, Wolf." Undo brings them
back.

## Play mode

Play mode is where you run a session.

### Play layout

| Area | Contents |
| --- | --- |
| Above the map | The breadcrumb trail. A click on a crumb, except the last, opens that map without moving the party. The party marker shows on the tile that leads down to the party |
| Map | The current map, the map controls, the mini-map, and the ways out |
| Dock | The Party card over the Dice Tray. When the open tray needs more room, the Party card gets shorter and its rows scroll inside the card, so the tray never covers a party row. A wide window shows the dock left of the map, and a narrow window shows it below the map |
| Sidebar | Three tabs of session panels and the Sheet tab |

| Sidebar tab | Panels |
| --- | --- |
| Session | World, Time, Encounters, and Initiative |
| Story | Quests, NPCs, and Handouts |
| Log | Travelogue |
| Sheet | The character detail card of the selected character |

On a window wider than about 1,090 pixels, Play mode fits the screen and the page does not scroll. The dock and the sidebar each scroll on their own, so the map, the party, the dice tray, and the open sheet stay in view together. A click on a row of the Party card selects that character and opens the Sheet tab. While **Hide panels** is on, the click selects the character and leaves the hidden sidebar on its tab.

**Hide panels** collapses the sidebar and gives the map the full width.

On a phone-width window, Play mode shows one area at a time. A bar at the bottom of the screen picks the area: **Map** shows the map with the Session tab under it, **Party** shows the Party card and the dice tray, and **Sheet**, **Story**, and **Log** show that sidebar tab. The bar takes the place of the sidebar tabs and the **Hide panels** button there. A click on a row of the Party card opens the Sheet view.

The World panel shows the node tree. A GM sees every node, and a player
sees only the nodes that the party discovered. A discovered node has at
least one revealed tile, or it is where the party stands.

A click on a row name in the World panel opens that map in a Player tab.
In a GM tab, a click on the map where the party stands opens that map. A
click on any other row asks what to do. **View map** opens the map and
leaves the party where it is, as the breadcrumb does. **Teleport party**
moves the party there.

### Map controls

The map controls sit in a row over the map.

| Control | What it does |
| --- | --- |
| Zoom in, Zoom out | Change the zoom one step |
| Fit map to view | Fits the map in the viewport, even when its tiles then draw small. In Play mode it fits the revealed tiles with a margin of two tiles, and at least 12 tiles on each side. Build mode, and a map with no revealed tile, fit the whole map |
| Center on party | Brings the party back into view at the current zoom |
| Mini-map of the parent map | Shows or hides the mini-map. Each browser keeps the choice. On a phone-width window the mini-map starts hidden until you show it. On the world map, or on a map that no tile links to, the button is dimmed and does nothing, and its tooltip says that the map has no parent map |
| Zoom readout | Shows the zoom as a percentage |
| Reveal fog (brush) | GM only. Picks up the reveal brush. A click or Enter on a tile reveals it |
| Hide fog (brush) | GM only. Picks up the hide brush. A click or Enter on a tile hides it |
| Reveal whole area | GM only. Asks first, and then reveals every tile of the map in view |

While a fog brush is picked up, a click paints fog instead of moving the
party. A second click on the same brush button, or Escape, puts the brush
down. A change of mode or of map also puts the brush down.

When a map opens in Build mode, the view fits the whole map, even when its
tiles then draw small. In Play mode the view fits the revealed tiles. If they
are too large to show at a readable size, the view centers on the party
instead, and **Fit map to view** shows them all at a smaller size. In a Player
tab, it centers on the bound character. The view then follows the party
until you pan or zoom.

A switch to Play mode opens the node where the party stands.

### Party movement

A click on a tile, or Enter on the keyboard cursor, moves the party there.
Only one kind of tab moves anyone.

| Tab | Party together | Party split |
| --- | --- | --- |
| GM | Moves the party | Moves the character selected in the Party card, or the party if no character is selected |
| Bound Player tab | Moves nobody | Moves its own character |
| Spectator | Moves nobody | Moves nobody |

A click on a tile that links to a sub-map enters the sub-map. The party
lands at the edge that it came from, and the travelogue logs the entry. A
first entry is logged as a discovery.

The move needs a walk from the tile of the party. The walk steps to the
four sides of each tile.

- A wall or an obstacle stops the walk. So a town wall, the walls of an
  interior, and furniture such as a table block it.
- Deep water stops the walk, so the party goes around a lake.
- A gate or a door lets the walk through.
- An empty cell lets the walk through, so a gap in a painted map does not
  block a move.
- A player walk goes through revealed tiles only, so an empty cell stops it.
- The walk goes around a tile that links to a sub-map, such as a shop in a
  town. It goes through such a tile only when no other way exists.

The party takes the shortest walk, and the fog clears around every tile of
the walk, not only around the tile where the party stops.

If no walk leads to the tile, a GM tab asks before it moves the party
there anyway. So you can still put the party past a wall or on a boat in
deep water. A player tab does not move the token, and it shows a message.
Nobody can stand on a wall or an obstacle, so a click on one moves nobody
and shows a message, even in a GM tab.

A GM click on a fogged tile that links to a sub-map asks first, and names
the sub-map. So a click that aims past a building in the fog does not take
the party inside by mistake.

A walk of the whole party moves the in-game clock on. The time depends on
the map.

| Map | Time for each tile of the walk |
| --- | --- |
| The world map, at the top of the World panel | 4 hours, one watch |
| A region map, one level below the world map | 30 minutes |
| A deeper outdoor map, such as a town | 1 minute |
| A building interior | None |

The minutes add up across walks, and the Time panel shows the next watch
once 4 hours have passed. When a walk moves the clock into a new watch, a message and a Travelogue
entry name the length of the walk and the new time, for example "The walk
took 4 hours. Now Day 2, Midday." A split character's walk spends no time. A
teleport, a way out of a map, and a forced move from another map spend no
time either.

Before a walk that reaches Night, a GM tab asks first. The dialog names the
length of the walk and offers three buttons:

| Button | Effect |
| --- | --- |
| Walk on | The party takes the whole walk into Night |
| Stop at Dusk | The party walks only as far as the last tile before Night. The button does not show when the first step already reaches Night, or for a forced move |
| Cancel | The party stays where it is, and the clock does not move |

Tick **Don't ask again tonight** to skip the question for later walks into
the same Night. The tab forgets the choice when you reload it. A forced move
and a click on a fogged link tile add the warning to their own confirm. A
walk that starts in Night does not ask, and neither does a player tab or a
split character, because they spend no time.

The walk check applies only to a move inside the map in view. The ways
out, a teleport from the World panel, and the Place on map button do not
check for a walk.

A player tab ignores clicks on a fogged tile. A player cannot move a token
into the fog or open the sub-map behind it.

### Ways out of a map

Inside a sub-map, the edges and tiles that lead back to the parent map show
return arrows. A click on an arrow travels.

| Kind | Where it shows | Where it leads |
| --- | --- | --- |
| Edge | A side of an outdoor sub-map that touches painted tiles on the parent map. The arrow shows while the party is at most three times its sight from that side | Back to the parent tile that the party crossed. If another region of the same parent map borders that side, the party crosses into that region at the matching spot |
| Tile | An outer door, or a staircase with no link, in an interior | Back to the parent level |
| Fallback | A node with neither kind | A plain "Return to (parent)" button |

An exit arrow that the mini-map would cover moves along its side of the map
until it is clear.

In Play mode, the mini-map floats over the top-left corner of the map, and
the map fits the canvas as if it were not there. Coordinate digits and
region names under the mini-map hide. Collapse the mini-map to see them. In
Build mode, the map fits clear of the mini-map, so a click or a paint
stroke on a corner tile does not land on the mini-map. After you pan or zoom,
tiles can pass under the mini-map in either mode, and a click there does
nothing.

### Party splitting

The **Allow splitting the party** checkbox in the Party card lets each
character stand on its own tile. The switch is off by default, and it is
GM-only.

| State | Effect |
| --- | --- |
| Off | Every character moves with the party marker. No character tokens or name labels show |
| On | Each character can stand on its own tile, shown by a gold token. The Party card shows a Place on map button on each row |

**Place on map** opens a dialog with a map and a tile, or **With the
party**. A placed character reveals fog around its tile.

When you clear the checkbox, a **Regroup the party** dialog asks where to
gather everyone. The party then teleports to the position of the character
that you pick. If you cancel, the party stays split.

### Map markers and ranges

| Marker | Meaning |
| --- | --- |
| Gold token | A character, while the party is split |
| Red diamond, upper right of a tile | A live encounter |
| Blue circle, upper left of a tile | A placed NPC |
| Parchment note, bottom center of a tile | A hidden handout on the tile. Only the GM sees it, at any range |
| Gold outline | A revealed point of interest |

| Range | Distance from the party (tiles) | What it sets |
| --- | --- | --- |
| Sight | See the table below | The radius that movement reveals. A revealed tile stays revealed. An edge exit arrow shows within three times this distance of its side |
| Detection range | 4 | The range at which encounter, NPC, and point-of-interest markers show |
| Nearby range | 8 | The range of the GM lists of nearby encounters and NPCs |

The sight of the party depends on the map and on the watch of the in-game
clock. The detection range and the Nearby range stay the same at every
hour.

| Map | Sight (tiles) |
| --- | --- |
| The world map | 2 |
| An outdoor map below the world map, from Dawn to Afternoon | 3 |
| An outdoor map below the world map, at Dusk | 2 |
| An outdoor map below the world map, at Night | 1 |
| A building interior | 2 |

A room in a building, an inn, or a castle is lit, so when the party steps
into it, the whole room comes out of the fog with its walls and doors. A
party that stands in a doorway sees into the rooms on both sides. A room of
more than 100 floor tiles, such as a great hall, shows only within the
sight of the party. The rooms of a dungeon, a cave, or a cellar stay dark.

In a GM tab in Play mode, the fog is part see-through. The terrain draws
dimmed under the fog, and the grid, the region outlines, and the region
names draw over it, so the GM reads the way ahead without a switch to Build
mode. Point of interest outlines and exit badges on fogged tiles stay
hidden. Creature markers show within the detection range, as they do under
solid fog, and the badge of a hidden handout shows at any range. A Player
tab, and a GM tab switched to the Player view, draw solid fog. In Play mode
the mini-map draws solid fog, in a GM tab too.

Inside a building, a fogged tile beside explored floor, a door, or stairs
draws a lighter fog. The lighter band shows where the explored part ends,
for example past a door that the party has not opened.

When the party is on a sub-map, the tiles that link to it on each map above
are revealed too. So the world map shows the region where the party stands.

When a tile that links to a sub-map first comes out of the fog, the
Travelogue logs "Sighted" and the name of the sub-map. A discoverable site
that the party has not found stays out of the log.

A hover on a tile in Play mode names the point of interest and the NPCs on
it. The keyboard cursor does the same. The hover uses the detection range,
so a tile out of range says nothing.

### The mini-map

Inside a sub-region, a small picture of the map one level up sits in the
top-left corner of the map. On the world map, the mini-map is hidden.

| Element | Meaning |
| --- | --- |
| Gold outline | The tiles of the parent map that lead into this sub-region |
| Gold dot | The approximate position of the party |

The dot scales the position of the party in the sub-region onto the
outlined tiles. So a party at the east edge of a town shows at the east
side of the block of that town. While the party is split, a Player tab
follows its bound character.

In Play mode, a tile of the mini-map that the party has not seen draws as
solid fog, also in a GM tab. In Build mode, every tile shows.

A click on the mini-map does nothing, so it never moves the party to a tile
hidden under it.

### Encounters panel

The Encounters panel in the Session tab has two tabs.

| Tab | GM tab lists | Player tab lists |
| --- | --- | --- |
| Active encounter | The live hostile creatures on the tile of the party and on the eight tiles around it | The same creatures |
| Nearby encounters | The other hostile creatures within the nearby range, on the node of the party, plus unplaced ones | The other live hostile creatures on revealed tiles of the node of the party, plus unplaced ones that the party walked into. A defeated foe does not show |

A friendly or neutral creature never shows in the Active encounter tab. It
stays in the NPCs panel. Each row shows the name on one line, and the HP and
the column and row on a second line. On a GM tab, the **Amount** field of a
row sets how much the damage and heal buttons of that row apply.

The Nearby encounters tab shows one line for each group of foes that share
a name, such as "Gray Wolf x4". The line shows the HP of the group added
up and the distance of the nearest one in tiles. The nearest group comes
first. Every defeated foe goes into one "Defeated (2)" line at the end. On
a GM tab, click a line to open the full rows of its foes, with the same
controls as an Active encounter row. One line opens at a time. A Player
tab shows each line as text, with the HP band instead of the bar.

A GM tab also shows these controls:

| Control | What it does |
| --- | --- |
| Start combat | Opens the combat setup for the party, the creatures of the Active encounter tab, and any friendly or neutral creature on the tile of the party |
| New creature | Opens the creature dialog for a new foe |
| From bestiary | Opens the **Add from bestiary** dialog |
| Save as a bestiary template, on a row | Stores that creature as a campaign template |

### The difficulty hint

Above the Active encounter rows, the GM sees one line that rates the foes
of that tab. For example: "Hard: 1200 XP against party
thresholds easy 300, medium 600, hard 900, deadly 1600".

| Part | Meaning |
| --- | --- |
| Band | Trivial, Easy, Medium, Hard, or Deadly. The band names the highest threshold that the adjusted total reaches. Under the easy threshold is Trivial |
| XP total | The adjusted worth of the hostile creatures |
| Thresholds | The easy, medium, hard, and deadly budgets, summed over the levels of the living characters |
| Unrated count | Shows when foes have no challenge rating, for example "2 unrated foes count for no XP" |

The adjusted total is the sum of the XP of each foe, times a multiplier for
the number of foes.

| Foes | Multiplier |
| --- | --- |
| 1 | x1 |
| 2 | x1.5 |
| 3 to 6 | x2 |
| 7 to 10 | x2.5 |
| 11 to 14 | x3 |
| 15 or more | x4 |

A party of one or two characters moves one step up this ladder, and a party
of six or more moves one step down. The ladder ends at x0.5 and x5.

A dead character adds no budget and does not count toward the party size.
The line hides when no living character remains, because there is no
budget to rate against.

The line is a hint only. It blocks nothing, it awards no XP, and players
never see it.

A foe with no challenge rating is worth nothing in the sum, but it still
counts toward the number of foes. The missing worth makes the total too
low, and the higher multiplier on the rated foes can make it too high.

### Creature fields

The creature dialog defines a foe or an NPC. The same dialog opens from
Build mode, from Play mode, and from the tile menu.

The fields sit under the headings Basics, Combat, Proficiencies,
Spellcasting, and Placement. The ability scores and AC open the Combat
section. The damage and condition defenses sit in a collapsed **Damage and
condition defenses** group, after Proficiencies. A field that depends on
another field stays disabled until that field has a value: **On hit: DC**
and **On hit: condition on a fail** need **On hit: save**, **Surprise
Attack: die** needs a dice count, **Multiattack: attack with
disadvantage** needs a Multiattack of 2 or more, and **Caster level**
needs a caster class.

| Field | Default | Meaning |
| --- | --- | --- |
| Name (required) | Empty | The name shown in the panels and the log. **Add** stays disabled while it is blank |
| Role / faction (players see it) | Empty | A short description, such as "blacksmith". The Player view shows it next to the name |
| Disposition | Neutral. Hostile for **New creature** and **New foe here** | Hostile, neutral, or friendly. A hostile creature is a foe |
| Creature type | Untyped | The SRD type, such as undead or beast. Sleep, the healing spells, Blight, Sunburst, and Sunbeam read it. An untyped creature matches no type rule, and a party character counts as humanoid |
| Max HP | 4 | The full health pool |
| Notes (GM only) | Empty | Text for the GM. The Player view does not show it |
| Level (blank for none) | Blank. 1 for **New creature** and **New foe here** | Sets the default stat block |
| Tier | Mob | Mob for rank and file, Legend for an above-normal enemy. A legend always has higher stats than a mob of the same level |
| Challenge rating | Unrated | The 5e rating, from 0 to 30. It sets the proficiency bonus that the creature rolls with, and its XP |
| Save proficiencies | None | The saving throws that the creature is trained in |
| Skill proficiencies | None | The skills that the creature is trained in |
| Weapon | None (unarmed) | A weapon from the library |
| Armor | None (unarmored) | Armor from the library |
| Multiattack (attacks per action) | Blank (one attack) | How many times the creature swings its weapon for one Attack action, from 2 to 6 |
| Multiattack: attack with disadvantage | Blank (none) | The swing of the Multiattack that rolls with disadvantage, such as 2 for the second attack. Blank, or a number past the last swing, stores none |
| Redirect Attack (reaction: an ally becomes the target) | Off | When an attack targets the creature, the app offers to make an ally the target instead. See [Redirect Attack](#redirect-attack) |
| Turn Resistance (advantage on saves against Turn Undead) | Off | The creature rolls its WIS save against Turn Undead with advantage. Use it for Turn Resistance and for Turn Defiance |
| Legendary actions per round | Blank | The legendary actions of the stat block, from 1 to 5. Blank means none. Each one is an attack that the creature takes on the turn of another combatant. See [Legendary actions](#legendary-actions) |
| Legendary resistance per day | Blank | The uses of Legendary Resistance, from 1 to 5. Blank means none. A long rest of the party gives them back. See [Legendary resistance](#legendary-resistance) |
| Pack Tactics | Off | The attack dialog of the creature offers a Pack Tactics box, which gives advantage |
| Surprise Attack: dice, Surprise Attack: die | Blank, d6 | Extra damage dice on a hit against a surprised target in round 1. Blank stores none |
| On hit: save, On hit: DC, On hit: condition on a fail | None, 10, Prone | A save that each hit of the weapon forces. A target that fails the save gains the condition. None stores no save |
| Resistant to, Vulnerable to, Immune to | None | The damage types that the creature takes half, double, or no damage from |
| Immune to conditions | None | The conditions that do not land on the creature. The log names the immunity in place of the chip |
| Caster class | None (non-caster) | The class whose spell list and ability the creature casts with |
| Caster level | Blank | The level that sets the spell slots of the creature |
| Spells | None | The spells that the creature knows |
| Location (map), Column, Row | The selected cell, or the middle of the map when no cell is selected | Where the creature stands. Columns and rows count from 1. Unplaced means that it appears everywhere. The map list groups each map under its parent map |
| Pick on map | | Closes the dialog until you click a tile of the map in view. Then the dialog opens again with your values, and the map, column, and row of that tile. Press Escape, or **Cancel** in the hint over the map, to go back without a change. A click while the dialog waits does not move the party or paint. On a phone, the Play screen shows the **Map** view while the dialog waits, and then goes back to the view you were in. The button shows only in Play and Build mode, because Library mode and the combat screen do not show the map. A second **Pick on map** from another dialog cancels the first, and that first dialog opens again with no change |
| Move to the party | | Sets the map, column, and row to the party's tile |

A line under **Row** warns when the tile is outside the map, has no
terrain, is deep water, or is a wall or an obstacle. The warning does not
stop the save, so a sea creature can still go on a water tile. The **Add
from bestiary** dialog shows the same warning.

The caster class list also offers "Fighter (Eldritch Knight)" and "Rogue
(Arcane Trickster)". For these two, a caster level below 3 saves as 3,
because these subclasses cast from level 3.

The six ability scores plus AC are the only stats that a creature has.

The Build chip for AC reads "Base AC". This is the AC without armor: 10
plus the DEX modifier by default, or higher for natural armor or a shield.
The Play chip and the combat card show the AC with armor.

Worn armor replaces the 10 + DEX part with its own base AC and the part of
the DEX modifier that its weight allows. See [Armor class](#armor-class).
For example, a DEX 16 creature in Plate has AC 18.

The Encounters and NPCs panels show each trained save and skill with its
bonus, for example "Saves DEX +4 | Skills Stealth +6". The app calculates
each bonus from the ability score, the challenge rating, and any
exhaustion, so there is no number to type.

An unrated creature takes its proficiency bonus from its level. With no
level, the bonus is +2. A save that a spell calls for uses the same bonus,
so the cast dialog asks only for the DC.

A defeated encounter shows as defeated in the lists. The app does not
delete it.

### Stat chips

In Play mode, a click on a stat chip of a creature applies a timed
adjustment, for example +2 STR for 3 rounds. The chip then reads "STR
14->16 (3r)".

The adjustment counts down as combat rounds pass, and combat math uses the
adjusted value while it lasts. In Build mode, the same chips set base
values.

### Combat screen

The combat screen runs one fight at the full width of the page.

| Area | Contents |
| --- | --- |
| Top | The turn ribbon: one chip per combatant in initiative order, with its name and number, as in "Gray Wolf 2" |
| Left column | The active combatant: initiative, AC, HP, conditions, concentration with its Drop control, death saves with their Roll and Stabilize controls, the Damage and Heal box, and the loadout |
| Center | The board: one card per combatant, with an HP bar, AC, conditions, and a short loadout. A dying, stable, or dead character shows a chip for its state |
| Right column | The **Log** and **Map** tabs, with the dice tray docked below them. **Log** shows the combat log. **Map** shows a read-only map of nine by nine tiles around the party, with the fog of the Play map and a marker on the tile of each hostile creature that still stands. Markers show only near the party, as on the Play map |

| Ribbon or card mark | Meaning |
| --- | --- |
| Ring on a chip | The current turn |
| **Current turn** tag and blue bar along the top of a card | The current turn |
| Red left edge on a card | A foe |
| Accent ring on a card | The selected target |
| Sword on a chip | A foe |
| Strike-through | A defeated combatant |
| Dashed edge | A combatant that cannot act, such as a stunned one, which is still in the fight but loses its turn. A dying or stable character at 0 HP shows the same edge, because it is still alive |

A click on a ribbon chip inspects that combatant without a change of turn.

The Damage and Heal box in the left column shows to the GM only. Its
**Target** select picks the combatant that the box acts on, and the buttons
name that combatant, as in **Heal Mirelle**. The target defaults to the card
selected on the board, then to the inspected combatant, then to the
combatant whose turn it is. A new selection on the board resets the target.
A selection lasts for one turn, and **Next turn** clears it. A dying ally
can be selected, so you can heal it on a foe's turn. The **Amount** stays
for the rest of the turn, so you can apply one area spell's damage to
several targets, and a new turn sets it back to 1.

| Viewer | Loadout shown on a card |
| --- | --- |
| GM tab | Every loadout |
| Bound tab, own card | Armor, weapons, spells, and slots |
| Bound tab, another player card | Armor and weapons only |
| Any Player tab, foe card | No loadout |

| Control | Who | What it does |
| --- | --- | --- |
| Back to map | Everyone | Leaves the screen without an end to the fight. The Initiative card in the sidebar shows the round and has **Open combat** |
| End combat | GM only | Opens the XP dialog when the party did not lose, a character is alive to earn XP, and the fight has XP to award or a standing foe. The dialog ends the fight. While foes stand and no character can earn XP, a confirm asks first. A lost fight, or a won fight with no XP to award, ends with no question |

Unless the party lost, End combat offers the XP of the defeated foes. The
XP is split evenly among the living characters and rounded down, and the
dialog states any XP that the split leaves over. A foe with no challenge
rating is worth nothing. You can change the amount. The dialog opens
before the fight ends, so **Back to the fight** keeps the fight, the XP,
and every foe as they are. **End and award** ends the fight and gives the
XP. A foe that falls while the dialog is open gets no fate, so a dead
foe is never logged as fled.

Each hostile creature that still stands gets a select with three choices.

| Choice | On **End and award** |
| --- | --- |
| Still hostile | No change, and no XP |
| Surrendered or captured | The foe becomes neutral, so the Encounter alert does not fire again when the party steps onto its tile. Its XP joins the split |
| Fled (remove from the campaign) | The foe leaves the campaign, and the log reads "Gray Wolf 2 flees." Its XP joins the split. **Undo** brings it back |

To make a captive a foe again, set its disposition back to hostile in the
creature dialog. To keep a foe that fled in the story, pick **Still
hostile** and move it to its new tile in the creature dialog.

A fight also ends when no creature of the fight is left on the tile of the
party or on the eight tiles around it, and no hostile creature of the fight
is left within the nearby range (8 tiles by default). A walk out of that
range ends the fight, and so does the deletion of the last creature in it.
The wider range lets a foe that joined from farther away keep the fight
open.

### Combat setup

**Start combat** opens the setup dialog. The **Set up combat** button of the
**Encounter!** dialog opens it too. It lists the party, the live hostile
creatures on the tile of the party and on the eight tiles around it, and any
friendly or neutral creature on the tile of the party. Hostile creatures
line up as foes, and friendly and neutral creatures line up with the party.
Only a hostile creature starts an encounter. To fight a friendly or neutral
creature, set its disposition to hostile first.

Under **Add nearby foes**, the dialog lists the other live hostile creatures
within the nearby range, nearest first, with the distance in tiles. Tick
**Join** on a row to bring that foe into the fight. When two or more foes
stand on one tile, an **Add the whole group** box above them ticks every
**Join** box of that tile at once. A joined foe rolls
initiative with the others. The Stealth contest covers only the rows above
the list. During a fight, the **Nearby encounters** tab has an **Add to
fight** button on each hostile row that is not in the fight. Open the line
of the foe to reach its row. It rolls
initiative for the foe, logs the roll, and puts the foe into the order.

Combatants that share a name get a number after it, such as "Goblin
Scout 1" and "Goblin Scout 2". The numbers follow the order of the creature
list. The rows of the Encounters panel, the combat status line in the
sidebar, the combat screen, and the attack and spell dialogs use the same
numbers. The Active tab and the setup dialog number the foes of the fight
that Start combat would begin, or of the fight that runs, so a foe shows
the same label in the panel, the dialog, and the fight. A foe that is the
only one of its name in the fight shows no number. The Nearby tab counts on
after the fight, so a second wolf nearby reads "Wolf 2" beside a lone
"Wolf" in the Active tab. A defeated foe keeps its place in the count of a
running fight. The log and the stored name keep the plain name.

| Control | What it does |
| --- | --- |
| Initiative value | Starts at 10 plus the DEX modifier. Every value is editable |
| Roll initiative | Rolls for every row at once |
| Who sneaks | Picks who sneaks for the Stealth contest: **No one**, **The party**, **The foes**, or **Both sides**. See [Stealth contest](#stealth-contest) |
| Roll Stealth | Rolls a Dexterity (Stealth) check for each row of each sneaking side. It shows only when a side sneaks |
| Stealth total | The Stealth total of a sneaker row. Roll Stealth fills it, and you can type your own value |
| PP | The passive Perception of a row that watches the other side |
| Surprised | Marks a combatant that the other side caught unaware. See [Surprise](#surprise) |
| Join | A foe under **Add nearby foes**: tick it to add the foe to the fight |
| Add the whole group | The label names the creatures, with a count for each name, and the distance, as in "Add the whole group (Gray Wolf x4), 4 tiles away". Ticks or clears the **Join** box of every nearby foe on one tile. It shows as mixed while only some are ticked |
| Parley | Closes the dialog with no fight, and turns the foes neutral, and logs a line such as "The party settles the encounter without a fight. Goblin Scout 1 and Goblin Scout 2 stand down." See [Parley](#parley) |
| Start combat | Rolls initiative for each row that you did not roll or type, and then starts the fight |

For the initiative rules, see [Initiative](#initiative).

### Surprise

The GM decides who is surprised. The [Stealth contest](#stealth-contest)
ticks the boxes for you, or you tick **Surprised** on each row by hand
before you press Start combat. The log records a line such as "Goblin Scout
is surprised."

A surprised combatant wears a Surprised chip and keeps its place in the
initiative order. Until its first turn ends, its Reaction pip is spent. On
that first turn, the Action and Bonus action pips are spent too, so every
button that needs them refuses. The app does not track movement, so the GM
keeps the surprised combatant in place. At the end of that turn the chip
ends and the reaction comes back, and its next turn is a normal one. To
overrule a spent pip, press it to mark it free.

### Stealth contest

The contest is optional. With **Who sneaks** at **No one**, the dialog
shows no Stealth controls. Pick the side that sneaks, and each row of that
side shows a Stealth total. Each row of the other side shows its passive
Perception (PP). Pick **Both sides** when each side tries to sneak up on
the other. Then every row shows a Stealth total and its PP.

**Roll Stealth** rolls d20 plus the Stealth bonus for each sneaker. A
character uses its sheet bonus, and a creature uses its stat block. The
chips of the roller slant the roll. For a character, armor with stealth
disadvantage and armor that the character is not proficient with also give
disadvantage. You can type a total in any sneaker row instead of rolling.
A row with no total takes no part.

The app compares each watcher's passive Perception with every sneaker
total. A watcher notices the threat when its passive Perception is higher
than at least one total. A total equal to the passive Perception stays
hidden. A watcher that notices no sneaker is surprised. Each change to a
total runs the contest again. It ticks **Surprised** on each watcher that
notices no one, and it clears the box on each watcher that notices. The
boxes of the sneaking side do not change. The outcome line under the picker
names every total and each surprised combatant.

With **Both sides**, the app runs one contest for each side. The foes'
passive Perception is compared with the party's totals, and the party's
passive Perception with the foes' totals. A sneaker still watches the other
side, because surprise is decided for each creature, so a sneaker can be
surprised too. Each side has its own outcome line.

You can change any **Surprised** box after the contest. When you press
Start combat, the travelogue records each outcome line, such as "The party
sneaks (Stealth Ayla 16, Bren 11). Goblin 1 and Goblin 2 are surprised."

### Parley

**Parley** in the setup dialog records that the party settled the encounter
without a fight. It closes the dialog, starts no fight, and writes a note
to the travelogue that names the foes. The foes stay on their tiles, but
they stand down and become neutral, so the **Encounter!** dialog does not
open again when the party next moves next to them. **Undo** makes them
hostile again. If the truce breaks later, change the disposition of each
foe back to hostile in the creature dialog.

### Attack dialog

A weapon button in the action bar opens the attack dialog.

| Field | Default | Meaning |
| --- | --- | --- |
| Defender | The card picked on the board, or the first defender | The target, shown with its AC. The foes of the attacker come first, and creatures on its own side follow under **Same side** |
| Roll | Auto (from conditions) | Auto, Normal, Advantage, or Disadvantage. A value other than Auto overrides the condition chips |
| Target cover | None | None, Half cover (+2 AC), or Three-quarters cover (+5 AC) |
| Range | Normal | For a ranged or thrown weapon. Long range takes disadvantage |
| Wield two-handed | Off | For a versatile weapon. Uses the two-handed damage dice |
| Multiattack (roll all N attacks) | On | For a creature with Multiattack whose Attack action is unspent. Rolls every swing against the same defender, one after another, and stops when the defender drops. Untick it to roll one swing at a time |
| Pack Tactics (an ally is next to the target) | Off | For a creature with Pack Tactics. Adds one advantage, which the chips can cancel |
| Sneak Attack (+Nd6) | Off | For an attacker with the feature that has not used it this turn |
| Ignore action cost | Off | Shows when the turn cannot pay for the swing. Swings anyway |
| Situational modifiers | Closed | Bonus dice (d4 to d12) and flat bonuses for the attack and the damage |

### Action, bonus action, and reaction

The Actions heading on the combat screen shows three pips: Action, Bonus
action, and Reaction. A free pip has a filled dot. A spent pip has an empty
ring, and its label is struck through. A combatant with Extra Attack also
shows how many swings are left. A button that needs a spent cost has a
muted label and a dashed edge, and its tooltip names the cost, as in
"Action spent".

| What | Cost |
| --- | --- |
| A weapon swing | The Attack action. Extra Attack banks the extra swings, so a Fighter of 5th level swings twice for one action. A creature with Multiattack banks its swings the same way |
| A cast | What the casting time of the spell names: an action, a bonus action, or a reaction. The repeat of a spell that the caster keeps open costs what the spell names for its repeat. Mordenkainen's Sword repeats for a bonus action |
| An off-hand swing | The bonus action |
| An opportunity attack | The reaction |
| A legendary action | One legendary action of the creature. The creature gets them all back when its own turn starts |
| A standard action (Dash, Disengage, Dodge, Help, Hide, Ready) | The action |
| Dash, Disengage, or Hide under **Cunning Action** | The bonus action, for a Rogue of 2nd level or higher |
| **Second Wind** | The bonus action and one use of the Second Wind pool |
| **Action Surge** | One use of the Action Surge pool. It gives the turn one more action |
| **Turn Undead** or **Preserve Life** | The action and one use of the Channel Divinity pool, spent only when the GM confirms the dialog |

The whole turn comes back when the turn of that combatant starts again. The
reaction comes back at the same time, not at the top of the round. A
combatant that the turn order steps past, because it is down or cannot act,
keeps what it spent.

The pips never block a button. Instead, the dialog refuses a swing or a
cast that the turn cannot pay for. The dialog then offers an **Ignore
action cost** box that goes ahead anyway. Use the box for a rule that the
app does not model.

Each pip is also a button. Press a free pip to mark that cost used, for
example when a bonus action goes to something the app does not track.
Press a used pip to mark it free again, for example after a spend by
mistake. The combat log records each press.

The **Standard actions** group under the spells has one button for each
standard action. A button spends the action and writes a log line, such as
"Ser Aldric takes the Dash action." The app does not move tokens or track
hidden creatures, so the GM resolves the rest. **Dodge** also puts a
Dodging chip on the combatant until the start of its next turn, and attack
rolls against a Dodging creature roll at disadvantage. The Dodging
creature rolls its Dexterity saves at advantage, both for a spell save in
the cast dialog and for a save from the character sheet. A Rogue of 2nd
level or higher also gets a **Cunning Action (bonus action)** group with
Dash, Disengage, and Hide, which spend the bonus action instead. A button
whose cost the turn already spent shows a toast and does nothing, so press
the pip first to free the cost.

A Fighter also gets a **Fighter** group with a button for each class pool
that the character has (see [Class feature pools](#class-feature-pools)).
The button title shows the uses left. **Second Wind** spends the bonus
action and one use, and the fighter regains 1d10 plus the fighter level in
HP. The log line shows the roll, such as "Ser Aldric uses Second Wind and
regains 9 HP (d10 5 + 4)." **Action Surge** costs no part of the turn.
Press it at any point in the turn for one more full action. After the
action is spent, the Action pip becomes free again. Before the action, a
"+1 action (Action Surge)" pip shows next to the Action pip, and the first
action spends that pip instead, so the Action pip stays free for the
second. An Attack action with the new action gets its Extra Attack swings
again. The app allows one surge per turn, as 5e does, even for a fighter
with two uses. A button with no use left, or a second surge in one turn,
shows a toast and spends nothing.

A Cleric of 2nd level or higher gets a **Channel Divinity** group. Each
button opens a dialog first, and a cancel keeps the use and the action.

- **Turn Undead** lists every undead in the fight, all ticked. Untick the
  ones that are out of range (30 feet) or cannot see or hear the cleric.
  Each ticked undead rolls a Wisdom save against the spell save DC of the
  cleric. An undead with the Turn Resistance box in its creature form rolls
  the save with advantage. On a failure, it gets a Turned chip for 1 minute. Damage ends
  the chip, and a Turned creature takes no reactions. It keeps its turns,
  and the GM moves it away or has it take the Dodge action. From cleric
  level 5, Destroy Undead destroys an undead of a low enough CR instead
  (CR 1/2 at level 5, 1 at 8, 2 at 11, 3 at 14, 4 at 17). An unrated
  undead is only turned.
- **Preserve Life** (Life Domain) shares out 5 times the cleric level in HP
  among the allies in the fight. The dialog has one amount per ally below
  half its max HP, and each amount stops at half the max HP. Undead and
  constructs get no row. A share-out over a limit shows a toast and
  spends nothing.

A casting time longer than a turn, such as a ten-minute ritual, is refused
in a fight in the same way, and it offers the same box.

### Two-weapon fighting

A character with two light melee weapons equipped gets an **Off-hand
(bonus action)** group in the action bar. An example is a dagger and a
shortsword. The group shows after the character takes its Attack action,
and only while the bonus action is unspent.

The group offers both weapons, and you pick the one that the second hand
swings. The off-hand swing rolls to hit like any other attack.

Its damage gets no ability bonus, which is the 5e rule. A negative ability
modifier still applies. A character with the Two-Weapon Fighting style adds
the ability modifier (see [Fighting styles](#fighting-styles)). The combat log marks the swing "off-hand".

### Reactions and opportunity attacks

A reaction happens between the turns of its owner, so its controls are on
the board card, not in the action bar. A card shows a Reaction row when all
of these conditions are true:

- The card is not the current turn.
- You can act for that combatant.
- The combatant can still act.
- Its reaction is unspent.

The row has one button per melee weapon, as in **Opportunity attack: Rapier**. It also
has one button per spell that casts as a reaction, as in **Cast Shield**.

Apart from a hit on a Shield caster or an attack on a creature with
Redirect Attack (see below), the app does not watch for a trigger. It
tracks no distance between tokens, so it cannot see a creature leave the
reach of another. You call the trigger at the table and press the button.

An opportunity attack rolls like a normal swing and keeps its ability bonus
on damage. It spends the reaction, and the log marks it "opportunity
attack".

Its defender starts as the combatant that takes the turn, because that is
who the reaction interrupts. A card that you pick on the board overrides
that. A reaction spell opens the usual cast dialog and spends the reaction
instead of the action.

### Legendary actions

A creature with **Legendary actions per round** set in the creature dialog
takes that many legendary actions each round. Its board card shows a row
named **Legendary action (N left)** when all of these conditions are true:

- The card is not the current turn.
- You can act for the creature.
- The creature can still act.
- It has a legendary action left.

The row has one button per weapon of the creature. A button opens the
attack dialog, titled "Legendary action: attack with", and the swing costs
one legendary action instead of the Attack action. It offers no Multiattack
box, because a legendary attack is one swing. The log marks each swing with
its number, as in "legendary action 2 of 3". The creature gets every
legendary action back when its own turn starts.

The 5e rule allows a legendary action only at the end of the turn of
another creature. The app does not enforce that timing, so take the action
when the turn ends and before you click **Next turn**. A legendary action
that is not an attack, such as a move, has no button, so describe it at
the table.

### Legendary resistance

A creature with **Legendary resistance per day** set can turn a failed
saving throw into a success. When such a creature fails the save of a save
spell, or its save against Turn Undead, a dialog asks "Use legendary
resistance? N left today". Click **Succeed instead** to spend one use, or
**Let it fail** to keep the failure. A success takes half damage from a
spell that halves on a save and no damage from any other, and no condition
lands. The log records each use and the uses left.

The uses come back when the party takes a long rest. The app does not ask
about the save that a weapon hit forces, such as the poison of a giant
spider. Handle that one by hand.

### Shield against a hit

When an attack roll hits a combatant whose reaction spell raises its AC,
such as Shield, a Reaction dialog opens before the damage. The dialog names
the roll and the AC, and the AC that the spell really adds. A floor such as
Barkskin can take up part of the bonus, so Shield on a combatant at AC 16
from Barkskin over a base of 12 adds only +1. The dialog opens only when the
higher AC would turn the hit into a miss, so it never opens on a natural 20,
which hits whatever the AC.

Press **Cast Shield** to cast the spell at the lowest slot that the
combatant can spend. The cast spends the reaction, and the attack then
rolls against the new AC. The log line of the attack names the spell
beside the AC. Press **Take the hit** to let the attack land as rolled.
Against Magic Missile, the spell blocks every dart. A combatant that
already has Shield takes no Magic Missile darts, and no dialog opens.

The dialog opens only in a tab that can act for the defender: the GM tab,
or the Player tab bound to that character. When a player attacks a foe
that knows Shield, the attack does not pause. Cast the foe's Shield from
its reaction control, and undo the damage by hand.

### Resisting a hit

When a weapon hit, a spell attack hit, or a save spell deals a damage type
that a combatant's reaction spell can resist, a Reaction dialog opens after
the damage roll and before the damage lands. The spell is a buff that casts
as a reaction, and its chip resists the type through **Resists** or
**Caster picks one of**. The dialog names the damage before resistance, and
for a save spell it names the save result too, such as "Mage fails the save
against Burning Hands and takes 12 damage." Press **Cast** to cast it with
that type picked, so the damage of that type is halved. Press **Take the
damage** to let the damage land as rolled. The dialog follows the same tab
rule as Shield.

A spell that damages several combatants, such as Burning Hands, opens one
dialog for each combatant that can react, in target order. When the spell
attack also offers Shield, the Shield dialog comes first. A combatant that
casts Shield has no reaction left, so it gets no second dialog. If the
fight ends while a dialog is open, your answer still counts and the damage
still lands.

### Redirect Attack

A creature with Redirect Attack, such as a goblin boss, can use its reaction
when an attack targets it. It swaps places with an ally, and the ally
becomes the target. A goblin boss can pick only another goblin within 5
feet, and its notes say so. The app tracks no positions, so before the
attack roll a **Redirect Attack** dialog lists every ally of the creature
in the fight that is not down. Pick an ally that qualifies and press
**Swap places**. Press **Keep target** or Escape to keep the creature as
the target, with its reaction unspent.

The dialog opens for a weapon attack and for an attack spell, such as Fire
Bolt, but not for a save spell. It opens only while the creature has its
reaction and can act, and only in the GM tab. When a player attacks the
creature from a Player tab, the attack does not pause. A redirect spends
the reaction, and the log names the swap. The attack roll then uses the AC
of the ally, and the damage, the resistances, and any save that the attack
forces apply to the ally. When **Multiattack** is ticked, only the first
swing can redirect, because the redirect spends the reaction.

### Cover and Sneak Attack

You decide both of these in the attack dialog. The app tracks no distance
between tokens and no line of sight, so it cannot see a wall, a barrel, or
where the rogue stands.

Half cover adds 2 to the AC of the target for that swing, and three-quarters
cover adds 5. The log prints both numbers, such as `vs AC 12 (10 half
cover +2)`.

Total cover is not offered, because a target in total cover cannot be
attacked. Cover in 5e also adds its bonus to Dexterity saving throws, and
the cast dialog does not apply that. Add it to the save bonus that you type
for a foe, or pick a roll mode for a character.

The Sneak Attack box shows when the attacker has the feature and has not
used it this turn. The label states the dice, such as `Sneak Attack
(+2d6)`. The level in the class that granted the feature sets the count.

The Sneak Attack dice are d6, they take the damage type of the weapon, and
a critical hit doubles them. The damage line of the log names them.

The 5e condition for the dice is advantage on the attack, or an ally next
to the target. The app checks neither, so the box is where you state that
the condition was met.

The app tracks the once-per-turn limit. After the dice land, the box is gone
for the rest of the turn, and it comes back on the next turn of any
combatant. So a rogue that spent the dice on its own swing can spend them
again on an opportunity attack, which is the 5e reading of once per turn. A
miss leaves the box, because Sneak Attack applies only on a hit.

### Pack Tactics, on-hit saves, Surprise Attack, and Multiattack

A creature with Pack Tactics has advantage when an ally of the creature
stands within 5 feet of the target. The app tracks no positions, so tick the
Pack Tactics box when the condition is met. The attack line of the log names
`Pack Tactics advantage`.

A creature weapon can force a save on each hit, such as the DC 11 Strength
save of a wolf bite. After the damage lands, the target rolls the save with
its own bonus and chips. The log names the total, the DC, and the result. A
target that fails gains the condition, and a target that the hit dropped to
0 HP rolls nothing. A creature immune to the condition keeps its chips, and
the log says so.

A creature with Surprise Attack adds its dice to a hit in round 1 when the
target is still surprised, which lasts until the end of the first turn of
the target. The app applies the dice without a box. They take the damage
type of the weapon, a critical hit doubles them, and the damage line of the
log names them.

A creature can have one attack of its Multiattack that rolls with
disadvantage, such as the second scimitar attack of a goblin boss. The app
counts the swings of the Attack action and adds the disadvantage to that
swing, and the attack line of the log names `Multiattack disadvantage`. An
advantage chip cancels it, and a roll mode that you pick in the dialog
replaces it.

### Damage riders on hits

Some spell chips add damage dice to hits, and the app rolls them with the
hit. Divine Favor adds 1d4 radiant to each weapon hit of the paladin who
holds it. Hunter's Mark goes on a foe, and each weapon hit of the ranger who
cast it adds 1d6 of the weapon's damage type. The mark does nothing for the
hits of anyone else. A critical hit doubles the rider dice, and the damage
line of the log names each rider, as in `, Hunter's Mark +2d6`.

When the marked creature drops to 0 HP, cast Hunter's Mark again on a later
turn and pick **Repeat (no slot)**. The repeat costs a bonus action and no
slot, and it marks the new target under the same concentration. The app does
not check that the old target is at 0 HP, so you check it. The advantage on
Wisdom checks to find the target, and the longer duration of a 3rd-level or
higher slot, stay with you.

### Combat rules

The app follows the 5e rules for the rolls in this section.

#### Attack rolls

- The roll is 1d20, plus the ability modifier of the weapon, plus the
  proficiency bonus of the attacker, against the AC of the defender.
- A character adds the proficiency bonus only when its proficiency lists
  cover the weapon, by category or by name. Otherwise, the roll takes the
  ability modifier alone, and the log says "not proficient".
- A creature is always proficient with its own weapon, like a 5e stat
  block.
- STR modifies a melee weapon, and DEX modifies a ranged weapon. A finesse
  weapon uses the higher of the two.
- A shot at long range takes disadvantage, which combines with the
  condition chips. A Roll value other than Auto still overrides it.
- A thrown melee weapon, such as a dagger, lists Melee first and the two
  throw distances after it. The throws count as ranged attacks. So a prone
  defender is harder to hit with a throw and easier to hit with a melee
  swing.
- Armor that the character is not trained for gives disadvantage on every
  attack roll.
- A natural 20 hits whatever the AC is, and every damage die rolls twice.
- A natural 1 always misses.
- On a hit, the damage dice roll with the ability modifier added.
  Proficiency never adds to damage.

#### Damage and damage defenses

The app applies the damage to the defender. An encounter or an NPC loses HP
at once, and the log records a defeat. A character or a creature loses
bonus HP first, then real HP. The combatant card shows bonus HP beside the
HP bar.

A weapon or spell hit checks the damage defenses of the defender first.

| Defense | Effect, rounded down |
| --- | --- |
| Immunity | The damage type goes to 0 |
| Resistance | The damage type is halved |
| Vulnerability | The damage type is doubled |

Each damage type in the hit changes separately. For a spell with half
damage on a successful save, the save halves first, and the defenses apply
after that.

A character resists the damage types of its race, such as fire for a
tiefling. A creature takes its three lists from the creature dialog. A
chip can add resistances too. Stoneskin resists bludgeoning, piercing, and
slashing from a nonmagical weapon, and a spell gets through it. Protection
from Energy resists the one type that the caster picks at the cast. A weapon
counts as magical when the **Magical weapon** box in its item form is
ticked, and the pact weapon of a Pact of the Blade warlock counts as
magical too. A creature takes the flag from the library weapon that arms
it. The
log names each defense that changed the damage, with the amount taken.

The Damage button on the combat screen and on the panels deals the typed
amount with no damage type. No defense applies to it.

#### Death saves

A party character at 0 HP is dying, not dead. It gets a death-save tracker
on the combat screen and on its sheet, and the Unconscious chip.

- The save is 1d20 against DC 10, with no ability modifier and no
  proficiency. A Bless chip still adds its die.
- Three successes stabilize the character. It stays at 0 HP and
  unconscious, and it rolls no more saves. The Stabilize button does the
  same thing without a roll.
- Three failures kill the character. The app says so and changes nothing
  else, so you decide what happens next.
- A natural 20 wakes the character at 1 HP. A natural 1 counts as two
  failures.
- Any damage at 0 HP is an automatic failure, with no roll. A critical hit
  counts as two failures. Damage on a stable character starts the saves
  again.
- If the damage left over past 0 HP is at least the HP maximum, the
  character dies at once. A 12 HP character hit for 24 dies, and so does a
  character at 0 HP hit for 12. Bonus HP absorbs the hit first.
- The hit that drops the character to 0 HP costs no failure.
- Any healing above 0 HP clears the tracker of a dying or stable character.
  Healing from the combat screen, from the HP stepper of the sheet, from a
  spell, and from a rest all count.
- A dead character regains no HP. A heal or a rest has no effect on it, and
  the combat log says so.
- Only a spell that raises the dead brings a dead character back. Revivify
  and Raise Dead are the built-in ones. Each clears the tracker and heals
  the character to 1 HP. Neither has an effect on a character that is not dead, a dying one
  included. In a custom spell, the **Raises the dead** box of a heal gives
  the same rule.
- Spare the Dying stabilizes a dying character, the same as the
  **Stabilize** control. It has no effect on a character that is not dying,
  or on a creature. In a custom spell, the **Stabilizes the dying** box of a
  heal gives the same rule.
- A healing spell has no effect on a creature at 0 HP, because a creature
  rolls no death saves. Revivify and Raise Dead bring a creature at 0 HP
  back to 1 HP. The heal control of the combat screen still heals a creature at 0 HP,
  so you can bring back an NPC that was only knocked out.
- The roll is a button, not an automatic step, so nobody rolls for the
  player when the turn advances.
- In a fight, a dying character keeps its place in the turn order. When its
  turn starts, the log and a toast say "Mirelle is dying. Roll a death
  save." The **Roll death save** button shows only on that turn, and it
  goes away after the roll, so the character rolls once per turn. A stable or dead character loses its
  turns.
- The GM sees **Stabilize** on any turn, because an ally stabilizes a
  friend on the ally's own turn.
- A dying character has no action bar, because it cannot act.

An encounter and an NPC have no death saves. Both are defeated at 0 HP.

#### Initiative

Initiative uses the DEX modifier, which is `floor((DEX - 10) / 2)`. The
default initiative value is 10 plus the modifier. On a tie, the combatant
with the higher DEX modifier goes first, and then the name decides.

Initiative is a Dexterity check, and it rolls as one.

- A condition chip that affects ability checks affects initiative. So a
  poisoned or frightened combatant rolls two d20s and keeps the lower one.
- Armor that the character is not trained for does the same.
- Exhaustion takes 2 off the total for each level.

The log line says what happened to each roll, for example: `Initiative
rolled: Ser Aldric 17, Mirelle 6 (at disadvantage (dropped 15), Poisoned
disadvantage).` Every value stays editable until you press Start combat.

A creature that a spell summons into a running fight rolls a plain d20 plus
its DEX modifier, with no condition or armor effect. You can edit the value
afterward.

#### Armor class

| Source | Effect on AC |
| --- | --- |
| Body armor | Its base AC replaces the unarmored baseline |
| Light armor | Adds the full DEX modifier |
| Medium armor | Adds the DEX modifier, at most +2 |
| Heavy armor | Adds no DEX modifier |
| Shield | Its own flat bonus, which is +2 by default |
| Other equipped items | Their own flat AC bonus |
| No body armor | Base AC (normally 10) plus the full DEX modifier |
| Unarmored Barbarian | 10 plus DEX plus CON, if that is higher than the line above |
| Unarmored Monk | 10 plus DEX plus WIS, if that is higher than the line above |

A Barbarian keeps its unarmored defense while it carries a shield. A Monk
loses it, but the shield still adds its bonus. Both lose the formula when
they put on body armor.

Body armor has two more 5e traits.

| Trait | Effect |
| --- | --- |
| Stealth | The wearer has disadvantage on every Stealth check. The Stealth row on the sheet shows "dis" |
| Min STR | If the Strength of the wearer is lower, the wearer loses 10 feet of walking speed. The speed badge beside AC names the armor. The Strength check includes what equipped items add |

Both traits come with the armor presets. Armor already in a saved campaign
has neither trait until you pick its preset again or set the fields by
hand.

#### Armor proficiency

A character that wears armor its proficiency lists do not cover takes these
penalties. A shield counts as its own entry in the armor list.

- Every STR and DEX save or check from the sheet rolls at disadvantage. The
  log says "not proficient" and names the armor.
- Every weapon attack rolls at disadvantage, because every attack uses STR
  or DEX.
- The character cannot cast a spell. The refusal names the armor and spends
  nothing. The cast dialog offers an **Ignore armor** box, which casts
  anyway.
- A spell that forces a STR or DEX save makes the wearer roll that save at
  disadvantage.

These penalties combine with the condition chips, so an advantage chip
cancels them. The AC of the armor still applies. A creature has no
proficiency lists and never takes these penalties.

#### Conditions

Eleven condition names have rules. The app applies them to every roll that
they affect: a weapon attack, a spell attack, a spell save, and a save or a
check rolled from the character sheet.

| Condition | What it does |
| --- | --- |
| Blinded | Attacks at disadvantage. Attacks against it have advantage |
| Frightened | Attacks and ability checks at disadvantage |
| Incapacitated | Loses its turn |
| Invisible | Attacks with advantage. Attacks against it have disadvantage |
| Paralyzed | Loses its turn. Attacks against it have advantage, and a melee hit is a critical hit. Fails STR and DEX saves at once |
| Petrified | Loses its turn. Attacks against it have advantage. Fails STR and DEX saves at once |
| Poisoned | Attacks and ability checks at disadvantage |
| Prone | Attacks at disadvantage. Melee attacks against it have advantage, and ranged attacks against it have disadvantage |
| Restrained | Attacks at disadvantage. Attacks against it have advantage. DEX saves at disadvantage |
| Stunned | Loses its turn. Attacks against it have advantage. Fails STR and DEX saves at once |
| Unconscious | Loses its turn. Attacks against it have advantage, and a melee hit is a critical hit. Fails STR and DEX saves at once |

A chip that you type matches a row when it spells one of the names above.
Case does not matter. Any other chip has no rule.

Charmed, Deafened, and Grappled have no rule. They need a relationship
between two combatants, or movement, and the app has neither. Decide their
effects at the table.

Timed conditions count down at the start of each round and end on their
own.

Some spell chips end at a turn boundary instead of a round count, such as
the Blinded of Sunbeam, which ends at the start of the caster's next turn.
Such a chip shows "next turn". Some chips deal damage at the end of each
turn of their holder, such as the chip of Acid Arrow. Point at a chip to
read what it does and when it ends. A dying character still takes this
damage, and each hit costs it a failed death save. When the fight ends,
the damage that such a chip still owes lands at once. Outside a fight the
app deals no later-turn damage, so apply it by hand.

A chip that deals damage on later turns, or that the holder retries a save
against, stays apart from a chip of the same name from another caster or
spell. A combatant can therefore show two Acid Arrow chips, and each one
deals its own damage. Point at such a chip to read which caster and spell
wrote it. The remove button of a chip removes only that chip, so the other
cast keeps its chip. For other chips, a combatant keeps one chip of each name. A longer
chip from another cast stays, and of two casts of one spell with different
strength, such as Aid at 2nd and at 3rd level, the stronger one stays.

A combatant that loses its turn keeps its place in the initiative order.
**Next turn** steps past it without a message. A save that fails at once
never reaches the dice, and the log names the chip that failed it.

A spell such as Hold Person lets its target repeat the save at the end of
each of its turns. A target that loses its turn still has that turn end, so
Next turn rolls the save as it steps past the target. A success ends the
condition, but the target still loses the turn that it was held for.

NPCs have condition chips too. The chips sit on the row of the NPC in the
NPCs panel of the Story tab, and on its card in the fight. The NPC list of
the Build rail is for authoring and shows no chips.

#### Advantage and disadvantage

Advantage and disadvantage from any number of sources combine by the 5e
rule. If both are present, the roll is normal. Otherwise, the one kind that
is present applies.

Chips on both sides of an attack count. The log names every chip that
affected the roll, including the ones that cancelled.

A roll that no chip affects uses the d20 mode of the dice tray. A roll that
a chip affects does not change the d20 mode. The mode changes only when you
click it.

#### Exhaustion

Exhaustion is a level from 0 to 6, not a chip, and the app stores it as its
own number.

| Effect per level | Where it applies |
| --- | --- |
| -2 on every d20 test | The saving throws and skills on the sheet, passive Perception, weapon and spell attacks, initiative, and death saves |
| -5 feet of walking speed | The speed badge on the sheet |

The log names the level and the number that it took off. A spell save DC
is not a d20 test, so exhaustion does not lower it.

The saving throw of a creature against a spell is a number that you type
into the cast dialog. The app does not apply exhaustion to it, so subtract
the penalty as you type it.

A row of six numbered pips sets the level, and the pips up to the current
level are filled. The row is on the character sheet under
the chips, and on each creature row in the Encounters and NPCs panels. The
top line of the character sheet also names the level, beside AC and speed.

| Action | Result |
| --- | --- |
| Click a pip | Sets the level to that pip |
| Click the pip of the current level | Takes one level off |
| Long rest | Takes one level off each character. A creature does not rest, so it keeps its level until you change it |

Only a GM can click the pips, because the sixth pip kills. A player on a
bound tab sees the row but cannot change it.

The sixth level kills.

- A character gets three failed death saves and goes unconscious. The log
  says that the character died of exhaustion. The HP number stays where it
  was, because exhaustion kills without damage.
- A creature goes to 0 HP and drops out of the fight, the same as a killing
  blow.
- A heal that brings a character or a creature back also takes the level
  from 6 down to 5.

## Spellcasting

Spells come from the Spells tab of the library. A character learns and
prepares them in the Spellbook tab, and casts them from the action bar in
a fight or from the sheet outside one.

### Spellbook tab

The Spellbook tab of the character detail card lists every spell that the
class of the character can learn, grouped by spell level. It also lists
any spell that the character knows from another source. Each spell is a
card with its name and one line with the school, the casting time, and the
range. The cards fill one column in the sidebar and several in the full
sheet.

| Element | Meaning |
| --- | --- |
| Heading | The caster classes, the prepared count against the limit (for a class that prepares), and the cantrip count against the limit |
| Level heading | The spell level, and the free slots of that level, as "3 of 4 slots". A pact slot casts every spell up to its level, so free pact slots show under that level and each lower one, as "1 of 2 pact slots" |
| Known badge | The character knows the spell |
| Prepared badge | The character prepared the spell |
| Spell card | Opens the spell detail, with Learn, Prepare, Unprepare, and Forget |

A multiclass caster picks the class that a new spell records under. The
list offers the caster classes whose spell list has the spell. If no class
has it, the list offers every caster class. A spectator sees the details
but no actions.

### Cast dialog

| Field | Shows for | Meaning |
| --- | --- | --- |
| Cast at level | A leveled spell | The slot level to spend. Only levels with an unspent slot show |
| Cast as ritual (10 minutes longer) | A ritual spell, for a Bard, Cleric, Druid, or Wizard | Casts at the spell level and spends no slot. The slot picker hides while the box is ticked |
| Target or Recipient | A spell with one target | The creature that the spell affects. The caption names the range of the spell, such as "Recipient (range 60 feet)" or "Target (touch)". The app does not check the distance |
| Targets | A spell with more than one target | Up to the cap of the spell. An upcast spell such as Hold Person reaches one more creature per level. The caption names the range too |
| Projectile allocation | A spell with several projectiles | How many projectiles go to each target. The total follows the slot level |
| Resist | A buff with a list of damage types, such as Protection from Energy | The damage type that the chip resists |
| Attack roll | An attack spell, except one whose projectiles hit automatically, such as Magic Missile | Normal, Advantage, or Disadvantage |
| Save DC on a hit | An attack spell whose hit brings a save, such as Ray of Sickness | The DC of that save. Starts at the spell save DC of the caster |
| Save DC | A save spell that rolls a save. Sleep, Color Spray, and Power Word Kill roll none | Starts at 8 plus the proficiency bonus plus the spell ability modifier |
| Save roll | A save spell that rolls a save | Normal, Advantage, or Disadvantage |
| Ignore components | A spell with a material component | Casts without a check of the inventory. The label adds "(not carried)" when the character lacks the component |
| Ignore armor | A caster in untrained armor | Casts anyway |
| Ignore action cost | A turn that already spent the cost | Casts anyway |
| Ignore the bonus action spell rule | A cast on the caster's own turn that the rule blocks | Casts anyway. The label names the reason |

If you press **Cast** with no target or recipient ticked, the dialog stays
open and shows "Pick at least one target." No slot is spent. A utility spell
or a summons needs no target.

The spell attack bonus is the proficiency bonus plus the spell ability
modifier, minus any exhaustion penalty.

The app follows the bonus action spell rule on the caster's own turn. After
a spell cast with the bonus action, the caster can cast only a cantrip with
a casting time of one action for the rest of the turn. A spell of 1st level
or higher, a reaction spell, and a spell cast with the second action of
Action Surge are all blocked. After a spell of 1st level or higher cast with
the action, a bonus action spell is blocked. An action cantrip blocks
nothing. The rule does not apply on another combatant's turn, so Shield
stays open after a bonus action spell. A repeat of a spell that an earlier
turn paid for is not a new cast, and the rule skips it. Giving back the
bonus action on the action bar also clears the spell that it paid for.

A hit of Ray of Sickness also rolls the CON save of the target. The target
list shows that save bonus beside the AC. A hit of Vampiric Touch gives the
caster hit points equal to half the damage the target took, after its
resistances, and the log records the amount.

Sleep and Color Spray roll a pool of hit points in place of a save, and
Power Word Kill compares the current HP of the target with its limit of
100. The dialog lists the targets by name only, because none of them rolls
a save. The app reads the HP of each target when you click Cast, not when
the dialog opens. See [Hit-point rules](spells-missing.md#hit-point-rules).

A spell can have creature-type rules, which the spell form in the Library
sets under **No effect on**, **Only affects**, **No effect if immune to**,
**Save at disadvantage**, and **Maximum damage**. The app applies them to
each target by its creature type. Hold Person and Charm Person affect only
humanoids, and a creature with no type still counts, so you decide for it. Sleep passes over undead and creatures immune to
Charmed, and the log names the reason. The healing spells have no effect on
undead or constructs. Blight skips undead and constructs, and a plant saves
at disadvantage and takes the maximum damage. Sunburst and Sunbeam give
undead and oozes disadvantage on the save. See
[Creature types](spells-missing.md#creature-types).

A Chill Touch hit stops the target from regaining hit points until the start
of the next turn of the caster, and a heal on it logs that it has no effect.
An undead target also attacks the caster at disadvantage until the end of the
next turn of the caster. The spell form sets this second chip under **Extra
chip on some creature types**, which shows once **A hit imposes a
condition** is ticked. The group names the creature types, the chip name, the
turn that ends it, and its mods, which include **Stops healing** and
**Attacks the caster at disadvantage**. The extra chip has no save.

A buff with a range of Self, such as Shield, offers only the caster as its
target. The chip of Shield, Shield of Faith, Mage Armor, or Barkskin changes
the AC that the sheet, the combatant cards, and every later attack read. On
a creature, Mage Armor replaces the authored AC when 13 plus DEX is higher,
and a creature has no shield field, so a shield that is part of the
authored AC does not add to the Mage Armor AC. See
[Armor class](spells-missing.md#armor-class).

Aid raises the HP maximum and current HP of its targets while its chip lasts.
False Life and Heroism grant temporary hit points, and the log records each
grant. Heroism grants them at the start of each turn of its target, and it
ends and blocks Frightened. The temporary hit points of a spell end with its
chip. See [Hit points and immunity](spells-missing.md#hit-points-and-immunity).

Faerie Fire gives advantage on attack rolls against each creature that
fails its save, and Blur gives disadvantage on attack rolls against the
caster. Protection from Evil and Good gives disadvantage only to an attacker
whose creature type is on its list, so a creature with no type set gets no
disadvantage. Greater Invisibility leaves an Invisible chip. A hit of
Guiding Bolt leaves a chip that gives advantage on the next attack roll
against the target, and a failed save against Vicious Mockery leaves a chip
that gives disadvantage on the next attack roll of the target. Each of
these two chips ends on that roll, hit or miss, and the log notes it. A
weapon attack and a spell attack both read all of these chips, and the log
line of a weapon attack names each chip that slanted it.

Haste gives its target +2 AC, advantage on DEX saves, and one more weapon
swing on each of its turns. The combat card counts the extra swing in the
swings left. When Haste ends by any path, including a chip that you remove
by hand, the target gets a Lethargic chip, and the log notes it. **Next
turn** steps past a lethargic combatant on its next turn, and the chip ends
at the end of that turn. The target keeps its concentration and its
reactions. See [Speed of action](spells-missing.md#speed-of-action).

A spell that the caster still keeps open from an earlier turn, such as Spiritual
Weapon, casts as a repeat. The dialog is titled **Repeat** and has no slot
picker and no ritual box. A repeat spends no slot and skips the component
and armor checks, because the first cast passed them. It still costs the
action or bonus action that the spell names.

The app refuses a cast for these reasons, in this order, and spends nothing
on a refusal:

1. A material component is missing. A component with a cost, or one that
   the spell destroys, must be the item itself. Any other component is
   covered by a component pouch or a focus.
2. The caster wears armor that it is not trained for.
3. The turn cannot pay the action cost, or the casting time is longer than
   one turn.

Only a character has an inventory, so a creature is never asked for a
component. A cast that consumes its component removes the item from the
inventory.

### Concentration

A caster, character or creature, keeps at most one concentration spell. A
new concentration spell ends the old one.

| Event | Result |
| --- | --- |
| Damage | A CON save against DC 10 or half the damage, whichever is higher. A failure ends the spell |
| A condition that loses the turn | Ends the spell |
| 0 HP for a creature | Ends the spell |
| The duration runs out | Ends the spell |
| Drop control | Ends the spell |

When a concentration spell ends, the conditions that it put on other
creatures end, and the creatures that it summoned leave.

### Summons

A summoning spell puts creatures from a library template on the tile of
the party, at full health. The built-in example is Conjure Animals, which
brings eight Wolf creatures, sixteen with a 5th-level slot, twenty-four
with a 7th-level slot, and thirty-two with a 9th-level slot. If the library has no template with the name
that the spell gives, the cast dialog refuses the spell.

The side that a summon fights on is the disposition of its template. A
hostile template fights the party. To summon an ally, write a friendly
template in the library.

If a fight is running, the summons join the initiative order. See
[Initiative](#initiative). The end of the spell removes the creatures
that it brought.

## Characters

### Party roster

The Party card lists the characters. The selected character sets what the
character detail card shows.

| Control | Who | What it does |
| --- | --- | --- |
| Row name | Everyone | Selects the character |
| Edit HP and AC (pencil) | GM | Opens the HP and AC dialog |
| Open player tab (arrow out of a box) | GM | Opens a Player tab bound to that character in a new browser tab |
| Place on map | GM, while the party is split | Moves that character. See [Party splitting](#party-splitting) |
| More actions (three dots) | GM | Opens a menu with **Grant XP**, which grants XP to that character alone (the default is 100), and **Delete**, which deletes the character after a confirm |
| New character | GM | Opens character creation |
| Award Party XP | GM | Grants XP to every character: the same amount to each, or a total split evenly and rounded down. The default is 100 per character |
| Spectator tab | GM | Opens a Player tab bound to no character |
| Allow splitting the party | GM | See [Party splitting](#party-splitting) |
| Playing as | Player tab | Binds the tab to a character. Locked in a tab opened from a player tab link, until the tab loses its character |

Open player tab is an ordinary link, so a middle-click or the "Open in new
tab" menu of the browser also works on it. Spectator tab is a button. It
always opens a new browser tab, and it has no link menu.

| HP and AC field | Meaning |
| --- | --- |
| Max HP | Overrides the calculated maximum, and lowers current HP to fit |
| Bonus HP (temporary) | Temporary points on top of the real HP. Damage drains them first, and healing never refills them. A typed amount stays after the spell that granted the old amount ends |
| Unarmored base AC | The unarmored baseline, normally 10 |

### Character summary card

The Sheet tab of the sidebar shows a summary card of the selected
character. It has what a GM reads during play:

- the name, the race, the HP bar, and the **Damage** and **Heal** controls
- the level line with AC, initiative, speed, passive Perception, the
  proficiency bonus, and XP
- the spell slot lines
- the level-up banner
- **Checks and saves**, a grid with a button for each plain ability check
  and each saving throw. A click rolls it through the dice tray. A solid dot
  marks a proficient save
- the counters of limited resources, such as Second Wind
- the Conditions block, with exhaustion
- the 18 skills, one line each with the bonus. A click rolls the skill

**Open full sheet** at the top of the card opens everything else. A Player
tab bound to a character shows the same card and the same button.

### Full sheet

**Open full sheet** at the top of the summary card opens the sheet the width
of the page, in the way the combat screen takes the page. The party row
menu (the three-dot button) has **Open full sheet** too, and the C key
opens and closes it in Play mode. With an empty party, the button hides
and the C key does nothing. The map, the party dock, and the sidebar hide
while it is open. The bar along the top has **Back to the map** and one
tab per party member. Left and Right move between the tabs, and Home and End
go to the first and last. **Back to the map** or Escape closes it and puts
focus back on the control that opened it. In a text field, such as the
inventory search, Escape clears the field and leaves the sheet open. A
switch to Build mode or a fight shows that mode, and the full sheet comes
back on the return to Play. At phone width the view bar at the bottom of
the screen hides while the full sheet is open.

The full sheet has four tabs.

| Tab | Contents |
| --- | --- |
| Character | The whole character sheet. On a page about 1,500 pixels wide or more, the skill list takes a third column beside the two section columns. See [Sheet contents](#sheet-contents) |
| Equipment | The nine equipment slots |
| Inventory | The item list |
| Spellbook | The spells that the character can learn, knows, and prepared. See [Spellbook tab](#spellbook-tab) |

### Sheet contents

The top of the sheet shows the name, the race, and a tall HP bar the width
of the card, with the current and maximum HP above it. Under the bar, the
GM gets a **Damage** button, an amount field, and a **Heal** button. The
amount field sets how many HP each click moves. It starts at 1. The level
line gives AC, initiative (**Init**), speed, passive Perception (**PP**),
the proficiency bonus (**Prof**), and XP. Init includes the exhaustion
penalty, as the initiative roll of a fight does.

A caster gets one line per spell level, such as "1st", then the pips, then
the free count, such as "3 of 4". A filled pip is a free slot. A spent pip is
a hollow ring, dimmed and struck through. A click on a pip spends or restores
a slot. Each line names its count for a screen reader and in its tooltip,
such as "Level 1 slots: 3 of 4 free".

While a character has a level to assign, an ability score improvement, or a
class feature choice left, a banner at the top of the sheet says so, such as
"Ready to level up: 1 level to assign." The GM's **Level up** button opens
the full sheet. For a pending level, it then opens **Assign a level**. For
an improvement or a feature choice, it moves focus to the **+2 ability** or
**Choose** button of the Progression block.
A Player tab shows the banner with no button. The party row of the character
shows a **Level up** mark at the same time.

The Character tab of the full sheet adds these items to the summary:

- the ability scores with their modifiers, which replace the quick-roll grid
- the six saving throws, with the bonus of each
- **Add pool** and the edit buttons of custom resource pools
- the Progression block, with the hit-dice pool
- the Features section, with one card for each class feature, race trait,
  and feat. A class feature with a claimed choice has a **Change** button
  for the GM. Cancel in its dialog keeps the current choice
- the castable spells

A dot in front of each save or skill shows how trained the character is.

| Dot | Training |
| --- | --- |
| Hollow | Untrained |
| Solid | Proficient |
| Ringed | Expertise, which doubles the proficiency bonus |

A key under passive Perception shows the solid and the ringed dot.

Passive Perception is 10 plus the Perception bonus. Compare it against a
hidden thing when nobody says they are looking.

A click on a save or a skill rolls it with a d20 and the whole bonus. The
roll goes through the dice tray, but the tray stays closed, and the dice and
the modifier that you set up in the tray stay as they were. The log shows
the parts of the number: the ability modifier, the proficiency or expertise,
and any condition chip that adds to the roll.

Guidance and Resistance add to one roll only. The first check or save that
they change removes their chip. In the Library, the spell form marks this
kind of spell with **One roll only**.

The DC is the **DC** field of the dice tray. Type a DC there once,
and each save or skill that you roll from the sheet reports success or
failure against it, in the toast and in the log, as in "against DC 13 from
the dice tray". The field keeps what you typed until you clear it. An attack
or a death save compares against its own target and leaves the field alone.
With the field blank,
nothing judges the roll, so compare the total against the DC that you have
in mind. The d20 mode of the dice tray applies, and the log names the die
that it dropped.

The Conditions block shows the chips and the held spell with its Drop
control. While the character is at 0 HP, it also shows the death-save
tracker with its Roll and Stabilize controls. The tracker shows the same
pips and words as the combat screen.

Expertise doubles the proficiency bonus for a skill. The Expertise features
of the Rogue and the Bard grant it. When such a feature unlocks, a prompt
offers the proficient skills.

The picks show in the class features list with a Change button. An
unclaimed grant waits in the Progression block as a pending feature choice
with a Choose button. The **Set expertise** button is a manual grant with
no maximum, for a subclass or homebrew feature that the class catalog does
not model. The button shows to the GM for any character with at least
one skill proficiency, and it offers only the proficient skills. The line
"No expertise chosen" shows only for a character with a class feature or a
feat that grants expertise.

### Creation and progression

Creation picks a class, a race, and a background, and offers the skill
choices of the class. From these three choices, the sheet assembles the
proficiencies: saving throws, skills, weapons, armor, tools, and languages.
Every list stays editable afterward.

The class sets the hit die, and the class with its subclass sets the caster
type. Max HP comes from the hit die plus the CON modifier per level.

Spell slots follow the 5e table. A multiclass character combines its
casting classes on the combined-caster-level table.

A character with no class still works. Its HP then follows a flat growth
curve, and it gains no proficiencies.

The total XP of a character follows the SRD table.

| Level | XP |
| --- | --- |
| 2 | 300 |
| 3 | 900 |
| 4 | 2,700 |
| 5 | 6,500 |
| 11 | 85,000 |
| 20 | 355,000 |

The sheet header shows the total against the start of the next level. A
character made at a higher level starts at the XP where that level begins.

Enough XP does not level a character with a class on its own. Each earned
level waits as a pending level. The GM assigns it to a class, either the
current class or a new one.

The proficiency bonus follows the assigned class levels. So a pending level
does not raise the bonus until the GM assigns it.

An assignment does these things:

- It grows HP by the hit die of that class.
- It adds a hit die.
- It advances the spell slots. A new spell level arrives full, and a slot
  already spent stays spent.
- On an ability score improvement level, it leaves a pending choice: +2
  across one or two abilities, up to 20, or a feat by name.

Both choices can be undone from the same block. The feat list shows a
built-in feat that the character does not qualify for as disabled, and it
names the prerequisite. An example is Grappler for a STR 8 Wizard. The
prerequisite of a feat that you wrote in the library is display text only,
so you enforce it.

A class feature with choices, such as the Expertise of the Rogue, prompts
when its level is assigned. A choice with only one possible pick applies
with no prompt. A cancel keeps the grant pending, and the Choose button in
the Progression block offers it again.

The hit-dice pool can be spent. The Spend button in the Progression block
spends one die outside a rest, and it asks first, so a click in the middle
of a fight does not heal by mistake.

| Rest | Hit dice |
| --- | --- |
| Short rest | The Short rest dialog asks how many dice each hurt character spends. Each die heals the roll plus the CON modifier, and spending stops at full HP |
| Long rest | Restores half of the total hit dice, at least one, largest dice first. For example, Fighter 3 / Wizard 3 with every die spent gets three dice back |

### Fighting styles

The Fighting Style feature of the Fighter (level 1), the Paladin (level 2),
and the Ranger (level 2) waits in the Progression block as a pending feature
choice. Click **Choose** and pick one style. The class features list shows
the pick with a Change button. A character with the feature from two classes
takes a different style each time.

| Style | Classes | Effect in the app |
| --- | --- | --- |
| Archery | Fighter, Ranger | +2 to the attack roll of a ranged weapon |
| Defense | Fighter, Paladin, Ranger | +1 AC while the character wears body armor |
| Dueling | Fighter, Paladin, Ranger | +2 damage with a melee weapon in one hand, when no other weapon is in hand |
| Great Weapon Fighting | Fighter, Paladin | Each 1 or 2 on a damage die rolls again once, for a two-handed weapon or a versatile weapon swung in two hands |
| Protection | Fighter, Paladin | Text only. The GM applies the disadvantage by hand |
| Two-Weapon Fighting | Fighter, Ranger | The off-hand attack adds the ability modifier to damage |

The attack log line names Archery, and the hit line names Dueling and Great
Weapon Fighting.

### Disciple of Life

A Life Domain cleric adds 2 + the spell slot level to each target of a
healing spell of 1st level or higher, such as Cure Wounds or Healing Word.
An upcast uses the higher slot. The heal line in the log ends in
", Disciple of Life +N". A spell that rolls no healing dice (Lesser Restoration), a
revive, and a stabilize get no bonus. The class features list on the sheet
shows the feature from cleric level 1.

### Class feature pools


The app gives each character a resource pool for every class feature that
has a count of uses. The class levels and the ability scores set the size of
each pool, so you do not type it in. A new level adds its uses unspent, and a
class that the character no longer has takes its pool away.

| Pool | Class and level | Uses | Refills on |
| --- | --- | --- | --- |
| Second Wind | Fighter 1 | 1 | Short rest |
| Action Surge | Fighter 2 | 1, or 2 from level 17 | Short rest |
| Rage | Barbarian 1 | 2, then 3 at level 3, 4 at 6, 5 at 12, 6 at 17. No pool at 20, where rage has no limit | Long rest |
| Bardic Inspiration | Bard 1 | The CHA modifier, at least 1 | Long rest, or short rest from level 5 |
| Channel Divinity | Cleric 2, Paladin 3 | Cleric: 1, then 2 at level 6, 3 at 18. Paladin: 1. A character with both classes gets the larger count | Short rest |
| Divine Sense | Paladin 1 | 1 plus the CHA modifier | Long rest |
| Lay on Hands | Paladin 1 | 5 hit points for each paladin level | Long rest |
| Ki points | Monk 2 | The monk level | Short rest |
| Wild Shape | Druid 2 | 2. No pool at 20, where Wild Shape has no limit | Short rest |
| Sorcery points | Sorcerer 2 | The sorcerer level | Long rest. From level 20, a short rest also restores 4 points (Sorcerous Restoration) |
| Arcane Recovery | Wizard 1 | 1 | Long rest |

### Custom pools

The GM can add a pool for any count of uses that the class list does not
give, such as the charges of a wand. Click **Add pool** below the resource
list of the sheet, and set the name, the number of uses, and **Refills on**.
A **Long rest** pool refills on a long rest, a **Short rest** pool refills on
either rest, and a **No rest** pool refills only when the GM restores it with
the plus button. Each row shows its rest in brackets. The pencil button edits
a custom pool, and the bin button removes it. A class feature pool has no
edit button, because the class levels set its size and its rest.

### Subclasses


A class can take a subclass from its subclass level.

| Subclass level | Classes |
| --- | --- |
| 1 | Cleric, Sorcerer, Warlock |
| 2 | Druid, Wizard |
| 3 | Barbarian, Bard, Fighter, Monk, Paladin, Ranger, Rogue |

The Progression block shows a Choose button for each class at that level,
and a Change button after the pick. The assignment of the subclass level
also asks for the pick. Only the GM can set a subclass.

The list offers the SRD subclass of each class. The Fighter also offers the
Eldritch Knight, and the Rogue also offers the Arcane Trickster.

| List item | Effect |
| --- | --- |
| A listed subclass | Stores that subclass and applies its rules |
| Other… | Stores any typed name. A typed name that matches a listed subclass stores as the listed name. A name that is not on the list has no rules effect |
| None | Clears the subclass |

The Eldritch Knight and the Arcane Trickster cast spells. Each one learns
from the wizard list with INT, as a known caster with no rituals. The slots
follow the third-caster table below, and a spell can be no higher than the
top slot level.

| Class level | Slots | Top spell level |
| --- | --- | --- |
| 3 | 2 × 1st | 1st |
| 4 to 6 | 3 × 1st | 1st |
| 7 to 9 | 4 × 1st, 2 × 2nd | 2nd |
| 10 to 12 | 4 × 1st, 3 × 2nd | 2nd |
| 13 to 15 | 4 × 1st, 3 × 2nd, 2 × 3rd | 3rd |
| 16 to 18 | 4 × 1st, 3 × 2nd, 3 × 3rd | 3rd |
| 19 to 20 | 4 × 1st, 3 × 2nd, 3 × 3rd, 1 × 4th | 4th |

| Subclass | Cantrips |
| --- | --- |
| Eldritch Knight | 2, and 3 from level 10 |
| Arcane Trickster | 3, and 4 from level 10 |

In a multiclass, each of these subclasses adds a third of its class level
to the combined caster level. A class with no slots yet at its own level
does not join the combined table. So a Fighter 4 (Eldritch Knight) /
Paladin 1 keeps the Eldritch Knight slots.

A change away from a casting subclass removes its slots, and it removes the
spells that the character learned under that class. A later change back
gives full slots. While a class has a subclass on its subclass level, that
level cannot move to a new class.

The Spells block of the character sheet warns when a spell list breaks a
subclass rule. The warning does not block the list, so a GM can allow it.

- The spell schools of each subclass. The Eldritch Knight uses abjuration
  and evocation, and the Arcane Trickster uses enchantment and illusion.
  The spells learned at class levels 3, 8, 14, and 20 can come from any
  school.
- The number of leveled spells that each subclass knows: 3 at class level
  3, 4 at level 4, and 13 at level 20. Only the spells learned under the
  subclass count, so the wizard spells of a Fighter (Eldritch Knight) /
  Wizard do not.
- Mage Hand as one of the Arcane Trickster cantrips.

### Eldritch invocations

A warlock picks its eldritch invocations and its pact boon when it gains
a warlock level in the Progression block. Only the GM can pick either one.
The level-up asks for the pact boon at warlock level 3, and for the new
invocations at each level that raises the count. It then offers one
optional swap of a known invocation for another that qualifies. A pick
that the GM cancels stays pending, and the **Warlock choices pending** row
asks for it again, with no swap. The Invocations row shows how many
invocations the warlock has and how many its level allows. The **GM edit**
buttons set the boon and the invocations freely, with no swap limit, and
list only the invocations that the warlock qualifies for. An invocation qualifies when the warlock level is high enough, the
warlock knows the cantrip that it names, and the warlock has the pact boon
that it names. The Pact boon row appears from warlock level 3. The
Invocation rules list under the rows shows what each picked invocation does.

| Warlock level | Invocations |
| --- | --- |
| 2 to 4 | 2 |
| 5 to 6 | 3 |
| 7 to 8 | 4 |
| 9 to 11 | 5 |
| 12 to 14 | 6 |
| 15 to 17 | 7 |
| 18 to 20 | 8 |

| Invocation | Effect in the app |
| --- | --- |
| Agonizing Blast | Adds the CHA modifier to the damage of each Eldritch Blast beam that hits |
| Eldritch Spear | Sets the range of Eldritch Blast to 300 feet |
| Repelling Blast | Adds a log line for each creature that an Eldritch Blast hits, with how far it can be pushed. The push has no size limit |
| An at-will spell, such as Armor of Shadows | The spell casts with no slot, at its own level. An invocation that limits the spell to the warlock offers only the warlock as a target, and one with no material drops the component. If the spellbook also has the spell, the app first asks **How to cast**: at will, or with a spell slot. The slot cast works as a usual cast, so it can target others and use a higher slot |
| A once-per-rest spell, such as Thief of Five Fates | The spell casts with a pact slot, and then it refuses until a long rest. The slot picker offers only the pact slot level, and the cast refuses when no pact slot is left. If the spellbook also has the spell, the cast uses the spellbook and keeps the invocation for later |
| Beguiling Influence | Adds the Deception and Persuasion skills. A change that removes the invocation removes the skills, except a skill that another grant also gives. A warlock that drops below 2nd level loses the skills, and gets them back at 2nd level |
| Book of Ancient Secrets | Casts the rituals in the Book of Shadows as rituals. See [Pact of the Tome](#pact-of-the-tome) |
| Thirsting Blade | One Attack action buys two swings with the marked pact weapon. A first swing with another weapon ends the Attack action, and the second swing refuses any weapon but the pact weapon. It does not add to Extra Attack from another class, so a fighter 5 / warlock 5 still swings twice with any weapon |
| Lifedrinker | Each hit with the pact weapon adds necrotic damage equal to the CHA modifier, at least 1. A critical hit does not double it. The damage line of the log names it, as in `, Lifedrinker +4 necrotic` |
| Any other invocation, such as Devil's Sight | Text in the rules list only |

The spells that the invocations cast list on the character sheet and in
combat. A spell that the spellbook does not have goes in its own
Invocations group on the sheet. A once-per-rest spell in that group shows
struck through while it is spent, and its tooltip says "spent" or
"available". A cast through an invocation uses the
warlock save DC and attack bonus, and the log names the invocation, as in
"Wren casts Mage Armor (Armor of Shadows)."

A Pact of the Blade warlock marks its pact weapon in the Inventory tab. Each
weapon or bow row has a sword button, labeled **Make (weapon) the pact
weapon**, that marks it, and the same button clears the mark. The marked row shows a
**Pact weapon** badge. One weapon at a time is the pact weapon, and the mark
goes away when the weapon leaves the inventory. Thirsting Blade and Lifedrinker
read the mark.

The app does not enforce these invocation rules, so you enforce them:

- The creature types of Chains of Carceri, and its limit of one cast on
  each creature per long rest.
- The push of Repelling Blast. The board does not move a token by feet,
  so you move the token.
- The ritual casting of a warlock with Book of Ancient Secrets. The app
  offers the ritual box for a ritual in the Book of Shadows only, but a
  ritual that the warlock also knows as a warlock spell casts with a slot.
- How the Pact of the Blade summons the pact weapon, and the familiar of the
  Pact of the Chain with the invocations that use it. The pact weapon does not
  count as magical against resistance to nonmagical damage.

### Pact of the Tome

A warlock with the Pact of the Tome keeps a Book of Shadows. The level-up
that picks the boon asks for three cantrips from the list of any class,
and the **Book of Shadows cantrips** row in the Progression block changes
them. The book cantrips join the spellbook as warlock spells, so they use
CHA and the warlock save DC. They do not count against the cantrip limit,
so the Spellbook tab reads, for example, "Cantrips 5/5" for two class
cantrips and three book cantrips.

A change of the pact boon away from the Pact of the Tome removes the Book of
Shadows. Its cantrips leave the spellbook, and a cantrip that the warlock
knew from a class before the book stays. To keep a book cantrip, forget it
in the Spellbook tab and learn it again as a class cantrip before you change
the boon.

The Book of Ancient Secrets invocation adds rituals to the book. The pick
asks for two 1st-level rituals from the list of any class. To copy more
rituals later, click **Add ritual** on the **Book rituals** row. The list
offers rituals up to half the warlock level, rounded up. A ritual in the
book lists with the other spells on the sheet, and it casts only as a
ritual, with no slot and ten minutes more. The GM decides when the warlock
finds a ritual to copy, and the app does not charge the gold or the time
of the copy. A warlock who loses the invocation loses the rituals too, so
the invocation picked again asks for two new rituals.

### Mystic Arcanum

At warlock levels 11, 13, 15, and 17, the level-up asks for one warlock spell
of 6th, 7th, 8th, and 9th level. The list offers the warlock spells of that
level in the library. A level left at None stays pending, and the **Warlock
choices pending** row asks for it again. The **Mystic Arcanum** row in the
Progression block lists the picks, and its **GM edit** button changes them.

An arcanum spell casts once per long rest at its own level with no spell
slot. It lists in a Mystic Arcanum group on the character sheet, and with
the other spells in combat. While it is spent, its chip shows struck through, and a cast
refuses until a long rest. If the spellbook also has the spell, the app
first asks **How to cast**: the arcanum with no slot, or a spell slot. The
log names the feature, as in "Wren casts Circle of Death (Mystic Arcanum)."

### Inventory and equipment

The Equipment tab shows nine slot cards around a plate with the
character's name and AC: Helmet, Armor, Gloves, Greaves, Main hand, Off
hand, Ranged, Ring 1, and Ring 2. A card shows the item's name and one
short stat line, such as "AC 17, heavy" or "1d8 slashing". Click a card to
open its picker. The picker lists **Empty** and every item that the slot
accepts, each with its full details, and **Equip** puts the chosen item in
the slot. 5e armor has no Helmet, Gloves, or Greaves
slot, so those three are a house rule. The item form marks their types
with "(house rule)", and a note under the AC row says so too.

| Slot | Accepts |
| --- | --- |
| Helmet | helmet |
| Armor | armor |
| Gloves | gloves |
| Greaves | greaves |
| Main hand | weapon |
| Off hand | shield or weapon |
| Ranged | bow |
| Ring 1, Ring 2 | ring |

One item fills as many slots as its quantity. So a single ring goes on one
hand, and a pair of daggers can fill both hands. A two-handed weapon in the
main hand empties the off hand. The Off hand card reads "Both hands on" the weapon, and it stays closed
until the weapon comes out of the main hand.

The Inventory tab has a search box over names and descriptions, a type
filter, and one collapsible heading per item type. Under each heading, every
item is a tile with its name, one short stat line, a badge such as "x41" for
a stack, and an "Equipped" mark for an item in a slot. Click a tile to show
the item in the detail pane, which has its full effects, its description,
and the edit, give, count, use, and discard controls. On a wide screen the
pane sits beside the tiles, and on a narrow one it sits under them.

| Item field | Values |
| --- | --- |
| Type | gear, weapon, armor, helmet, gloves, greaves, shield, bow, ring, or consumable. Gear and consumables cannot be equipped |
| Description | Free text |
| Damage roll | Structured dice terms: a base roll plus optional permanent riders |
| Category | simple, martial, or none for a natural weapon such as a bite |
| Kind | melee (STR) or ranged (DEX) |
| Properties | The 5e property flags: finesse, versatile, two-handed, light, heavy, reach, thrown, ammunition, and loading |
| Range | Normal and long range in feet, for a ranged or thrown weapon. A blank or unreadable field takes 80/320 for a ranged weapon and 20/60 for a melee weapon. The long range never saves shorter than the normal range |
| Two-handed damage | The other dice of a versatile weapon |
| Status effects | Tags that the weapon inflicts, for example burning or poisoned |
| Magic | For a weapon: tick **Magical weapon** so that resistance to nonmagical weapon damage does not apply |
| Weight class | For body armor: light, medium, or heavy |
| Base AC | For body armor |
| Min STR | For body armor: the Strength score that it needs. 0 means none |
| Stealth | For body armor: tick it to give the wearer disadvantage on Stealth |
| AC bonus | A flat bonus on any other item that can be equipped. A shield uses this field too, and it starts at +2 |
| Ability buff | For example +2 STR, applied while the item is equipped |
| Heals when drunk | For a consumable: the heal dice, as a count, a die size, and a flat bonus. A count of 0 means the item heals nothing. A potion preset fills it |

Only the GM adds an item. A player uses, gives away, and discards what the
character carries.

| Control | Shows for | What it does |
| --- | --- | --- |
| Use one | A consumable | Uses one charge, down to the last one. A consumable with heal dice asks who drinks it first (see below) |
| Drop one | Any other stacked item | Removes one from the stack |
| Add or remove (plus) | Every item, for the GM | Opens an **Amount** field under the row. **Add** puts that many on the stack, and the log records a pickup. **Remove** takes that many off, at most the whole stack, and the log records a discard |
| Discard | Every item | Removes the whole stack. Asks first when the stack has more than one item |

A consumable with heal dice heals when a character uses it. **Use one** opens a
dialog that asks who drinks it. The character who carries it is first,
and any other party character can take it, so a character can pour a
potion into a downed ally. The tray rolls the heal with no target, and a
heal above 0 HP ends the dying state. A dead character cannot take a
potion, and the potion stays on the stack. In a fight, on the turn of the
character who carries it, a potion costs the action. The app does not
check that the two characters stand on the same tile.

| Potion | Heal |
| --- | --- |
| Potion of Healing | 2d4 + 2 |
| Potion of Greater Healing | 4d4 + 4 |
| Potion of Superior Healing | 8d4 + 8 |
| Potion of Supreme Healing | 10d4 + 20 |

The heal dice belong to the item, so a renamed potion still heals. To make
a custom healing item, such as a Troll Draught that heals 3d6, add a
consumable and set **Heals when drunk**. A consumable with no heal dice is a
plain consumable, and **Use one** only takes it off the stack. A potion from
an older save that has no heal dice gets them on load when its name matches
one of the potions above.

An edit keeps the item equipped, because it is the same item. A type change
that its slot cannot accept takes the item off. When the last of a stack is
removed, the item comes off.

## Time, story, and dice

### Time and rests

The Time panel shows the in-game day and watch, for example "Day 3, Dusk".
A day has six watches: Dawn, Morning, Midday, Afternoon, Dusk, and Night.
Only a GM tab shows the buttons. A walk of the party also moves the clock
on, by the time that [Party movement](#party-movement) lists for each map.

| Button | Time passed | Effect |
| --- | --- | --- |
| Advance | One watch | None beyond the time |
| Short rest | One hour | Refills pact slots and each short-rest pool (see [Class feature pools](#class-feature-pools) and [Custom pools](#custom-pools)). Sorcerous Restoration gives 4 sorcery points at sorcerer 20. Restores no HP, because in 5e only spent hit dice heal on a short rest |
| Long rest | Eight hours, two watches. From Afternoon or Dusk, a dialog also offers to rest until the next Dawn | Restores HP and every resource except a No rest pool, refills the spell slots, and takes one level of exhaustion off each character |

| Unit | Length |
| --- | --- |
| Round | 6 seconds |
| Watch | 4 hours, or 2,400 rounds |

When time passes, every condition, timed stat change, and concentration
with a round count loses that many rounds. One that runs out ends. So Bless
cast between fights is gone after a rest, while an effect that lasts 8
hours still has 4 hours left after one watch.

A rest that lifts a dying character above 0 HP clears the death-save
tracker. A character that is already dead keeps its exhaustion level.

### Quests

A row of buttons at the top of the Story tab names the Quests, NPCs, and Handouts cards with the number of entries in each. The Quests count includes the quests in a folded group. A click on one opens that card and scrolls to it. Each card also has a chevron button in its top-right corner that folds the card to its title, and the browser remembers which cards you folded.

The Quests panel in the Story tab lists active and completed quests.

| Control | What it does |
| --- | --- |
| New quest | Opens the quest dialog, with Title, Notes, Unlocks, and the reward fields |
| Status mark | Completes or reopens the quest |
| Eye | Reveals the quest to players, or hides it again |
| Chevron | Shows or hides the details: the notes, the objectives with all their controls, the links, and the buttons below |
| Group heading | Folds or opens the Active or Completed group. The heading shows the number of quests in the group. The Completed group starts folded, and the browser remembers each choice |
| Objective | Adds an objective |
| Link place | Links the quest to a map place |
| Link creature | Links the quest to a creature |
| Edit, Delete | Edits or deletes the quest |

A folded quest is one line: the status mark, the title, the count of objectives done (such as "1 of 4"), the chevron, and the eye. A click on the title or the chevron opens the quest. The open details list the objectives, each with a checkbox that marks it done, and several objectives can be done at once. Each objective also has controls to hide it
from players or reveal it, to move it up or down, and to remove it. A click on a
link chip shows the linked place on the map.

When you mark a GM-only objective of a revealed quest done, a dialog asks
whether to reveal the objective to players. When you mark the last open
objective done, a dialog offers to complete the quest. Completing a quest
shows a toast and writes a travelogue line. The line of a quest that
players cannot see is GM-only. Reopening a quest writes no line.

The **Unlocks** field of the quest dialog lists the other quests that this
quest leads to. When you complete a quest that unlocks hidden quests, the
dialog lists each of them under **Also reveal**, ticked. Clear a box to
keep that quest hidden. Each revealed quest gets its own travelogue line.
This dialog also comes up when you click the status mark of such a quest.
The Player view never shows the Unlocks list. A deleted quest leaves every
Unlocks list.

The reward fields of the quest dialog are **Reward gold (gp)**, **Reward
XP**, and **Pay**. Pay is either "To each living character" or "As a total,
split evenly". A total splits among the living characters and rounds down.
When you complete a quest with a reward, the dialog shows the three fields
with the reward filled in, and you can change them first. The gold goes
into the Gold stack of each character, or into the first item whose name
starts with "Gold". A character with neither gets a new "Gold (gp)" item.
A dead character gets no share. The travelogue line reads, for example,
"The party receives 50 gp and 300 XP each." Set both amounts to 0 to
remove the reward.

On a window wider than about 1,090 pixels, the Quests panel grows with its
list, and the Story tab scrolls around it. On a narrower window, the panel
scrolls once its list is taller than most of the window. A click on a
control keeps the scroll position, and a revealed or hidden quest keeps its
place in the order.

The Player view lists only revealed quests. It shows the objectives that
are not hidden, and it hides the notes and the links.

### NPCs

The NPCs panel in the Story tab lists the friendly and neutral creatures
near the party. Each row shows a disposition badge, the location, and the
chips.

| Viewer | Lists |
| --- | --- |
| GM tab | The NPCs on the node of the party within the nearby range, plus unplaced NPCs. A placed NPC that the party has not met shows "not yet met" |
| Player tab | Unplaced NPCs, plus the placed NPCs on the node of the party that the party has met |

In a GM tab, the **Here** and **All** switch above the list picks its scope.
**Here** lists the NPCs near the party, as in the table. **All** lists every
friendly and neutral creature in the campaign, on any map, so you can look up
an NPC without moving the party. A Player tab has no switch.
The party meets a placed NPC when it lands on the tile of that NPC. The
meeting writes one travelogue line. If you move the NPC, it counts as not
met until the party lands on its new tile. A move onto the party tile keeps
the NPC met, whether it comes from **Move to the party** in the edit dialog
or from the buttons below.

In a GM tab, each row of the NPCs panel has two more controls. The
**Travels with party** toggle makes the NPC a companion, and it shows a
check mark while it is on. A companion moves to the party tile each time
the party moves, into and out of child maps too. A companion at 0 HP stays
behind. Turning the toggle on also brings the NPC to the party, and turning
it off leaves the NPC where it stands. Each change writes a GM-only
travelogue line. The arrow button, "Bring to the party", moves the NPC to
the party tile once.

Long notes show two lines, and **More** shows the rest. The condition
chips and the exhaustion pips of an NPC row show only while the NPC is in
the running fight, or while it still has a condition or a level of
exhaustion.

An NPC stands on any map at a column and a row, or it stays unplaced. An
unplaced NPC appears everywhere. Columns and rows count from 1, the same as
the numbers along the map edges.

The notes of an NPC are GM-only. The Player view lists the NPC with its
role and disposition, without its notes.

### Handouts

A handout is read-aloud text or lore, with an optional picture.

| Field | Meaning |
| --- | --- |
| Title | The name of the handout |
| Read-aloud / lore | The text |
| Image (optional) | A picture. When you edit a handout, leave the field empty to keep the current picture |
| Shows at | Everywhere (campaign-wide), anywhere in one node, or one tile of one node |
| Only for (none checked: every player) | The characters who see the handout |

A handout starts hidden. The eye toggle reveals it to players or hides it
again. A badge beside the title reads **Shown** or **Hidden**.
A shown handout lists its text under the title. In a GM tab, a long text
shows three lines, and **More** shows the rest. A Player tab shows the
whole text.

When the party, or a character on their own tile, steps onto a tile with a
hidden handout, the GM tab shows a message such as "The party stands on
'Dorn's Manifest'." with a **Reveal** button. The message comes after
any encounter dialog. Each handout gives this message once per session. A
parchment note on the tile marks each hidden handout on the map, and only
the GM sees it.

The GM sees every handout of the node where the party stands. A line under
each row names the tile of the handout and the characters who see it.

A Player tab lists a handout under the current spot only when all of these
conditions are true:

- The GM revealed it.
- It is campaign-wide, or bound to the node of the party, or bound to the
  tile where the party stands.
- It has no chosen characters, or the tab plays one of them. A spectator
  tab never lists a handout that has chosen characters.

A Player tab also lists every other revealed handout for its character in a
**Revealed earlier** group below the handouts of the current spot. The group
comes from the campaign, so a Player tab that opens late, or opens on a new
device, lists the same handouts as a tab that was open all along. A handout
leaves the group when the GM hides or deletes it.
An erase stroke, a smaller node size, or a regeneration of the node can
remove the tile of a handout. The handout then binds to the whole node. An
undo of the erase or the regeneration binds it to its tile again.

### Travelogue

The Travelogue in the Log tab records events automatically, newest first.
Each entry shows the in-game day and watch when it happened, such as "Day 1,
Dusk". A line from a fight adds the round, such as "Day 1, Dusk, round 2".
Hover the time to see the local time of the entry. An entry saved
without an in-game time shows the local time instead. The combat log shows only
the round, such as "Round 2".

| Entry kind | Examples |
| --- | --- |
| Travel | Region entry, discovery, teleports, and regrouping |
| Combat | Defeats, lost concentration, ended conditions, and the lines of a fight |
| Rest | Short and long rests |
| Roll | Every dice tray roll, with the name of the roller |
| Note | Meetings, cleared foes, quests and handouts that the GM reveals or hides, the end of a concentration spell, and other notices |

| Limit | Value |
| --- | --- |
| Entries kept | The newest 200 |
| Entries kept while a fight runs | Every line of the fight, up to 1,000 entries in all |

**Clear log** deletes every entry after a confirmation.

### Dice tray

The Dice Tray collapses to a d20 icon with the label **Roll dice**. The full tray builds a roll from
steppers, and it does not read typed dice expressions.

| Control | Values |
| --- | --- |
| Die counts | A small cell for each of d4, d6, d8, d10, d12, d20, and d100, with a minus button, the count, and a plus button. The cells fill as many columns as the tray width allows, and a die with a count other than zero shows in the accent color |
| Modifier | The **mod** cell after the dice: a flat number, set with plus and minus buttons |
| d20 mode | A switch under the dice: Normal, Advantage, or Disadvantage. Advantage rolls every d20 twice and keeps the higher die, and Disadvantage keeps the lower. The choice stays until you change it |
| DC | The field beside the Roll button: an optional number to meet or beat. Each roll then reports success or failure. A save or a skill rolled from the character sheet uses it as the DC |
| Roll | Rolls the selection |

The tray shows the latest result at its top. The total is large, and the dice faces and
the modifier sit beside it in small type, as in "d20 (5) + 3". A roll with a
target ends with a line such as "vs 15: fail". Every roll
also goes into the Travelogue under the name of the roller. The name is
"The GM" for a GM tab, the character name for a bound tab, and "A player"
for a spectator tab.

An attack or a death save from the app opens the tray and shows its roll
there. The dice counts and the modifier keep what you set, so your next
**Roll** is your own roll and not a repeat of the attack. An attack judges
against the AC of its target for that roll only, and the DC field
keeps the value that you typed. A save or a skill from the character sheet
rolls in the tray without opening it. A roll that names its own
mode uses that mode for one roll only, and it leaves the d20 mode as it was.

## The library

Library mode curates the templates that the preset pickers offer. It has
four tabs.

| Tab | Contents |
| --- | --- |
| Equipment | Every weapon, armor, gear item, and consumable that the item form offers, in five subtabs: Weapons, Armor, Rings, Consumables, and Gear |
| Creatures | Stock creatures in two subtabs. Foes lists the hostile templates, and People lists the rest. The hand-off icon opens the matching campaign dialog, filled in |
| Spells | The spell catalog that the Spellbook tab picks from, grouped by spell level. The app ships 111 built-in spells |
| Feats | The feat catalog that the level-up feat choice offers. The app ships 16 built-in feats |

| Row badge | Meaning | Row control |
| --- | --- | --- |
| customized | You edited a built-in default, and the app stores an override | Revert (the counter-clockwise arrow) |
| custom | You added a new entry | Delete (the red trash icon) |

A custom entry overrides a default with the same name. For equipment, the
name and the type must both match. An edit that changes the disposition of
a creature moves the entry to the other subtab.

The Spells tab has **Class**, **Level**, and **School** filters beside the
name filter, and the Creatures tab has a **Challenge rating** filter on
both subtabs.
Each filter offers only the values that the entries of the subtab in view have, and a filter with no values hides.

The equipment form shows its **Preset** picker only for a new entry. An
edit of an existing entry hides it, because a pick would overwrite the
stats of the entry.

Customizations live outside the campaign. New and Load example replace the
campaign and never change the library. A campaign export bundles the
customizations, and a campaign import offers to restore them. See
[Campaign controls](#campaign-controls).

| Library file control | What it does |
| --- | --- |
| Export library | Downloads `campaign-library.json` |
| Import library | Loads an exported file into this browser, and replaces the customizations after a confirmation |
| Reset library | Removes all customizations and restores the built-in defaults. It is disabled while the library has no customizations |

The Library file card sits at the top of Library mode, above the tabs.

At startup, if the browser has no customizations, the app loads
`library/campaign-library.json` from the project directory. The merged
lists apply at once everywhere that the app reads the presets.

## Keyboard control

Press `?` anywhere for the shortcut reference.

| Key | Action |
| --- | --- |
| ? | Show the shortcut reference |
| Ctrl/Cmd+S | Save |
| Ctrl/Cmd+Z | In Build mode, undo the last stroke. In Play and Library mode, undo to the previous save |
| Ctrl/Cmd+Shift+Z | Redo the last undone save |
| B, P | Switch to Build or Play mode |
| C | In Play mode, open or close the full character sheet |
| Escape | Close a dialog or the full sheet, or put down the fog brush |
| Arrows on the map | Move the map cursor |
| Enter, Space on the map | Act on the cursor cell |
| +, - on the map | Zoom |
| Arrow off an edge, twice | Leave the area through that side. The first press lights the exit, and the second press travels |
| Shift+F10, Menu key on the map | Open the tile menu for the cursor cell (Build mode) |
| Arrows, Home, End in the World tree | Move between rows, and open or close a row |
| Enter, Space in the World tree | Open the map of the row |
| Shift+F10, Menu key in the World tree | Open the row menu |
| Tab, first press on the page | Show the skip links **Skip to the map** (Play and Build mode) and **Skip to the build tools** (Build mode) |

Save, Undo, Redo, and the mode keys work in a GM tab only. The map keys
work after you click the map or move focus to it.

The map is a focusable widget with a visible focus ring. A screen-reader
live region names the current node, its size, the party position, and the
number of points of interest. The region updates as these values change.

A list after the map names the points of interest, and a screen reader
reads it on demand. In Play mode, the list names only the points of
interest that the tooltip names: revealed, discovered if discoverable, and
within detection range. It reads the notes in a GM tab only.

A second live region names the cursor cell after each arrow key. It gives
the column and row, the art, the point of interest, and whether the cell is
explored.

The ways out of a sub-region are real buttons. Tab past the map, and they
show over it, each with its way out. For example: "Return to Barrow of the
Old King, through the stairs up at column 11, row 7".

The turn ribbon and the board of the combat screen are one tab stop each.
Arrow keys move between chips and between cards, and Enter or Space picks a
target. A live region announces each turn. When one side is down, it says
"The fight is over." once and stops reading turns. Each action pip is a
toggle button named for its cost, such as "Bonus action spent", and a
screen reader reads whether it is pressed.

## Mouse and touch control

| Input | Build mode | Play mode |
| --- | --- | --- |
| Left button | Paint, erase, inspect, or link a region | Move the party or a character, or use a fog brush |
| Right button drag | Pan the map | Pan the map |
| Right click without a drag | Open the tile menu | Nothing |
| Wheel | Zoom at the pointer | Zoom at the pointer |
| Two-finger drag | Pan the map | Pan the map |
| Pinch | Zoom | Zoom |

The map grid shows X and Y labels along the top and left edges. When the
grid edge scrolls out of view, the labels stay at the edges of the viewport
at partial opacity.
