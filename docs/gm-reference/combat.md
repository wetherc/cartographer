# Combat

*Reference. Part of the [GM reference](../gm-reference.md). For the steps of a task, read the [GM guide](../gm-guide.md).*

## Combat screen

The combat screen runs one fight at the full width of the page.

| Area | Contents |
| --- | --- |
| Top | The turn ribbon: one chip per combatant in initiative order, with its name and number, as in "Gray Wolf 2" |
| Left column | The active combatant: initiative, AC, HP, conditions with the GM's add and remove controls, concentration with its Drop control, death saves with their Roll and Stabilize controls, the Damage and Heal box, and the loadout |
| Center | The board: one card per combatant, with an HP bar, AC, and conditions. Click **Gear** under a card to show its short loadout. A dying, stable, or dead character shows a chip for its state |
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

On a wide window the combat screen fits the window, and each column scrolls
on its own. On a phone the ribbon chips scroll sideways, and a bar at the
bottom of the window shows whose turn it is with **Previous turn** and
**Next turn**.

A click on a ribbon chip inspects that combatant without a change of turn.
The left column then reads **Inspecting** and shows a **Back to current
turn** link. A click on the link, on the chip of the current turn, or on
the inspected chip again returns the column to whoever's turn it is. The
next turn and the end of the fight also return it.

The Damage and Heal box in the left column shows to the GM only. Its
**Target** select picks the combatant that the box acts on, and the buttons
name that combatant, as in **Heal Mirelle**. The target defaults to the
inspected combatant, then to the card selected on the board. With neither,
the select reads **Choose a target**, and **Damage** and **Heal** stay
disabled until you pick one. The box never defaults to the combatant whose
turn it is. A new selection on the board or a new inspection resets the
target. A selection lasts for one turn, and **Next turn** clears it. A
dying ally can be selected, so you can heal it on a foe's turn. The
**Amount** starts at 1, and each **Damage** or **Heal** press sets it back
to 1, so a second click does not repeat a big hit. A click in the field
selects its number, so you can type the next amount over it. An empty
field, or a number below 1, disables both buttons.

| Viewer | Loadout shown on a card |
| --- | --- |
| GM tab | Every loadout |
| Bound tab, own card | Armor, weapons, spells, and slots |
| Bound tab, another player card | Armor and weapons only |
| Any Player tab, foe card | No loadout |

| Control | Who | What it does |
| --- | --- | --- |
| Back to map | Everyone | Leaves the screen without an end to the fight. A bar above the Play map shows the round and whose turn it is, and its **Return to fight** button opens the screen again. The Initiative card moves to the top of the Session tab and has **Open combat** too |
| Previous turn | GM only | Moves the turn back one combatant, past a combatant that cannot act. Use it to take back a **Next turn** pressed by mistake. It moves the turn only: a repeated save, a round tick, or a chip that ended on the way stays as it is, and the header **Undo** takes those back. It is disabled on the first turn of the fight |
| Initiative field | GM only | Sits in the left column. Type a new value and press Enter, or leave the field, to fix a mistyped roll. The order sorts again, and the turn stays with the combatant who has it |
| Delay turn | GM only | Shows in the left column on the current turn. The combatant moves to just after the next combatant in the order and takes that combatant's initiative, and the next combatant starts its turn. When that combatant cannot act, such as a Paralyzed one, its turn starts and ends, and the turn passes on. The delayed combatant keeps its unspent actions. The last combatant of a round cannot delay |
| Condition | GM only | Sits in the left column with the chips of the combatant it shows. It opens the same dialog as the Condition button of a creature card, and the x on a chip removes it. Players see the chips only |
| End combat | GM only | Opens the XP dialog when the party did not lose, a character is alive to earn XP, and the fight has XP to award, a standing foe, or loot. The dialog ends the fight. While foes stand and no character can earn XP, a confirm asks first. A lost fight, or a won fight with no XP to award, ends with no question |

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

The same dialog hands out loot. **Loot** lists the weapons and the armor of
each defeated foe, such as "Scimitar (Goblin 2)". A natural weapon, such
as a bite, drops nothing. Tick the items to keep, and pick the character
who takes them in **Loot goes to**. The items join that character's
inventory. **Total gp** takes the coins found on the foes, and splits
them evenly among the living characters, rounded down, into the gold
field of each character's Coins row. Each part logs one travelogue line.
The dialog also opens for a fight with loot and no XP.

A fight also ends when no creature of the fight is left on the tile of the
party or on the eight tiles around it, and no hostile creature of the fight
is left within the nearby range (8 tiles by default). A walk out of that
range ends the fight, and so does the deletion of the last creature in it.
The wider range lets a foe that joined from farther away keep the fight
open.

## Combat setup

**Start combat** opens the setup dialog. The **Set up combat** button of the
**Encounter!** dialog opens it too. It lists the characters with the party
and any split-off character within one tile of the party, the live hostile
creatures on the tile of the party and on the eight tiles around it, and any
friendly or neutral creature on the tile of the party. Hostile creatures
line up as foes, and friendly and neutral creatures line up with the party.
Only a hostile creature starts an encounter. To fight a friendly or neutral
creature, set its disposition to hostile first.

Under **Party members elsewhere**, the dialog lists each character split off
to a tile farther away or to another map. Tick **Join** on a row to bring
that character into the fight.

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
| Join | A foe under **Add nearby foes**, or a character under **Party members elsewhere**: tick it to add that row to the fight |
| Add the whole group | The label names the creatures, with a count for each name, and the distance, as in "Add the whole group (Gray Wolf x4), 4 tiles away". Ticks or clears the **Join** box of every nearby foe on one tile. It shows as mixed while only some are ticked |
| Parley | Closes the dialog with no fight, and turns the foes neutral, and logs a line such as "The party settles the encounter without a fight. Goblin Scout 1 and Goblin Scout 2 stand down." See [Parley](#parley) |
| Start combat | Rolls initiative for each row that you did not roll or type, and then starts the fight |

For the initiative rules, see [Initiative](#initiative).

## Surprise

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

## Stealth contest

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

## Parley

**Parley** in the setup dialog records that the party settled the encounter
without a fight. It closes the dialog, starts no fight, and writes a note
to the travelogue that names the foes. The foes stay on their tiles, but
they stand down and become neutral, so the **Encounter!** dialog does not
open again when the party next moves next to them. **Undo** makes them
hostile again. If the truce breaks later, change the disposition of each
foe back to hostile in the creature dialog.

## Attack dialog

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

## Action, bonus action, and reaction

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
| **Rage** | The bonus action and one use of the Rage pool |
| **Turn Undead** or **Preserve Life** | The action and one use of the Channel Divinity pool, spent only when the GM confirms the dialog |

The whole turn comes back when the turn of that combatant starts again. The
reaction comes back at the same time, not at the top of the round. A
combatant that the turn order steps past because it cannot act, such as a
Lethargic or Stunned one, gets its reaction and its legendary actions back,
and keeps the rest of what it spent. A combatant that is dead or defeated
gets nothing back.

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
that the character has (see [Class feature pools](characters.md#class-feature-pools)).
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

A Barbarian gets a **Barbarian** group with a **Rage** button while the
character has the Rage pool. The button spends the bonus action and one use,
and it puts a Raging chip on the barbarian for 10 rounds (1 minute). While
the chip lasts, a melee weapon hit that uses STR adds the Rage damage bonus:
+2 up to barbarian level 8, +3 from level 9, and +4 from level 16. The
barbarian also resists bludgeoning, piercing, and slashing damage, and
rolls STR checks and STR saves at advantage. The attack line of a hit names
the bonus, such as "Rage +2". To end a Rage early, remove the Raging chip.
The app does not end the Rage when the barbarian skips an attack, and it
does not stop spellcasting or concentration, so the GM applies those rules.

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

## Two-weapon fighting

A character with two light melee weapons equipped gets an **Off-hand
(bonus action)** group in the action bar. An example is a dagger and a
shortsword. The group shows after the character takes its Attack action,
and only while the bonus action is unspent.

The group offers both weapons, and you pick the one that the second hand
swings. The off-hand swing rolls to hit like any other attack.

Its damage gets no ability bonus, which is the 5e rule. A negative ability
modifier still applies. A character with the Two-Weapon Fighting style adds
the ability modifier (see [Fighting styles](characters.md#fighting-styles)). The combat log marks the swing "off-hand".

## Reactions and opportunity attacks

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

## Legendary actions

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

## Creature actions

A creature can have save actions, such as the Cold Breath of a winter wolf.
To add one, click **Edit actions** in the Actions section of the creature
dialog, pick **Add an action**, and click **Open**. The action dialog asks
for a name, the saving throw, the DC, one damage term (dice, die, and
type), a **Recharge** face, and whether a save halves the damage. To change
or remove an action, pick it in the list and click **Open**. Tick **Remove
this action** to remove it. Click **Done** to go back to the creature
dialog, and then click **Save**.

In a fight, each action shows in the spell list of the creature, beside its
spells. It opens the cast dialog with the DC of the action, spends no slot,
and costs the Action. Each target rolls its save, and the damage goes
through the defenses of the target, as for a save spell.

An action with a recharge face (6, 5-6, or 4-6) is spent after one use and
leaves the spell list. At the start of each turn of the creature, the app
rolls a d6 for each spent action. On the recharge face or higher, the
action is ready again. The log shows each roll. The end of a fight makes
every action ready again.

The Library creature form does not edit actions. A template that you save
from a creature keeps its actions, and a creature spawned from the template
gets them.

## Evasion

A character with the Evasion feature (rogue 7, monk 7) takes no damage when
it makes a DEX save against a spell that deals half damage on a success,
such as Fireball or Lightning Bolt. On a failed save it takes half damage.
The log line adds "Evasion" after the damage. A creature with an Evasion
trait gets no automatic change, so adjust its damage by hand.

## Legendary resistance

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

A spell that fails the target by its hit points, such as Power Word Stun
or Sleep, rolls no first save, so the dialog does not open for it. The
repeat save of Power Word Stun at the end of each turn is a real save.

## Shield against a hit

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

## Resisting a hit

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

## Redirect Attack

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

## Cover and Sneak Attack

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
the condition was met. A swing at disadvantage can never use Sneak Attack.
When you pick Disadvantage in the dialog, the box is disabled and its label
says `not at disadvantage`. When the swing rolls at disadvantage for another
reason, such as Poisoned under Auto, a ticked box adds no dice and spends no
use.

The app tracks the once-per-turn limit. After the dice land, the box is gone
for the rest of the turn, and it comes back on the next turn of any
combatant. So a rogue that spent the dice on its own swing can spend them
again on an opportunity attack, which is the 5e reading of once per turn. A
miss leaves the box, because Sneak Attack applies only on a hit.

## Pack Tactics, on-hit saves, Surprise Attack, and Multiattack

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

## Damage riders on hits

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

## Combat rules

The app follows the 5e rules for the rolls in this section.

### Attack rolls

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
- A Champion fighter scores a critical hit on a weapon attack with a
  natural 19 or 20 from level 3 (Improved Critical), and with a natural 18
  to 20 from level 15 (Superior Critical). Such a roll also hits whatever
  the AC is.
- A critical hit with a melee weapon adds more weapon damage dice that do
  not double. Brutal Critical adds one die at barbarian level 9, two at 13,
  and three at 17, and the half-orc Savage Attacks trait adds one. The damage
  line of the log names them, as in `, extra critical dice +2d12`.
- A natural 1 always misses.
- On a hit, the damage dice roll with the ability modifier added.
  Proficiency never adds to damage.

### Damage and damage defenses

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

### Death saves

A party character at 0 HP is dying, not dead. It gets a death-save tracker
on the combat screen and on its sheet, and the Unconscious and Prone chips.
A heal takes off Unconscious, and Prone stays until you remove it when the
character stands up. A cast that puts Unconscious on a target, such as
Sleep, also adds Prone. An Unconscious chip that you add by hand does not.

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

### Initiative

Initiative uses the DEX modifier, which is `floor((DEX - 10) / 2)`. A
character adds more terms to it. Jack of All Trades (bard 2) adds half the
proficiency bonus, rounded down. Remarkable Athlete (Champion 7) adds half,
rounded up, and the larger of the two applies. The Alert feat adds 5. The
default initiative value is 10 plus the modifier. On a tie, the combatant
with the higher DEX modifier goes first, and then the name decides.

Initiative is a Dexterity check, and it rolls as one.

- A condition chip that affects ability checks affects initiative. So a
  poisoned or frightened combatant rolls two d20s and keeps the lower one.
- Armor that the character is not trained for does the same.
- Exhaustion of level 1 or higher does the same.
- Feral Instinct (barbarian 7) gives advantage.

The log line says what happened to each roll, for example: `Initiative
rolled: Ser Aldric 17, Mirelle 6 (at disadvantage (dropped 15), Poisoned
disadvantage).` Every value stays editable until you press Start combat. After
the start, the GM fixes a value in the initiative field of the left column
on the combat screen.

A creature that a spell summons into a running fight rolls a plain d20 plus
its DEX modifier, with no condition or armor effect. You can edit the value
afterward.

### Armor class

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
| Unarmored Draconic Bloodline sorcerer | 13 plus DEX, if that is higher than the line above. A shield still adds its bonus |

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

### Armor proficiency

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

### Conditions

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
| Petrified | Loses its turn. Attacks against it have advantage. Fails STR and DEX saves at once. Resists all damage and is immune to poison damage |
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
cast keeps its chip.

Two casters who put a chip of the same name on one combatant each leave their
own chip. When two clerics cast Bless on one fighter and one cleric loses
concentration, the fighter stays blessed by the other. The effect still
counts once, through the stronger chip, so two Blesses add one d4 and two
Shields of Faith add +2 AC. A once-only chip such as Guidance is used up one
chip at a time. From one caster, a combatant keeps one chip of each name. A
longer chip from another spell of that caster stays, and of two casts of one
spell with different strength, such as Aid at 2nd and at 3rd level, the
stronger one stays.

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

### Advantage and disadvantage

Advantage and disadvantage from any number of sources combine by the 5e
rule. If both are present, the roll is normal. Otherwise, the one kind that
is present applies.

Chips on both sides of an attack count. The log names every chip that
affected the roll, including the ones that cancelled.

A roll that no chip affects uses the d20 mode of the dice tray. A roll that
a chip affects does not change the d20 mode. The mode changes only when you
click it.

### Exhaustion

Exhaustion is a level from 0 to 6, not a chip, and the app stores it as its
own number.

The app uses the 2014 rules for exhaustion. Each level keeps the effects of
the levels below it.

| Level | Effect | Where it applies |
| --- | --- | --- |
| 1 | Disadvantage on ability checks | Skill and ability checks from the sheet, Stealth rolls, initiative, and passive Perception (-5) |
| 2 | Speed halved | The speed badge on the sheet |
| 3 | Disadvantage on attack rolls and saving throws | Weapon and spell attacks, saves from the sheet and against spells, concentration saves, repeated saves, and death saves |
| 4 | HP maximum halved | The HP maximum of the character or creature. Current HP drops to the new maximum. When the level falls below 4 again, the maximum comes back, but current HP does not rise |
| 5 | Speed 0 | The speed badge on the sheet |
| 6 | Death | See below |

Exhaustion does not change any printed bonus. The log line of a slanted roll
names the level, such as "Exhaustion 3 disadvantage".

The rest of the rules in the app also follow 2014, with one exception. Skill
Expert is a feat from Tasha's Cauldron of Everything. Skilled can be taken
once, as in 2014.

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
