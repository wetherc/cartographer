# The app wiring layer

*Reference. Back to the [architecture overview](../architecture.md).*

`src/main.js` is the composition root. It builds one shared context object.
Then it calls a series of `wireX(app)` functions, one per feature area. Each
function lives in its own file under `src/app/`. This guide explains that
context object, the rules that keep the wiring modules independent of each
other, and what each module owns.

## The AppContext

`main.js` constructs one **AppContext** (declared in `src/types/app.ts`) and
passes it to every wiring module:

```
AppContext
  |
  +-- engine objects ....... palette, grid, navigator, partyTracker, toasts
  |                          (built once in main.js, live for the whole session)
  |
  +-- state ................ mutable record: the campaign data a save
  |                          serializes, plus the mode/role switches
  |
  +-- views ................ registry of mounted panels other modules refresh
  |                          (starts empty; wiring modules fill it in)
  |
  +-- actions .............. registry of cross-module operations
                             (starts empty; wiring modules fill it in)
```

The two registries let modules talk to each other, and neither module
imports the other. When `partyWiring.js` mounts the character sheet, it
registers a view. When `mapTravel.js` moves the party onto an encounter, it
calls an action that `encounterWiring.js` registered. Neither file imports
the other, so neither can create an import cycle or an
initialization-order dependency on the other.

One rule makes this safe: **the wiring modules read everything on the context
at call time, inside event handlers. They never capture a value from the
context while wiring runs.** A module wired early can provide an event
handler that calls a view that a later module registers. This works because
the lookup happens when the event fires, not when the handler was created.
Write `app.views.encounterPanel.update()` inside the handler. Do not pull
`app.views.encounterPanel` into a local variable during wiring. At that
point, the view is still undefined.

Every registry entry is declared required, and `main.js` casts the two empty
objects once so the types say so from the start. A few modules read the
registries while wiring still runs. This is why the call order in `main.js`
is a dependency order. `mapWiring.js` draws the first map as it finishes.
This marks the encounter and NPC tiles. It also rebuilds the two Build-rail
lists scoped to the same node. As a result, `main.js` wires `wireEncounters`
and `wireStory` before it. `main.js` wires `wireSessionControls` last.
Mounting the role switch applies the starting role immediately. This
refreshes four panels and re-points the character sheet. A module that reads
a view or action during its own mount belongs after the module that
registers it.

State ownership follows the same split. Only campaign data lives on
`app.state`. This is the data that a save serializes. Per-feature UI state
stays private inside the module that owns it:

- the selected tile
- the active brush
- the edit history
- the selected character
- a running combat
- the dirty flag

## The wiring modules

Each is a `wireX(app)` factory. This list orders them by what a new
contributor sees first.

### campaignActions.js

This module owns the dirty flag (the Save indicator and the leave-page
guard) and the header's campaign controls: Save, Undo, Redo, New, Load
example, Export, and Import. It provides `markDirty`, which every other
module calls.

`src/storage/SaveNotices.js` decides what message the GM sees after a write.
Its main job is to stay quiet. Autosave writes every ten seconds while the
campaign is dirty. Without this module, a full origin repeats the same
warning on every write. `saveOutcome` turns a write result into a message
and a landed flag. `historyLoss` and `historyLossMessage` announce a
shortened or cleared undo history once, not on every write.
`footprintWarning` waits for the footprint to grow by ten percent before it
warns again.

This module also handles cross-tab save adoption. When another browser tab
saves, a Play-mode tab with nothing unsaved adopts that campaign in place
through `rehydrate.js`, and it does not reload the page. Build mode,
Library mode, and any failure to adopt fall back to a reload.

### mapWiring.js (plus mapAuthoring.js and mapTravel.js)

This module mounts the map and syncs its location: the canvas, the
breadcrumb, both world trees, the palette, the fog controls, and the
Build-rail tools. It provides the map-facing actions (`goTo`-style syncs,
`onModeChanged`/`onRoleChanged`) and returns the shared `MapEnv` context.
Every module around the map takes `MapEnv` as its second argument.

`mapResync.js` holds the one map-resync epilogue that those modules share.
`resyncMapViews(app, env, { reframe })` puts the views that reflect the map
back in line with the grid. It always refreshes the breadcrumb and both
world trees. With `reframe`, it also re-frames the canvas on the current
node. It drops the tile selection, re-filters the palette to the node's
kind, and re-places the party marker. A caller uses this when it changes the
node in view. Without `reframe`, the canvas only redraws in place, and the
GM keeps their pan and zoom. A caller uses this for a change elsewhere that
the node in view still needs to draw. The helper lives in its own module
because `mapWiring.js` imports `nodeActions.js`, one of the callers.

The gesture layers live beside it, in their own files:

- `mapAuthoring.js` handles Build mode: paint, erase, and region strokes,
  drop-paint, the tile inspector, and the map-edit undo (`snapshotEdit` on the
  `MapEnv`, `undoStroke` as an action).
- `mapTravel.js` handles Play mode: cell clicks, teleports, point-of-interest
  discovery, NPC meets, and the hover tooltip. It syncs its own views, and
  it does not call `resyncMapViews`. A bound character's move does not move
  the party that the location panels filter on. A Play-mode zoom into a node
  leaves the tile selection and the palette alone.

### generateAction.js and nodeActions.js

`generateAction.js` runs the Generate dialog flow and its non-destructive
apply. `nodeActions.js` handles node create, edit, and delete. Both take
`(app, env)` like the gesture layers, and both end in `resyncMapViews`.

The three decisions they share are pure functions in `src/map/NodeEdits.js`.
`freshNodeId` picks an id that the grid does not use. `tileWithinBounds`
says where the party goes when the node it stands in shrinks.
`relandedTile` says the same for a node that was regenerated under it.
`entranceArtFor` names the marker that a generated map's entrance gets on
its parent. `coerceNodeKind`, in `NodeKinds.js`, makes sure that a dialog or
a hand-edited save cannot write a kind that the renderer does not know.

### partyWiring.js

This module owns the roster, character sheet, inventory, spellbook, and Time
panel. It provides `refreshSelectedCharacter` and the `partyPanels` view,
which re-reads everything those panels show at once.

The character panels do not talk to each other. `characterScope.js` holds
which character the panels are pointed at. It writes an edited character
back into the roster, and it hands the new value to every panel that
registered with it. A panel gets a commit handle from `register`. The scope
skips that panel when it distributes an edit, because the panel already
re-renders itself from its own commit path. A fourth character tab needs one
registration.

`view/CharacterClaim.js` owns this tab's claim on one character and the
"Playing as" picker. `splitParty.js` owns the GM's split switch and the
regroup that it forces. This module mounts both here, and both call back
into it. The claim calls back to select a character, or to fall back to
spectator. The switch calls back to redraw the roster, whose place buttons
follow it.

Every panel this module refreshes stops short of rebuilding when nothing it
shows has changed. `ui/CharacterSheet.js` compares a dependency list and
re-points its existing nodes at the new values. `ui/CharacterRoster.js` runs
the guard that the list panels run, through `repaintNeeded`. The claim
compares the option list and the displayed value before it replaces the
picker's options. A `partyPanels` update on an adopted save that changed
nothing therefore adds no element to the party rail.

### rehydrate.js

This module writes a loaded campaign over the running one. It replaces:

- the grid's contents
- the party position
- the node in view
- the ten campaign fields on `app.state`
- every campaign-backed view, refreshed last

This is what makes a follower tab's update cost a repaint, rather than a
page load. The parse was never the expensive part. After the tile codec (see
[Persistence](persistence.md)), it takes well under a millisecond.

What it adopts from the leader is narrower than it looks:

- It takes an already-built `Campaign`, and it does not read storage. As a
  result, migrations, asset restore, tile decode, and entity defaults stay
  stated once, in `Campaigns.loadInitialCampaign`. This module shares them
  with an ordinary page load.
- `mode` and `role` are deliberately *not* adopted. Both are per-tab view
  state, so a display pinned to the Player view does not follow the GM tab
  into Build mode.

If you add a campaign field, it must join `SYNCED_STATE_KEYS`. A test holds
that list against the `Campaign` shape. If you forget, the test run fails.

Each adopted field passes through `reconcile` from
`src/storage/Reconcile.js` first. A parse builds a fresh object for every
entity, including the ones no edit touched, and autosave writes every ten
idle seconds whether or not anything moved. `reconcile` returns the live
object wherever the two sides are structurally equal, so an unchanged
collection comes back as the identical array and a changed entity as a new
object whose untouched sub-objects are still the live ones. A panel that
compares its rows by identity, which is what `ui/listPanel.js` does, can then
tell a real edit from a repeated autosave. It pairs a collection by element
`id`, so an insertion at the front does not make every later entity look
changed.

The world's nodes go through the same `reconcile` call before
`grid.replaceNodes`, and for a stronger reason than the panels. The map
caches (`revealedIdsOf` in `map/MapRenderer.js`, `findRegionGroups` in
`map/RegionGroups.js`, and `spanBlocks` in `map/TilePaint.js`) are keyed on
node identity. A node the save did not change comes back as the object those
caches already know, so an adoption that moved nothing leaves them warm.

### encounterWiring.js (plus creatureForm.js, weaponAttack.js, spellCast.js, combatants.js)

This module owns the Encounters panel, the sidebar's Initiative card, the
Build-rail encounter authoring list, and the walked-into-an-encounter alert.
It owns the running combat. Only this module writes `state.combat`. The turn
flow is registered on `app.actions` (`advanceCombatTurn`, `endCombat`), so
the combat screen drives the same fight through the same code. The fight
itself renders in combat mode. [The combat guide](combat.md) covers it.

The shared create-and-edit dialog (identity, disposition, an optional level
and tier, placement via `locationFields`) lives in `creatureForm.js`. It
backs every creature authoring flow: this module's panels, the Story
sidebar's lists, and the Build-mode right-click menu. A caller that creates
passes a seed, either a library template or a small preset such as the "New
foe here" item's level-1 hostile. Edits go through the pure
`Creature.editCreature`. It keeps live state (current HP clamped to a new
max, stat block, conditions), and it resets the `met` flag when the creature
moves. The bestiary spawn dialog is `creatureForm.js`'s `addFromLibrary`.

`weaponAttack.js` resolves the 5e attacks that the combat screen's action
bar triggers. `spellCast.js` resolves spells the same way. `weaponAttack.js`
itself is the dialog, the dice tray, and the log lines. The rules that it
applies are pure functions in `src/combat/AttackResolve.js`, which holds the
unit tests. `resolveAttack` decides hit, crit, and the wording that both the
log and the toast quote. `damageParts` assembles the dice that a hit rolls,
and it doubles every count on a crit, including the dialog's added dice.
`attackerStats` picks between a creature's stat block and a character's
gear-buffed scores.

The spell decides how many creatures a cast can name. `Casting.maxTargets`
reads its `targetCount` value, where an absent value means one target, plus
one target per scaling step. A `targetCount` of 0 marks an area spell with
no cap at all. The cast dialog offers a single picker at a cap of one, and a
capped checkbox group above that. Both caps are read at the slot level that
the picker opens on, which is the lowest level that the caster can spend. A
cast that ends up over the cap resolves the targets it can reach, and it
reports the rest as dropped. A multi-projectile spell, such as Scorching
Ray, gets the allocation grid, rather than checkboxes, because its
projectiles split between creatures. Its total must add up exactly, so a
change to the slot level restates it through the form's `setTotal`. See
[Entities](entities.md#multi-projectile-spells) for the model.

Which creatures a cast can reach depends on where it is cast from. In
combat, the list comes from the initiative order, so it is whoever is in
the fight. Out of combat, it is the party's own tile: the undefeated hostile
creatures standing on it. The tile is as close
to a range check as the app gets, since there is no distance between two
tokens to measure yet.

All of this builds on `combatants.js`, the one place that resolves a
participant id across the two combatant collections (characters,
creatures):

- `findCombatant(app, id)` returns `{ entity, kind, store }`, where `store`
  writes an update back to the owning collection with its panel refreshes.
- `combatantsAsTargets` assembles a foe or ally target list from the running
  order.
- `applyToTarget` is the single damage-or-heal write path, with the defeat
  and drop-to-0 transitions each logged exactly once.
- `applyConditionToTarget` is the same for a condition that a spell imposes.
  A failed save against a spell with a `condition` adds that chip to the
  target. The chip carries a round counter, read from the spell's duration
  (`SpellTiming.durationInRounds`). The existing round tick clears the chip
  when the spell ends. Both kinds hold chips, so the write branches only
  to satisfy the store function of the collection the target lives in.
- `commitCreatures(app)` is the refresh that follows a write to
  `state.creatures`. Several panels can show the same creature: the Play
  sidebar's Encounters and NPCs lists and the Build rail's two authoring
  lists. A write from any side must refresh the others, because nothing
  about the write itself says which side it came from.

  `commitCreatures` does five things after a write. It re-marks the danger
  and blue tiles on the viewed map. That call also rebuilds both Build-rail
  lists, which are scoped to the same node. It refreshes the Play sidebar's
  Encounters and NPCs panels. It refreshes the initiative panel, whose
  wrapped update also refreshes the combat screen. Authoring, moving,
  spawning, or defeating a creature on the party's tile can start or end a
  fight, so this refresh matters. It also marks the campaign dirty. A
  caller passes `{ panel: false }` from an Encounters panel row handler.
  The list helper already re-renders its own rows once the handler
  resolves, so an update here renders them twice. A caller passes
  `{ dirty: false }` when it marks dirty itself.

New combat features must route entity resolution, HP application, and the
post-write refresh through these functions. They must not rewrite the
character and creature cascade.

The authoring forms share their fields the same way. An entity the GM can
author in two places (a campaign creature in a dialog, a creature template
in the Library rail) describes its fields once as a `ModalField[]`:

- `creatureFields.js` holds the creature's fields, the live behavior
  (`creatureFieldsChange`), and `readCreatureFields`. One spec covers foes
  and townsfolk, because a blank level is what separates them.
- `gearFields.js` holds the weapon and armor picker options, plus the None,
  preset, and hand-tuned read-back cascade.
- `statFields.js` holds the stat-block fields and the clamped read-back.
- `casterFields.js` holds the class, level, and spell picker, plus
  `refilterSpellsOnChange`.

`promptModal` renders such a spec as a dialog and `ui/SpecForm.js`'s
`buildSpecForm` renders it as an inline rail form, so a field, a default, a
clamp, and a cross-field rule are each written once. A dialog adds the
placement fields from `locationFields.js` around the spec; a template form
omits them, because a template holds no position. A change to one of these
shapes lands in the shared module, never in one form.

### combatWiring.js

This module mounts the combat screen (`ui/CombatScreen.js`) and registers
`views.combatScreen`. It owns no combat state. The fight lives in
encounterWiring. The view is derived per render, by `combat/CombatView.js`.
This module holds only the tab's transient UI choices: which combatant the
screen is inspecting, and which board card is held as the attack target.
`main.js` wires this module before `wireEncounters`, so the view exists by
the time the fight's refresh paths run. The details, including how the dice
tray moves into the screen and back, are in [the combat guide](combat.md).

### storyWiring.js

This module owns the travelogue (it provides `logEvent`), NPCs, quests, and
handouts.

The quest and handout panels get their add, edit, and delete callbacks from
`entityList.js`'s `wireEntityList(app, spec)`. A spec says:

- which `state` list the entries live on
- the noun its dialogs are titled with
- what fields those dialogs show
- how a submitted record becomes a new or edited entry

The helper owns the rest:

- prompting
- rejecting an empty title
- deriving a unique id from the title
- appending or replacing the entry
- marking the campaign dirty
- confirming a delete by name

### libraryWiring.js

This module owns the Library mode's three template lists (equipment,
creatures, spells) and the custom-library file controls: export,
import, reset, and the startup auto-load. The creature list shows two
subtabs. Foes holds the hostile templates, and People holds the rest. An
edit that changes a template's disposition moves it to the other subtab.
"Add to campaign" opens the matching campaign dialog: the foe dialog for a
hostile template, and the NPC dialog for the rest.

The custom library is deliberately not campaign state. It belongs to the
GM, not to any one campaign. `library/Library.js` holds the built-in
defaults, the pure merge logic, and a small module-level "active library"
registry. The merge rule: a custom entry whose name (and for equipment,
type) matches a default overrides it in place, and all others append. The
preset consumers, such as the item form's pickers, the enemy gear selects,
and "From bestiary", read that registry at call time. They mount far from
the wiring that loads customizations.

Inside the wiring, every list's remove flow goes through one
`makeRemoveHandler(noun, apply)`, so the revert-override-vs-delete-custom
confirm wording lives there alone. The name-keyed lists (creatures, spells)
store edits through one `makeKeyedStore`, which owns id derivation and makes
a rename retire the old key. A fourth library kind, such as a feat catalog,
must reuse both, rather than paste another copy.

### sessionControls.js

This module owns the mode and role switches (role guarded by the cross-tab
GM lock), the sidebar tabs, and the sidebar collapse. It provides
`setMode`. Mode is a three-way toggle: Play, Build, or Library. Library
mode hides the map column entirely, and shows only the template lists.

Only one tab can hold the GM view, and only one tab can play a given
character. Both locks come from `createHeartbeatLock`, in
`storage/GMLock.js`. This function builds one tab's side of a lock.
`claim(key)` takes the key, and it releases whatever key this tab held
before. It also refreshes the stored record on an interval, so other tabs
can see that the holder is alive. `release()` frees the key, and so does
`pagehide`. The `onYield` callback runs when another tab claims the held
key. This happens when this tab stays frozen long enough for its record to
pass the TTL. `sessionControls.js` claims the single GM key. To yield, it
switches to the Player view. `view/CharacterClaim.js` claims a
per-character key from `characterLockKey`. To yield, it drops to
spectator.

### diceWiring.js

This module owns the dice tray, and the `rollDice` action that a weapon
attack or a spell uses to put its own roll through it. Every roll is logged
to the travelogue. Each entry is attributed to the GM, to the character
that this tab is bound to, or to an anonymous player. This last case
happens when the tab is a spectator.

### shortcuts.js and onboarding.js

This module owns global keyboard shortcuts and the first-run overlay. Which
key means what is the table in `src/view/Shortcuts.js`, so it can be tested
without a keyboard. `shortcuts.js` keeps the listener, the "am I typing in a
field" test that needs real DOM elements, and the clicks each action turns
into. Ctrl/Cmd+Z is the one entry that reads app state: in Build mode it
undoes the last stroke, everywhere else the last save.
