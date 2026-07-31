# Combat

*Back to the [architecture overview](../architecture.md).*

Running a fight gets its own mode. `combat` is the fourth `AppMode`, alongside
`play`, `build`, and `library`, and like Library mode it replaces the map
columns entirely: `body.mode-combat` hides the map, the Play sidebar, and the
authoring rails, and the full-width combat screen takes their place. There is
no header button for it. The app enters combat mode when a fight starts and
leaves when it ends, however it ends; the ribbon's Back to map and the
sidebar's Initiative card carry a tab back and forth mid-fight, and a request
for the mode with no fight running lands on Play instead
(`sessionControls.js` guards it), so a stale `setMode` can never show an empty
screen.

Combat mode is for both roles. Build and Library are authoring modes, so a tab
switched to the Player role leaves them, but the same guard in
`sessionControls.js` leaves a player on the combat screen: a player takes their
own character's turn there, and bouncing them to the map would take the fight
away from them. Since the header's mode switch is hidden on a player tab, the
ribbon's Back to map is how a player reaches the map instead.

This guide covers who owns what during a fight and how the screen stays
current. The 5e resolution itself (attack rolls, casts, damage application)
is unchanged by the screen and documented with
[the wiring layer](app-wiring.md#encounterwiringjs-plus-encounterformjs-weaponattackjs-spellcastjs-combatantsjs)
and [entities](entities.md).

## The pieces

```
src/combat/CombatView.js ..... pure: projects a CombatState into rows a
                               surface can draw (side, HP, AC, defeated,
                               who may act), plus the fight's outcome
src/combat/Loadout.js ........ pure: what a combatant is wearing, swinging,
                               and holding in slots, and how much of that a
                               given viewer may see
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

`encounterWiring.js` owned the running fight before the screen existed and
still does. The fight lives in `state.combat` and nowhere else: every read goes
through a `current()` accessor and every write through `setCombat`, both local
to that module. It used to keep a closure copy beside the state field, which a
cross-tab rehydrate then could not reach: the rehydrate writes `state.combat`,
so a follower tab whose fight had ended elsewhere kept drawing the old order.
One home for the value removes that whole class of drift.
Turn advance and combat end are registered on `app.actions` as
`advanceCombatTurn` and `endCombat`, so the screen's Next turn and End combat
buttons run exactly the code the fight has always run, round-wrap condition
ticks and concentration sweeps included. The advance skips combatants who are
down: `advanceTurn` takes a defeated predicate and steps the pointer past
them to the next one standing, so a dead goblin's turn never comes up, while
its chip stays in the ribbon, struck through. With every participant down the
pointer walks one full cycle and stops where it started, which keeps the
round counter and timed effects moving until the GM closes the fight. The
same pattern as `removeCombatant`: anything that changes the fight goes
through the module that holds it.

What `combatWiring.js` owns is per-tab UI state that never persists: which
combatant the left column is inspecting (`inspectedId`, picked by the ribbon
chips, null meaning whoever's turn it is) and which board card is held as the
target (`selectedTargetId`). The inspection is never validated: inspecting a
defeated combatant is legitimate, and an id that stops resolving just falls
back to whoever's turn it is. The target is released on the refresh that
shows it defeated, out of the order, or the fight over, since a dead foe's
card would otherwise keep its pressed ring while the attack dialog had
already stopped honoring the pick.

## The view is derived, not stored

`buildCombatView(combat, resolve, viewer)` in `src/combat/CombatView.js` is a
pure projection: the round, the turn index, and one row per participant with
its name, side, initiative, HP, AC, conditions, defeated flag, and whether
this viewer may act for it. The resolver is injected (`findCombatant` from
`combatants.js`) because only the wiring layer sees every collection an id
might live in. Nothing on a row is stored in the order itself, so a rename, a
disposition flip, or damage mid-fight shows up on the next render. Both the
screen and the old panel derivations (`sideOf`, `isDowned`, `mayActOn`) read
from this one module, which is also where the unit tests live; the DOM on top
of it is inspected visually instead.

`mayAct` is the one viewer-dependent field: the GM may act for anyone
including foes, a player only for the party character the tab is bound to.
The screen uses it to gate the action bar, the HP controls, the concentration
Drop control, and the turn-end button, which a player gets only on their own
character's turn and which reads "End my turn" there rather than "Next turn".

`fightOutcome(view)` is the other derivation in the module: `victory` once every
foe row is defeated, `defeat` once every party row is, null while both sides
still have someone standing. A side with nobody on it settles nothing, so an
order the GM built with no foes in it reads as undecided. A mutual wipe reads as
a defeat, since what happened to the party outweighs what happened to the
monsters.

### Who may see what

`src/combat/Loadout.js` holds the second viewer rule. `loadoutAccess(found,
viewer, id)` answers `full`, `public`, or `none`: the GM sees everything, a
player sees their own character whole, another party member's armor and weapons
only, and nothing at all of a foe. Armor and a drawn weapon are visible across
the table; a caster's prepared list and remaining slots are that player's
business, and a foe's sheet is the GM's to reveal. `buildLoadout` takes the
access level and never assembles what the viewer may not see, so no surface
downstream can leak it by drawing a field it was handed.

## The layout

Three columns over a turn ribbon, stacking below 1100px.

The **active column** shows the inspected combatant or, by default, whoever's
turn it is: name, initiative, AC, HP (exact where the viewer may act for the
combatant — the GM anywhere, a player on their own character — the coarse band
otherwise), condition chips, and concentration with its Drop control. The GM
gets a damage/heal amount and button pair, the Encounters panel's idiom,
applied through `applyToTarget`, the same single write path every hit uses.
Under the facts sits the combatant's **loadout** in its fuller form: weapons
with their damage rolls, and a chip per slot pool. Below that sits the **action
bar** (`CombatActionBar.js`): one button per weapon and per castable spell of
the current turn's combatant, resolved by the same `weaponsOf`/`spellsOf`
derivations the sidebar strip used to read. The buttons are grouped under an
Actions heading, weapons first and then the spells by spell level under the
spellbook's own headings, since a caster with a dozen spells was otherwise one
undifferentiated run of buttons. The bar belongs to the turn, not the
inspection, so inspecting a foe never offers its weapons to a player.

The **board** shows the two sides as labelled groups of cards
(`CombatantCard.js`). Each card carries the same loadout in a compact form
(`LoadoutBlock.js` draws both, so a card and the column cannot describe one
combatant differently), trimmed by the host to what that viewer may see. Each
card is a real `<button>` acting as the target
picker: clicking one holds it (`aria-pressed`), clicking again releases it,
and the held id pre-fills the attack dialog's defender and the cast dialog's
target field, whichever picker the spell built (single select, multiselect,
or the projectile allocation grid; `prefillTarget` in `spellCast.js`). The
attack dialog's six situational fields sit behind a collapsed disclosure
(`promptModal`'s `advanced` field flag), so the common flow is click the
card, click the weapon, press Enter.

The **log column** shows the travelogue filtered to `combat` and `roll`
entries logged since this fight's setup opened (`CombatState.startedAt`,
stamped by `startCombat`), newest first, sharing `TravelogPanel.js`'s row
builder so an entry reads the same in both lists. The time bound is what
keeps the column from replaying every battle the campaign ever logged; the
"Initiative rolled" line lands inside it because the stamp is taken when the
setup dialog opens, not when Start is pressed. Under it sits the dice tray: the app has one
tray, and the screen borrows the whole `#dice-tray-container` card by
`appendChild` while the mode is active, returning it below the map on exit.
Moving the element keeps `diceWiring.js`'s handle valid, since the tray is
mounted once and never re-resolved.

The **turn ribbon** runs under the columns: one chip per participant in
order, initials plus initiative, the current turn ringed and marked
`aria-current`, foes marked by icon rather than color alone, defeated chips
struck through. Clicking a chip inspects without advancing the turn. The
round counter and the turn controls sit beside it: Back to map for everyone,
the turn-end button for whoever may take the current turn, and End combat for
the GM alone.

## Ending a fight

A fight ends when the GM ends it, or when its participants are genuinely gone.
Killing the last enemy is neither. It used to end the fight on the spot, which
closed the screen mid-swing and took the log and the board away from whoever
landed the hit, with no chance to heal up first.

Two rules keep the screen up. The auto-drop (`syncCombatLocation`, an action
the party-move paths and `commitEncounters` call — never the plain panel
refresh, which also runs from the rehydrate loop, where a state write would
fight the save just adopted from another tab) reads `encountersAtTile` rather
than `encountersOnTile`: the two differ only in that `encountersOnTile` filters
the defeated out, so the drop counts every encounter staged on the party's tile
including the dead ones. Walking off the tile or deleting the last encounter
still clears the fight; a kill does not.
And the screen grows a banner under the ribbon once `fightOutcome` settles,
saying that the party is victorious or defeated, with a line for the GM that
combat stays open until they end it. End combat takes the primary emphasis from
the turn-end button at that point, and turns still advance, so a round of
healing is available before leaving.

The banner is a persistent `role="status"` node rather than one rebuilt per
render, unhidden before its text is written: a status region hidden at the
moment of the change is not read out, and a rebuilt node would re-announce the
outcome on every HP edit.

## How the screen stays current

`app.views.combatScreen` is registered by `combatWiring.js` (mounted before
`wireEncounters`, so it exists by the time the fight's refresh paths run) and
reached from four directions. The registered `update` skips the rebuild while
the tab sits on another mode with the fight still running: nothing on the
screen is visible then, and the switch back into combat mode is itself one of
the refresh paths, so the first visible frame is always freshly drawn. A
fight that has ended still falls through to the rebuild, which empties the
screen rather than leaving the last fight's DOM behind.

- **The initiative-panel wrapper.** `encounterWiring.js` wraps
  `views.initiativePanel.update()` and refreshes the combat screen inside it,
  so every call site the sidebar card already had (party moves, role
  switches, the rehydrate loop, `commitEncounters`) reaches the screen for
  free.
- **Combatant writes.** `findCombatant`'s character and NPC `store`s update
  the screen directly; the encounter branch reaches it through
  `commitEncounters`.
- **The log.** `logEvent` refreshes the screen, because a line that changes
  no combatant (a missed attack, a plain tray roll) would otherwise never
  reach the log column.
- **Mode changes.** `sessionControls.js` updates the screen on every mode
  switch. That is what keeps the dice tray honest: the registered `update` is
  a wrapper that first syncs the tray's dock against `state.mode`, so the
  tray moves on entry and exit however they happen (auto-enter, auto-exit,
  the header's Play button, the sidebar's Open combat, a reload resuming a
  fight).

A reload with a fight running re-enters combat mode from `main.js`, after
`wireSessionControls` has registered `setMode`, whatever the tab's role: a
player takes their turn on that screen too, and Back to map leaves for anyone
who would rather watch the map. It is
deliberately not part of `rehydrate.js`: cross-tab rehydrate adopts campaign
state in place and leaves `mode` out of its synced keys, so a Player-pinned
display never inherits the GM tab's mode. `combat` is in the synced keys, and
the rehydrate refresh loop includes the initiative panel, whose wrapper
refreshes the screen.

## Accessibility

A visually hidden `aria-live="polite"` region announces each turn ("Round 2:
Mirelle's turn."), keyed on round and combatant id so HP edits and other
refreshes repeat nothing. The ribbon and the board are one tab stop each: a
roving tabindex anchors on the current turn's chip and the selected card,
arrow keys move focus with wraparound, and a rebuild notes which chip or card
held focus (by `data-combatant-id`) and restores it on the new element. The
keydown listeners attach once at mount to the persistent containers and query
the buttons per keypress, since every render replaces them.

## The sidebar card

`InitiativePanel.js` dropped to a status card when the screen took over: one
line ("Round 3, Mirelle's turn", resolved through `describe` so renames show)
plus Open combat. The card still only shows while a fight is running, and the
wrapper around its `update` still owns the auto-drop described above.
