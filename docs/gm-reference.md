# GM reference

*Reference. For the steps of a task, read the [GM guide](gm-guide.md).*

This document describes what the app contains: the two header switches, the
panels of each mode, the keyboard controls, and the rules that the app
applies on its own. It assumes no knowledge of the code.

If a control named here does not show, look at the mode switch and the role
switch first. Most of the app depends on these two settings.

## Modes

The mode switch sits in the header. It changes the whole layout.

| Mode | Layout | Purpose |
| --- | --- | --- |
| Build | World-tree rail, editable map, palette and tile inspector | Author the world: maps, points of interest, regions, staged encounters |
| Play | Map with a session sidebar | Run a session: party movement, fog, encounters, combat |
| Library | No map. Four tabs of templates | Curate the reusable templates that feed the preset pickers |

Combat replaces the Play layout while a fight is open. The map and its
panels step aside, and the fight takes the full width.

## Roles

The role switch sits beside the mode switch.

| Role | Sees | Can change |
| --- | --- | --- |
| GM | Exact enemy HP, secret tile notes, the whole map | Everything |
| Player | Enemy health as a band (Unharmed, Bloodied, Down), no secret notes, the fog-revealed map only | Nothing, unless the tab is bound to a character |

The role is per browser tab. Only one tab at a time holds the GM view.
While a GM tab is open, every other tab of the same origin opens as a
Player tab and stays that way. The claim expires a few seconds after the GM
tab closes or crashes.

Every save in the GM tab, including an autosave, reaches the other tabs. A
Play-mode tab takes the change without a reload, so it keeps its scroll
position, its open panel, and its map zoom and pan.

### Player tab options

| Option | Effect |
| --- | --- |
| `?role=player` on the URL | The tab opens as a Player tab and can never show the GM view |
| The padlock beside the role switch | Same lock, set from inside the tab. To undo it, close the tab or drop the URL parameter |
| `?character=<id>` on the URL | The tab binds to one character |
| The "Playing as" dropdown in the Party panel | Same binding, set from inside the tab |

A bound tab can spend spell slots and other resources, add and clear
conditions, and use, give away, or discard what its character carries. A
bound tab cannot edit base attributes (stats, XP, Bonus HP, Base AC), add
an inventory item, or touch another character. An unbound Player tab is a
spectator.

Recovery of a resource is a GM action. A player can spend a slot but cannot
restore one. HP steppers are GM-only for the same reason.

A binding is exclusive, under the same claim-and-expire rule as the GM
view. The GM tab ignores bindings and can edit everyone. A roll from a
bound tab is logged under the character's name. A roll from a spectator tab
stays anonymous.

## Theme

The theme switch (monitor, sun, moon) sets the light or dark scheme for the
whole UI. The default, System, follows the operating system. The app stores
the choice per browser, so a dark GM laptop and a light table display can
run at the same time.

## Campaign controls

| Control | What it does |
| --- | --- |
| New | Resets to the blank campaign after a confirmation |
| Load example | Replaces the campaign with the demo campaign after a confirmation |
| Import | Loads a campaign from a `.json` file |
| Save | Writes the campaign to the local storage of the browser |
| Export | Downloads the whole campaign as a `.json` file |
| Undo, Redo | Steps back to the state before the last Save, New, Load example, or Import, and forward again |

The app does not save on its own except through autosave, which runs after
you pause editing. The Save button reads "Save •" while changes are
unsaved. The undo history covers many steps, but not an unlimited number. A
save from a stepped-back position discards what was left to redo.

Everything lives in the local storage of one browser, under one origin.
There is no server and no account.

## The example campaign

Load example replaces the campaign with a complete demo. It has a 32x32
overworld with a bay coastline. Four outdoor subregions sit on it: two
wilderness regions, the farming town of Briarwick, and the port of
Saltmere. A dungeon interior and a castle keep sit under it. The campaign
ships an eleven-quest chain, two staffed towns of NPCs, field enemies in
every biome, minor bosses and a major boss, lore handouts, a bestiary of
reusable mob templates, and a two-member party with kit and spell slots.

## Build mode

### Node kinds

The world is a tree of nodes. The top node is the world map. Regions and
interiors hang beneath it.

| Kind | Palette it gets |
| --- | --- |
| Region | The full terrain, road, river, coast, and building palette |
| Interior | Interior pieces only: floors, walls, doors, stairs |

A node also carries a free-text environment tag, for example grassland,
forest, shop, or temple. The tag is description only.

### Palette tools

| Tool | What a drag does |
| --- | --- |
| Brush | Paints the selected terrain, road, or marker on every cell the pointer crosses |
| Erase | Clears cells back to empty |
| Inspect | Selects one cell and opens it in the tile inspector |
| Region | Marks the dragged rectangle as one sub-region |

The Size row (1x, 2x, 3x) sets how large the next painted tile draws. At 2x
or 3x, one click stamps one tile whose image stretches across a 2x2 or 3x3
block. The block is visual only. The covered cells keep their own terrain,
roads across it stay tile-sized, and fog reveals it piece by piece. A
scaled stamp places one block per click. Roads always paint at 1x.

Roads overlay the terrain under them. Repainting the terrain under a road
leaves the road on top.

The Tools card holds Undo stroke and Export PNG. Undo stroke reverts the
last edit, where a whole drag, a region link, or a generation each count as
one edit. This history is separate from the header Undo and Redo, and it
ends at a page reload. Export PNG downloads the current map at full
resolution, with fog ignored.

### Tile inspector fields

| Field | Meaning |
| --- | --- |
| POI type | The point-of-interest marker on the tile |
| Discoverable | The POI stays hidden until the party steps onto its tile |
| Notes | GM-only text. The GM sees it on hover in Play mode |
| Zooms into | The child node that this tile leads to |
| Set party start here | Places the spawn tile of the party |

### Map generation

The Generate card fills the current node with a generated layout.

| Field | Values |
| --- | --- |
| Archetype | wilderness or town for a region, dungeon or castle for an interior |
| Size | small, medium, or large |
| Seed | The number that reproduces the layout |
| Levels | For a dungeon, how many levels to create |

The dialog previews the exact layout before it stamps anything. Every
generated layout can reach its parent map. A dungeon gets an entrance
corridor with a door on the map edge. A castle gets a gate in the south
wall. A town gets roads that run edge to edge. When nothing on the parent
map links to the node, generation places an entrance tile near the center
of the parent and reports where.

Each level of a multi-level dungeon becomes a child node. The stairs down
of one level lead to the stairs up of the level below. The bottom level has
no stairs down.

### Link warnings

Build mode shows a warning above the tool tabs when the node in view has no
way in or out. The world tree marks each node that has a problem with a
warning triangle.

| Warning | Meaning |
| --- | --- |
| Nothing leads here | No tile on the parent map links to this node |
| No way out | The node is linked, but has no outer door, no usable staircase, and no painted parent tile beside its block |

Neither problem strands a party. A node without an authored way out still
offers a plain "Return to {parent}" button.

## Play mode

The sidebar holds the session panels in three tabs.

| Tab | Panels |
| --- | --- |
| Session | World, Time, Party, Encounters, Initiative |
| Story | Quests, NPCs, Handouts |
| Log | The travelogue |

Hide panels collapses the sidebar and gives the map the full width.

### Map markers and ranges

| Marker | Meaning |
| --- | --- |
| Gold token | A character, when party splitting is on |
| Red diamond, upper right of a tile | A live encounter |
| Blue circle, upper left of a tile | A placed NPC |
| Gold outline | A revealed point of interest |

Movement reveals fog in a radius around the new position, and a revealed
tile stays revealed. An encounter marker and an NPC marker appear at
detection range, which is twice the fog reveal radius. The Nearby
encounters tab lists encounters within four times the reveal radius.

Hovering a tile in Play mode, with the pointer or with the keyboard cursor,
names the point of interest and the NPCs on it. This follows the same
detection range as the markers, so a tile out of range says nothing.

### Encounter fields

| Field | Meaning |
| --- | --- |
| Name | The name shown in the panel and the log |
| Max HP | The full health pool |
| Level | Drives the default stat block |
| Tier | mob for rank and file, legend for an above-normal enemy |
| Weapon, Armor | Gear from the library. None leaves the enemy unarmed or unarmored |
| Map, Tile | Where the encounter stands |

The six ability scores plus AC are the only stats an enemy carries. A
legend always out-stats a level-matched mob. A defeated encounter is styled
as defeated, not deleted.

In Play mode, a click on a stat chip applies a timed adjustment, for
example +2 STR for 3 rounds, shown as "STR 14->16 (3r)". The adjustment
ticks down as combat rounds pass, and combat math uses the adjusted value
while it lasts. In Build mode, the same chips set base values.

### Combat screen

| Area | Contents |
| --- | --- |
| Left column | The active combatant: initiative, AC, HP, conditions, concentration with its Drop control, death saves with their Roll and Stabilize controls, damage and heal steppers, and the loadout |
| Center | The board: one card per combatant, with HP bar, AC, conditions, and a short loadout. A dying, stable, or dead character carries a chip for it |
| Right column | The combat log, with the dice tray docked beneath it |
| Bottom | The turn ribbon: one chip per combatant in initiative order |

The current turn is ringed in the ribbon. A foe chip carries a sword. A
defeated combatant is struck through. A combatant that cannot act, such as a
stunned one, takes a dashed edge on both its ribbon chip and its board card,
which marks it apart from a defeat: it is still in the fight, and only its
turn is gone. A click on a chip inspects that combatant without advancing the
turn.

A player card shows spells and slots to its own bound tab. Another player's
card shows armor and weapons only. A foe card shows no loadout at all
except to the GM tab.

Back to map leaves the screen without ending the fight. The Initiative card
in the sidebar shows the round and holds Open combat. Only the GM can click
End combat. A fight also ends when the party walks off the tile, or when
the last creature staged there is deleted.

### The rules the app applies

Attack rolls follow 5e without change.

- The roll is 1d20, plus the ability modifier of the weapon, plus the
  proficiency bonus of the attacker, against the AC of the defender.
- A character adds the proficiency bonus only when its proficiency lists cover
  the weapon, by category or by name. Without that, the roll takes the ability
  modifier alone, and the log says "not proficient". A creature is always
  proficient with its own weapon, the way a 5e stat block is.
- STR modifies a melee weapon. DEX modifies a ranged weapon. A finesse weapon
  uses the higher of the two.
- A versatile weapon offers a "Wield two-handed" box in the attack dialog. The
  box swaps the damage dice for the two-handed dice.
- A ranged or thrown weapon offers a Range field in the attack dialog. A shot
  at long range takes disadvantage, which folds in with the condition chips.
  A mode you pick in the Roll field still beats it.
- A natural 20 hits whatever the AC is, and every damage die rolls twice.
- A natural 1 always misses.
- On a hit, the damage dice roll with the ability modifier folded into the
  base term. Proficiency never adds to damage.

The app applies the damage to the defender. An encounter loses HP on the
spot, and a defeat is logged. A character loses bonus HP first, then real
HP. An NPC loses HP the way an encounter does.

A party character at 0 HP is dying, not dead. It gets a death-save tracker on
the combat screen and on its sheet, and the Unconscious chip.

- The save is 1d20 against DC 10, with no ability modifier and no proficiency.
  A Bless chip still adds its die.
- Three successes stabilize. The character stays at 0 HP and unconscious, and
  rolls no more saves. The Stabilize button does the same thing without a roll.
- Three failures kill. The app says so and changes nothing else. What happens
  next is yours to decide.
- A natural 20 wakes the character at 1 HP. A natural 1 counts as two failures.
- Any damage while at 0 HP is an automatic failure, with no roll. A critical
  hit counts as two. Damage on a stable character starts the saves again.
- The hit that drops the character to 0 HP costs no failure. Any healing above
  0 HP clears the tracker, a dead one included. That is how you decide the
  death did not stand. Healing from the combat screen, from the sheet's HP
  stepper, from a spell, and from a rest all count.
- The roll is a button, not automatic. Nobody rolls for the player at the turn
  advance.

An encounter and an NPC have no death saves. Both are defeated at 0 HP.

Initiative uses the DEX modifier, which is `floor((DEX - 10) / 2)`. The
default initiative value is 10 plus the modifier. Roll initiative rolls d20
plus the modifier for everyone at once.

Armor class follows 5e as well.

| Source | Effect on AC |
| --- | --- |
| Body armor | Its base AC replaces the unarmored baseline |
| Light armor | Adds the full DEX modifier |
| Medium armor | Caps the DEX modifier at +2 |
| Heavy armor | Ignores DEX |
| Shield | A flat +2 |
| Other equipped items | Their own flat AC bonus |
| No body armor | Base AC (normally 10) plus the full DEX modifier |

Armor proficiency follows 5e as well. A character that wears armor its
proficiency lists do not cover pays for it in three places. A shield counts
as its own entry in the armor list.

- Every STR and DEX save or check from the sheet rolls at disadvantage. The
  slant folds in with the condition chips, so an advantage chip cancels it.
  The log says "not proficient" and names the worn piece.
- The character cannot cast a spell. The refusal names the armor and spends
  nothing. The cast dialog offers an "Ignore armor" box, which casts anyway,
  for a table that waives the rule.
- A spell that forces a STR or DEX save catches the wearer too: the target
  rolls that save at disadvantage.

The AC of the armor still applies. Wearing armor untrained changes rolls,
not the armor itself. A creature has no proficiency lists and never pays
this penalty.

Timed conditions tick down at the start of each round and expire on their
own.

Eleven condition names carry rules. The app applies them wherever the roll is
thrown: a weapon attack, a spell attack, a spell save, and a save or a check
rolled from the character sheet.

| Condition | What it does |
| --- | --- |
| Blinded | Attacks at disadvantage. Attacks against it have advantage |
| Frightened | Attacks and ability checks at disadvantage |
| Incapacitated | Loses its turn |
| Invisible | Attacks with advantage. Attacks against it have disadvantage |
| Paralyzed | Loses its turn. Attacks against it have advantage, and a melee hit is a critical hit. Fails STR and DEX saves outright |
| Petrified | Loses its turn. Attacks against it have advantage. Fails STR and DEX saves outright |
| Poisoned | Attacks and ability checks at disadvantage |
| Prone | Attacks at disadvantage. Melee attacks against it have advantage, ranged attacks disadvantage |
| Restrained | Attacks at disadvantage. Attacks against it have advantage. DEX saves at disadvantage |
| Stunned | Loses its turn. Attacks against it have advantage. Fails STR and DEX saves outright |
| Unconscious | Loses its turn. Attacks against it have advantage, and a melee hit is a critical hit. Fails STR and DEX saves outright |

Charmed, Deafened, Exhaustion, and Grappled carry no rule. They need a
relationship between two combatants, an exhaustion track, or movement, none of
which the app has. Adjudicate them by hand. A chip you type yourself matches a
row when it spells one of the names above, ignoring case, and carries no rule
otherwise.

Advantage and disadvantage from any number of sources fold by the 5e rule: if
both are present the roll goes straight, and otherwise the one kind present
wins. Chips on both sides of an attack count, and the log names every chip that
slanted the roll, including the ones that cancelled. A roll that no chip
touches still honors the dice tray's own advantage toggle.

A combatant that loses its turn keeps its place in the initiative order. Next
turn steps past it and says nothing. A save that fails outright never reaches
the dice, and the log names the chip that failed it.

NPCs carry condition chips as well. The chips sit on the NPC's row in the Story
tab's NPC panel and on its card in the fight. The Build rail's NPC list is for
authoring and shows none.

## Characters

The Party roster creates, selects, and deletes characters. The selected
character scopes the Character sheet and the Inventory panel.

### Sheet contents

The collapsed card shows the name, the race, a full-width HP bar with
damage and heal steppers, and, for a caster, one pip group per spell level.
A filled pip is an unspent slot. A click spends or restores it.

The expanded card adds the ability scores with their modifiers, the XP
award control, custom resource pools, the Progression block, the hit-dice
pool, and the class features unlocked by level.

It also lists the six saving throws and the 18 skills with what each one
adds. A dot in front of the name says how trained the character is: hollow
for untrained, solid for proficient, and ringed for expertise, which doubles
the proficiency bonus. Passive Perception sits under the skills. It is 10
plus the Perception bonus, the score to compare a hidden thing against when
nobody says they are looking.

A click on a save or a skill rolls it. The dice tray opens with the d20 and
the whole bonus, and the session log breaks the number down: the ability
modifier, the proficiency or expertise, and any condition chip that adds to
the roll, such as Bless on a save or Guidance on a check. The roll carries no
DC, so nothing judges it. Read the total against whatever you had in mind. The
tray's advantage and disadvantage toggle applies, and the log names the die it
threw away. A player on a bound tab rolls their own character. A spectator sees
the numbers and cannot roll.

The Conditions block holds the chips, the held spell with its Drop control,
and, while the character is at 0 HP, the death-save tracker with its Roll and
Stabilize controls. The tracker shows the same pips and the same words as the
combat screen.

Expertise is a GM grant. The Set expertise button in the Progression block
lists the skills the character is proficient in. The proficiency bonus doubles
for the ones you pick. No class feature grants expertise yet.

| Field | Who can set it | Meaning |
| --- | --- | --- |
| Max HP | GM | Overrides the derived maximum and clamps current HP |
| Bonus HP | GM | Temporary points on top of intrinsic HP. Damage drains it first, and healing never refills it |
| Base AC | GM | The unarmored baseline, normally 10 |
| XP | GM | Award XP grants the same amount to every character at once |

### Creation and progression

Creation picks a class, a race, and a background, and offers the skill
choices of the class. From these three choices the sheet assembles the
proficiencies: saving throws, skills, weapons, armor, tools, and languages.
Every list stays editable afterward.

The class fixes the hit die and the caster type. Max HP derives from the
hit die plus the CON modifier per level. Spell slots follow the 5e table,
and a multiclass character combines its casting classes on the
combined-caster-level table. A classless character still works. Its HP then
follows a flat growth curve, and it gains no proficiencies.

Enough XP does not level a classed character on its own. Each earned level
waits as a pending level that the GM assigns to a class, either the current
class or a new one. An assignment grows HP by the hit die of that class,
adds a hit die, and advances spell slots. A newly unlocked spell level
arrives full, and an already spent slot stays spent. An ASI level leaves a
pending choice: +2 across one or two abilities, capped at 20, or a feat by
name. Both choices are undoable from the same block.

The hit-dice pool is spendable. A short rest spends a die to heal the roll
plus the CON modifier. A long rest restores half the pool.

### Inventory and equipment

The panel has two tabs. Equipment holds nine slots: Helmet, Armor, Gloves,
Greaves, Main hand, Off hand, Ranged, Ring 1, and Ring 2. Each picker lists
only the items that its slot accepts. Inventory holds the item list, with a
search box over names and descriptions, a type filter, and one collapsible
heading per item type.

| Item field | Values |
| --- | --- |
| Type | gear, weapon, armor, helmet, gloves, greaves, shield, bow, ring, consumable |
| Description | Free text |
| Damage roll | Structured dice terms: a base roll plus optional permanent riders |
| Category | simple, martial, or none for a natural weapon such as a bite |
| Kind | melee (STR) or ranged (DEX) |
| Properties | The 5e property flags: finesse, versatile, two-handed, light, heavy, reach, thrown, ammunition, loading |
| Range | Normal and long range in feet, for a ranged or thrown weapon |
| Two-handed damage | The alternate dice of a versatile weapon |
| Status effects | Tags that the weapon inflicts, for example burning or poisoned |
| Weight class | For body armor: light, medium, or heavy |
| Base AC | For body armor |
| AC bonus | A flat bonus on any other equippable |
| Ability buff | For example +2 STR, applied while equipped |

Only the GM adds an item. A player uses, gives away, and discards what the
character carries. A consumable gets a use-one control down to its last
charge. Anything else gets a drop-one control while it is stacked. The
discard button takes the whole stack, and confirms first when the stack
holds more than one item.

An edit keeps the item equipped, because it is the same item. A type change
that its slot cannot hold takes the item off. Removing the last of a stack
unequips it.

## Time, story, and dice

| Panel | Contents |
| --- | --- |
| Time | The in-game day and watch, Advance, Short rest, Long rest |
| NPCs | Friendly, neutral, or hostile townsfolk with a disposition badge, notes, and a placement |
| Quests | Active and completed quests |
| Handouts | Read-aloud text or lore attached to a node or the campaign, with an optional image and an eye toggle |
| Travelogue | An automatic log of region entry, teleports, defeats, rests, and discoveries, newest first |

A short rest restores half of the character resources. A long rest restores
all of them. Only a long rest refills spell slots.

An NPC sits on any map at specific coordinates, or stays unplaced, in which
case it appears everywhere. The panel lists the NPCs at the current
location of the party.

The Dice Tray collapses to a d20 icon. The full tray sets a count per die
type (d4 to d100) and a flat modifier with plus and minus steppers. The
tray parses no text expressions. The result shows each face and the total,
and the last eight rolls stay listed with timestamps. The history lasts for
the current session only.

## The library

Library mode has three tabs.

| Tab | Contents |
| --- | --- |
| Equipment | Every weapon, armor, gear item, and consumable the item form offers, across five category subtabs |
| Creatures | Stock enemies and townsfolk, across two subtabs. Foes holds the hostile templates, and People holds the rest. The hand-off icon opens the matching campaign dialog, pre-filled |
| Spells | The spell catalog the spellbook picks from, grouped by spell level |

An edit to a built-in default stores an override. The row gains a
"customized" badge and a revert button. A new entry carries a "custom"
badge and a delete button. A custom entry overrides a default when the
names match. For equipment, the name and the type must both match.

Customizations live outside the campaign. New, Import, and Load example
replace the campaign and never touch the library.

| Library file control | What it does |
| --- | --- |
| Export | Downloads `campaign-library.json` |
| Import | Loads an exported file into this browser, and replaces the customizations after a confirmation |
| Reset | Removes all customizations and restores the built-in defaults |

The app loads `library/campaign-library.json` from the project directory at
startup when the browser has no customizations. The merged lists apply at
once everywhere the presets are read.

## Keyboard control

Press `?` anywhere for the shortcut reference.

| Key | Action |
| --- | --- |
| Ctrl/Cmd+S | Save |
| Ctrl/Cmd+Z | Undo, or undo the last stroke in Build mode |
| Ctrl/Cmd+Shift+Z | Redo |
| B, P | Switch to Build or Play mode |
| Arrows on the map | Move the map cursor |
| Enter, Space on the map | Act on the cursor cell |
| +, - on the map | Zoom |

The map is a focusable widget with a visible focus ring. A screen-reader
live region names the current node, its size, the party position, and the
revealed points of interest, and updates as these change.

The ways out of a sub-region are real buttons. Tab past the map, and they
appear over it, each naming its way out, for example "Return to Darkwood,
through the stairs up at 4,1". A cursor walk off an edge takes two presses:
the first lights the arrow, and the second travels.

The turn ribbon and the board of the combat screen are one tab stop each.
Arrow keys move between chips and between cards. Enter or Space picks a
target. A live region announces each turn.

## Mouse control

| Input | Build mode | Play mode |
| --- | --- | --- |
| Left button | Paint, erase, inspect, or drag a region | Move the party or the selected character |
| Right button drag | Pan the map | Pan the map |
| Wheel | Zoom | Zoom |

The map grid carries X and Y labels along the top and left edges. The
labels pin to the edges of the viewport at partial opacity when the grid
edge scrolls out of view.
