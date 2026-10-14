# Roles and campaigns

*Reference. Part of the [GM reference](../gm-reference.md). For the steps of a task, read the [GM guide](../gm-guide.md).*

## Roles

The role switch sits at the right end of the header. Its accessible name is
Viewer, and its options are GM and Player. The first switch to Player in a
browser shows the toast "Player view. Click GM to return.", because the
Player view hides the mode switch and the campaign controls. A tab that
another tab forces out of the GM view does not show this toast.

| Role | Sees | Can change |
| --- | --- | --- |
| GM | Exact foe HP, tile notes, the whole map, and every quest, handout, and NPC | Everything |
| Player | Creature health as a band (Unharmed, Bloodied, Down), exact HP for the party, the fog-revealed map, and only what the GM revealed | Nothing, unless the tab is bound to a character |

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
[Party roster](characters.md#party-roster).

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

- the exact HP of a creature, foe or NPC ally (the view shows a health band
  instead). Party characters keep their exact HP
- the GM-only lines of the travelogue and the combat log: the total of an HP
  pool, the reason that an HP pool or an HP limit gives for each target, the
  save bonus of a creature, and the HP readout of a creature after you set
  its damage by hand. The Player view shows a version of each line without
  the number
- the dice and the result of a hidden roll from the dice tray
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

## Campaign search

The search box in the header finds a word in every part of the campaign.
Press `/` or click the box, and type. The list groups the matches by kind:
maps, quests, NPCs and creatures, handouts, tile notes, creature notes, and
the travelogue. Each group shows up to five matches, and a line under it
counts the rest. Every word you type must occur in the match, in any field.

Use the arrow keys to move through the list, and press Enter to open the
match. A click opens it too. Escape closes the list, and a second Escape
clears the box. A map, a tile note, or a creature with a place opens its map
and centers the tile. A quest, a handout, a creature with no place, or a log
line opens its list in the sidebar and marks the row. Between phone width
and a wide screen, the box shows as a lens button until you focus it.

A Player tab finds only what that tab can read elsewhere: revealed quests
and their shown steps, revealed handouts for its character, the creatures
that the party met, the player lines of the travelogue, and the maps where
the fog has cleared a tile. Quest notes, creature notes, and tile notes
stay GM-only, so a Player tab never matches them.

## Campaign controls

The header buttons create, save, and move the whole campaign. They show in
a GM tab only. On a phone-width window, the header buttons and the theme and role
switches fold into the **Menu** button beside the title. A press on a
button in the menu closes it, and so do Escape and a click outside the
header.

| Control | What it does |
| --- | --- |
| Welcome | Opens the Welcome card on the map, with its three ways to start: build by hand, generate a world, or load the example campaign. The card opens by itself only on the first visit with a blank campaign. In Library mode, the button switches to Play mode first. Escape closes the card, the same as Dismiss |
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
