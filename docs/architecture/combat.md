# Combat

*Back to the [architecture overview](../architecture.md).*

Running a fight gets its own mode. `combat` is the fourth `AppMode`, alongside
`play`, `build`, and `library`, and like Library mode it replaces the map
columns entirely: `body.mode-combat` hides the map, the Play sidebar, and the
authoring rails, and the full-width combat screen takes their place. There is
no header button for it. The app enters combat mode when a fight starts and
leaves when it ends, however it ends; the sidebar's Initiative card carries an
Open combat button for a tab that stepped out to the map mid-fight, and a
request for the mode with no fight running lands on Play instead
(`sessionControls.js` guards it), so a stale `setMode` can never show an empty
screen.

This guide covers who owns what during a fight and how the screen stays
current. The 5e resolution itself (attack rolls, casts, damage application)
is unchanged by the screen and documented with
[the wiring layer](app-wiring.md#encounterwiringjs-plus-encounterformjs-weaponattackjs-spellcastjs-combatantsjs)
and [entities](entities.md).

## The pieces

```
src/combat/CombatView.js ..... pure: projects a CombatState into rows a
                               surface can draw (side, HP, AC, defeated,
                               who may act)
src/ui/CombatScreen.js ....... the screen: active column, board, log column,
                               turn ribbon, live region, keyboard handling
src/ui/CombatantCard.js ...... one board card; doubles as a target-picker
                               button when given an onSelect
src/ui/CombatActionBar.js .... the active combatant's weapons and spells as
                               one strip of buttons
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
still does: the `combat` closure variable, mirrored to `state.combat` through
`setCombat`, is written nowhere else. The screen never holds a second copy.
Turn advance and combat end are registered on `app.actions` as
`advanceCombatTurn` and `endCombat`, so the screen's Next turn and End combat
buttons run exactly the code the fight has always run, round-wrap condition
ticks and concentration sweeps included. The same pattern as
`removeCombatant`: anything that changes the fight goes through the module
that holds it.

What `combatWiring.js` owns is per-tab UI state that never persists: which
combatant the left column is inspecting (`inspectedId`, picked by the ribbon
chips, null meaning whoever's turn it is) and which board card is held as the
target (`selectedTargetId`). A stale target id, say a foe defeated since it
was picked, matches nothing at use time and the dialogs fall back to their own
defaults, so neither field is ever validated or cleared eagerly.

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
The screen uses it to gate the action bar, the HP controls, and the
concentration Drop control.

## The layout

Three columns over a turn ribbon, stacking below 1100px.

The **active column** shows the inspected combatant or, by default, whoever's
turn it is: name, initiative, AC, HP (exact for the GM, the coarse band for a
player), condition chips, and concentration with its Drop control. The GM
gets a damage/heal amount and button pair, the Encounters panel's idiom,
applied through `applyToTarget`, the same single write path every hit uses.
Below that sits the **action bar** (`CombatActionBar.js`): one button per
weapon and per castable spell of the current turn's combatant, resolved by
the same `weaponsOf`/`spellsOf` derivations the sidebar strip used to read.
The bar belongs to the turn, not the inspection, so inspecting a foe never
offers its weapons to a player.

The **board** shows the two sides as labelled groups of cards
(`CombatantCard.js`). Each card is a real `<button>` acting as the target
picker: clicking one holds it (`aria-pressed`), clicking again releases it,
and the held id pre-fills the attack dialog's defender and the cast dialog's
target field, whichever picker the spell built (single select, multiselect,
or the projectile allocation grid; `prefillTarget` in `spellCast.js`). The
attack dialog's six situational fields sit behind a collapsed disclosure
(`promptModal`'s `advanced` field flag), so the common flow is click the
card, click the weapon, press Enter.

The **log column** shows the travelogue filtered to `combat` and `roll`
entries, newest first, sharing `TravelogPanel.js`'s row builder so an entry
reads the same in both lists. Under it sits the dice tray: the app has one
tray, and the screen borrows the whole `#dice-tray-container` card by
`appendChild` while the mode is active, returning it below the map on exit.
Moving the element keeps `diceWiring.js`'s handle valid, since the tray is
mounted once and never re-resolved.

The **turn ribbon** runs under the columns: one chip per participant in
order, initials plus initiative, the current turn ringed and marked
`aria-current`, foes marked by icon rather than color alone, defeated chips
struck through. Clicking a chip inspects without advancing the turn. The
round counter and the GM's Next turn / End combat sit beside it.

## How the screen stays current

`app.views.combatScreen` is registered by `combatWiring.js` (mounted before
`wireEncounters`, so it exists by the time the fight's refresh paths run) and
reached from four directions:

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
`wireSessionControls` has registered `setMode`, and only on a GM tab. It is
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
wrapper around its `update` still owns the walked-off-the-tile auto-drop.
