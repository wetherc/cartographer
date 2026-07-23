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
put it on a display facing the table. When you click **Save** in your GM tab, any
other tab of the same origin reloads to match — a minimal way to drive a
player-facing screen from your laptop with no server. (The two tabs share one
campaign; the role is the only thing that differs between them.)

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

### Generating a map

Instead of painting a large map tile by tile, the **Generate** card (right rail)
can fill the current node with an auto-generated layout. Pick an archetype —
**wilderness** or **town** for a region, **dungeon** or **castle** for an
interior — and a size (small / medium / large), and the node's grid is replaced
with the generated map (with a confirmation first if the node already has
tiles). Every generated layout is guaranteed to be reachable from its parent
map: dungeons get an entrance corridor with a door on the map edge, castles a
gate in the south wall, and towns roads that run edge to edge. Regenerate as
many times as you like until you get a layout you want to refine by hand.

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
session panels. Collapse the sidebar with **Hide panels** to give the map the full
width.

### Moving the party and fog of war

Click a tile to move the party there (or use the keyboard cursor — arrows to move
the cursor, Enter/Space to act). Moving reveals fog in a radius around the new
position; revealed tiles stay revealed. Clicking a region-linked tile zooms into
that region instead of moving; the breadcrumb above the map zooms back out.

Regions on the overworld aren't highlighted until at least one of their tiles has
been revealed, so undiscovered areas stay hidden from view.

The map grid is labeled with X/Y coordinates along the top and left edges, so you
can call out tile positions.

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
status **conditions** (poisoned, prone, …).

### Initiative and conditions

The **Initiative** panel interleaves the party and the encounters into one turn
order. Enter each combatant's initiative, start combat, and step through with
**Next turn**; the current turn is highlighted and a round counter advances. On
each new round, timed conditions tick down and expire on their own.

### Characters, HP, and resources

Build the party in the **Party** roster (create / select / delete). Selecting a
character scopes the **Character sheet** and **Inventory** to that character —
each character has its own inventory.

The character card is collapsed by default to name / race / HP / mana bars;
expand it for stats, XP, and resource pools. HP and mana are modeled as resource
pools, set at character creation with sensible defaults. Gaining enough XP levels
the character up automatically (an N×100 curve), and HP and mana grow per level.
Inventory stacks of two or more get a **consume one** control distinct from the
remove-whole-stack button.

### Time and rests

The **Time** panel tracks the in-game day and watch. **Advance** moves time
forward; **Short rest** and **Long rest** restore character resources (half vs.
full) and log the rest. Rest recovery hooks into the same resource machinery HP
and mana use.

### NPCs, quests, handouts, and the travelogue

- **NPCs** — friendly/neutral/hostile non-combatants with a disposition badge,
  notes, and a location. The panel shows the NPCs at the party's current location.
- **Quests** — active/completed quest log. Completing a quest turns its toggle
  button's plus into a checkmark.
- **Handouts** — read-aloud text or lore attached to a node (or campaign-wide).
  Each has an eye toggle that reveals or hides it; a revealed handout shows its
  read-aloud block, so the panel doubles as your "read this now" surface. Players
  (Player role) see only revealed handouts, read-only.
- **Travelogue** — an automatic event log: region entry, teleports, encounter
  defeats, rests, and discoveries. Newest first, with a confirmed Clear.

### Dice

The **Dice Tray** collapses to a single d20 icon; expand it for the full tray. Set
counts per die type (d4–d100) and a flat modifier with +/- steppers — there's no
text-expression parsing — then roll. The result shows each die's face and the
total.

## Accessibility

The map is keyboard-operable: it's a focusable widget with a visible focus ring,
arrows move a cursor cell, Enter/Space act, and +/- zoom. A screen-reader live
region narrates the current node (name, size, party position, revealed POIs) and
updates as things change. Icon-only buttons carry text labels, disclosures report
their expanded state, and both light and dark themes are supported.

## Tips

- **Save often.** Autosave doesn't exist; Undo history is small. Export a backup
  before a big edit.
- **Build discoverable POIs and secret notes for surprises.** Both stay hidden
  from players until the moment you want them revealed.
- **Use a second Player-role tab on a shared screen.** Save in your GM tab to push
  updates to it.
