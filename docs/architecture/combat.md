# Combat

*Explanation. Back to the [architecture overview](../architecture.md).*

A fight runs in its own mode. `combat` is the fourth `AppMode`, alongside
`play`, `build`, and `library`. Like Library mode, it replaces the map columns
entirely: `body.mode-combat` hides the map, the Play sidebar, and the
authoring rails, and the full-width combat screen takes their place. There is
no header button for combat mode.

The app enters combat mode when a fight starts and leaves it when the fight
ends, whatever way it ends. The ribbon's Back to map control and the
sidebar's Initiative card move a tab back and forth during a fight. If no
fight is running, a request for combat mode lands on Play instead, and
`sessionControls.js` guards this rule so that a stale `setMode` call cannot
show an empty screen.

Combat mode works for the GM and for a player. A tab that switches to the
Player role leaves Build mode and Library mode, which are authoring modes,
but the same guard in `sessionControls.js` keeps a player on the combat
screen, where they take their own character's turn, because moving a player
back to the map would take the fight away from them. The header's mode
switch is hidden on a player tab, so a player reaches the map through the
ribbon's Back to map control instead.

The screen does not change the 5e resolution itself (attack rolls, casts,
and damage application), which
[the wiring layer](app-wiring.md#encounterwiringjs-plus-creatureformjs-weaponattackjs-the-four-cast-modules-combatantsjs)
and [entities](entities.md) document.

## Modules

```
src/combat/ActionBudget.js ... pure: what one combatant already spent on the
                               current turn, and what a turn start gives back
src/combat/CombatView.js ..... pure: projects a CombatState into rows a
                               panel can draw (side, HP, AC, defeated,
                               who can act), plus the fight's outcome
src/combat/Loadout.js ........ pure: what a combatant is wearing, swinging,
                               and keeping in slots, and how much of that a
                               given viewer can see
src/combat/Arrival.js ........ pure: the text of the walked-into-something
                               alert, for the hostile creatures on a tile
src/combat/InitiativeRoll.js . pure: one initiative roll as a DEX check, with
                               the slant, the exhaustion penalty, and a note
src/combat/RefreshScheduler.js  pure: one deferred refresh for a burst of
                               writes, with an injectable scheduler
src/combat/FocusRestore.js ... pure: names a control so a rebuild can hand
                               focus back to its twin, with fallbacks
src/combat/HPLines.js ........ pure: the log lines for a damage or heal the
                               GM applies from the amount field
src/ui/CombatScreen.js ....... the screen: composes the columns, the board,
                               the outcome banner, the live region, and the
                               focus handoff after a rebuild
src/ui/CombatRibbon.js ....... the turn ribbon: the round heading, one chip
                               per participant, the turn controls, and the
                               roving tab stop helpers
src/ui/CombatActiveColumn.js . the left column: the inspected combatant's
                               facts, HP controls, chips, concentration,
                               death saves, loadout, and action bar
src/ui/CombatLog.js .......... the log column: a role="log" list that only
                               adds the rows logged since its last update
src/ui/CombatantCard.js ...... one board card; doubles as a target-picker
                               button when given an onSelect
src/ui/LoadoutBlock.js ....... a loadout as labelled lines, shared by the
                               cards and the active column
src/ui/CombatActionBar.js .... the active combatant's weapons and spells as
                               buttons, grouped by kind and spell level
src/app/combatWiring.js ...... mounts the screen, keeps its transient UI
                               state, routes everything else to actions
src/app/encounterWiring.js ... the only writer of state.combat; the turn
                               flow lives here as registered actions
src/ui/InitiativePanel.js .... the sidebar card: one status line plus the
                               Open combat button
styles/combat.css ............ the mode's layout and the screen's styles
```

## The module that writes the fight

`encounterWiring.js` owns the running fight. The fight lives only in
`state.combat`, every read goes through a `current()` accessor, every write
goes through `setCombat`, and both accessors are local to that module. A
cross-tab rehydrate writes `state.combat` and nothing else, so a follower tab
whose fight ended elsewhere reads the ended fight from the same field on its
next refresh. A second copy of the fight anywhere, such as a closure variable
beside the state field, would miss that write and keep drawing the old order.

Turn advance and combat end are registered on `app.actions` as
`advanceCombatTurn` and `endCombat`, so the screen's Next turn and End
combat buttons run the same code as every other caller, including the
round-wrap condition ticks and the concentration sweeps. The advance step
skips combatants who are down and those whose chips cost them the turn:
`advanceTurn` takes a predicate and steps the pointer past them to the next
combatant that can act, and `CombatView.skipsTurn` is that predicate, which
covers the downed, the stunned, and a participant id that no longer
resolves. A defeated goblin's turn never comes up, but its chip stays in the
ribbon, struck through, and a stunned one keeps its place too, marked with a
dashed edge rather than a strike, because it is in the fight and only its
turn is gone. If every participant is skipped, the pointer walks one full
cycle and stops where it started, which keeps the round counter and timed
effects moving until the GM closes the fight. `removeCombatant` follows the
same pattern, so anything that changes the fight goes through the module
that owns it.

`combatWiring.js` owns per-tab UI state that never persists: `inspectedId`,
which combatant the left column is inspecting (picked by the ribbon chips,
with null meaning whoever's turn it is), and `selectedTargetId`, which board
card is picked as the target. The app never validates the inspection,
because inspecting a defeated combatant is a legitimate thing to do, and an
id that stops resolving falls back to whoever's turn it is. The app releases
the target on the refresh that shows it defeated, out of the order, or the
fight over, because otherwise a defeated foe's card would keep its pressed
ring after the attack dialog stopped honoring the pick.

## The action budget

A turn in 5e has one action, one bonus action, and one reaction, and
`src/combat/ActionBudget.js` is the pure model of what a combatant already
spent. The budget lives on the participant, in a `used` field, so it saves
and resumes with the fight. It records what is gone rather than what is left,
so a participant from an older save has no `used` field and `budgetOf` reads
that absence as a whole turn.

`attacksLeft` is the one counter in the budget. Extra Attack buys two swings
for one action, so the first swing spends the action and banks the rest,
`spendAttack` draws on the bank before it spends another action, and
`attacksAvailable` reports how many swings are left. Each swing also marks
`attacked`, because the `action` flag alone cannot say what the action went
to: a cast spends it too, and two-weapon fighting needs the Attack action
specifically.

`advanceTurn` gives a whole budget back to the combatant the pointer lands
on, and the reaction resets there rather than at the top of the round, which
matches the rule that a combatant gets its reaction back at the start of its
own turn. A combatant the pointer skips keeps its spent budget, because that
combatant never takes a turn. The Sneak Attack flag is the exception, because
the 5e limit is once per turn and a turn is anyone's turn, so `resetSneak`
gives it back to the whole order at every turn boundary and a rogue that
spent the dice on its own swing can spend them again on an opportunity
attack. `refresh` and `resetSneak` return the same participant when nothing
changes, which keeps the identity of the order array, and with it the save
diff and the combatant index caches.

`canSpend` is a gate on the buttons and not a refusal, because the rules have
more exceptions than this model covers, so every path that spends a cost also
gives the GM a way past the gate.

Movement has no entry in the budget. Nothing in the app moves a token by
feet, so `Movement.walkSpeed` stays informational.

### Spending the budget

`app.actions.spendBudget(id, cost, options)` is the only write path, and
encounterWiring registers it, so `state.combat` keeps one writer. The cost is
'action', 'bonus', 'reaction', 'attack' for a weapon swing, or 'sneak' for the
once-per-turn Sneak Attack flag, which costs no part of the turn. The return
value is false when the budget no longer has the cost. With no fight running
the action reports success and writes nothing, which is what a cast from the
character sheet needs.

A weapon swing spends 'attack'. `rollWeaponAttack` asks first and rolls no
dice on a refusal. How many swings one Attack action buys comes from
`Features.attacksPerAction`, which reads the class feature list of the
attacker.

A cast spends what its casting time names. `SpellTiming.castingCost` turns
the structured casting time into a cost, and reads a ten-minute or a
`special` casting time as null, because no part of a turn pays for those.
`castPlan` puts the cost and a blocked flag on the plan, and `resolveCast`
spends the cost before the first roll. A cast is blocked by a turn that
already spent that part of itself, or by a casting time longer than a turn.

The attack dialog offers the way past as an "Ignore action cost" box on a
turn with no swing left, and the cast dialog shows the same box for a blocked
cast, worded for whichever of the two reasons applies. A cast that
goes through on the opt-out spends nothing, because there is nothing left to
take.

The action bar draws the pips: one per cost, struck through once spent, plus
the swing count when more than one swing is left. The pips report and never
gate. `CombatantRow` includes the `used` budget and `attacksLeft`, so the
screen reads them from the same row it draws everything else from.

### Two-weapon fighting

`src/combat/TwoWeapon.js` is the pure half. `isLightMelee` reads the kind and
the `light` property of one weapon, `offhandWeapons` gives the light melee
weapons of a list and gives none unless the list has two of them, and
`canOffhand` adds the budget conditions: the Attack action is already taken,
and the bonus action is still free. The test reads the `attacked` mark
rather than the `action` flag, so an action spent on a cast does not unlock
the second hand, because the rule makes the off-hand swing the second attack
after a taken Attack action.

Which hand holds which weapon is not modeled. Both light melee weapons are
offered, and the GM picks the one the second hand swings.

combatWiring calls `canOffhand` and puts the list in the `offhand` field of
the action bar's actions, so the Off-hand group appears only on a turn that
can take the swing. The button routes to `weaponAttack` with `offhand: true`,
which spends the bonus action instead of an attack and takes
`offhandDamageModifier` for its damage. That function drops a positive
ability modifier and keeps a negative one, because the rule takes the bonus
away and a penalty is not a bonus.

`weaponAttack` has one table of the three swings a combatant can take: the
main-hand one, the off-hand one, and the opportunity attack. Each row states
what the swing spends, what the dialog is titled, what its opt-out box says,
what the log adds to the attack line, and what the toast says when the turn
cannot pay. `swingKind` picks the row from the dialog's answers, and
`canSwing` asks the budget whether that row is payable. Both are pure and
tested.

### Reactions

`src/combat/Reactions.js` says what a reaction is worth offering. `canReact`
reads the reaction pip, `opportunityWeapons` keeps the melee weapons of a
list because a bow reaches nobody who walks past, and `reactionSpells` keeps
the spells whose casting time reads as a reaction, through
`SpellTiming.castingCost`.

Nothing detects a trigger. A 5e reaction fires off a fact this app does not
track, such as a creature leaving the reach of another, so the GM sees the
trigger at the table and presses the control.

The controls sit under the board card of the combatant that reacts, which is
not the combatant taking the turn. A board card is one button, and a button
cannot contain a button, so `combatantCard` returns the card and the controls
wrapped in one `.combatant-slot` element, and the card draws the row it is
given. `CombatScreen.reactionFor` decides who gets a control: not the active
turn, a viewer who can act for the combatant, a combatant still able to act,
an unspent reaction, and something to spend it on.

The swing routes to `weaponAttack` with `reaction: true`, which spends the
reaction and otherwise rolls a normal swing, ability bonus and all. Its
default defender is the combatant taking the turn, because that is who the
reaction interrupts, and a card the GM picked on the board wins over that
default. The cast routes to the same `castSpellAction` the action bar uses,
because that path already spends what the casting time names and `castPlan`
finds the caster's own participant by id rather than by whose turn it is.

### Cover and Sneak Attack

Both of these are GM calls in the pre-roll dialog. The app tracks no distance
between tokens and no line of sight, so no rule here can read a wall, a
barrel, or where the rogue stands, and the GM answers the dialog from what
they see at the table.

`src/combat/Cover.js` has the 5e table: half cover adds 2 to the AC of the
target, and three-quarters cover adds 5. `coverBonus` reads an answer it does
not know as no cover, and `coverNote` gives the text the log prints. Total
cover has no entry, because a target in total cover cannot be attacked at
all.

The cover control is a select beside the roll mode, so it is one click away
for every swing. `rollWeaponAttack` adds the bonus to the AC of the defender
once, and that raised AC then goes to the dice tray, to `resolveAttack`, to
the log, and to the miss toast. The log prints the raised AC and the plain
one together, such as `vs AC 12 (10 half cover +2)`.

Sneak Attack is a checkbox. It appears when `Features.sneakAttackDice` gives
the attacker dice and the turn still has the `sneak` flag, and the label
states the count, so the GM sees what the box is worth. The count comes from
the level in the class that granted the feature, not from the level of the
character.

The dice land through the `sneakDice` option of `damageParts`. They are
always d6, they take the damage type of the weapon, and a critical hit
doubles them like every other damage die. The flag is spent at the damage
step and not beside the swing, because Sneak Attack applies only on a hit, so
a miss leaves the flag for the next attack of the turn. The flag comes back
at every turn boundary, as the budget section above says, so an opportunity
attack can use the dice on somebody else's turn.

Whether the rogue qualifies for the dice is not modeled. The 5e condition is
advantage on the attack or an ally next to the target, and the second half
needs the map distance that nothing here has, so the box states the GM's
answer to that question.

## The combat view

`buildCombatView(combat, resolve, viewer)` in `src/combat/CombatView.js` is a
pure projection. It returns the round, the turn index, and one row per
participant, and each row has a name, side, initiative, HP, AC, conditions, a
defeated flag, an incapacitated flag for a combatant whose chips cost it the
turn, whether this viewer can act for it, and what the turn has spent. The
wiring layer injects the resolver (`findCombatant` from `combatants.js`),
because only the wiring layer sees every collection where an id can live.
The order itself stores nothing on a row, so a rename, a disposition flip, or
damage during a fight shows up on the next render. The screen and the panel
derivations (`sideOf`, `isDowned`, `mayActOn`) read from this one module,
which has the unit tests, while the DOM on top of it is inspected visually
instead.

`mayAct` is the one field that depends on the viewer. The GM can act for
anyone, including foes, and a player can act only for the party character
that the tab is bound to. The screen uses this field to gate the action bar,
the HP controls, the concentration Drop control, the death-save Roll and
Stabilize controls, and the turn-end button. A player gets the turn-end
button only on their own character's turn, and on a player's tab this button
reads "End my turn" instead of "Next turn".

`fightOutcome(view)` is the other derivation in the module. It returns
`victory` once every foe row is defeated, `defeat` once every counted party
row is defeated, and null while both sides still have someone standing. A
side with nobody on it settles nothing, so an order that the GM built with
no foes in it reads as undecided. A mutual wipe reads as a defeat, because
what happens to the party outweighs what happens to the monsters.

A creature row takes its side from its disposition: a hostile creature is a
foe, and a friendly or neutral one stands with the party. Only characters
and hostile creatures have the row's `counted` flag and settle the outcome,
so a friendly or neutral creature is a bystander whose fall settles nothing
and whose standing does not prevent the defeat of a fallen party. The side
does not shield a creature, because a hostile action's target list includes
every other creature in the fight whatever its side, so the party can turn
on a bystander mid-fight.

### Loadout visibility

`src/combat/Loadout.js` defines the second viewer rule. `loadoutAccess(found,
viewer, id)` returns `full`, `public`, or `none`. The GM sees everything,
while a player sees their own character in full, only the armor and weapons
of another party member, and nothing of a foe, because armor and a drawn
weapon are visible across the table, a caster's prepared list and remaining
slots are that player's own business, and a foe's sheet is the GM's to
reveal. `buildLoadout` takes the access level and never assembles what the
viewer cannot see, so nothing downstream can leak that data by drawing a
field it was handed.

## The layout

The screen has three columns above a turn ribbon. Below a width of 1100px,
the columns stack.

The **active column** shows the inspected combatant, which is whoever's turn
it is by default. The column shows the name, initiative, AC, HP, condition
chips, and concentration with its Drop control. A character at 0 HP also
shows its death-save tracker: three success pips, three failure pips, and
Roll and Stabilize controls. A stable character reads "Stable at 0 HP" and a
dead one "Dead", with no controls. The block comes from
`ui/DeathSaveBlock.js`, which the character sheet also uses, so the two
cannot describe the same state differently. The HP value is exact where the
viewer can act for the combatant, which is the GM anywhere and a player only
on their own character, and otherwise the column shows a coarse band instead
of the exact HP. The GM also gets a damage and heal amount field with a
button pair, the same idiom as the Encounters panel, applied through
`applyToTarget`, which is the single write path that every hit uses. Under
the facts sits the combatant's **loadout** in its fuller form: weapons with
their damage rolls, and a chip for each slot pool. Below that sits the
**action bar** (`CombatActionBar.js`), which shows one button per weapon and
per castable spell of the current turn's combatant, resolved through the same
`weaponsOf` and `spellsOf` derivations that the sidebar reads. The buttons
are grouped under an Actions heading, weapons first and then spells by spell
level under the spellbook's own headings, because a caster with a dozen
spells would otherwise show one undifferentiated run of buttons. The bar
belongs to the turn, not the inspection, so inspecting a foe never offers its
weapons to a player.

The **board** shows the two sides as labelled groups of cards
(`CombatantCard.js`). Each card shows the same loadout in a compact form, and
`LoadoutBlock.js` draws both forms, so a card and the column can never
describe one combatant differently. The host trims each card to what that
viewer can see. Each card is a real `<button>` that acts as the target
picker: clicking a card selects it (`aria-pressed`), clicking it again
releases it, and the selected id pre-fills the attack dialog's defender field
and the cast dialog's target field, whichever picker the spell built (single
select, multiselect, or the projectile allocation grid, through
`prefillTarget` in `spellTargets.js`). The attack dialog's six situational
fields sit behind a collapsed disclosure (`promptModal`'s `advanced` field
flag), so the common flow is to click the card, click the weapon, and press
Enter.

The **log column** shows the travelogue filtered to `combat` and `roll`
entries. It shows only entries logged since this fight's setup opened
(`CombatState.startedAt`, stamped by `startCombat`), newest first, which
keeps the column from replaying every battle that the campaign ever logged.
It shares `TravelogPanel.js`'s row builder, so an entry reads the same in
both lists. The "Initiative rolled" line lands inside this bound, because the
app takes the stamp when the setup dialog opens, not when Start is pressed.
Under the log sits the dice tray. The app has one tray, and the screen
borrows the whole `#dice-tray-container` card by `appendChild` while the mode
is active, then returns it below the map on exit. Moving the element keeps
`diceWiring.js`'s handle valid, because the app mounts the tray once and
never re-resolves it.

The **turn ribbon** runs under the columns. It shows one chip per
participant, in order, with initials plus initiative. The current turn is
ringed and marked `aria-current`, foes are marked by an icon rather than by
color alone, and defeated chips are struck through. Clicking a chip inspects
that combatant without advancing the turn. The round counter and the turn
controls sit beside the ribbon: Back to map for everyone, the turn-end
button for whoever can take the current turn, and End combat for the GM
alone.

## Starting a fight

A fight can start wherever the party stands with a live creature.
`creaturesHere` in `encounterWiring.js` is the gate on the Start combat
button, and every undefeated creature on the party's exact tile counts,
whatever its disposition, so a party that decides to attack a neutral
bystander is not stopped.

Only a hostile creature is a threat, and only a threat raises the arrival
modal. A friendly or neutral creature opens nothing: the panel lists it, and
a step onto its tile logs a meeting instead. `arrivalAlert` in
`src/combat/Arrival.js` writes the text of the modal, and it reads `name`,
`currentHP`, and `maxHP` off each hostile creature there.

The Start combat button sits in the Active tab of the Encounters panel. The
Active tab lists the same live creatures the gate counts, so the panel
switches itself to that tab whenever the button can show.

### Rolling initiative

Initiative is a Dexterity check, so `src/combat/InitiativeRoll.js` rolls it
as one. `initiativeSlant` asks `ConditionEffects.rollMode` for the mode a
check takes from the chips of the roller, folds in the disadvantage of armor
the roller is not trained for, and reads the exhaustion penalty.
`rollInitiative` throws the d20s itself, keeps the higher or the lower one,
and adds the DEX modifier that the roster already stamped on the participant.

The setup dialog fills a whole column at once, so this roll does not go
through the dice tray, which shows one roll where this press makes six. The
roll returns a note instead, which names the dropped die and every reason,
and the travelogue line includes it. `encounterWiring.js` resolves the
participant id to its entity with `findCombatant`, and an id that no longer
resolves rolls plain rather than failing.

## Ending a fight

A fight ends when the GM ends it, or when its participants are gone, and
killing the last enemy is neither of these. An automatic end on the last
kill would close the screen mid-swing and take the log and the board away
from whoever landed the hit, with no chance to heal first.

The auto-drop keeps the fight running when the party leaves the tile or the
creature list changes for reasons other than a kill. `syncCombatLocation` is
an action that the party-move paths and `commitCreatures` call. The plain
panel refresh never calls it, because that refresh also runs from the
rehydrate loop, where a state write would fight the save that the tab just
adopted from another tab. The auto-drop reads `creaturesOnTile`, which keeps
defeated creatures and bystanders in the count, because a combatant at 0 HP
is a turn in the fight rather than the end of it, and a fight the party
picked with a neutral creature has no hostiles in it at all. Walking off the
tile clears the fight, and so does deleting the last thing to fight, but a
kill does not.

The screen also grows a banner under the ribbon once `fightOutcome` settles.
The banner states that the party is victorious or defeated, with a line for
the GM that combat stays open until the GM ends it, and at that point End
combat takes the primary emphasis away from the turn-end button. Turns still
advance, so a round of healing is available before the GM leaves the fight.

The banner is a persistent `role="status"` node. The app does not rebuild
this node on every render, because a rebuilt node would re-announce the
outcome on every HP edit, and it unhides the node before it writes the text,
because a status region hidden at the moment of the change is not read out
by a screen reader.

## Refreshing the screen

`combatWiring.js` registers `app.views.combatScreen`. It mounts before
`wireEncounters`, so the view exists by the time the fight's refresh paths
run. The registered `update` function skips the rebuild while the tab sits
on another mode with the fight still running, because nothing on the screen
is visible then. The switch back into combat mode is itself one of the
refresh paths, so the first visible frame is always freshly drawn. A fight
that has ended still falls through to the rebuild, which empties the screen
instead of leaving the last fight's DOM behind.

The rebuild is deferred and coalesced. `update` asks
`src/combat/RefreshScheduler.js` for a refresh, and the first request in a
synchronous burst schedules one run in a microtask, while every request
after it, until that run, does nothing. One weapon attack reaches the view
four or five times (the budget spend, the attack line, the damage line, the
target write, and the defeat line), and without the scheduler each of those
would rebuild the whole screen. With it they cost one rebuild, and the
browser paints no frame between them. The scheduler takes its `schedule`
function as an argument, so a test drives the flush by hand. The dice tray
dock still moves at once, inside `update`, because the mode's CSS has already
changed by then.

The log column does not rebuild at all. `CombatLog.js` keeps the id of the
newest row it drew, and on each update it asks `entriesAfter` for the entries
logged since then and prepends only those. It rebuilds from scratch only when
that id has left the log, which means the log was cleared or a new fight
began. `TravelogPanel.js` renders the same way. The list is also a
`role="log"` live region, and a screen reader speaks only the rows that are
added, so a list rebuilt whole would either re-read every row or read
nothing.

Every one of these paths calls that registered `update`:

- **The initiative-panel wrapper.** `encounterWiring.js` wraps
  `views.initiativePanel.update()` and refreshes the combat screen inside
  that wrapper, so every call site that the sidebar card already has (party
  moves, role switches, the rehydrate loop, `commitCreatures`) reaches the
  screen without extra code.
- **Combatant writes.** The character `store` that `findCombatant` uses
  updates the screen directly, and the creature branch reaches the screen
  through `commitCreatures`.
- **The log.** `logEvent` refreshes the screen, because a line that changes
  no combatant, such as a missed attack or a plain tray roll, would otherwise
  never reach the log column.
- **Mode changes.** `sessionControls.js` updates the screen on every mode
  switch. The registered `update` function is a wrapper that first syncs the
  tray's dock against `state.mode`, so the tray moves on entry and exit
  however they happen: auto-enter, auto-exit, the header's Play button, the
  sidebar's Open combat control, or a reload that resumes a fight.

A reload with a fight running re-enters combat mode from `main.js`, after
`wireSessionControls` has registered `setMode`, whatever the tab's role. A
player takes their turn on that screen too, and Back to map lets anyone leave
who prefers to watch the map. This re-entry is not part of `rehydrate.js`,
because cross-tab rehydrate adopts campaign state in place and leaves `mode`
out of its synced keys, so a Player-pinned display never inherits the GM
tab's mode. `combat` is in the synced keys, and the rehydrate refresh loop
includes the initiative panel, whose wrapper refreshes the screen.

## Accessibility

A visually hidden `aria-live="polite"` region announces each turn, for
example "Round 2: Mirelle's turn." This region is keyed on round and
combatant id, so HP edits and other refreshes announce nothing extra. The
combat log list is a `role="log"` region, and each attack result, damage
line, and defeat is spoken as its row lands, because the list only ever
gains rows. The ribbon and the board are each one tab stop, and a roving
tabindex anchors on the current turn's chip and on the selected card. Arrow
keys move focus with wraparound. The keydown listeners attach once, at
mount, to the persistent containers, and they query the buttons on each
keypress, because every render replaces the buttons.

A rebuild replaces every control, so focus would fall to the page body after
each one, and `src/combat/FocusRestore.js` decides where it goes instead.
Before the rebuild, the screen names the focused control: a chip or a card by
its combatant id, any other control by its accessible label or its text.
After the rebuild, the control with the same name takes focus back, so a
Damage button stays under the finger across the HP edit it made. When that
control is gone or disabled, focus goes to the current turn's chip, then to
the round heading, which is a persistent `h2` with `tabindex="-1"`. Focus
that sat on an element still in the document, such as the docked dice tray,
is left alone. The first frame of a fight moves focus onto the screen the
same way, because the Start control that opened it has already been rebuilt.
Leaving the screen, by Back to map or End combat, moves focus to the map
canvas.

The attack and cast dialogs need no help from this. They open before any
write, so the button that opened one is still in the document when it closes
and takes focus back, and the deferred rebuild then runs and moves that focus
to the rebuilt button by name.

## The sidebar card

`InitiativePanel.js` is a status card. It shows one line, for example "Round
3, Mirelle's turn", resolved through `describe` so that renames show, plus an
Open combat control, and it shows only while a fight is running. The wrapper
around its `update` function owns the auto-drop described above.
