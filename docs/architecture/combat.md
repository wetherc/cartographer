# Combat

*Explanation. Back to the [architecture overview](../architecture.md).*

A fight runs in its own mode. `combat` is the fourth `AppMode`, alongside
`play`, `build`, and `library`. Like Library mode, it replaces the map columns
entirely: `body.mode-combat` hides the map, the Play sidebar, and the
authoring rails, and the full-width combat screen takes their place. There is
no header button for combat mode.

The app enters combat mode when a fight starts. The app leaves combat mode
when the fight ends, whatever way it ends. The ribbon's Back to map control
and the sidebar's Initiative card carry a tab back and forth during a fight.
If no fight is running, a request for combat mode lands on Play instead.
`sessionControls.js` guards this rule, so a stale `setMode` call can never
show an empty screen.

Combat mode works for both roles: the GM and a player. Build mode and Library
mode are authoring modes. When a tab switches to the Player role, it leaves
Build mode and Library mode. The same guard in `sessionControls.js` keeps a
player on the combat screen instead. A player takes their own character's
turn there. Moving a player back to the map takes the fight away from them.
The header's mode switch is hidden on a player tab.
Because of this, a player uses the ribbon's Back to map control to reach the
map instead.

This guide covers who owns what during a fight and how the screen stays
current. The screen does not change the 5e resolution itself: attack rolls,
casts, and damage application.
[The wiring layer](app-wiring.md#encounterwiringjs-plus-encounterformjs-weaponattackjs-spellcastjs-combatantsjs)
and [entities](entities.md) document that resolution.

## The pieces

```
src/combat/ActionBudget.js ... pure: what one combatant already spent on the
                               current turn, and what a turn start gives back
src/combat/CombatView.js ..... pure: projects a CombatState into rows a
                               surface can draw (side, HP, AC, defeated,
                               who can act), plus the fight's outcome
src/combat/Loadout.js ........ pure: what a combatant is wearing, swinging,
                               and holding in slots, and how much of that a
                               given viewer can see
src/combat/Arrival.js ........ pure: the text of the walked-into-something
                               alert, for the hostile creatures on a tile
src/ui/CombatScreen.js ....... the screen: active column, board, log column,
                               turn ribbon, outcome banner, live region,
                               keyboard handling
src/ui/CombatantCard.js ...... one board card; doubles as a target-picker
                               button when given an onSelect
src/ui/LoadoutBlock.js ....... a loadout as labelled lines, shared by the
                               cards and the active column
src/ui/CombatActionBar.js .... the active combatant's weapons and spells as
                               buttons, grouped by kind and spell level
src/app/combatWiring.js ...... mounts the screen, holds its transient UI
                               state, routes everything else to actions
src/app/encounterWiring.js ... still the only writer of state.combat; the
                               turn flow lives here as registered actions
src/ui/InitiativePanel.js .... the sidebar card: one status line plus the
                               Open combat button
styles/combat.css ............ the mode's layout and the screen's styles
```

## One writer, two surfaces

`encounterWiring.js` owned the running fight before the screen existed. It
still owns the fight today. The fight lives only in `state.combat`. Every
read goes through a `current()` accessor. Every write goes through
`setCombat`. Both accessors are local to that module. In the past, the
module also kept a closure copy beside the state field. A cross-tab
rehydrate did not reach that copy: the rehydrate writes `state.combat`, so
a follower tab whose fight had ended elsewhere kept drawing the old order.
One home for the value removes this whole class of drift.

Turn advance and combat end are registered on `app.actions` as
`advanceCombatTurn` and `endCombat`. Because of this, the screen's Next turn
and End combat buttons run the exact code the fight has always run. This
includes round-wrap condition ticks and concentration sweeps. The advance
step skips combatants who are down and those whose chips cost them the turn.
`advanceTurn` takes a predicate and steps the pointer past them to the next
combatant that can act. `CombatView.skipsTurn` is that predicate, and it covers
the downed, the stunned, and a participant id that no longer resolves. A
defeated goblin's turn never comes up, but its chip stays in the ribbon,
struck through. A stunned one keeps its place too, marked with a dashed edge
rather than a strike, because it is still in the fight. If every participant is
skipped, the pointer walks one full
cycle and stops where it started. This keeps the round counter and timed
effects moving until the GM closes the fight. `removeCombatant` follows the
same pattern: anything that changes the fight goes through the module that
holds it.

`combatWiring.js` owns per-tab UI state that never persists. This includes
`inspectedId`: which combatant the left column is inspecting, picked by the
ribbon chips, with null meaning whoever's turn it is. It also includes
`selectedTargetId`: which board card is held as the target. The app never
validates the inspection. Inspecting a defeated combatant is legitimate, and
an id that stops resolving falls back to whoever's turn it is. The app
releases the target on the refresh that shows it defeated, out of the order,
or the fight over. Otherwise a defeated foe's card keeps its pressed
ring, even after the attack dialog stops honoring the pick.

## The action budget

A turn in 5e holds one action, one bonus action, and one reaction.
`src/combat/ActionBudget.js` is the pure model of what a combatant already
spent. The budget lives on the participant, in a `used` field, so it saves and
resumes with the fight. It records what is gone, not what is left. As a result,
a participant from an older save carries no `used` field, and `budgetOf` reads
that absence as a whole turn.

`attacksLeft` is the one counter in the budget. Extra Attack buys two swings
for one action, so the first swing spends the action and banks the rest.
`spendAttack` draws on the bank before it spends another action, and
`attacksAvailable` reports how many swings are left.

`advanceTurn` gives a whole budget back to the combatant the pointer lands on.
The reaction resets there and not at the top of the round. This matches the
rule that a combatant gets its reaction back at the start of its own turn. A
combatant the pointer skips keeps its spent budget, because that combatant
never takes a turn. `refresh` returns the same participant when nothing is
spent. That keeps the identity of the order array, and with it the save diff
and the combatant index caches.

`canSpend` is a gate on the buttons and not a refusal. The rules hold more
exceptions than this model carries. Every path that spends a cost also gives
the GM a way past the gate.

Movement has no entry in the budget. Nothing in the app moves a token by feet,
so `Movement.walkSpeed` stays informational.

### What spends it

`app.actions.spendBudget(id, cost, options)` is the only write path.
encounterWiring registers it, so `state.combat` keeps one writer. The cost is
'action', 'bonus', 'reaction', or 'attack' for a weapon swing. The return value
is false when the budget no longer holds the cost. With no fight running the
action reports success and writes nothing, which is what a cast from the
character sheet needs.

A weapon swing spends 'attack'. `rollWeaponAttack` asks first and rolls no dice
on a refusal. How many swings one Attack action buys comes from
`Features.attacksPerAction`, which reads the class feature list of the attacker.

A cast spends what its casting time names. `SpellTiming.castingCost` turns the
structured casting time into a cost, and reads a ten-minute or a `special`
casting time as null: no part of a turn pays for it. `castPlan` puts the cost
and a blocked flag on the plan, and `resolveCast` spends the cost before the
first roll. Two things block a cast: a turn that already spent that part of
itself, and a casting time longer than a turn.

Both dialogs offer the way past. The attack dialog shows an "Ignore action cost"
box on a turn with no swing left. The cast dialog shows one for a blocked cast,
worded for whichever of the two reasons applies. A cast that goes through on the
opt-out spends nothing, because there is nothing left to take.

The action bar draws the pips: one per cost, struck through once spent, plus the
swing count when more than one swing is left. The pips report and never gate.
`CombatantRow` carries the `used` budget and `attacksLeft`, so the screen reads
them from the same row it draws everything else from.

## The view is derived, not stored

`buildCombatView(combat, resolve, viewer)` in `src/combat/CombatView.js` is a
pure projection. It returns the round, the turn index, and one row per
participant. Each row carries a name, side, initiative, HP, AC, conditions, a
defeated flag, an incapacitated flag for a combatant whose chips cost it the
turn, whether this viewer can act for it, and what the turn has spent. The
wiring layer
injects the resolver (`findCombatant` from `combatants.js`), because only the
wiring layer sees every collection where an id can live. The order itself
stores nothing on a row. Because of this, a rename, a disposition flip, or
damage during a fight shows up on the next render. The screen and the old
panel derivations (`sideOf`, `isDowned`, `mayActOn`) both read from this one
module. The unit tests also live in this module. The DOM on top of it is
inspected visually instead.

`mayAct` is the one field that depends on the viewer. The GM can act for
anyone, including foes. A player can act only for the party character that
the tab is bound to. The screen uses this field to gate the action bar, the
HP controls, the concentration Drop control, the death-save Roll and
Stabilize controls, and the turn-end button. A
player gets the turn-end button only on their own character's turn. On a
player's tab, this button reads "End my turn" instead of "Next turn".

`fightOutcome(view)` is the other derivation in the module. It returns
`victory` once every foe row is defeated. It returns `defeat` once every
counted party row is defeated. It returns null while both sides still have
someone standing. A side with nobody on it settles nothing. Because of this,
an order that the GM built with no foes in it reads as undecided. A mutual
wipe reads as a defeat: what happens to the party outweighs what happens to
the monsters.

A creature row takes its side from its disposition. A hostile creature is a
foe, and a friendly or neutral one stands with the party. Only characters
and hostile creatures carry the row's `counted` flag and settle the outcome.
A friendly or neutral creature is a bystander: its fall settles nothing, and
its standing does not hold off the defeat of a fallen party. The side does
not shield a creature: a hostile action's target list carries every other
creature in the fight, whatever its side, so the party can turn on a
bystander mid-fight.

### Who can see what

`src/combat/Loadout.js` holds the second viewer rule. `loadoutAccess(found,
viewer, id)` returns `full`, `public`, or `none`. The GM sees everything. A
player sees their own character in full. For another party member, a player
sees only armor and weapons. A player sees nothing of a foe. Armor and a
drawn weapon are visible across the table. A caster's prepared list and
remaining slots are that player's own business. A foe's sheet is the GM's to
reveal. `buildLoadout` takes the access level and never assembles what the
viewer cannot see. Because of this, no surface downstream can leak that data
by drawing a field it was handed.

## The layout

The screen has three columns above a turn ribbon. Below a width of 1100px,
the columns stack.

The **active column** shows the inspected combatant. By default, it shows
whoever's turn it is. The column shows the name, initiative, AC, HP,
condition chips, and concentration with its Drop control. A character at 0 HP
also shows its death-save tracker: three success pips, three failure pips, and
Roll and Stabilize controls. A stable character reads "Stable at 0 HP" and a
dead one "Dead", with no controls. The block comes from
`ui/DeathSaveBlock.js`, which the character sheet also uses, so the two
surfaces cannot describe the same state differently. The HP value is
exact where the viewer can act for the combatant: the GM anywhere, a player
only on their own character. Otherwise the column shows a coarse band instead
of the exact HP. The GM also gets a damage and heal amount field with a
button pair, the same idiom as the Encounters panel, applied through
`applyToTarget`. This is the same single write path that every hit uses.
Under the facts sits the combatant's **loadout** in its fuller form: weapons
with their damage rolls, and a chip for each slot pool. Below that sits the
**action bar** (`CombatActionBar.js`). The action bar shows one button per
weapon and per castable spell of the current turn's combatant. It resolves
these buttons through the same `weaponsOf` and `spellsOf` derivations that
the sidebar strip used to read. The buttons are grouped under an Actions
heading: weapons first, then spells by spell level under the spellbook's own
headings. Without this grouping, a caster with a dozen spells shows one
undifferentiated run of buttons. The bar belongs to the turn, not the
inspection. Because of this, inspecting a foe never offers its weapons to a
player.

The **board** shows the two sides as labelled groups of cards
(`CombatantCard.js`). Each card carries the same loadout in a compact form.
`LoadoutBlock.js` draws both forms, so a card and the column can never
describe one combatant differently. The host trims each card to what that
viewer can see. Each card is a real `<button>` that acts as the target
picker. Clicking a card holds it (`aria-pressed`). Clicking it again releases
it. The held id pre-fills the attack dialog's defender field and the cast
dialog's target field, whichever picker the spell built: single select,
multiselect, or the projectile allocation grid (`prefillTarget` in
`spellCast.js`). The attack dialog's six situational fields sit behind a
collapsed disclosure (`promptModal`'s `advanced` field flag). Because of
this, the common flow is: click the card, click the weapon, press Enter.

The **log column** shows the travelogue filtered to `combat` and `roll`
entries. It shows only entries logged since this fight's setup opened
(`CombatState.startedAt`, stamped by `startCombat`), newest first. It shares
`TravelogPanel.js`'s row builder, so an entry reads the same in both lists.
This time bound keeps the column from replaying every battle that the
campaign ever logged. The "Initiative rolled" line lands inside this bound,
because the app takes the stamp when the setup dialog opens, not when Start
is pressed. Under the log sits the dice tray. The app has one tray. The
screen borrows the whole `#dice-tray-container` card by `appendChild` while
the mode is active, and returns it below the map on exit. Moving the element
keeps `diceWiring.js`'s handle valid, because the app mounts the tray once
and never re-resolves it.

The **turn ribbon** runs under the columns. It shows one chip per
participant, in order, with initials plus initiative. The current turn is
ringed and marked `aria-current`. Foes are marked by an icon rather than by
color alone. Defeated chips are struck through. Clicking a chip inspects
that combatant without advancing the turn. The round counter and the turn
controls sit beside the ribbon: Back to map for everyone, the turn-end
button for whoever can take the current turn, and End combat for the GM
alone.

## Starting a fight

A fight can start wherever the party stands with a live creature.
`creaturesHere` in `encounterWiring.js` is the gate on the Start combat
button: every undefeated creature on the party's exact tile counts,
whatever its disposition. A party that decides to attack a neutral
bystander is not stopped.

Only a hostile creature is a threat, and only a threat raises the arrival
modal. A friendly or neutral creature opens nothing: the panel lists it,
and a step onto its tile logs a meeting instead. `arrivalAlert` in
`src/combat/Arrival.js` writes the text of the modal. It reads `name`,
`currentHP`, and `maxHP` off each hostile creature there.

The Start combat button sits in the Active tab of the Encounters panel. The
Active tab lists the same live creatures the gate counts, so the panel
switches itself to that tab whenever the button can show.

## Ending a fight

A fight ends when the GM ends it, or when its participants are genuinely gone.
Killing the last enemy is neither of these. In the past, killing the last
enemy ended the fight on the spot. This closed the screen mid-swing and took
the log and the board away from whoever landed the hit, with no chance to
heal first.

The auto-drop keeps the fight running when the party leaves the tile or the
creature list changes for reasons other than a kill. `syncCombatLocation` is
an action that the party-move paths and `commitCreatures` call. The plain
panel refresh never calls it, because that refresh also runs from the
rehydrate loop, where a state write fights the save that the tab just
adopted from another tab. The auto-drop reads `creaturesOnTile`, which
keeps defeated creatures and bystanders in the count. A combatant at 0 HP
is a turn in the fight, not the end of it, and a fight the party picked
with a neutral creature has no hostiles in it at all. Walking off the tile
still clears the fight. So does deleting the last thing to fight. A kill
does not clear the fight.

The screen also grows a banner under the ribbon once `fightOutcome` settles.
The banner states that the party is victorious or defeated, with a line for
the GM that combat stays open until the GM ends it. At that point, End combat
takes the primary emphasis away from the turn-end button. Turns still
advance, so a round of healing is available before the GM leaves the fight.

The banner is a persistent `role="status"` node. The app does not rebuild
this node on every render. It unhides the node before it writes the node's
text. A status region hidden at the moment of the change is not read out by
a screen reader. A rebuilt node re-announces the outcome on every HP
edit.

## How the screen stays current

`combatWiring.js` registers `app.views.combatScreen`. It mounts before
`wireEncounters`, so the view exists by the time the fight's refresh paths
run. Four different paths reach this view. The registered `update` function
skips the rebuild while the tab sits on another mode with the fight still
running, because nothing on the screen is visible then. The switch back into
combat mode is itself one of the refresh paths. Because of this, the first
visible frame is always freshly drawn. A fight that has ended still falls
through to the rebuild. This rebuild empties the screen instead of leaving
the last fight's DOM behind.

- **The initiative-panel wrapper.** `encounterWiring.js` wraps
  `views.initiativePanel.update()` and refreshes the combat screen inside
  that wrapper. Because of this, every call site that the sidebar card
  already had (party moves, role switches, the rehydrate loop,
  `commitCreatures`) reaches the screen without extra code.
- **Combatant writes.** The character `store` that `findCombatant` uses
  updates the screen directly. The creature branch reaches the screen
  through `commitCreatures`.
- **The log.** `logEvent` refreshes the screen. Without this, a line that
  changes no combatant, such as a missed attack or a plain tray roll, never
  reaches the log column.
- **Mode changes.** `sessionControls.js` updates the screen on every mode
  switch. This keeps the dice tray in the correct place. The registered
  `update` function is a wrapper that first syncs the tray's dock against
  `state.mode`. Because of this, the tray moves on entry and exit however
  they happen: auto-enter, auto-exit, the header's Play button, the
  sidebar's Open combat control, or a reload that resumes a fight.

A reload with a fight running re-enters combat mode from `main.js`, after
`wireSessionControls` has registered `setMode`. This happens whatever the
tab's role. A player takes their turn on that screen too, and Back to map
lets anyone leave who prefers to watch the map. This re-entry is
deliberately not part of `rehydrate.js`. Cross-tab rehydrate adopts campaign
state in place and leaves `mode` out of its synced keys, so a Player-pinned
display never inherits the GM tab's mode. `combat` is in the synced keys, and
the rehydrate refresh loop includes the initiative panel, whose wrapper
refreshes the screen.

## Accessibility

A visually hidden `aria-live="polite"` region announces each turn, for
example "Round 2: Mirelle's turn." This region is keyed on round and
combatant id, so HP edits and other refreshes announce nothing extra. The
ribbon and the board are each one tab stop. A roving tabindex anchors on the
current turn's chip and on the selected card. Arrow keys move focus with
wraparound. A rebuild notes which chip or card held focus, by
`data-combatant-id`, and restores focus to the new element. The keydown
listeners attach once, at mount, to the persistent containers. They query
the buttons on each keypress, because every render replaces the buttons.

## The sidebar card

`InitiativePanel.js` dropped to a status card when the screen took over. The
card shows one line, for example "Round 3, Mirelle's turn", resolved through
`describe` so that renames show, plus an Open combat control. The card still
shows only while a fight is running. The wrapper around its `update`
function still owns the auto-drop described above.
