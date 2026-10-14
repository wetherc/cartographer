# Play mode

*Reference. Part of the [GM reference](../gm-reference.md). For the steps of a task, read the [GM guide](../gm-guide.md).*

Play mode is where you run a session.

## Play layout

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

On a window wider than about 1,090 pixels, Play mode fits the screen and the page does not scroll. The dock and the sidebar each scroll on their own, so the map, the party, the dice tray, and the open sheet stay in view together. On a short window, an open dice tray scrolls in its own box, and the Party card keeps room for four characters. A click on a row of the Party card selects that character and opens the Sheet tab. While **Hide panels** is on, the click selects the character and leaves the hidden sidebar on its tab.

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

## Map controls

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
down. A change of mode or of map also puts the brush down. A tile that you
hide stays hidden after a reload and in every Player tab, until the party
moves within sight of it again.

When a map opens in Build mode, the view fits the whole map, even when its
tiles then draw small. In Play mode the view fits the revealed tiles. If they
are too large to show at a readable size, the view centers on the party
instead, and **Fit map to view** shows them all at a smaller size. In a Player
tab, it centers on the bound character. The view then follows the party
until you pan or zoom.

A switch to Play mode opens the node where the party stands.

## Party movement

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

The minutes add up across walks. The Time panel shows the minutes spent
inside the current watch, and it shows the next watch once 4 hours have
passed. When a walk moves the clock into a new watch, a message and a Travelogue
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

## Ways out of a map

Inside a sub-map, the edges and tiles that lead back to the parent map show
return arrows. A click on an arrow travels.

| Kind | Where it shows | Where it leads |
| --- | --- | --- |
| Edge | A side of an outdoor sub-map that touches painted tiles on the parent map. The arrow shows while the party is at most three times its sight from that side | Back to the parent tile that the party crossed. If another region of the same parent map borders that side, the party crosses into that region at the matching spot |
| Tile | An outer door, or a staircase with no link, in an interior | Back to the parent level |
| Fallback | A node with neither kind | A plain "Return to (parent)" button |

An exit arrow that the mini-map would cover moves along its side of the map
until it is clear.

The mini-map floats over the bottom-right corner of the map in every mode,
away from the coordinate digits, and the map fits the canvas as if it were
not there. A region name under the mini-map hides. Tiles can pass under the
mini-map, and a click or a paint
stroke there does nothing. Pan the map, or collapse the mini-map, to paint
those tiles. On a narrow screen the mini-map starts collapsed.

When the tiles are small, the coordinate digits label every second column or
row (1, 3, 5, and so on), so that the numbers do not overlap. Zoom in to see
every number. On very small tiles the map shows no coordinate digits.

## Party splitting

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

## Map markers and ranges

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
| An outdoor map below the world map, at Night, for a group that sees in the dark | 2 |
| A building interior | 2 |
| A dungeon, a cave, or a cellar, for a group that sees in the dark | 3 |

A group sees in the dark when every character in it has darkvision from
its race, or when one character in it carries an item with the **Sheds
light** box ticked. The Torch and the Lantern presets tick the box. The
group is the party, without the characters that stand apart from it. A
character that moves alone sees with its own darkvision or light.

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
it. It also names a linked map whose name plate does not fit on the map at
that zoom, such as a small building in a town. The keyboard cursor does the
same. The hover names points of interest and NPCs only within the detection
range, so a tile out of range does not name them.

## The mini-map

Inside a sub-region, a small picture of the map one level up sits in the
bottom-right corner of the map. On the world map, the mini-map is hidden.

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

## Encounters panel

The Encounters panel in the Session tab has two tabs.

| Tab | GM tab lists | Player tab lists |
| --- | --- | --- |
| Active encounter | The live hostile creatures on the tile of the party and on the eight tiles around it | The same creatures |
| Nearby encounters | The other hostile creatures within the nearby range, on the node of the party, plus unplaced ones | The other live hostile creatures on revealed tiles of the node of the party, plus unplaced ones that the party walked into. A defeated foe does not show |

A friendly or neutral creature never shows in the Active encounter tab. It
stays in the NPCs panel.

Both tabs show one line for each group of foes that share a name, such as
"Gray Wolf x4". The line shows the HP of the group added up and the distance
of the nearest one in tiles, or "Here" when it stands on the tile of the
party. The nearest group comes first. Every defeated foe goes into one
"Defeated (2)" line at the end. On a GM tab, click a line to open the full
row of each of its foes. One line opens at a time in each tab. A Player tab
shows each line as text, with the HP band instead of the bar.

A full row shows the name, the HP, and the column and row on its first line.
The **Amount** field and the buttons of the row go on the line below. The
Amount field sets how much the damage and heal buttons of that row apply. An empty field, or a number below 1, disables both buttons.

A GM tab also shows these controls:

| Control | What it does |
| --- | --- |
| Start combat | Opens the combat setup for the party, the creatures of the Active encounter tab, and any friendly or neutral creature on the tile of the party |
| New creature | Opens the creature dialog for a new foe |
| From bestiary | Opens the **Add from bestiary** dialog |
| Save as a bestiary template, on a row | Stores that creature as a campaign template |

## The difficulty hint

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

## Creature fields

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
| Weapon | None (unarmed) | The main weapon, from the library. The attack dialog lists it first, and the on-hit save applies to it |
| Other weapons | None | More weapons from the library, such as the shortbow of a goblin. Each one gets its own button in the attack row |
| Armor | None (unarmored) | Armor from the library |
| Multiattack (attacks per action) | Blank (one attack) | How many times the creature swings one of its weapons for one Attack action, from 2 to 6 |
| Multiattack: attack with disadvantage | Blank (none) | The swing of the Multiattack that rolls with disadvantage, such as 2 for the second attack. Blank, or a number past the last swing, stores none |
| Redirect Attack (reaction: an ally becomes the target) | Off | When an attack targets the creature, the app offers to make an ally the target instead. See [Redirect Attack](combat.md#redirect-attack) |
| Turn Resistance (advantage on saves against Turn Undead) | Off | The creature rolls its WIS save against Turn Undead with advantage. Use it for Turn Resistance and for Turn Defiance |
| Legendary actions per round | Blank | The legendary actions of the stat block, from 1 to 5. Blank means none. Each one is an attack that the creature takes on the turn of another combatant. See [Legendary actions](combat.md#legendary-actions) |
| Legendary resistance per day | Blank | The uses of Legendary Resistance, from 1 to 5. Blank means none. A long rest of the party gives them back. See [Legendary resistance](combat.md#legendary-resistance) |
| Pack Tactics | Off | The attack dialog of the creature offers a Pack Tactics box, which gives advantage |
| Surprise Attack: dice, Surprise Attack: die | Blank, d6 | Extra damage dice on a hit against a surprised target in round 1. Blank stores none |
| On hit: save, On hit: DC, On hit: condition on a fail | None, 10, Prone | A save that each hit of the weapon forces. A target that fails the save gains the condition. None stores no save |
| Resistant to, Vulnerable to, Immune to | None | The damage types that the creature takes half, double, or no damage from |
| Immune to conditions | None | The conditions that do not land on the creature. The log names the immunity in place of the chip |
| Caster class | None (non-caster) | The class whose spell list and ability the creature casts with |
| Caster level | Blank | The level that sets the spell slots of the creature |
| Spells | None | The spells that the creature knows |
| Edit actions | No actions | Opens the list of save actions, such as a breath weapon. Pick an action to edit it, or **Add an action**. See [Creature actions](combat.md#creature-actions) |
| Location (map), Column, Row | The selected cell, or the middle of the map when no cell is selected | Where the creature stands. Columns and rows count from 1. Unplaced means that it appears everywhere. The map list groups each map under its parent map |
| Pick on map | | Closes the dialog until you click a tile of the map in view. When **Location (map)** names another map, that map opens first. The hint at the bottom of the map names the map, and the tool chip on the map toolbar reads **Placing creature**. Then the dialog opens again with your values, and the map, column, and row of that tile. Press Escape, or **Cancel** in the hint over the map, to go back without a change. A click while the dialog waits does not move the party or paint. On a phone, the Play screen shows the **Map** view while the dialog waits, and then goes back to the view you were in. The button shows only in Play and Build mode, because Library mode and the combat screen do not show the map. A second **Pick on map** from another dialog cancels the first, and that first dialog opens again with no change |
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
The Play chip and the combat card show the AC with armor. While the
creature wears armor, the Build row also shows "AC in use" beside the Base
AC chip, and the creature form captions its AC field "Base AC (no armor),
AC in use 16" (for example) as you change the armor, AC, or DEX.

Worn armor replaces the 10 + DEX part with its own base AC and the part of
the DEX modifier that its weight allows. See [Armor class](combat.md#armor-class).
For example, a DEX 16 creature in Plate has AC 18.

The Encounters and NPCs panels show each trained save and skill with its
bonus, for example "Saves DEX +4 | Skills Stealth +6". The app calculates
each bonus from the ability score and the challenge rating, so there is no
number to type.

An unrated creature takes its proficiency bonus from its level. With no
level, the bonus is +2. A save that a spell calls for uses the same bonus,
so the cast dialog asks only for the DC.

A defeated encounter shows as defeated in the lists. The app does not
delete it.

## Stat chips

In Play mode, a click on a stat chip of a creature applies a timed
adjustment, for example +2 STR for 3 rounds. The chip then reads "STR
14->16 (3r)".

The adjustment counts down as combat rounds pass, and combat math uses the
adjusted value while it lasts. In Build mode, the same chips set base
values.
