# Time, story, and dice

*Reference. Part of the [GM reference](../gm-reference.md). For the steps of a task, read the [GM guide](../gm-guide.md).*

## Time and rests

The Time panel shows the in-game day and watch, for example "Day 3, Dusk".
A day has six watches: Dawn, Morning, Midday, Afternoon, Dusk, and Night.
Under the watch, a line and a thin bar show the time spent inside that
watch, for example "3 hours 30 minutes in". At the start of a watch the
line reads "Start of the watch". Only a GM tab shows the buttons. A walk of the party also moves the clock
on, by the time that [Party movement](play.md#party-movement) lists for each map.

| Button | Time passed | Effect |
| --- | --- | --- |
| Advance | One watch, 4 hours. The minutes already spent inside the watch stay, so "Day 1, Dawn, 3 hours 30 minutes in" becomes "Day 1, Morning, 3 hours 30 minutes in" | None beyond the time |
| Short rest | One hour | Refills pact slots and each short-rest pool (see [Class feature pools](characters.md#class-feature-pools) and [Custom pools](characters.md#custom-pools)). Sorcerous Restoration gives 4 sorcery points at sorcerer 20. Restores no HP, because in 5e only spent hit dice heal on a short rest |
| Long rest | Eight hours, two watches. From Afternoon or Dusk, a dialog also offers to rest until the next Dawn | Restores HP and every resource except a No rest pool, refills the spell slots, and takes one level of exhaustion off each character. A character at 0 HP gains nothing |

A short rest ends with a message that names the pools it restored and the
new time, for example "Short rest: 1 hour. Second Wind and Action Surge
restored. Now Day 1, Morning." When no character is hurt, the short rest
opens no dialog and goes straight to that message.

The three buttons do nothing while a fight runs, and their tooltip reads
"End the fight first". A rest in a fight would heal and refill the party
while the turn order stayed where it was, and effects that end at a turn
boundary, such as Shield, do not end with game time.

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

## Quests

A row of buttons at the top of the Story tab names the Quests, NPCs, and Handouts cards with the number of entries in each. The Quests count includes the quests in a folded group. A click on one opens that card and scrolls to it. Each card also has a chevron button in its top-right corner that folds the card to its title, and the browser remembers which cards you folded.

The Quests panel in the Story tab lists active and completed quests.

| Control | What it does |
| --- | --- |
| New quest | Opens the quest dialog, with Title, Notes, Unlocks, and the reward fields. **Create** stays disabled while the title is blank |
| Status mark | Completes or reopens the quest |
| Eye | Reveals the quest to players, or hides it again. The eye reads as pressed while players can see the quest |
| Chevron | Shows or hides the details: the notes, the objectives with all their controls, the links, and the buttons below |
| Group heading | Folds or opens the Active or Completed group. The chevron sits before the group name, and the heading shows the number of quests in the group. The Completed group starts folded, and the browser remembers each choice |
| Objective | Adds an objective |
| Link place | Links the quest to a map place |
| Link creature | Links the quest to a creature |
| Edit, Delete | Edits or deletes the quest |

A folded quest is one line: the status mark, the title, a **Shown** or **Hidden** badge, the count of objectives done (such as "1 of 4"), the chevron, and the eye. A click on the title or the chevron opens the quest. The open details list the objectives, each with a checkbox that marks it done, and several objectives can be done at once. Each objective also has controls to hide it
from players or reveal it, to move it up or down, and to remove it. A click on a
link chip shows the linked place on the map. A place chip names the map and the
tile, such as "Briarwick Vale (column 21, row 15)".

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
into the gold field of the Coins row of each character.
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

## NPCs

The NPCs panel in the Story tab lists the friendly and neutral creatures
near the party. Each row shows a disposition badge, the location, and the
chips. In a GM tab, **New NPC** and **From bestiary** sit below the list.
**From bestiary** opens the **Add from bestiary** dialog (see [Encounters
tab](build.md#encounters-tab)) with the tile of the party as the default place.

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

## Handouts

A handout is read-aloud text or lore, with an optional picture.

| Field | Meaning |
| --- | --- |
| Title (required) | The name of the handout. **Create** and **Save** stay disabled while the title is blank |
| Read-aloud / lore | The text, in a box of several lines. Line breaks stay in the text |
| Image (optional) | A picture. Click **Choose image** to pick a file, and the file name shows beside the button. When you edit a handout, leave the field empty to keep the current picture |
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

## Travelogue

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
| Story entries kept (Travel, Note, and Rest) | The newest 200 |
| Roll and Combat entries kept | The newest 200 |
| Roll and Combat entries kept while a fight runs | Every line of the fight, up to 1,000 |

The two counts are separate. A long fight or many dice rolls remove only
older Roll and Combat entries, and the story entries stay.

The note box at the top of the Travelogue adds a Note entry of your own,
such as a ruling or a name that the players made up. Type the text, and
click **Add note** or press Ctrl+Enter (Cmd+Enter on a Mac). Tick **GM only**
to keep the note out of every Player tab. The box shows only in a GM tab.

| Control | What it does |
| --- | --- |
| Kind chips | Travel, Notes, Rests, Combat, and Rolls. Click a chip to hide or show the entries of that kind. The choice lasts until you reload the tab |
| Copy as text | Copies the entries that the chips show to the clipboard, oldest first, one line each, such as "Day 1, Dawn: Entered the Keep." Paste it into your session notes |
| Clear log | Deletes every entry after a confirmation |

## Dice tray

The Dice Tray collapses to a d20 icon with the label **Roll dice**. The full tray builds a roll from
steppers, and it does not read typed dice expressions.

| Control | Values |
| --- | --- |
| Die counts | A small cell for each of d4, d6, d8, d10, d12, d20, and d100, with a minus button, the count, and a plus button. The cells fill as many columns as the tray width allows, and a die with a count other than zero shows in the accent color |
| Modifier | The **mod** cell after the dice: a flat number, set with plus and minus buttons |
| d20 mode | A switch under the dice: Normal, Advantage, or Disadvantage. Advantage rolls every d20 twice and keeps the higher die, and Disadvantage keeps the lower. The choice stays until you change it |
| DC | The field beside the Roll button: an optional number to meet or beat. Each roll then reports success or failure. A save or a skill rolled from the character sheet uses it as the DC |
| Hidden roll | A box beside the Roll button, in a GM tab only. A ticked box makes each **Roll** secret. The box stays ticked until you clear it |
| Roll | Rolls the selection |

The tray shows the latest result at its top. The total is large, and the dice faces and
the modifier sit beside it in small type, as in "d20 (5) + 3". A roll with a
target ends with a line such as "vs 15: fail". Every roll
also goes into the Travelogue under the name of the roller. The name is
"The GM" for a GM tab, the character name for a bound tab, and "A player"
for a spectator tab.

A hidden roll goes into the Travelogue as a GM-only line, such as "The GM
rolls in secret: d20[4]=4 + modifier=3 -> total: 7". A Player tab reads only "The GM rolls in
secret." Use it for a Perception check that the players do not know about,
or for the save of a foe. The box applies only to the **Roll** button. An
attack, a save, or a check that the app rolls logs its own line, and the box does not change it.

An attack or a death save from the app opens the tray and shows its roll
there. The dice counts and the modifier keep what you set, so your next
**Roll** is your own roll and not a repeat of the attack. An attack judges
against the AC of its target for that roll only, and the DC field
keeps the value that you typed. A save or a skill from the character sheet
rolls in the tray without opening it. A roll that names its own
mode uses that mode for one roll only, and it leaves the d20 mode as it was.
