---
---
# Combat

*Explanation. Back to the [architecture overview](../architecture.md).*

A fight runs in its own mode. `combat` is the fourth `AppMode`, beside
`play`, `build`, and `library`. Like Library mode, combat mode replaces the
map columns. The `body.mode-combat` class hides the map, the Play sidebar,
and the authoring rails, and the full-width combat screen takes their place.

The header's mode switch has no button for combat mode. The app enters the
mode when a fight starts and leaves it when the fight ends, in whatever way
the fight ends. During a fight, the ribbon's Back to map control and the
sidebar's Initiative card move a tab between the map and the screen. If no
fight is running, `sessionControls.js` turns a request for combat mode into
Play mode, so a stale `setMode` call cannot show an empty screen.

Combat mode works for the GM and for a player. A tab that switches to the
Player role leaves Build mode and Library mode, because those modes are for
authoring. The same guard in `sessionControls.js` keeps a player on the
combat screen, because the player takes the turn of their own character
there. A player tab hides the header's mode switch, so a player gets to the
map through the ribbon's Back to map control.

The [wiring layer](app-wiring.md#encounterwiringjs-plus-encounterpanelsjs-creatureformjs-weaponattackjs-attackfieldsjs-the-four-cast-modules-combatantsjs-combatantwritesjs)
and [Entities](entities.md) document the 5e resolution of an attack, a cast,
and a damage application.

## Modules

```
src/combat/Initiative.js ..... pure: the order, the round counter, the turn
                               pointer, and the turn advance
src/combat/ActionBudget.js ... pure: what one combatant already spent on the
                               current turn, and what a turn start gives back
src/combat/TurnActions.js .... pure: the standard actions, Cunning Action,
                               Second Wind, and Action Surge
                               as action bar entries, and their log lines
src/combat/CombatView.js ..... pure: projects a CombatState into rows a
                               panel can draw (side, HP, AC, defeated,
                               who can act), plus the fight's outcome
src/combat/FightEnd.js ....... pure: the outcome, the foes still standing,
                               and the XP of the defeated foes
src/combat/AttackResolve.js .. pure: the hit and crit table, the damage dice,
                               and the attacker's stats and proficiency
src/combat/AttackOptions.js .. pure: which per-swing options a weapon allows
                               (Sneak Attack, the two-handed grip)
src/combat/TwoWeapon.js ...... pure: the off-hand swing of two-weapon fighting
src/combat/Reactions.js ...... pure: what a reaction can spend itself on
src/combat/LegendaryResistance.js  pure: the uses of Legendary Resistance left,
                               spent, and given back
src/combat/Cover.js .......... pure: the AC bonus of half and three-quarters
                               cover
src/combat/Loadout.js ........ pure: what a combatant wears, swings, and
                               keeps in slots, and how much of that a
                               given viewer can see
src/combat/Arrival.js ........ pure: the text of the alert for the hostile
                               creatures on a tile the party walks onto
src/combat/InitiativeRoll.js . pure: one initiative roll as a DEX check, with
                               the slant, the exhaustion penalty, and a note
src/combat/RefreshScheduler.js pure: one deferred refresh for a burst of
                               writes, with an injectable scheduler
src/combat/FocusRestore.js ... pure: names a control so a rebuild can give
                               focus back to its twin, with fallbacks
src/combat/HPLines.js ........ pure: the log lines for a damage or heal the
                               GM applies from the amount field
src/combat/SaveLines.js ...... pure: the GM and player versions of a save
                               spell's log lines
src/combat/SpentCost.js ...... pure: the note on an action bar button whose
                               cost the turn already spent
src/combat/FightMarkers.js ... pure: the foe tiles that the fight map marks
src/view/CombatSelection.js .. pure: the turn key, and how long the picked
                               target stays held
src/map/FightFrame.js ........ pure: the tile size and offsets that center
                               the fight map on the party
src/ui/CombatSetup.js ........ the setup dialog: one initiative row per
                               combatant, and the Roll initiative fill
src/ui/CombatScreen.js ....... the screen: composes the columns, the board,
                               the outcome banner, the live region, and the
                               focus handoff after a rebuild
src/ui/CombatRibbon.js ....... the turn ribbon: the round heading, one chip
                               per participant, the turn controls, and the
                               roving tab stop helpers
src/ui/CombatActiveColumn.js . the left column: the inspected combatant's
                               facts, HP controls, chips, concentration,
                               death saves, loadout, and action bar
src/ui/CombatMap.js .......... the read-only map of the fight area in the
                               Map tab
src/ui/CombatLog.js .......... the log column: a role="log" list that only
                               adds the rows logged since its last update
src/ui/CombatantCard.js ...... one board card, which is also a target-picker
                               button when given an onSelect
src/ui/LoadoutBlock.js ....... a loadout as labelled lines, shared by the
                               cards and the active column
src/ui/CombatActionBar.js .... the active combatant's weapons, spells, and
                               turn actions as buttons, grouped by kind and
                               spell level, under the budget pips
src/ui/InitiativePanel.js .... the sidebar card: one status line plus the
                               Open combat button
src/app/combatWiring.js ...... mounts the screen, keeps its transient UI
                               state, and sends everything else to actions
src/app/encounterWiring.js ... the only writer of state.combat, with the turn
                               flow as registered actions
src/app/turnAdvance.js ....... the turn advance, with the turn boundaries
                               that it passes on the way
src/app/turnActions.js ....... takes a turn action, and the GM's pip
                               override on the budget
src/app/turnEffects.js ....... what the start and the end of one turn do:
                               repeated saves, later-turn damage, and
                               chips that end at a boundary
src/app/combatEnd.js ......... the End combat confirmation and the XP award
styles/combat.css ............ the mode's layout and the screen's styles
```

## The module that writes the fight

`encounterWiring.js` owns the running fight. The fight lives only in
`state.combat`. Every read goes through a `current()` accessor and every
write goes through `setCombat`, and both accessors are local to that module.

A cross-tab rehydrate writes `state.combat` and nothing else. A follower tab
whose fight ended in another tab therefore reads the ended fight from the
same field on its next refresh. A second copy of the fight, such as a
closure variable beside the state field, would miss that write and keep
drawing the old order.

The turn advance and the combat end are registered on `app.actions` as
`advanceCombatTurn` and `endCombat`. The screen's Next turn and End combat
buttons run the same code as every other caller, including the round-wrap
condition ticks and the concentration sweeps. `removeCombatant` follows the
same pattern, so anything that changes the fight goes through the module
that owns it.

### Names in the log

Two foes of one name get a number on their cards ("Gray Wolf 1", "Gray
Wolf 2"). `combatLabels` in `src/app/combatants.js` numbers them across the
whole running order. The combatant that `findCombatant` returns has a
`label` getter over those labels, and `logName(app, target)` gives the same
label for a target by id. Every log and toast line in the combat modules
uses one of the two. A line built from `entity.name` would read "Gray Wolf"
for both wolves, and a source-text test in `tests/uiVocabulary.test.js`
fails on it. The fight-end lines run after the fight clears, so
`fightSummary` in `app/combatEnd.js` takes the labels while the order
still exists.

### The turn advance

`advanceTurn` in `Initiative.js` takes a predicate and steps the pointer past
every combatant that the predicate rejects. `CombatView.skipsTurn` is that
predicate. It covers a downed combatant, a combatant whose chips cost it the
turn (Stunned or Lethargic, for example), and a participant id that
resolves to nothing. A dying character is the exception. Its Unconscious
chip would cost it the turn, but `skipsTurn` returns false while
`isDying` is true, so the character gets the turn on which it rolls its
death save. The `deathSave` flag of the turn budget allows one roll per
turn, and `rollDeathSaveFor` refuses a roll off that turn. A stable
character, and one at 0 HP with no tracker, still skip.

A defeated goblin never gets a turn, but its chip stays in the ribbon, struck
through. A stunned goblin also keeps its place, marked with a dashed edge
instead of a strike, because it is still in the fight and only its turn is
gone. A dying or stable character at 0 HP gets the dashed edge too, with no
strike. `downState` in `view/DeathSaveView.js` picks the mark and the words
of the accessible name for the ribbon chip and the card. It returns "dying"
or "stable at 0 HP" for a character with a death save tracker, "defeated"
for any other defeated combatant, and "cannot act" for a combatant whose
chips cost it the turn. If the predicate rejects every participant, the pointer walks one full
cycle and stops where it started. The round counter and the timed effects
then keep moving until the GM closes the fight.

`app/turnAdvance.js` wraps the advance in `advancePastHeld`, which runs the
turn boundaries that the advance passes (see `app/turnEffects.js`). The end
of a turn rolls the repeated saves of the combatant, such as the save that
ends Hold Person. It then deals the damage that the chips of the combatant
leave for later turns, such as the acid of Acid Arrow, and counts the
boundary for every chip keyed to that turn. The start of a turn counts the
boundary, and then a chip with `mods.tempHPEachTurn` (Heroism) grants its
temporary hit points to the combatant.

`advancePastHeld` runs its work in this order:

1. The turn that ends runs its end-of-turn work.
2. The pointer moves from `state.combat` as that work left it. Damage can
   end a spell whose summons then leave the order, and a pointer moved from
   a copy taken earlier would write those summons back.
3. The new order is stored.
4. Each combatant that the pointer stepped past starts and ends its turn.
   A paralyzed target still has a turn that ends, so its retry rolls there.
   Without that roll, it stays held for the whole duration. When the round
   wraps, the skipped combatants below the old pointer take their turns
   first, then the round ticks, and then the skipped combatants at the top
   of the order take theirs.
5. The combatant that the pointer lands on starts its turn.

A dead character, a defeated creature, or a missing combatant rolls no save
and takes no damage, but the chips keyed to its turns still count the
boundary. A dying character at 0 HP still has its turn end, and the damage
of a chip costs it a failed death save, as any hit does. The start of a fight
starts the first turn. A removal from the fight ends the chips keyed to the
removed combatant, and it starts the turn of the next combatant when the
removed one held the turn. The end of a fight ends every chip that waits on
a turn boundary, because no turn comes again. `endFightEffects` first deals
the later-turn damage that such a chip still owes, so an Acid Arrow that hit
on the last turn still burns. A chip that deals damage only on a failed
repeated save deals none at the end of a fight.

A chip that only counts a boundary down, such as a chip with two ends left,
still writes the new count back. An entity whose chips no boundary touches
keeps its identity, and so does a roster with no change, because the roster
indexes and the pack cache of the save key on that identity.

### The round wrap

The round wrap runs `TimedEffects.passRound` over every character and every
creature, bystanders included. It takes one round off the timed chips, the
timed stat modifiers, and a held concentration. An entity with nothing timed
comes back as the same object, and a collection with no changed entity keeps
its array.

The save packs each entity through a cache keyed on the object. A new object
per entity per round misses that cache. With 1,200 creatures, the round-tick
save costs about 180 ms with new objects and about 3 ms with the kept ones.

### Per-tab UI state

`combatWiring.js` owns two pieces of per-tab UI state, which never persist.
`inspectedId` is the combatant that the left column inspects. The ribbon
chips pick it, and null means whoever's turn it is. `selectedTargetId` is the
board card that the GM or player picked as the target.

The app never validates the inspection, because a user can inspect a
defeated combatant on purpose. An id that stops resolving falls back to
whoever's turn it is. The app releases the target on the refresh that shows
it defeated, out of the order, or with the fight over. Otherwise the card of
a defeated foe would keep its pressed ring after the attack dialog stopped
using the pick. `heldTarget` in `view/CombatSelection.js` also releases the
target when the turn changes, because a target picked for one combatant's
attack would otherwise open the next combatant's dialogs and HP box on the
same card, which can be that combatant's own card. `turnKey` names a turn
by the round and the id of the turn holder, and the HP box of the active
column resets its amount on the same key. The key leaves out the index into
the order, because a summon sorted above the holder, or a drop earlier in
the order, moves that index in the middle of one turn.

## The action budget

A 5e turn has one action, one bonus action, and one reaction.
`src/combat/ActionBudget.js` is the pure model of what a combatant already
spent. The budget lives on the participant, in a `used` field, so it saves
and resumes with the fight. It records what is gone instead of what is left.
A participant with no `used` field therefore reads as a whole turn through
`budgetOf`.

`attacksLeft` is the only counter in the budget. Extra Attack gives two
swings for one action, so the first swing spends the action and banks the
rest. The Multiattack of a creature banks its swings the same way,
through `CreatureAttacks.swingsPerAction`. `spendAttack` draws on the bank before it spends another action, and
`attacksAvailable` reports how many swings are left. Only a weapon whose own
count is two or more draws on the bank (see
[Hit riders and the pact weapon](#hit-riders-and-the-pact-weapon)). Each swing also sets
`attacked`, because a cast spends the `action` flag too, and two-weapon
fighting needs to know that the action went to the Attack action.

A chip with `mods.extraAction` (Haste) gives one more swing, which `extra`
records. `spendAttack` and `attacksAvailable` take an `extraAction` flag, and
the extra swing comes only once the action and the bank are both spent. So a
cast on the action still leaves the extra swing, and nothing banks behind it.
No other cost reads the flag, because the extra action of Haste can't pay for
a cast.

`advanceTurn` gives a whole budget back to the combatant the pointer lands
on. The reaction resets there and not at the top of the round, because a 5e
combatant gets its reaction back at the start of its own turn. A combatant
that the pointer skips keeps its spent budget, because it takes no turn.

The Sneak Attack flag resets differently. The 5e limit is once per turn, and
a turn is anyone's turn. `resetSneak` therefore gives the flag back to the
whole order at every turn boundary. A rogue that spent the dice on its own
swing can spend them again on an opportunity attack in another combatant's
turn. `refresh` and `resetSneak` return the same participant when nothing
changes. The order array then keeps its identity, and so do the save diff and
the combatant index caches.

`canSpend` gates the buttons, but it does not refuse a cost. The rules have
more exceptions than this model covers, so every path that spends a cost also
gives the GM a way past the gate.

Movement has no entry in the budget. Nothing in the app moves a token by
feet, so `Movement.walkSpeed` is for display only.

### Spending the budget

`app.actions.spendBudget(id, cost, options)` is the write path for every
spend, and `app.actions.toggleBudget(id, cost)` is the write path for the
GM's pip override. `encounterWiring.js` registers both, so `state.combat`
keeps one writer. The cost of a spend is one of these values:

- `'action'`, `'bonus'`, or `'reaction'`, for that part of the turn
- `'attack'`, for a weapon swing
- `'sneak'`, for the once-per-turn Sneak Attack flag, which costs no part of
  the turn
- `'legendary'`, for one legendary action of a creature. The options pass
  `legendaryActions`, the count per round of the creature

The action returns false when the budget does not have the cost. With no
fight running, the action reports success and writes nothing. A cast from the
character sheet outside a fight uses this path.

A weapon swing spends `'attack'`. `rollWeaponAttack` asks first and rolls no
dice on a refusal. `Features.attacksPerAction` reads the class features of
the attacker to find how many swings one Attack action gives.

A cast spends what its casting time names. `SpellTiming.castingCost` turns
the structured casting time into a cost. It reads a casting time of minutes,
of hours, or of the `special` kind as null, because no part of a turn pays
for those. `castPlan` puts the cost and a blocked flag on the plan, and
`resolveCast` spends the cost before the first roll. A cast is blocked when
the turn already spent that part, or when the casting time is longer than a
turn.

The attack dialog shows an "Ignore action cost" box on a turn with no swing
left. The cast dialog shows the same box for a blocked cast, with the wording
for the reason that applies. A cast that goes through on this opt-out spends
nothing, because nothing is left to take. The submit button stays disabled
until the box is ticked, through the `submitRequires` option of
`promptModal`. The dialog therefore cannot close on a swing or a cast that the
resolver then refuses. The cast dialog gates its components and armor
opt-outs in the same way.

The bonus action spell rule lives in `combat/SpellRule.js`. The budget keeps
two turn flags for it, `bonusSpell` and `actionSpell`, which `resolveCast`
sets through `spendBudget` after it spends the cost. `castPlan` asks
`spellRuleBlock` only when the caster holds the running turn and the cast is
not a repeat, and puts the reason on the plan as `ruleBlock`. The dialog then
adds an "Ignore the bonus action spell rule" box that `submitRequires` gates.

A cast with no target ticked is refused inside the dialog. The `validate`
option of `promptModal` runs `missingTarget` from `app/spellTargets.js` when
the GM presses Cast. When no target is picked, the dialog stays open and shows
"Pick at least one target." above its buttons. `resolveCast` runs the same
check, so a caller that skips the dialog still spends no slot on nobody.

The action bar draws the budget as pips. Each cost has one pip, struck through
once spent, and the bar shows the swing count when more than one swing is
left. The pips show the budget and never gate a button. `CombatantRow`
includes `used` and `attacksLeft`, so the screen reads them from the same row
that it draws everything else from. `combat/SpentCost.js` names the spent
cost behind each button (`costNote`, `attackNote`, `spellNote`). The bar dims
such a button and adds the note to its tooltip and accessible name, as in
"Cast Message, action spent". The button stays live, because its dialog
offers the GM the waiver.

Each pip is a toggle button with `aria-pressed`. A press calls
`toggleBudget` in `src/app/turnActions.js`, which goes through the
`toggleBudget` action of encounterWiring. That action spends the cost with
`spend` or gives it back with `unspend` from `ActionBudget.js`. Giving back
the action also drops the swings it banked, so the next Attack action banks
them again. The press writes a log line, because no other record of the
override exists.

A participant with `surprised` set starts the fight with the budget of
`surprisedBudget`: its reaction is spent, and on its own turn the action and
the bonus action are spent too. `startCombat` gives that budget to every
surprised participant, and `refreshTurn` gives it again when the pointer
lands on one. `advanceTurn` runs `endSurprise` on the participant whose
turn ends and on each participant it steps past, which drops the flag and
frees the reaction. encounterWiring also puts a Surprised chip on each
surprised combatant that ends at the end of its first turn, so the card
shows the state. The setup dialog sets the flag from its Surprised boxes.

### Turn actions

`src/combat/TurnActions.js` lists the turn actions that are not a swing or a
cast. `turnActions` returns the six standard actions, each with the action
as its cost, and with `cunningAction` it adds Dash, Disengage, and Hide with
the bonus action as their cost. Each entry names a `group`, and the action
bar draws one row of buttons per group in list order. A class action joins
the bar by adding entries with its own group, with no change to the bar.
With `secondWind` and `actionSurge`, the uses left in those pools, it adds
the two fighter entries. Each of them names its `poolId`, and Action Surge
has a `cost` of null, because it spends no part of the turn.

`src/app/turnActions.js` is the app half. `turnActionsOf` reads the class
levels of a character for Cunning Action, and a creature gets the standard
actions only. `takeTurnAction` spends the cost through `spendBudget`, logs
the line from `turnActionLine`, and for Dodge puts a Dodging chip on the
combatant that ends at the start of its next turn. `ConditionEffects.js`
gives attacks against a Dodging creature disadvantage, and its
`saveAdvantage` entry gives the Dodging creature advantage on DEX saves. An entry with a
`poolId` checks that the pool has a use left before it spends anything.
Second Wind then spends the bonus action and heals through `applyToTarget`.
Action Surge calls the `surgeBudget` action of encounterWiring, which runs
`ActionBudget.surge`. The `surged` flag blocks a second surge on the same
turn. With the action spent, the action becomes free, and the swings that
Extra Attack banked stay banked. With the action free, the surge sets the
`spare` flag instead. The next spend of the action, through `spend` or
`spendAttack`, clears `spare` and leaves the action free, so the turn has
two actions in all. The action bar shows a "+1 action (Action Surge)" pip
while `spare` is set.

`src/combat/ChannelDivinity.js` adds the cleric entries: Turn Undead from
cleric level 2, and Preserve Life for a character with the feature of that
name, which the Life Domain grants at level 2. It also has the pure rules:
the Destroy Undead CR table, the Preserve Life budget and caps, and the
check of a share-out. `src/app/channelDivinity.js` opens the dialog first
and spends the pool and the action only on confirm. Turn Undead rolls each
save with `resolveSave` and puts a Turned chip on a failure, with
`endsOnDamage` set and `spellName: 'Turn Undead'` in its source, so the
end-on-damage log line names the source. Turned has `noReactions` in
`ConditionEffects.js` rather than `noActions`, because `losesTurn` would skip
the turn of a `noActions` holder. The ward prompts ask `canReact`.

### Two-weapon fighting

`src/combat/TwoWeapon.js` is the pure half of the off-hand swing.
`isLightMelee` reads the kind and the `light` property of one weapon.
`offhandWeapons` returns the light melee weapons of a list, and it returns
none unless the list has two of them. `canOffhand` adds the budget
conditions: the Attack action is taken, and the bonus action is free.

The test reads the `attacked` mark and not the `action` flag. In 5e, the
off-hand swing is the second attack after a taken Attack action, so an action
spent on a cast does not unlock it. The app does not model which hand holds
which weapon. It offers both light melee weapons, and the GM picks the one
that the second hand swings.

`combatWiring.js` calls `canOffhand` and puts the list in the `offhand` field
of the action bar's actions. The Off-hand group therefore shows only on a
turn that can take the swing. The button sends `offhand: true` to
`weaponAttack`, which spends the bonus action instead of an attack.
`offhandDamageModifier` sets the damage modifier of that swing. It drops a
positive ability modifier and keeps a negative one, because the rule removes
the bonus and a penalty is not a bonus.

`combat/AttackTweaks.js` has one table of the swings a combatant can take: the
main-hand swing, the off-hand swing, the opportunity attack, and the
legendary action. Each row
states what the swing spends, the dialog title, the text of the opt-out box,
what the log adds to the attack line, and the toast for a turn that cannot
pay. `swingKind` picks the row from the dialog's answers, and `canSwing` asks
the budget whether the turn can pay for that row. Both functions are pure and
tested.

### Reactions

`src/combat/Reactions.js` decides what a reaction can spend itself on.
`canReact` reads the reaction pip. `opportunityWeapons` keeps the melee
weapons of a list, because a bow cannot hit a creature that walks past.
`reactionSpells` keeps the spells whose casting time reads as a reaction,
through `SpellTiming.castingCost`.

Apart from a hit on a Shield caster (see below), the app does not detect a
trigger. A 5e reaction starts from a fact that this app does not track, such
as a creature leaving the reach of another. The GM sees the trigger at the
table and presses the control.

The controls sit under the board card of the combatant that reacts, which is
not the combatant taking the turn. A board card is one button, and HTML does
not allow a button inside a button. `combatantCard` therefore returns the card
and the controls inside one `.combatant-slot` element. `CombatScreen.reactionFor`
decides who gets a control. A combatant gets one when all of these are true:

- It is not the combatant taking the turn.
- The viewer can act for it.
- It can still act.
- Its reaction is unspent.
- It has a weapon or a spell to spend the reaction on.

The swing sends `reaction: true` to `weaponAttack`, which spends the reaction
and otherwise rolls a normal swing, with the ability bonus. Its default
defender is the combatant taking the turn, because that is the combatant the
reaction interrupts. A card that the GM picked on the board replaces that
default. The cast goes to the same `castSpellAction` that the action bar
uses. That path already spends what the casting time names, and `castPlan`
finds the caster's participant by id and not by whose turn it is.

### Legendary actions

The budget of a participant has a `legendary` count, the legendary actions
spent since the start of its own turn. `refresh` sets it back to 0 when
`advanceTurn` lands on the creature, so the count refills once per round
at the right point. `legendaryLeft(participant, max)` reads what is left,
and `spendLegendary` spends one. `buildCombatView` puts `legendaryLeft` on
each row, which is 0 for anything but a creature.

`CombatScreen.legendaryFor` gives a board card a second row under the
reaction row, with the same `.combatant-card__reaction` styles. It uses the
tests of `reactionFor`, except that it asks for a legendary action left in
place of an unspent reaction. The row lists every weapon from `getWeapons`,
because a legendary attack can be a ranged one. A button sends
`legendary: true` to `weaponAttack`. The dialog then leaves out the
Multiattack box, and `rollWeaponAttack` spends `'legendary'` in place of the
Attack action. `AttackTweaks.legendarySwing` numbers the log note from the
budget before the swing pays, as in ", legendary action 2 of 3". The app
does not enforce the 5e timing (at the end of another creature's turn),
because it has no event for the end of a turn apart from **Next turn**.

### Legendary resistance

`combat/LegendaryResistance.js` is pure. `resistancesLeft` compares the
per-day count with `legendaryResistanceUsed` on the creature, and
`spendResistance` and `restoreResistance` write that field. The long rest
in `partyWiring.js` calls `restoreAllResistance`, which maps
`restoreResistance` over the creatures and returns the same array when no
creature changed.

`app/legendaryResistance.js` asks the GM. `resistSpellSaves` runs in
`resolveCast` after the Shield pause and before the damage reaction pause,
so Absorb Elements sees the damage that a resisted save leaves. It returns
null when no failed save belongs to a creature with a use left, and the
cast then finishes without waiting. `canResist` skips a target that the
spell left alone and a target of a spell with no save roll (an HP pool such
as Sleep). `resistedOutcome` rewrites a failed outcome as a success: half
damage for a spell that halves on a save, no condition, and no later-turn
damage. Turn Undead calls `offerResistance` on each failed WIS save, and its `ask`
option replaces the question dialog in a test. The
save that a weapon hit forces (`rollHitSave`) does not ask, because that
path is synchronous inside the attack roll.

### The Shield pause

An attack roll that hits is a trigger that the app does see, and
`src/app/shieldWard.js` offers the defender its AC reaction at that point.
`pendingWard` looks for a spell that casts as a reaction, whose buff chip
adds AC (`mods.ac`), and whose `castPlan` the defender can pay for without
an opt-out. The defender also needs an unspent reaction, the ability to
act, no chip of that spell already, and a viewer who may act for it
(`CombatView.mayActOn`). `wardRaise` measures how far the AC would go up by
reading `acOf` with and without the candidate chip, so a floor such as
Barkskin's 16 counts. Shield on a base AC of 12 under Barkskin raises the AC
from 16 to 17, and the ward offers +1 and only against a roll of 16. A spell
with no real raise is offered only when its chip blocks the attacking spell.
`offerWard` asks the question and casts the spell through `resolveCast` at
the lowest slot. It returns how far the AC of the defender went up, which it
reads with `acOf` before and after the cast.

`rollWeaponAttack` asks after the d20 rolls and before the log line, so the
line states the AC that the roll answered to in the end. `resolveCast` asks
through `wardSpellAttack`, after `castSpell` rolls and before
`applyOutcomes` writes anything. The pure `CastRolls.wardedOutcome` then
checks each outcome again against the raised AC. It stops a projectile that
hits automatically only when the ward chip names the spell in `mods.blocks`,
which is the Magic Missile rule of Shield. A target that already holds such
a chip takes none of the automatic hits, and `wardSpellAttack` applies that
with no question.

Both functions return a promise only while a question is open. A call with
no ward in reach finishes before it returns, so a suite that calls one
without `await` reads the result on the next line. Each takes an `ask`
option in place of `confirmModal`, and a test passes its own answer there.

### The damage reaction pause

The damage roll of a weapon hit, a spell attack hit, or a save spell is a
second trigger that the app sees. `src/app/damageWard.js` offers the
defender a reaction spell whose buff chip resists a damage type in the
damage, through `mods.resist` or a
`resistChoice` pick list. `pendingDamageWard` uses the same gates as
`pendingWard`. The pure `DamageWard.wardType` picks the type: the one in
the hit that the spell can resist, that the defender does not resist or
ignore already, and that deals the most damage. `offerDamageWard` casts the
spell through `resolveCast` with that type as the `resist-type` answer, so
the chip resists it. `rollWeaponAttack` asks after `hitDamage` rolls and
before `defendedDamage` reads the defenses, so the new chip halves the hit.

`resolveCast` asks through `wardSpellDamage`, after the Shield pass of
`wardSpellAttack` and before `applyOutcomes` writes anything. A hit that
Shield turned into a miss deals nothing, so it asks nothing, and a defender
that spent its reaction on Shield has none left for this question. The pure
`DamageWard.landingDamage` reads the damage that one outcome is about to
deal before defenses: the damage of a hit, half of a splash on a miss, the
sum of the rays that hit, and the damage of a save spell, halved on a
success. A save that negates the damage and a target that the spell passes
over deal nothing. Each damaged target of a multi-target spell, such as
Burning Hands, gets its own question in target order. Each question waits
for the one before it, and `wardSpellDamage` looks up each target's
reaction again when its question comes. `applyOutcomes` then reads each
target's defenses with any new chip.

A fight that ends while the question is open does not stop the damage, on
either path. The cast of the reaction still goes ahead on a yes, and the
damage then lands the same way it lands outside a fight.

### The Redirect Attack pause

A creature with `redirectAttack`, such as a goblin boss, can spend its
reaction when an attack targets it. It swaps places with an ally, and the
ally becomes the target. The 5e trait of a goblin boss asks for another
goblin within 5 feet, and the fight tracks no positions, so
`src/app/redirectWard.js` offers every ally on the creature's side that is
not down, and the GM judges who qualifies from the notes. `pendingRedirect`
needs a running fight, a defender that can act and still has its reaction,
and a viewer who may act for it (`mayActOn`), so a Player tab never pauses
on a foe. `offerRedirect` opens a dialog with the allies and two buttons,
**Swap places** and **Keep target**. Keep target and Escape resolve null. A
pick spends the reaction, logs the swap, and returns the
ally.

The question comes after the attack pays and before the attack roll.
`rollWeaponAttack` asks once the swing has spent its budget, and then
`swingAt` rolls the whole swing against the ally: its AC, cover, the chip
slants, the damage, its defenses, the on-hit save, and the Shield and
damage reaction pauses. With the Multiattack box ticked, each swing asks
again, so only the first swing can redirect, because the redirect spends
the reaction. `resolveCast` asks through `redirectSpellTargets` for an
attack spell, after the cast pays and before `castSpell` rolls. It asks for
each target in order and swaps a redirected target for the ally. The ally
comes from the plan's own target list when it is there, so it keeps the
fields that the spell reads. A save spell does not offer the redirect,
because it makes no attack roll.

### Weapon options in the attack dialog

`src/combat/AttackOptions.js` decides which per-swing options a weapon
allows, so the dialog shows only the options that the rules permit for that
swing. `allowsSneakAttack` needs a finesse or a ranged weapon.
`hasFreeHandFor` needs both hand slots to be empty or to hold the weapon
itself. A shield or a second weapon therefore rules out the two-handed grip.
A creature has no equipment slots, so it always passes.

A versatile weapon with a free hand offers a two-handed grip, which rolls the
`versatileDamage` dice. A ranged weapon with a stated range offers a normal
and a long shot, and the long shot rolls with disadvantage. A thrown melee
weapon offers a melee swing, a thrown attack, and a long thrown attack. The
damage step checks the free hand again, because the equipment can change
while the dialog is open.

### One-shot chips on an attack

A chip with `mods.once` (Guiding Bolt, Vicious Mockery) ends on the first
attack roll it slants (see
[attack slant chips](entities.md#attack-slant-chips)). `app/weaponAttack.js`
calls `riderSpend.spendOnceChips` after it logs the attack line, on a hit or
a miss, and after a Shield pause settles. `app/spellCastResolve.js` calls it
for each target of a spell attack after the cast line and before the
outcomes land. Both pass the chip lists that decided the mode, and the
function removes the used chips by name from the live roster entries of the
attacker and the target.

### Cover and Sneak Attack

Cover and Sneak Attack are GM calls in the dialog before the roll. The app
tracks no distance between tokens and no line of sight. No rule here can see
a wall, a barrel, or where the rogue stands, so the GM answers the dialog from
what they see at the table.

`src/combat/Cover.js` has the 5e table. Half cover adds 2 to the AC of the
target, and three-quarters cover adds 5. `coverBonus` reads an unknown answer
as no cover, and `coverNote` gives the text that the log prints. Total cover
has no entry, because a target in total cover cannot be attacked.

The cover control is a select beside the roll mode, so it is one click away
for every swing. `rollWeaponAttack` adds the bonus to the AC of the defender
once. The dice tray, `resolveAttack`, the log, and the miss toast all read
that raised AC. The log prints the raised AC and the plain AC together, such
as `vs AC 12 (10 half cover +2)`.

Sneak Attack is a checkbox. It shows when `Features.sneakAttackDice` gives the
attacker dice, the weapon allows Sneak Attack, and the turn still has the
`sneak` flag. The label states the dice count, so the GM sees what the box is
worth. The count comes from the level in the class that granted the feature,
not from the level of the character.

The dice go in through the `sneakDice` option of `damageParts`. They are
always d6, they take the damage type of the weapon, and a critical hit doubles
them like every other damage die. The app spends the flag at the damage step,
because Sneak Attack applies only on a hit. A miss therefore leaves the flag
for the next attack of the turn.

The app checks the weapon, but not the rest of the 5e condition for Sneak
Attack. That condition is advantage on the attack, or an ally next to the
target. The second half needs a map distance that the app does not have, so
the ticked box is the GM's answer.

### Pack Tactics, on-hit saves, Multiattack, and Surprise Attack

The attack dialog shows a Pack Tactics box for a creature with
`packTactics`. A ticked box sets `tweaks.pack`, and `prepareSwing` adds one
advantage slant beside the chip slants, so a disadvantage chip still cancels
it. The attack line names it, unless the GM picked a mode.

A creature weapon with an `onHitSave` forces a save on each hit.
`rollHitSave` in `app/weaponAttack.js` runs after the damage lands. It skips
a defender at 0 HP, rolls `Checks.resolveSave` with the save bonus and chips
of the defender, and logs `HitSave.hitSaveLine`. The line names the total and
not the bonus, so a Player tab reads the same line. A failed save goes
through `applyConditionToTarget`, which checks condition immunity.

A creature with `multiattack` gets a ticked Multiattack box while its Attack
action is unspent. `weaponAttack` then calls `rollWeaponAttack` once for each
swing, and it reads both sides again through `liveAttackSides` before each
swing.

A creature can mark one swing of its Multiattack with
`multiattackDisadvantage`, counted from 1, and `CreatureAttacks.coerceWeakSwing`
drops a number past the last swing. `rollWeaponAttack` asks
`AttackTweaks.isWeakSwing` before the swing pays. It reads the swing number
from the participant's budget: an unspent Attack action makes it swing 1, and
each banked swing that the creature has used adds one. The answer goes in as
`tweaks.weak`, and `prepareSwing` adds one disadvantage slant, so an
advantage chip still cancels it. The attack line names
`Multiattack disadvantage`, unless the GM picked a mode. A swing with the
free-action box ticked spends no budget, so each such swing reads as swing 1.

A creature with `surpriseAttack` adds its dice on a hit. `rollWeaponAttack`
asks `CreatureAttacks.surpriseDiceFor`, which gives the dice only in round 1
and only for a defender whose participant still has `surprised`. The answer
goes in as `tweaks.surprise`, never from the dialog. `hitDamage` adds the
dice with the damage type of the weapon, doubles them on a crit, and names
them in the rider note.

### Hit riders and the pact weapon

`WeaponSwing.hitDamage` adds the dice of the hit riders in
`entities/HitRiders.js` (Divine Favor on the attacker, Hunter's Mark on the
defender), and a critical hit doubles them. Lifedrinker
adds a flat necrotic term from `PactWeapon.pactDamage` when the weapon is the
attacker's pact weapon, and a crit leaves it single. The function returns a
`riderNote` that names each one, and `hitLines` puts the note after the
damage detail, as in `Longsword hits Goblin Scout for 17 slashing [8,6 +3],
Hunter's Mark +1d6.` The defender's resistances then apply per damage type,
the same as for the weapon's own dice.

Thirsting Blade works through `Features.attacksPerAction`, which the budget
reads as the swings of one Attack action. The weapon swing passes its weapon,
so the count is 2 only for a swing with the pact weapon. A first swing with
another weapon banks nothing, and a swing with another weapon cannot draw on
a bank that the pact weapon left, because `spendAttack` and
`attacksAvailable` use the bank only for a weapon that buys two or more
swings. The combat screen calls `attacksPerAction` with no weapon, so its
count of swings left is the best case.

### Creature-type rules and caster slants

A save or heal spell can carry `effect.typeRules` (see `src/types/spell.ts`).
`app/spellCastResolve.js` stamps each target with `creatureType` and
`conditionImmunities` from the roster, and `entities/SpellTypeRules.js`
applies the lists in `Casting.js`. A skipped target reports `unaffectedBy`
and spends none of an HP pool, so Sleep passes over undead without losing
dice. An `only` list passes over a typed target outside it and lets an
untyped target through, so Hold Person on a GM creature with no type still
lands. A `disadvantage` type folds a disadvantage into the save mode of that
target alone, and a `maxDamage` type reads the damage dice at their top face.

A chip with the `disadvantageVsSource` mod slants the attacks of its holder
against the caster named in `source.casterId`. `entities/SourceSlant.js`
reads it, and both `combat/WeaponSwing.js` and the spell attack in
`spellCastResolve.js` fold it into the roll mode. Chill Touch writes this chip
on an undead target through the typed chip of its `onHit` block, and the
spell form authors that chip in `ui/SpellFormTypedChip.js`.

## The combat view

`buildCombatView(combat, resolve, viewer)` in `src/combat/CombatView.js` is a
pure projection. It returns the round, the turn index, and one row per
participant. Each row has these fields:

- the name, side, initiative, HP, AC, and conditions
- a `defeated` flag, and an `incapacitated` flag for a combatant whose chips
  cost it the turn
- a `counted` flag for a combatant that settles the outcome
- `mayAct`, which says whether this viewer can act for the combatant
- `deathSaves`, `used`, and `attacksLeft`

The wiring layer injects the resolver (`findCombatant` from `combatants.js`),
because only the wiring layer sees every collection that an id can live in.
The order stores nothing on a row, so a rename, a disposition change, or
damage during a fight shows on the next render. The screen and the panel
derivations (`sideOf`, `isDowned`, `mayActOn`) all read from this one module.
The module has unit tests, and the DOM on top of it is checked visually.

`mayAct` is the only field that depends on the viewer. The GM can act for
anyone, foes included. A player can act only for the party character that the
tab is bound to. The screen uses this field to gate the action bar, the HP
controls, the concentration Drop control, the death-save Roll and Stabilize
controls, and the turn-end button. A player gets the turn-end button only on
their own character's turn, and on a player tab it reads "End my turn" in
place of "Next turn".

`fightOutcome(view)` returns `victory` once every foe row is defeated, and
`defeat` once every counted party row is defeated. It returns null while both
sides still have someone standing. A side with no one on it settles nothing,
so an order that the GM built with no foes is undecided. A mutual wipe reads
as a defeat, because the fate of the party outweighs the fate of the monsters.

A creature row takes its side from its disposition. A hostile creature is a
foe, and a friendly or neutral creature stands with the party. Only characters
and hostile creatures have the `counted` flag. A friendly or neutral creature
is therefore a bystander. Its fall settles nothing, and its survival does not
prevent the defeat of a fallen party. The side does not protect a creature,
because a hostile action can target any other creature in the fight. The party
can turn on a bystander mid-fight.

### Loadout visibility

`src/combat/Loadout.js` defines the second viewer rule.
`loadoutAccess(found, viewer, id)` returns `full`, `public`, or `none`.

| Viewer | Own character | Other combatant on the party side | Foe |
| --- | --- | --- | --- |
| GM | full | full | full |
| Player | full | public (armor and weapons) | none |

Armor and a drawn weapon are visible across the table. The prepared spells and
remaining slots of a caster belong to that player, and a foe's sheet is the
GM's to reveal. `buildLoadout` takes the access level and never assembles what
the viewer cannot see. Code downstream therefore cannot leak that data by
drawing a field that it was given.

## The layout

The screen has three columns above a turn ribbon. Below a width of 1100px,
the columns stack.

### The active column

The active column shows the inspected combatant, which is whoever's turn it is
by default. The column shows the name, initiative, AC, HP, condition chips,
and concentration with its Drop control.

A character at 0 HP also shows its death-save tracker: three success pips,
three failure pips, and the Roll and Stabilize controls. A stable character
reads "Stable at 0 HP" and a dead character reads "Dead", with no controls.
The block comes from `ui/DeathSaveBlock.js`, which the character sheet also
uses, so the screen and the sheet always describe a tracker the same way.

The HP value is exact where the viewer can act for the combatant. That is the
GM for every combatant, and a player for their own character only. Other
viewers see a coarse HP band. The GM also gets an amount field with Damage and
Heal buttons, the same controls as the Encounters panel. They apply through
`applyToTarget`, which is the single write path for every hit.

Under the facts is the combatant's loadout in its full form: weapons with
their damage rolls, and a chip for each slot pool. Below the loadout is the
action bar (`CombatActionBar.js`). It shows one button per weapon and per
castable spell of the combatant whose turn it is, from the same `weaponsOf`
and `spellsOf` derivations that the sidebar reads. The buttons sit under an
Actions heading, with weapons first and then spells under the spellbook's own
spell-level headings. Without the grouping, a caster with a dozen spells would
show one long run of buttons. The bar belongs to the turn and not to the
inspection, so inspecting a foe never offers its weapons to a player.

### The board

The board shows the two sides as labelled groups of cards
(`CombatantCard.js`). Each card shows the loadout in a compact form.
`LoadoutBlock.js` draws both forms, so a card and the active column always
describe a combatant the same way. The host trims each card to what the viewer
can see.

Each card is a real `<button>` that picks the target. A click selects the card
(`aria-pressed`), and a second click releases it. The selected id pre-fills
the defender field of the attack dialog. It also pre-fills the target field of
the cast dialog, whichever picker the spell built: a single select, a
multiselect, or the projectile allocation grid (through `prefillTarget` in
`spellTargets.js`). The six situational fields of the attack dialog sit behind
a collapsed disclosure (the `advanced` field flag of `promptModal`). The common
flow is therefore a click on the card, a click on the weapon, and Enter.

### The log column

The log column shows the travelogue entries of the `combat` and `roll` kinds,
newest first. It shows only entries logged since this fight's setup opened,
so the column does not replay every fight in the campaign. The setup takes a
timestamp when its dialog opens, and `startCombat` stores it as
`CombatState.startedAt`. The "Initiative rolled" line is logged inside the
dialog, so it falls after that timestamp. The column shares the row builder
of `TravelogPanel.js`. `logEvent` stamps each entry with the in-game clock
and, during a fight, the round. The column passes `withRound` to `entryItem`,
so a fight line reads "Round 2" there and "Day 1, Dusk, round 2" in the
travelogue.

The travelogue keeps its newest 200 entries (`TRAVELOG_LIMIT`). A fight of five
rounds with ten combatants can log more than that. `logEvent` therefore passes
the running fight's `startedAt` to `appendEntry`, which then trims only the
entries older than the fight. The list can grow past 200 during a fight, up to
`TRAVELOG_FIGHT_LIMIT` (1,000). The first line logged after the fight ends
trims the list back to 200. The column keeps as many rows as the larger limit.

### GM-only lines

A log line that names what the Player view hides elsewhere is GM-only. The
caller passes a third argument to `logEvent`: `{ gm: true }` for a line that
a Player tab never shows, or `{ player: '...' }` for a line with a
player-safe version. The entry keeps `gm: true` and the `player` text beside
`message`. `log/LogVisibility.js` builds the list that each role reads. The
GM reads every `message`. A Player tab reads the `player` text of a GM-only
entry, or does not see the entry. The ids stay the same, so both log lists
keep their append-only updates. A role change rebuilds both lists, because
the two roles read different lines.

These lines are GM-only:

- the total and the rolls of an HP pool (Sleep, Color Spray), which a Player
  tab reads as the dice alone
- the reason on each target of an HP pool or an HP limit ("within the pool",
  "over 100 HP", "150 HP or fewer"), which a Player tab reads with no reason
- the save bonus of a creature on a save spell or an on-hit save, which a
  Player tab reads as the ability and the total
- the HP readout of a creature after a damage or a heal from the amount
  field, which a Player tab reads without the readout

`combat/SaveLines.js` builds the GM and player versions of the save lines.
A party character's lines stay open, because the sheet shows the same
numbers. An AC in an attack line stays open too, because the combatant cards
show a foe's AC to every viewer.

The dice tray sits under the log. The app has one tray. While combat mode is
active, the screen moves the whole `#dice-tray-container` card into the column
with `appendChild`, and it puts the card back in the play dock on exit. Moving
the element keeps the handle of `diceWiring.js` valid, because the app mounts
the tray once and never looks it up again. The right column is `position:
sticky` and no taller than the screen, so the tray stays in view while the
GM scrolls the board or a long active column. The log list scrolls inside
the height that the tray leaves. Below 1100px the columns stack, and the
column scrolls with the page.

Above the log, `buildTabs` adds a Log tab and a Map tab. The Map tab holds
`ui/CombatMap.js`, a canvas that draws the party node with the same
`MapRenderer` as the main map. `map/FightFrame.js` works out the tile size
and the offsets that center a window of nine by nine tiles on the party
tile. The canvas has no pan, zoom, or click handling. `combatWiring.js`
passes `getMapView`, which reads the party position from `partyTracker`.
`combat/FightMarkers.js` marks the tile of each hostile creature of the
order that still stands, which is the rule of the Play map. A companion, a
summoned ally, or a defeated foe gets no marker. The view also passes the
marker range of the Play map (twice the reveal radius of `partyTracker`)
and sets `fogDim` by `seesThroughFog` in `src/view/ViewRole.js`, the
same rule as the Play map. So the GM sees the terrain under a
see-through fog, and a Player tab gets opaque fog and shows nothing that
its Play map hides. The screen redraws the map on each render while the
Map tab shows, and when the GM opens the tab.

### The turn ribbon

The turn ribbon runs above the columns. It shows one chip per participant, in
order, with the name and initiative. A long name ends in an ellipsis, and the
number that tells two foes of one name apart stays whole (`chipName`). The
current turn is ringed and marked
`aria-current`. An icon marks each foe, so the side does not depend on color
alone, and a defeated chip is struck through. A click on a chip inspects that
combatant without advancing the turn.

The round counter and the turn controls sit beside the ribbon:

- Back to map, for everyone
- the turn-end button, for whoever can take the current turn
- End combat, for the GM only

## Starting a fight

Only the GM starts a fight, from the Start combat button in the Active tab of
the Encounters panel, or from the Set up combat button of the arrival modal.
Both read one list, `hostileGroup` in `src/entities/CreatureMap.js`. It keeps
the undefeated hostile creatures of `encounterGroup`, which is every creature
in the party's node within `ENCOUNTER_RADIUS` (one) grid steps of the party's
tile. A diagonal step counts as one, so the group covers the party's tile and
the eight tiles around it. A GM who stages two bandits on neighbouring tiles
therefore meets both in one fight. `canStartCombat` in `encounterPanels.js`
gates the button on that list. The Active tab and the difficulty hint list
the same creatures, so the panel switches to that tab whenever the button can
show.

The setup roster from `combatRoster` is the whole party, the creatures of
`hostileGroup`, and any friendly or neutral creature on the party's own tile.
A defeated hostile creature stays staged but does not join a new fight, and a
bystander on the tile joins in any condition. Hostile creatures line up as
foes, and friendly and neutral creatures line up with the party. A friendly or
neutral creature alone does not make an encounter. The GM who wants to fight
one sets its disposition to hostile first.

`nearbyFoes` in `combat/CombatRoster.js` lists the undefeated hostiles
within `nearbyRadius` that stand outside the encounter group, each with its
tile and its straight-line distance in tiles. The setup dialog shows them
under "Add nearby foes" with a Join box, and only the ticked ones join the
roster for Roll initiative and Start. `nearbyGroups` splits the list by
tile, and a tile with two or more foes gets an "Add the whole group" box
that ticks each Join box of the tile. `groupTitle` names the creatures
of the group in that box ("Gray Wolf x2, Goblin"), so a screen reader
hears which creatures it adds. During a fight, the Nearby tab gives each hostile
row outside the order an "Add to fight" button. `encounterPanels.js` rolls
initiative for it and calls `app.actions.addCombatant`. The Nearby list
repaints on the set of joinable ids through its `dependsOn`, so the button
shows when a fight starts and goes when it ends. The joined row leaves the
list, so `EncounterPanel.js` moves keyboard focus to the "Add to fight"
button now at the same place, or to the last one. With no button left,
focus goes to the selected tab.

Only a hostile creature is a threat, and only a threat opens the arrival modal
when the party steps next to it or onto its tile. A friendly or neutral
creature opens nothing. The NPCs panel lists it, and a step onto its tile logs
a meeting. `arrivalAlert` in `src/combat/Arrival.js` writes the text of the
modal from the `name`, `currentHP`, and `maxHP` of each creature in
`hostileGroup`. The GM sees exact HP, and a player sees an HP band. With no
fight running, the GM's modal has Set up combat and Not now buttons, and Set
up combat opens the setup dialog at once. A player's modal, and a GM's modal
for one character's token away from the party, has one Continue button,
because the setup reads the party's shared position.

### Rolling initiative

Initiative is a Dexterity check, so `src/combat/InitiativeRoll.js` rolls it as
one. `initiativeSlant` asks `ConditionEffects.rollMode` for the mode that the
roller's chips give a check. It adds the disadvantage of armor the roller is
not trained for, and it reads the exhaustion penalty. `rollInitiative` throws
the d20s, keeps the higher or the lower one, and adds the DEX modifier that
the roster stored on the participant.

One press of Roll initiative fills the whole column, so this roll does not go
through the dice tray, which shows one roll at a time. The roll returns a note
that names the dropped die and each reason, and the travelogue line includes
it. `encounterWiring.js` resolves the participant id to its entity with
`findCombatant`. An id that resolves to nothing rolls a plain d20 instead of
failing. The GM can edit every value by hand before Start.

## Ending a fight

A fight ends when the GM presses End combat, or when no creature of the fight
is left near the party. The defeat of the last enemy does not end the fight.
An automatic end on the last kill would close the screen mid-swing, and it
would take the log and the board away before the party could heal.

### The End combat control

`endCombat` calls `confirmFightEnd` in `app/combatEnd.js` first. The
button sits next to Next turn, so one stray click would otherwise drop a
live fight. When hostile creatures still stand, the XP dialog opens with a
line that counts them and a **Back to the fight** button, so it serves as the
question. `opensXPDialog` tells `confirmFightEnd` when that dialog opens.
Only a fight with standing foes and no living character to earn XP gets a
separate confirm. A lost fight closes with no question.

After a victory, `askFightXP` offers the experience points of the defeated
foes while the fight still runs. `FightEnd.fightEnd` adds up the `crXP`
value of each defeated hostile creature, and a foe with no challenge rating
is worth nothing. The share goes to every character in the order who is
still alive, a dying one included, split evenly and rounded down. The GM can
change the amount. When the GM picks **Back to the fight**, `endCombat`
returns before `setCombat(null)`, so the fight and its foes stay as they
are. Otherwise the fight closes and `applyFightXP` gives each character the
amount through `addXP`, so a new level becomes pending in the usual way.
The fight keeps running while the dialog is open, and a Player tab can take
a turn in that time. So `endCombat` reads `fightSummary` again before it
closes the fight, and `applyFightXP` uses that summary. A fate lands only
on a foe that still stands, and the XP goes only to a character still
alive. The amount stays what the GM typed.

### The automatic end

`syncCombatLocation` ends a fight when the party walks away from it or the last
creature in it is deleted. The party-move paths and `commitCreatures` call
this action. `main.js` also calls it once after every module is wired, so a
save whose fight has no creature left near the party's tile loads with the
fight ended. It runs there and not inside `wireEncounters`, because it logs
through `logEvent` and leaves combat mode through `setMode`, which
`wireStory` and `wireSessionControls` register later. The plain panel
refresh never calls it, because that refresh also runs from the rehydrate
loop. There, a state write would conflict with the save that the tab just
took from another tab.

The check is `fightInReach` in `combat/CombatRoster.js`. It keeps the
fight while any creature of the encounter group is in the running order, or
while any hostile in the order stands within `nearbyRadius`, four times the
reveal radius. That radius is the one of the Nearby tab and of the "Add
nearby foes" list, so a foe that joined from there does not end the fight at
once. Both checks count defeated creatures, because a combatant at 0 HP is a
turn in the fight and not the end of it. A bystander counts only inside the
encounter group. A walk away from the fight ends it, and so does the deletion of the
last creature in it, but a kill does not.

### The outcome banner

Once `fightOutcome` settles, the screen shows a banner at the bottom center
of the window. It floats with `position: fixed`, so the ribbon and the
columns do not move when it appears. The
banner states that the party is victorious or defeated. It tells the GM that
combat stays open until the GM ends it. At that point, End combat takes the
primary emphasis from the turn-end button. Turns still advance, so the party
can use a round to heal before the GM ends the fight.

The banner is a persistent `role="status"` node. The app does not rebuild the
node on every render, because a new node would announce the outcome again on
every HP edit. The app also unhides the node before it writes the text,
because a screen reader does not read a status region that is hidden when the
text changes.

## Refreshing the screen

`combatWiring.js` registers `app.views.combatScreen`. It mounts before
`wireEncounters`, so the view exists when the fight's refresh paths run.

The registered `update` function skips the rebuild while the tab shows another
mode during a running fight, because nothing on the screen is visible then.
The switch back into combat mode is itself a refresh path, so the first visible
frame is always new. When the fight has ended, `update` still rebuilds, which
empties the screen of the last fight's DOM.

### The deferred rebuild

`update` asks `src/combat/RefreshScheduler.js` for a refresh. The first request
in a synchronous burst schedules one run in a microtask. Every later request in
the burst does nothing.

One weapon attack reaches the view four or five times: the budget spend, the
attack line, the damage line, the target write, and the defeat line. Without
the scheduler, each of those calls would rebuild the whole screen. With it,
they cost one rebuild, and the browser paints no frame between them. The
scheduler takes its `schedule` function as an argument, so a test can run the
flush by hand. The dice tray still moves at once, inside `update`, because the
mode's CSS has already changed by then.

The log column does not rebuild. `CombatLog.js` keeps the id of the newest row
it drew. On each update, it asks `entriesAfter` for the entries logged since
then and adds only those at the top. It rebuilds only when that id has left the
log, which means that the log was cleared or a new fight began.
`TravelogPanel.js` renders the same way. The list is a `role="log"` live
region, and a screen reader reads only the added rows. A list rebuilt whole
would read every row again, or read nothing.

### Refresh paths

Each of these paths calls the registered `update`:

- **The initiative-panel wrapper.** `encounterWiring.js` wraps
  `views.initiativePanel.update()` and refreshes the combat screen inside it.
  Every call site that the sidebar card already has (party moves, role
  switches, the rehydrate loop, `commitCreatures`) reaches the screen with no
  extra code.
- **Combatant writes.** The character `store` that `findCombatant` uses updates
  the screen directly. A creature write reaches the screen through
  `commitCreatures`.
- **The log.** `logEvent` refreshes the screen. A line that changes no
  combatant, such as a missed attack or a plain tray roll, would otherwise not
  reach the log column.
- **Mode changes.** `sessionControls.js` updates the screen on every mode
  switch. The registered `update` first syncs the dock of the tray with
  `state.mode`, so the tray moves on every entry and exit: the automatic entry,
  the automatic exit, the header's Play button, the sidebar's Open combat
  control, or a reload that resumes a fight.

A reload with a fight running enters combat mode again from `main.js`, after
`wireSessionControls` has registered `setMode`, for either role. A player takes
their turn on that screen too, and anyone can leave with Back to map to watch
the map.

Cross-tab rehydrate adopts campaign state in place and leaves `mode` out of
its synced keys, so a display tab in the Player role does not follow the GM
tab into Build mode. `combat` is in the synced keys, and the rehydrate refresh
loop includes the initiative panel, whose wrapper refreshes the screen.

A fight that starts or ends in another tab is the one case that moves a
follower tab's mode. `followerMode` in `view/CombatMode.js` decides the move,
and `app/externalSaves.js` acts on it. A tab in Play mode enters combat mode
when a fight starts, and a tab in combat mode returns to Play when the fight
ends. A tab in Build or Library mode stays where it is, because a fight is not
a reason to discard what that tab has open.

## Accessibility

A visually hidden `aria-live="polite"` region announces each turn, for example
"Round 2: Mirelle's turn." The region is keyed on the round and the combatant
id, so an HP edit or another refresh announces nothing extra. When the
fight has an outcome, the region reads "The fight is over." once and skips
the turn announcement, and it is emptied when the fight view goes away. Each
action pip toggle has the fixed name "<cost> spent" with `aria-pressed`, and
the focus restore of `CombatScreen` keys on that name, so the name stays the
same when the pip changes state. The combat log
list is a `role="log"` region. A screen reader speaks each attack result,
damage line, and defeat as its row is added, because the list only gains rows.

The ribbon and the board are one tab stop each. A roving tabindex anchors on
the chip of the current turn and on the selected card, and the arrow keys move
focus with wraparound. The keydown listeners attach once, at mount, to the
persistent containers. They find the buttons on each keypress, because every
render replaces the buttons.

A rebuild replaces every control, so without help, focus would fall to the page
body after each rebuild. `src/combat/FocusRestore.js` decides where focus goes.
Before the rebuild, the screen names the focused control: a chip or a card by
its combatant id, and any other control by its accessible label or its text.
After the rebuild, the control with the same name takes focus again, so the
Damage button keeps focus through the HP edit that it made.

When that control is gone or disabled, focus goes to the chip of the current
turn, and then to the round heading, which is a persistent `h2` with
`tabindex="-1"`. Focus on an element that is still in the document, such as the
docked dice tray, stays where it is. The first frame of a fight moves focus onto
the screen the same way, because the Start control that opened the fight is
gone by then. Back to map and End combat move focus to the map canvas.

The attack and cast dialogs need no extra help. A dialog opens before any
write, so the button that opened it is still in the document when the dialog
closes, and that button takes focus back. The deferred rebuild then runs and
moves focus to the new button with the same name.

## The sidebar card

`InitiativePanel.js` is a status card. It shows only while a fight is running.
It has one line, for example "Round 3, Mirelle's turn", which it resolves
through `describe` so that a rename shows. It also has an Open combat control.
The wrapper around its `update` function refreshes the combat screen, as
described in Refresh paths.
