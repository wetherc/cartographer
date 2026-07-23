# GM guide

A practical walkthrough of Campaign Builder for the person running the game. It
assumes no familiarity with the code — see [`architecture.md`](architecture.md)
for that. If a control named here isn't visible, check the **mode** and **role**
switches in the header first; most of the app is gated on those two settings.

## Starting out

Open the app in a browser served over HTTP (see the README for the dev server).
On a first run with no saved campaign, you start from a **blank campaign**: one
empty world map, no characters, and no encounters.

Three ways to begin:

- **New** (header) — a confirmed reset back to the blank campaign. This replaces
  the current campaign and its save, so you're asked to confirm first.
- **Load example** — replaces the current campaign with a small demo world
  (a world map plus one region, a sample character, an encounter, an NPC, and a
  handout). Useful for seeing how a filled-in campaign looks before building your
  own. It also overwrites the current campaign, so it confirms first.
- **Import** — load a campaign from a `.json` file you exported earlier.

Nothing is saved automatically. Click **Save** to write the campaign to the
browser's local storage. **Export** downloads the whole campaign as a `.json`
file you can back up or move to another machine. **Undo** steps back to the
snapshot taken before your last Save/New/Load example/Import — a small history is
kept, so it covers the most common "I didn't mean to do that" mistakes, but it is
not unlimited.

Everything lives in one browser's local storage under a single origin. There is
no server and no account.

## Modes and roles

Two independent switches in the header change what you see:

- **Mode — Play / Build.** Build mode is for authoring the world (drawing maps,
  placing points of interest, defining regions). Play mode is for running a
  session (moving the party, revealing fog, tracking encounters). You'll build in
  Build mode, then flip to Play mode at the table.
- **Role — GM / Player.** GM sees everything: exact enemy HP, secret tile notes,
  the full map. Player sees a safe subset: enemy health as a coarse band
  (Unharmed / Bloodied / Down, not exact numbers), no secret notes, and only the
  fog-revealed map. Player role is read-only — it forces Play mode and hides the
  authoring and campaign-management controls.

Role is **per browser tab**, so you can open a second tab, set it to Player, and
put it on a display facing the table. Only one tab at a time can hold the GM
view: while a GM tab is open, every other tab of the same origin opens as (and
is kept in) the Player view. Closing the GM tab frees the role for another tab
to claim; if the GM tab crashes instead of closing, the claim expires on its
own after a few seconds. When you click **Save** in your GM tab, any
other tab of the same origin reloads to match — a minimal way to drive a
player-facing screen from your laptop with no server. (The two tabs share one
campaign; the role is the only thing that differs between them.)

A Player tab still shows the GM/Player switch, which would claim the GM view
the moment your GM tab closes — risky on a display the table can reach. Lock it:
either open the tab with `?role=player` on the URL (good for a bookmark), or
click the padlock next to the role switch while in the Player view and confirm.
A locked tab hides the switch entirely and can never show the GM view; unlock it
by closing the tab (or removing `?role=player` from the URL).

## Building a world (Build mode)

Switch to **Build** mode. The layout reflows to a world-tree rail on the left, the
editable map in the center, and a palette + tile inspector on the right.

### Nodes and the world tree

The world is a tree of **nodes**. The top node is your world map; regions and
interiors hang beneath it. The **World tree** (left rail) is the always-visible
picture of that hierarchy — it shows every node and where you are, and it's where
you add, rename, resize, and delete nodes.

A node has a **kind**:

- **Region** — outdoor/overworld areas. Gets the full terrain and road palette.
- **Interior** — buildings and dungeons. Gets only the interior pieces (floors,
  walls, doors, stairs).

Each node also carries a free-text **environment** tag (grassland, forest,
shop, temple, …) used for description and flavor.

Create a node from the world tree's add-child affordance; a dialog asks for its
name, kind, environment, and size. Resize a node later from its edit affordance —
growing keeps existing tiles, shrinking prunes anything outside the new bounds
(with a confirm if that would drop non-empty tiles).

### Painting tiles

Pick a brush in the **Palette** (right rail), then **left-drag** across the map to
paint every cell the pointer crosses; a single click paints one cell. The palette
is filtered to the node's kind, so an interior only offers interior pieces.

Tools in the palette:

- A **brush** — the selected terrain, road, or marker.
- **Erase** — clears cells back to empty.
- **Inspect** — selects a single cell to edit in the tile inspector.
- **Region** — drag a rectangle to mark a block of tiles as one sub-region (see
  below).

**Roads overlay** the terrain beneath them, so you can run a road across sand,
snow, or grass and the ground still shows through the verges. Re-painting the
terrain under a road keeps the road on top.

Panning is the **right mouse button** in both modes (drag with the right button
held); the wheel zooms. This is deliberate — the left button is reserved for
painting in Build and for acting in Play.

Mistakes are cheap: **Undo stroke** (the Tools card, or Ctrl/Cmd+Z in Build
mode) reverts the last edit — a whole paint or erase drag counts as one edit,
as does a region link or a generation. This history is separate from the
header's save-level Undo and lasts only until the page reloads.

The Tools card also has **Export PNG**, which downloads the current map as a
full-resolution image (fog ignored) — for printing, or dropping into a VTT.

### Generating a map

Instead of painting a large map tile by tile, the **Generate** card (right rail)
can fill the current node with an auto-generated layout. Pick an archetype —
**wilderness** or **town** for a region, **dungeon** or **castle** for an
interior — and a size (small / medium / large). The dialog shows a **live
preview** of the exact layout it will stamp, driven by a visible **seed**:
click **Reroll** (or change any field) to see a different candidate, and
nothing touches the node until you accept — so finding a good layout is no
longer a destructive loop. The seed reproduces the layout, so note it down if
you want to regenerate the same map later. Accepting replaces the node's grid
(with a confirmation first if the node already has tiles). Every generated
layout is guaranteed to be reachable from its parent map: dungeons get an
entrance corridor with a door on the map edge, castles a gate in the south
wall, and towns roads that run edge to edge.

Generating also guarantees a way in from the map above: if nothing on the
parent map links to the node yet, an entrance tile (a dungeon, castle, or
settlement marker matching the archetype) is placed near the parent's centre
and an alert tells you where — repaint or relink that tile to move the
entrance where you want it.

Dungeons can be multi-level: set **Levels** to more than one and each level's
stairs-down leads to a freshly generated level below it (created as a child
node in the world tree). Descending the stairs lands the party on the lower
level's stairs-up, and the bottom level has no stairs-down — stairs never lead
nowhere.

### Points of interest and tile metadata

Select the **Inspect** tool and click a tile to open the **Tile inspector**. There
you set the tile's **POI type**, a **discoverable** flag, and free-text **notes**.

- **Notes** are GM-only. Players never see them; you see them on hover in Play
  mode (GM role).
- A **discoverable** POI stays hidden — no gold outline, no tooltip — until the
  party physically steps onto its tile, at which point it's marked discovered
  (and stays that way). Use this for secrets the party shouldn't see coming.
- The inspector also has **Set party start here**, which places the party's spawn
  tile. The party position is saved, so this is effectively the campaign's start
  point.

### Regions (zoom-in areas)

A **region link** makes a block of overworld tiles zoom into a child node. Select
the **Region** tool, drag a rectangle over the block, and on release link it to an
existing child node or create a new one. Every tile in the block then shares that
child, so clicking anywhere in the block (in Play mode) zooms in.

When the party zooms into a region, it lands on a sensible border tile computed
from the direction of approach, rather than dropping into a fully fogged interior.

## Running a session (Play mode)

Switch to **Play** mode. The map is the primary element; a sidebar holds the
session panels in three tabs: **Session** (world, time, encounters, initiative),
**Story** (quests, NPCs, handouts), and **Log** (the travelogue). Collapse the
sidebar with **Hide panels** to give the map the full width.

### Moving the party and fog of war

Click a tile to move the party there (or use the keyboard cursor — arrows to move
the cursor, Enter/Space to act). Moving reveals fog in a radius around the new
position; revealed tiles stay revealed. Clicking a region-linked tile zooms into
that region instead of moving; the breadcrumb above the map zooms back out.

Regions on the overworld aren't highlighted until at least one of their tiles has
been revealed, so undiscovered areas stay hidden from view.

The map grid is labeled with X/Y coordinates along the top and left edges, so you
can call out tile positions.

As GM you also get direct fog control (the eye buttons on the map): a **reveal
brush** and a **hide brush** — click or drag across tiles to light or re-fog
them — plus a **reveal whole area** action for the current map. Players never
see these controls.

### Encounters

Build an encounter roster in the **Encounters** panel (name, max HP, stat block),
and bind each to a tile. In Play mode the panel shows only the encounters at the
party's current location — no active encounter, no clutter.

When the party **steps onto a tile with an encounter**, it pops up as a modal over
the map, naming the encounter, its region, and its coordinates. Fleeing or
ignoring an encounter leaves it in the sidebar for that node; it isn't removed. A
live encounter's tile shows a red diamond marker once revealed, so the party can
see a point of interest as they approach.

Damage and heal from the panel; a defeated encounter is styled as such rather than
deleted, so you keep a record of what died. Each encounter row tracks its own
status **conditions** (poisoned, prone, …) and a **stat block** — chips like
"AC 13" added right on the row, GM-only.

Recurring foes go in the **bestiary**: the save icon on an encounter row stores
its blueprint (name, max HP, stat block) as a template, and **From bestiary**
spawns a fresh, full-health copy at the party's location — so the fourth goblin
isn't typed from scratch. Templates are snapshots (later edits to the live
encounter don't change them) and the same dialog can delete a stale one.

### Initiative and conditions

The **Initiative** panel appears only while the party is in an encounter —
standing on a tile with at least one live encounter bound to it — and lists
exactly who is involved: the party, that tile's encounters, and any NPCs placed
on the same tile (hostile NPCs line up as foes, friendly and neutral ones with
the party). Enter each combatant's initiative — or click **Roll initiative** to
roll a d20 for everyone at once (you can still adjust any value) — then start
combat and step through with **Next turn**; the current turn is highlighted and
a round counter advances. On each new round, timed conditions tick down and
expire on their own. Walking off the tile (or defeating the last encounter on
it) ends the encounter and hides the panel.

### Characters, HP, and resources

Build the party in the **Party** roster (create / select / delete). Selecting a
character scopes the **Character sheet** and **Inventory** to that character —
each character has its own inventory.

The character card is collapsed by default to the name and race with a
full-width bar line each for HP and mana; expand it for stats, XP, and
resource pools (where the HP and mana steppers live). HP and mana are modeled
as resource pools, set at character creation with sensible defaults. Gaining
enough XP levels the character up automatically (an N×100 curve), and HP and
mana grow per level. Inventory stacks of two or more get a **consume one**
control distinct from the remove-whole-stack button.

For combat speed, the Party roster's **Award XP** grants the same amount to
every character at once.

### Time and rests

The **Time** panel tracks the in-game day and watch. **Advance** moves time
forward; **Short rest** and **Long rest** restore character resources (half vs.
full) and log the rest. Rest recovery hooks into the same resource machinery HP
and mana use.

### NPCs, quests, handouts, and the travelogue

- **NPCs** — friendly/neutral/hostile non-combatants with a disposition badge,
  notes, and a location. The add/edit dialog places an NPC on any map
  (region or interior) at specific tile coordinates — or leaves it unplaced,
  in which case it appears everywhere. Each row shows the placement, and the
  panel shows the NPCs at the party's current location. A placed NPC also shows
  on the map as a blue circle in its tile's upper-left corner (the encounter
  diamond sits upper-right, so a tile can carry both) once the tile is revealed,
  and hovering the tile in Play mode names everyone standing there.
- **Quests** — active/completed quest log. Completing a quest turns its toggle
  button's plus into a checkmark.
- **Handouts** — read-aloud text or lore attached to a node (or campaign-wide),
  optionally with an attached image (shown above the text once revealed). Each
  has an eye toggle that reveals or hides it; a revealed handout shows its
  read-aloud block, so the panel doubles as your "read this now" surface. Players
  (Player role) see only revealed handouts, read-only.
- **Travelogue** — an automatic event log: region entry, teleports, encounter
  defeats, rests, and discoveries. Newest first, with a confirmed Clear.

### Dice

The **Dice Tray** collapses to a single d20 icon; expand it for the full tray. Set
counts per die type (d4–d100) and a flat modifier with +/- steppers — there's no
text-expression parsing — then roll. The result shows each die's face and the
total, and the last eight rolls stay listed beneath it (with timestamps) so
contested rolls can be compared. The history is session-only.

## Accessibility

The map is keyboard-operable: it's a focusable widget with a visible focus ring,
arrows move a cursor cell, Enter/Space act, and +/- zoom. A screen-reader live
region narrates the current node (name, size, party position, revealed POIs) and
updates as things change. Icon-only buttons carry text labels, disclosures report
their expanded state, and both light and dark themes are supported.

## Tips

- **Watch the Save button.** It reads "Save •" whenever you have unsaved
  changes; saving confirms with a toast, and closing the tab with unsaved work
  warns first. Press `?` anywhere for the keyboard-shortcut reference
  (Ctrl/Cmd+S saves, Ctrl/Cmd+Z undoes, B/P switch modes).
- **Save often.** Autosave doesn't exist; Undo history is small. Export a backup
  before a big edit.
- **Build discoverable POIs and secret notes for surprises.** Both stay hidden
  from players until the moment you want them revealed.
- **Use a second Player-role tab on a shared screen.** Save in your GM tab to push
  updates to it.
