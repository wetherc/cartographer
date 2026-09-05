# The app wiring layer

*Reference. Back to the [architecture overview](../architecture.md).*

`src/main.js` is the composition root. It builds one shared context object,
then calls a series of `wireX(app)` functions, one per feature area, each in
its own file under `src/app/`.

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

The two registries let modules talk to each other without importing each
other. When `partyWiring.js` mounts the character sheet, it registers a view,
and when `mapTravel.js` moves the party onto an encounter, it calls an action
that `encounterWiring.js` registered, so neither file can create an import
cycle or an initialization-order dependency on the other.

The wiring modules read everything on the context at call time, inside event
handlers, and never capture a value from the context while wiring runs. A
module wired early can therefore provide an event handler that calls a view a
later module registers, because the lookup happens when the event fires
rather than when the handler was created. Write
`app.views.encounterPanel.update()` inside the handler rather than pulling
`app.views.encounterPanel` into a local variable during wiring, when the view
is still undefined.

Every registry entry is declared required, and `main.js` casts the two empty
objects once so the types say so from the start. A few modules read the
registries while wiring still runs, which makes the call order in `main.js`
a dependency order. `mapWiring.js` draws the first map as it finishes, which
marks the encounter and NPC tiles and rebuilds the two Build-rail lists
scoped to the same node, so `main.js` wires `wireEncounters` and `wireStory`
before it. `main.js` wires `wireSessionControls` last, because mounting the
role switch applies the starting role immediately, which refreshes four
panels and re-points the character sheet. A module that reads a view or
action during its own mount belongs after the module that registers it.

Only campaign data, the data a save serializes, lives on `app.state`, and
per-feature UI state stays private inside the module that owns it:

- the selected tile
- the active brush
- the edit history
- the selected character
- a running combat
- the dirty flag

A handler that reads an entity, opens a dialog, and awaits the answer reads
the entity again by id after the await and applies the edit to that current
entity, never to the pre-await copy, because the entity can change while the
dialog is open: a heal lands, a condition is added, or another tab adopts a
save. `applyFresh` in `src/entities/Roster.js` does this for a list, and
returns a null entity when the id is gone, so the handler can toast and stop
instead of writing.

## The wiring modules

Each is a `wireX(app)` factory, listed here in the order a new contributor
meets them.

### campaignActions.js

This module owns the dirty flag (the Save indicator and the leave-page
guard) and the header's campaign controls: Save, Undo, Redo, New, Load
example, Export, and Import. It provides `markDirty`, which every other
module calls.

`src/storage/SaveNotices.js` decides what message the GM sees after a write.
Autosave writes every ten seconds while the campaign is dirty, so a full
origin would repeat the same warning on every write without a rule for when
to stay quiet. `saveOutcome` turns a write result into a message and a landed
flag, `historyLoss` and `historyLossMessage` announce a shortened or cleared
undo history once rather than on every write, and `footprintWarning` waits
for the footprint to grow by ten percent before it warns again.

This module also handles cross-tab save adoption. When another browser tab
saves, a Play-mode tab with nothing unsaved adopts that campaign in place
through `rehydrate.js`, without a page reload. Build mode, Library mode, and
any failure to adopt fall back to a reload.

The adoption tries the recorded delta first. Every save writes its exact
edit as a delta beside the campaign (see the history log in
[Persistence](persistence.md)), and this module remembers the history
position of its live state. When an external save is exactly one delta ahead
of that position, `HistoryLog.planAdoption` returns the ops, and the tab
applies them to its own state with `applyOps` without reading the whole save
again. `applyOps` copies only along the op paths, so every node and entity
outside the edit keeps its identity and the adoption costs the size of the
edit. Every other case (a position gap, an undo, a cleared log, or a failed
apply) takes the full load path through `Campaigns.loadInitialCampaign`.

### mapWiring.js (plus mapAuthoring.js and mapTravel.js)

This module mounts the map and syncs its location: the canvas, the
breadcrumb, both world trees, the palette, the fog controls, and the
Build-rail tools. It provides the map-facing actions (`goTo`-style syncs,
`onModeChanged`/`onRoleChanged`) and returns the shared `MapEnv` context.
Every module around the map takes `MapEnv` as its second argument.

`mapResync.js` defines the one map-resync step that those modules share.
`resyncMapViews(app, env, { reframe })` puts the views that reflect the map
back in line with the grid, and it always refreshes the breadcrumb and both
world trees. With `reframe`, which a caller passes when it changes the node
in view, it also re-frames the canvas on the current node, drops the tile
selection, re-filters the palette to the node's kind, and re-places the
party marker. Without `reframe`, for a change elsewhere that the node in
view still needs to draw, the canvas only redraws in place and the GM keeps
their pan and zoom. The helper lives in its own module because
`mapWiring.js` imports `nodeActions.js`, one of the callers.

`locationPanels.js` is the other shared refresh step.
`refreshLocationPanels(app)` updates the four panels that filter their rows
by a map location: encounters, initiative, NPCs, and handouts. The map resync
does not cover them, because it reads the grid and these read the campaign
lists. A caller uses this when it moves a creature, unplaces one, or changes
what a handout is bound to.

The gesture layers live beside it, in their own files:

- `mapAuthoring.js` handles Build mode: paint, erase, and region strokes,
  drop-paint, the tile inspector, and the map-edit undo (`snapshotEdit` on the
  `MapEnv`, `undoStroke` as an action).
- `mapTravel.js` handles Play mode: cell clicks, teleports, point-of-interest
  discovery, NPC meets, and the hover tooltip. It syncs its own views and
  does not call `resyncMapViews`. A bound character's move does not move the
  party that the location panels filter on, and a Play-mode zoom into a node
  leaves the tile selection and the palette alone.

### generateAction.js and nodeActions.js

`generateAction.js` runs the Generate dialog flow and its apply, and
`nodeActions.js` handles node create, edit, and delete. Both take
`(app, env)` like the gesture layers, and both end in `resyncMapViews`.

A generated layout replaces every tile of the node, so the sub-maps the
replaced tiles led to are removed with them. A multi-level dungeon leaves its
deeper levels this way, and the new level 1 gets new ones. The pure decisions
live in `src/map/RegenerateNode.js`. `linkedDescendants` names the nodes to
remove: every node a replaced tile links to, with its subtree. A child that
no tile links to is left alone, because it was already unreachable.
`regenerateLanding` says where the party goes, including a party that stood
in a removed level, and `regenerateTokenMoves` says the same for each token
that stood in the node, a split character or a placed creature, because the
new layout can turn the tile it stands on into wall or void. Every other
location inside the removed levels is emptied, with the same answers the
delete path gives: a character rejoins the party
(`CharacterTokens.recallFrom`), a creature becomes unplaced
(`CreatureMap.unplaceFrom`), and a handout becomes campaign-wide
(`Handouts.unbindFrom`). A location left on a node that is gone would hide
its owner from every panel.

`regenerateSnapshot` builds the undo record. The stroke-undo ring in
`EditHistory.js` keeps an `EditSnapshot` per edit: the rewritten nodes, the
ids of created nodes, the removed nodes, the party position, the locations
of the characters and creatures the edit moved, the nodes the handouts it
set loose were bound to, and the entry memory. `undoStroke` in
`mapAuthoring.js` applies them all, then refreshes the panels that filter by
location through `app/locationPanels.js`. The rng that drew the layout also
picks the entrance art on the parent, so one seed gives one result.

The decisions they share are pure functions in `src/map/NodeEdits.js`.
`freshNodeId` picks an id that the grid does not use, `tileWithinBounds`
says where the party goes when the node it stands in shrinks,
`relandedTile` says the same for a node that was regenerated under it, and
`entranceArtFor` names the marker that a generated map's entrance gets on
its parent. `coerceNodeKind`, in `NodeKinds.js`, keeps a dialog or a
hand-edited save from writing a kind that the renderer does not know.

`src/map/NodeCleanup.js` decides where every other location goes when a
node is deleted or shrinks. A delete can remove the node the party stands
in, and a party position on a missing node breaks the next load, so
`deleteLanding` names the tile in the remaining parent, beside the block the
node occupied, and `deleteNode` refuses when no parent remains.
`locationsAfterDelete` then recalls split characters inside the subtree,
unplaces creatures there, and unbinds handouts from it, and
`locationsAfterShrink` pulls the party, split characters, and placed
creatures inside the new bounds through `tileWithinBounds`. `nodeActions.js`
reads the live state into these functions and writes the answers back.

### partyWiring.js

This module owns the roster, character sheet, inventory, spellbook, and Time
panel. It provides `refreshSelectedCharacter` and the `partyPanels` view,
which re-reads everything those panels show at once.

The character panels do not talk to each other, so `characterScope.js`
records which character the panels are pointed at. It writes an edited
character back into the roster, and it hands the new value to every panel
that registered with it. A panel gets a commit handle from `register`, and
the scope skips that panel when it distributes an edit, because the panel
already re-renders itself from its own commit path. A fourth character tab
needs one registration.

`view/CharacterClaim.js` owns this tab's claim on one character and the
"Playing as" picker, and `splitParty.js` owns the GM's split switch and the
regroup that it forces. This module mounts both, and both call back into it:
the claim to select a character or to fall back to spectator, and the switch
to redraw the roster, whose place buttons follow it.

Every panel this module refreshes stops short of rebuilding when nothing it
shows has changed. `ui/CharacterSheet.js` compares a dependency list and
re-points its existing nodes at the new values, `ui/CharacterRoster.js` runs
the guard that the list panels run through `repaintNeeded`, and the claim
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

A follower tab's update therefore costs a repaint rather than a page load.
The parse itself takes well under a millisecond after the tile codec (see
[Persistence](persistence.md)).

The adoption has limits:

- It takes an already-built `Campaign` and does not read storage, so
  migrations, asset restore, tile decode, and entity defaults stay stated
  once, in `Campaigns.loadInitialCampaign`, shared with an ordinary page
  load. The delta adoption in `campaignActions.js` also hands it a
  `Campaign`, which `Campaigns.campaignFromLiveState` builds from the state
  that `applyOps` produced, and this module cannot tell which path built it.
- `mode` and `role` are *not* adopted. Both are per-tab view state, so a
  display pinned to the Player view does not follow the GM tab into Build
  mode.

A new campaign field joins `SYNCED_STATE_KEYS`, because a test compares that
list with the fields of `Campaign` and fails when one is missing.

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
`grid.replaceNodes`, because the map caches (`revealedIdsOf` in
`map/MapRenderer.js`, `findRegionGroups` in `map/RegionGroups.js`, and
`spanBlocks` in `map/TilePaint.js`) are keyed on node identity. A node the
save did not change comes back as the object those caches already know, so
an adoption that moved nothing leaves them warm.

### encounterWiring.js (plus creatureForm.js, weaponAttack.js, the four cast modules, combatants.js)

This module owns the Encounters panel, the sidebar's Initiative card, the
Build-rail encounter authoring list, and the walked-into-an-encounter alert.
It owns the running combat, and only this module writes `state.combat`. The
turn flow is registered on `app.actions` (`advanceCombatTurn`, `endCombat`),
so the combat screen drives the same fight through the same code. The fight
itself renders in combat mode, which [the combat guide](combat.md) covers.

The shared create-and-edit dialog (identity, disposition, an optional level
and tier, placement via `locationFields`) lives in `creatureForm.js`. It
backs every creature authoring flow: this module's panels, the Story
sidebar's lists, and the Build-mode right-click menu. A caller that creates
passes a seed, either a library template or a small preset such as the "New
foe here" item's level-1 hostile. Edits go through the pure
`Creature.editCreature`, which keeps live state (current HP lowered to fit a
new max, stat block, conditions) and resets the `met` flag when the creature
moves. The bestiary spawn dialog is `creatureForm.js`'s `addFromLibrary`.

`weaponAttack.js` resolves the 5e attacks that the combat screen's action
bar triggers. Casting a spell is the same job, split across four modules:
`spellCast.js` has the two entry points and builds the cast plan,
`spellTargets.js` says who a spell can reach, `spellCastFields.js` builds
the dialog fields, and `spellCastResolve.js` rolls the cast and writes the
outcome. `CastPlan` in `src/types/cast.ts` passes between them.
`weaponAttack.js` itself is the dialog, the dice tray, and the log lines,
while the rules it applies are pure functions in
`src/combat/AttackResolve.js`, which has the unit tests. `resolveAttack`
decides hit, crit, and the wording that both the log and the toast quote,
`damageParts` assembles the dice that a hit rolls and doubles every count on
a crit, including the dialog's added dice, and `attackerStats` picks between
a creature's stat block and a character's gear-buffed scores.

The spell decides how many creatures a cast can name. `Casting.maxTargets`
reads its `targetCount` value, where an absent value means one target, plus
one target per scaling step, and a `targetCount` of 0 marks an area spell
with no cap at all. The cast dialog offers a single picker at a cap of one,
and a capped checkbox group above that. Both caps are read at the slot level
that the picker opens on, which is the lowest level that the caster can
spend. A cast that ends up over the cap resolves the targets it can reach
and reports the rest as dropped. A multi-projectile spell, such as Scorching
Ray, gets the allocation grid rather than checkboxes, because its
projectiles split between creatures, and its total has to add up exactly, so
a change to the slot level restates it through the form's `setTotal`. See
[Entities](entities.md#multi-projectile-spells) for the model.

Which creatures a cast can reach depends on where it is cast from. In
combat, the list comes from the initiative order, so it is whoever is in the
fight. Out of combat, it is the party's own tile: the undefeated hostile
creatures standing on it. The tile is as close to a range check as the app
gets, since there is no distance between two tokens to measure.

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
  target. The chip has a round counter, read from the spell's duration
  (`SpellTiming.durationInRounds`), and the existing round tick clears the
  chip when the spell ends. Both kinds have condition chips, so the write
  branches only to satisfy the store function of the collection the target
  lives in.
- `commitCreatures(app)` is the refresh that follows a write to
  `state.creatures`. Several panels can show the same creature (the Play
  sidebar's Encounters and NPCs lists and the Build rail's two authoring
  lists), and nothing about the write itself says which side it came from,
  so a write from any side refreshes the others.

  After a write, `commitCreatures` re-marks the danger and blue tiles on the
  viewed map, which also rebuilds both Build-rail lists scoped to the same
  node, refreshes the Play sidebar's Encounters and NPCs panels, refreshes
  the initiative panel (whose wrapped update also refreshes the combat
  screen, because authoring, moving, spawning, or defeating a creature on
  the party's tile can start or end a fight), and marks the campaign dirty.
  A caller passes `{ panel: false }` from an Encounters panel row handler,
  because the list helper already re-renders its own rows once the handler
  resolves and an update here would render them twice. A caller passes
  `{ dirty: false }` when it marks dirty itself.

New combat features route entity resolution, HP application, and the
post-write refresh through these functions rather than rewriting the
character and creature cascade.

The authoring forms share their fields the same way. An entity the GM can
author in two places (a campaign creature in a dialog, a creature template
in the Library rail) describes its fields once as a `ModalField[]`:

- `creatureFields.js` defines the creature's fields, the live behavior
  (`creatureFieldsChange`), and `readCreatureFields`. One spec covers foes
  and townsfolk, because a blank level is the only difference between them.
- `gearFields.js` defines the weapon and armor picker options, plus the None,
  preset, and hand-tuned read-back cascade.
- `statFields.js` defines the stat-block fields and the range-limited
  read-back.
- `casterFields.js` defines the class, level, and spell picker, plus
  `refilterSpellsOnChange`.

`promptModal` renders such a spec as a dialog and `ui/SpecForm.js`'s
`buildSpecForm` renders it as an inline rail form, so a field, a default, a
range limit, and a cross-field rule are each written once. A dialog adds the
placement fields from `locationFields.js` around the spec, and a template
form omits them, because a template has no position. A change to a field, a
default, a range limit, or a cross-field rule lands in the shared module,
never in one form.

### combatWiring.js

This module mounts the combat screen (`ui/CombatScreen.js`) and registers
`views.combatScreen`. It owns no combat state, because the fight lives in
encounterWiring and the view is derived per render by `combat/CombatView.js`,
and it keeps only the tab's transient UI choices: which combatant the screen
is inspecting, and which board card is picked as the attack target.
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

This module owns the Library mode's four template lists (equipment,
creatures, spells, feats) and the custom-library file controls: export,
import, reset, and the startup auto-load. The creature list shows two
subtabs, Foes for the hostile templates and People for the rest, and an edit
that changes a template's disposition moves it to the other subtab. "Add to
campaign" opens the campaign's creature dialog, seeded from the template.

The custom library is not campaign state, because it belongs to the GM
rather than to any one campaign. `library/Library.js` has the built-in
defaults, the pure merge logic, and a small module-level "active library"
registry. A custom entry whose name (and for equipment, type) matches a
default overrides it in place, and all others append. The code that uses the
presets, such as the item form's pickers, the enemy gear selects, and "From
bestiary", reads that registry at call time, because those controls mount
far from the wiring that loads customizations.

Inside the wiring, every list's remove flow goes through one
`makeRemoveHandler(noun, apply)`, so the revert-override-vs-delete-custom
confirm wording lives there alone. The name-keyed lists (creatures, spells,
feats) store edits through one `makeKeyedStore`, which owns id derivation
and makes a rename retire the old key. It refuses a rename onto a name that
another entry already uses, with a toast, because a custom entry keeps its
id and the store would drop the other entry's id from the index. The id
rules (`storedEntryId`, `renameConflict`, and the `idClaimer` that
`normalizeLibrary` uses on the way in) live in `library/LibraryIdentity.js`.
Every edit and removal writes through `updateCustom(edit)`, which reads the
stored library first and applies the edit onto that, so two tabs editing the
library do not erase each other's work. The row summaries live in
`app/librarySummaries.js`.

### sessionControls.js

This module owns the mode and role switches (role guarded by the cross-tab
GM lock), the sidebar tabs, and the sidebar collapse. It provides
`setMode`. Mode is a three-way toggle for the header (Play, Build, or
Library), and Library mode hides the map column entirely and shows only the
template lists.

Only one tab can have the GM view, and only one tab can play a given
character. Both locks come from `createHeartbeatLock`, in
`storage/GMLock.js`, which builds one tab's side of a lock. `claim(key)`
takes the key and releases whatever key this tab claimed before, and it
refreshes the stored record on an interval, so other tabs can see that the
holder is alive. `release()` frees the key, and so does `pagehide`. The
`onYield` callback runs when another tab claims the held key, which happens
when this tab stays frozen long enough for its record to pass the TTL.
`sessionControls.js` claims the single GM key and yields by switching to the
Player view, and `view/CharacterClaim.js` claims a per-character key from
`characterLockKey` and yields by dropping to spectator.

### diceWiring.js

This module owns the dice tray, and the `rollDice` action that a weapon
attack or a spell uses to put its own roll through it. Every roll is logged
to the travelogue, and each entry is attributed to the GM, to the character
that this tab is bound to, or to an anonymous player when the tab is a
spectator.

### shortcuts.js and onboarding.js

These modules own global keyboard shortcuts and the first-run overlay. Which
key means what is the table in `src/view/Shortcuts.js`, so it can be tested
without a keyboard. `shortcuts.js` keeps the listener, the "am I typing in a
field" test that needs real DOM elements, and the clicks each action turns
into. Ctrl/Cmd+Z is the one entry that reads app state: in Build mode it
undoes the last stroke, everywhere else the last save.
