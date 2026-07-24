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
- **Load example** — replaces the current campaign with a complete demo
  campaign: a 32x32 overworld with a crossroads and hand-shaped terrain, three
  outdoor subregions (two wilderness regions and the town of Briarwick) plus a
  dungeon interior, populated end to end as a playable arc. It ships a
  seven-quest chain (goblin raids that trace back to the risen king in the
  barrow), a staffed town of NPCs, field enemies in every biome, three minor
  bosses and a major boss, lore handouts, a bestiary of reusable mob
  templates, and a two-member party with kit and spell slots. Useful for
  seeing how a filled-in campaign looks before building your own. It also
  overwrites the current campaign, so it confirms first.
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

A Player tab can also **play as one character**. Pick one from the "Playing as"
dropdown at the top of the Party panel, or open the tab with `?character=<id>`
on the URL (combine with `?role=player&character=hero` for a bookmarked
per-player display). A bound tab can play its character — spend and restore HP,
spell slots, and other resources, add and clear conditions, and manage
inventory — but cannot edit base attributes (stats, XP) or touch any other
character; an unbound Player tab is a pure spectator. Bindings are exclusive:
only one tab at a time can play a given character, on the same claim-and-expire
rules as the GM view, so two tabs can never both act as the same hero. The GM
tab ignores bindings entirely and can always edit everyone. Dice rolled from a
bound tab are logged in the travelogue under the character's name ("Hero rolls
d20..."); a spectator tab's rolls stay anonymous ("A player rolls...").

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
paint every cell the pointer crosses; a single click paints one cell. Swatches
are grouped into collapsible **Terrain**, **Roads**, **Buildings**, and
**Interior** sections (click a heading to expand or collapse it), and the
palette is filtered to the node's kind, so an interior only offers interior
pieces.

The **Size** row (1x/2x/3x) sets how large the next painted tile's art draws:
at 2x or 3x a click stamps one tile whose image is stretched across a 2x2 or
3x3 block — good for landmarks like an academy or a keep that should dominate
their surroundings, with no sub-region link involved. The block is purely
visual: the covered cells keep their own terrain, roads across it stay
tile-sized, fog reveals it piecewise, and re-painting the anchor cell at 1x
shrinks the art back to one cell. Scaled stamps place one block per click
(dragging doesn't repeat them), and roads always paint at 1x.

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

Linking a single tile from the tile inspector (the **Zooms into** select or **New
region here**) stamps a 2x2 block on outdoor maps — the selected tile plus its
right/below neighbors, shifted at the map edge — so a sub-region always has a
visible footprint; neighbors already linked elsewhere, walls, and empty cells are
left alone. Interiors keep single-tile links (a stair or door is one cell), and
unlinking a tile clears its whole block.

On outdoor maps a linked block also draws as enlarged art rather than repeated
tiles: each 2x2 chunk of the block shows one image scaled across it (a bigger
block gets several distinct 2x2 images, never one image stretched further), so a
region entrance reads as a landmark. Roads and paths laid through the block stay
tile-sized on top of it, fog still reveals it piecewise, and interiors render
tile by tile as usual.

When the party zooms into a region, it lands on a sensible border tile computed
from the direction of approach, rather than dropping into a fully fogged interior.

## Running a session (Play mode)

Switch to **Play** mode. The map is the primary element; a sidebar holds the
session panels in three tabs: **Session** (world, time, encounters, initiative),
**Story** (quests, NPCs, handouts), and **Log** (the travelogue). Collapse the
sidebar with **Hide panels** to give the map the full width.

### Moving the party and fog of war

The party moves as one marker by default. As GM, click a tile to move the
whole party there (or use the keyboard cursor — arrows to move the cursor,
Enter/Space to act). Moving reveals fog in a radius around the new position;
revealed tiles stay revealed. Clicking a region-linked tile zooms into that
region: as GM this moves the party in; in a player tab it only brings the
region into view.

Whether the party may split up is governed by the GM-only **Allow splitting
the party** switch at the top of the Party panel, off by default. While it's
off, only the shared party marker renders (no per-character tokens or name
labels), and everyone travels simultaneously with the GM's clicks — a player
tab's map clicks move no one.

With the switch on, every character stands on the map as their own gold token
with their name above it; characters travelling together share a tile and
their names stack. In a player tab bound to a character (see "Player tabs play
one character"), a click moves only that player's own character — their step
reveals fog around them, and clicking the party's tile rejoins it. A spectator
tab moves no one. As GM you can also place one character from the roster (the
map button on their row, **Place &lt;name&gt; on the map**): any map and tile,
or back "With the party", without moving anyone else. Individual moves are
logged, and a character stepping onto an encounter's tile raises the encounter
alert under their own name. A GM whole-party move still recalls everyone.

Turning the switch off while characters stand apart first regroups the party:
a dialog asks which member's position everyone teleports to, then all
characters gather there and simultaneous movement resumes. Cancelling the
dialog leaves the switch on and nobody moves.

Regions on the overworld aren't highlighted until at least one of their tiles has
been revealed, so undiscovered areas stay hidden from view.

The map grid is labeled with X/Y coordinates along the top and left edges, so you
can call out tile positions. When you zoom or pan far enough that the grid edge
leaves the viewport, the labels pin to the top and left edges of the map viewer
at partial opacity, so coordinates stay readable without hiding the map under
them.

As GM you also get direct fog control (the eye buttons on the map): a **reveal
brush** and a **hide brush** — click or drag across tiles to light or re-fog
them — plus a **reveal whole area** action for the current map. Players never
see these controls.

### Encounters

Build an encounter roster in the **Encounters** panel (name, max HP, level, and a
**tier** — a rank-and-file *mob* or an above-normal *legend*), and bind each to a
tile. The tier and level stamp a reasonable default stat block — the six ability
scores plus AC, the only stats an enemy carries (legends always out-stat a
level-matched mob) — and arm the enemy with generic **gear**: a weapon picked
from the 5e preset list and a named armor whose flat AC bonus adds on top of
the stat block's base AC. Both are editable in the same create/edit dialog
(Weapon, Armor, and Armor AC bonus fields), and the Build rail's Encounters
tab shows each enemy's gear under its name. Bestiary templates carry gear
along with the stat block. In Play mode the panel splits into two tabs. **Active
encounter** lists the live encounters on the party's tile — what the party has
walked into — and carries the **Start combat** button; stepping onto such a
tile switches to it, and leaving switches back. **Nearby encounters** lists
the rest in range — within four times the fog reveal radius of the party's
tile — along with the New encounter and From bestiary buttons. Both tabs are
always present and freely selectable; an empty one says so. Players see less
still — a
nearby encounter enters their sidebar only once it's been discovered, its tile
revealed through the fog (or, for an unplaced one, once the party has walked
into it).

When the party **steps onto a tile with an encounter**, it pops up as a modal over
the map, naming the encounter, its region, and its coordinates. Fleeing or
ignoring an encounter leaves it in the sidebar for that node; it isn't removed. A
live encounter's tile shows a red diamond marker once the party (or a split-off
character) comes within detection range — twice the fog reveal radius — so danger
is sensed a little beyond sight, but distant threats stay hidden.

Every encounter row has an **edit** (pencil) action opening the same dialog the
add flow uses — name, HP, level/tier, and the map/tile placement — so moving an
encounter somewhere else no longer means deleting and recreating it. Its live
state survives an edit: current HP carries over (clamped if you lower the max),
and the stat block and conditions stay as you tuned them. Build mode gets its
own **Encounters** card in the right rail, scoped to whatever map you're
looking at, with the same edit/delete actions plus a New encounter button that
defaults onto the selected tile — so you can stage a region's fights while
authoring it, without walking the party there. This card is also where **base
stats are edited**: every row carries the full set of stat chips, and clicking
one sets its value. Clicking a placed encounter's name **focuses the map** on
its tile, so you can find a staged fight without hunting for coordinates.

Damage and heal from the panel; a defeated encounter is styled as such rather than
deleted, so you keep a record of what died. Each encounter row tracks its own
status **conditions** (poisoned, prone, …) and shows its **stat block** as chips
("AC 13"), GM-only. In Play mode the chips aren't for editing base values —
clicking one applies a **timed adjustment** (+2 STR for 3 rounds, say), shown as
"STR 14→16 (3r)" and ticked down automatically as combat rounds pass. Combat
math (initiative's DEX modifier) uses the adjusted values while they last.

Recurring foes go in the **bestiary**: the save icon on an encounter row stores
its blueprint (name, max HP, stat block) as a template, and **From bestiary**
spawns a fresh, full-health copy at the party's location — so the fourth goblin
isn't typed from scratch. Templates are snapshots (later edits to the live
encounter don't change them) and the same dialog can delete a stale one.

### Initiative and conditions

Opening combat is a GM-only action. While the party stands on a tile with at
least one live encounter, the GM's Active encounter tab shows a **Start
combat** button; it opens a setup dialog listing exactly who is involved: the party,
that tile's encounters, and any NPCs placed on the same tile (hostile NPCs line
up as foes, friendly and neutral ones with the party). Each combatant's **DEX
modifier** (`floor((DEX - 10) / 2)`, so a DEX of 20 is +5) is shown beside
their name and folded in everywhere: the default value is 10 + modifier, and
**Roll initiative** rolls d20 + modifier for everyone at once (you can still
adjust any value before starting). Players never see the button or the dialog —
they cannot open a fight or roll the party's initiative.

The **Initiative** panel itself appears only while a fight is actually running —
there is no idle setup card parked in the sidebar. Once combat starts, step
through with **Next turn**; the current turn is highlighted and a round counter
advances. On each new round, timed conditions tick down and expire on their
own. **End combat** — or walking off the tile, or defeating the last encounter
on it — ends the fight and hides the panel again.

While a foe holds the turn, its highlighted row shows a dice button (GM view
only): set up the roll in the dice tray as usual, then click it to roll as that
enemy — the result lands in the travelogue under the enemy's name, and in a
toast, without disturbing the tray's own readout.

On the **active combatant's turn**, their weapons line up under the
highlighted row as one-click **attack buttons**: a party member's equipped
weapons — visible to the GM and, on a bound tab, to the player driving that
character — or a foe's assigned weapon, GM only. Clicking one picks the
defender from the opposite side (automatic with a single one standing, a
quick dialog otherwise; a foe's targets are the party characters, with AC
computed from their equipped armor, and any friendly NPCs on the tile), loads
the dice tray with 1d20 plus the weapon's ability modifier (STR for melee, DEX
for finesse and ranged — the same rule the weapon was created under) plus the
attacker's level-based **proficiency bonus**, against the defender's AC, and
rolls it right in the tray. The natural d20 matters, 5e-style: a **natural 20**
hits regardless of AC and is a **critical hit** — every damage die rolls twice
— while a **natural 1** always misses. On a hit the weapon's damage dice roll
too, ability modifier folded into the base term (proficiency never adds to
damage), and the total lands in the travelogue and a toast by damage type
("12 slashing + 3 fire"), along with any status effects the weapon inflicts.
The damage is **applied to the defender automatically** — an encounter's HP
drops on the spot, defeat is logged, and downing the last foe ends the combat;
a character hit by a foe loses bonus HP first, then real HP, with a travelogue
line when they drop to 0. NPCs carry no HP, so a hit on one stays a log line.
The damage/heal steppers on the encounter row and character card remain for
adjustments (resistances, temporary HP rulings, or undoing a roll).

### Characters, HP, and resources

Build the party in the **Party** roster (create / select / delete). Selecting a
character scopes the **Character sheet** and **Inventory** to that character —
each character has its own inventory.

The character card is collapsed by default to the name and race with a
full-width HP bar and, for spellcasters, a **spell slots** line — one pip group
per spell level, filled pips being the slots still unspent. Both lines are live
controls without expanding the card: the HP bar carries **damage/heal steppers**
on either side, and each slot **pip is clickable** — a filled pip spends that
slot, an empty one restores it. Expand the card for stats, the XP award
control, and any custom resource pools.
Each ability score shows its derived modifier beside it (DEX 20 is +5) — the
same modifier initiative uses. NPCs carry the six scores too, editable in
their dialogs. HP and spell slots are modeled as resource pools; creation asks
for max HP and whether the character is a spellcaster, and a caster's slots
follow the standard full-caster table for their level. Gaining enough XP
levels the character up automatically (an N×100 curve): HP grows per level and
a caster's slot maxima track the table, with newly unlocked spell levels
arriving at full and already-spent slots staying spent. Saves from the old
mana system migrate on load — the mana pool becomes the slot pools for the
character's level. Every inventory stack gets a **consume one** control
distinct from the remove-whole-stack button — even 1-stacks, since using the
last potion and throwing it away are different stories. Inventory changes
write themselves into the travelogue: pickups record who found what, where,
and at what in-game time; consuming or discarding logs a shorter line.

The panel splits into two tabs. **Equipment** (the default) holds nine
**equipment slots** — Helmet, Armor, Gloves, Greaves, Main hand, Off hand,
Ranged, and two ring slots (Ring 1 and Ring 2, so a character can wear two
rings at once). Each picker lists only the items its slot accepts (a potion
can't be worn as armor; the off hand takes a shield or a weapon). The
**Inventory** tab holds the item list with a **search box** (matching names
and descriptions), a **type filter**, and a **sort** control (by name, type,
or largest stack).

Items carry a **type** (gear, weapon, armor, helmet, gloves, greaves, shield,
bow, ring, or consumable) and an optional **description**, both set when
adding one — and every field stays **editable afterward** via the pencil
button on the item's row, which opens the same form pre-filled. Edits keep
the item equipped (it's the same item), except that changing its type to
something its slot can't hold takes it off automatically.

Weapons and bows carry a **damage roll** as structured dice terms — a base
roll plus optional permanent riders, so a burning blade can deal 2d6 slashing
+ 1d4 fire. A **5e preset** picker fills standard values (a greatsword is 2d6
slashing, melee) which the GM may then adjust freely. The weapon's
**handling** alone fixes which ability modifies its damage — **melee** uses
STR, **finesse** and **ranged** use DEX — and the summary line shows the full
roll with its ability, e.g. "2d6 slashing + 1d4 fire (STR)". Weapons can also
list **status effects** they inflict (burning, poisoned...), added as tags on
the form.

Armor class follows 5e. Body armor (the **armor** type, worn in the Armor
slot) is created with a **weight class** and a configurable **base AC** that
replaces the unarmored baseline; the weight class alone fixes how DEX scales
it — **light** adds the full DEX modifier, **medium** caps it at +2, **heavy**
ignores DEX entirely — and isn't overridable per item. **Shields** always
grant a flat +2. Other equippables (helmets, rings, bows, weapons...) can
carry a flat **AC bonus** and/or an **ability-score buff** (say, +2 STR),
both set when adding the item and applied only while equipped — a buffed
score shows the boost beside its modifier on the sheet, and the modifier
reflects the buffed total. Unarmored characters use their **Base AC** (a
sheet field, normally 10) + full DEX, so effects like Mage Armor are a
one-field change. The derived **AC readout** in the sheet's header sums all
of this. Removing the last of a stack unequips it automatically, and saves
from the flat-bonus armor era migrate on load (old body armor reads as light
armor with the same total).

The sheet also carries two HP controls beyond the bar's steppers: **Max HP**
(GM-only) overrides the pool's maximum per character, clamping current HP down
if needed, and **Bonus HP** tracks temporary points from items or boons on top
of intrinsic HP — shown as a "+N" beside the bar, drained before real HP when
damage lands, and never refilled by healing (it's granted, not healed).

For combat speed, the Party roster's **Award XP** grants the same amount to
every character at once.

### Time and rests

The **Time** panel tracks the in-game day and watch. **Advance** moves time
forward; **Short rest** and **Long rest** restore character resources (half vs.
full) and log the rest. Spell slots follow the D&D rule: only a long rest
refills them — a short rest leaves them spent.

### NPCs, quests, handouts, and the travelogue

- **NPCs** — friendly/neutral/hostile non-combatants with a disposition badge,
  notes, and a location. The add/edit dialog places an NPC on any map
  (region or interior) at specific tile coordinates — or leaves it unplaced,
  in which case it appears everywhere. Each row shows the placement, and the
  panel shows the NPCs at the party's current location. A placed NPC also shows
  on the map as a blue circle in its tile's upper-left corner (the encounter
  diamond sits upper-right, so a tile can carry both) once the party comes
  within detection range — the same twice-the-reveal-radius rule as encounter
  markers — and hovering the tile in Play mode names everyone standing there.
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
