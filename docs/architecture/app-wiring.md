# The app wiring layer

*Back to the [architecture overview](../architecture.md).*

`src/main.js` is the composition root: it builds one shared context object and
then calls a series of `wireX(app)` functions, one per feature area, each
living in its own file under `src/app/`. This guide explains that context
object, the rules that make the wiring modules independent of each other, and
what each module owns.

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

The two registries are how modules talk to each other without importing each
other. When `partyWiring.js` mounts the character sheet, it registers a view.
When `mapTravel.js` moves the party onto an encounter, it calls an action that
`encounterWiring.js` registered. Neither file imports the other, so neither
can create an import cycle or an initialization-order dependency on the other.

One rule makes this safe: **everything on the context is read at call time
inside event handlers, never captured at wiring time.** A module wired early
can hand out an event handler that calls a view a later module registers,
because the lookup happens when the event fires, not when the handler was
created. Write `app.views.encounterPanel.update()` inside the handler; never
pull `app.views.encounterPanel` into a local variable during wiring, where it
would still be undefined.

Every registry entry is declared required, and `main.js` casts the two empty
objects once so the types say so from the start. A few modules do read the
registries while wiring is still running, which is why `main.js`'s call order is
a dependency order. `mapWiring.js` draws the first map as it finishes, which
marks the encounter and NPC tiles and rebuilds the two Build-rail lists scoped to
the same node, so `wireEncounters` and `wireStory` are wired before it.
`wireSessionControls` is wired last, because mounting the role switch applies the
starting role immediately, and that refreshes four panels and re-points the
character sheet. A module that reads a view or action during its own mount
belongs after the module that registers it.

State ownership follows the same split. Only campaign data, the stuff a save
serializes, lives on `app.state`. Per-feature UI state (the selected tile, the
active brush, the edit history, the selected character, a running combat, the
dirty flag) stays private inside the module that owns it.

## The wiring modules

Each is a `wireX(app)` factory. In rough order of what you will bump into
first:

### campaignActions.js

The dirty flag (the Save indicator and the leave-page guard) and the header's
campaign controls: Save, Undo, Redo, New, Load example, Export, Import. It
provides `markDirty` for everything else to call.

It also handles cross-tab save adoption. When another browser tab saves, a
Play-mode tab with nothing unsaved adopts that campaign in place through
`rehydrate.js` instead of reloading the page. Build and Library mode, and any
failure to adopt, fall back to the reload.

### mapWiring.js (plus mapAuthoring.js and mapTravel.js)

The map mounts and location syncs: the canvas, the breadcrumb, both world
trees, the palette, the fog controls, and the Build-rail tools. It provides
the map-facing actions (`goTo`-style syncs, `onModeChanged`/`onRoleChanged`)
and returns the shared `MapEnv` context, which every module around the map
takes as its second argument.

`mapResync.js` holds the one map-resync epilogue those modules share.
`resyncMapViews(app, env, { reframe })` puts the views that reflect the map back
in line with the grid. It always refreshes the breadcrumb and both world trees.
With `reframe` it also re-frames the canvas on the current node, drops the tile
selection, re-filters the palette to the node's kind, and re-places the party
marker, for a caller that changed the node in view. Without it the canvas only
redraws in place and the GM keeps their pan and zoom, for a change elsewhere
that the node in view happens to draw. The helper lives in its own module
because `mapWiring.js` imports `nodeActions.js`, one of the callers.

The gesture layers live beside it in their own files:

- `mapAuthoring.js` handles Build mode: paint/erase/region strokes,
  drop-paint, the tile inspector, and the map-edit undo (`snapshotEdit` on the
  `MapEnv`, `undoStroke` as an action).
- `mapTravel.js` handles Play mode: cell clicks, teleports, point-of-interest
  discovery, NPC meets, and the hover tooltip. It syncs its own views rather
  than calling `resyncMapViews`. A bound character's move does not move the
  party that the location panels filter on, and a Play-mode zoom into a node
  leaves the tile selection and the palette alone.

### generateAction.js and nodeActions.js

`generateAction.js` runs the Generate dialog flow and its non-destructive
apply. `nodeActions.js` handles node create/edit/delete. Both take
`(app, env)` like the gesture layers, and both end in `resyncMapViews`.

### partyWiring.js

The roster, character sheet, inventory, spellbook, and Time panel. It provides
`refreshSelectedCharacter` and the `partyPanels` view, which re-reads
everything those panels show at once.

The character panels do not talk to each other. `characterScope.js` holds which
character they are pointed at, writes an edited character back into the roster,
and hands the new value to every panel that registered with it. A panel gets a
commit handle from `register`, and the scope skips that panel when it fans an
edit out, because a panel already re-renders itself from its own commit path.
Adding a fourth character tab is one registration.

`view/CharacterClaim.js` owns this tab's claim on one character and the "Playing
as" picker, and `splitParty.js` owns the GM's split switch and the regroup it
forces. Both are mounted from here and call back into it — the claim to select a
character or fall back to spectator, the switch to redraw the roster whose place
buttons follow it.

### rehydrate.js

Writes a loaded campaign over the running one: the grid's contents, the party
position, the node in view, the ten campaign fields on `app.state`, then every
campaign-backed view. This is what makes a follower tab's update cost a
repaint rather than a page load. The parse never was the expensive part, and
after the tile codec (see [Persistence](persistence.md)) it is well under a
millisecond.

Two details:

- It takes an already-built `Campaign` rather than reading storage, so
  migrations, asset restore, tile decode, and entity defaults stay stated once
  in `Campaigns.loadInitialCampaign` and shared with an ordinary page load.
- `mode` and `role` are deliberately *not* adopted. Both are per-tab view
  state, so a display pinned to the Player view does not follow the GM tab
  into Build mode.

If you add a campaign field, it has to join `SYNCED_STATE_KEYS`. A test holds
that list against the `Campaign` shape, so forgetting will fail the suite.

### encounterWiring.js (plus encounterForm.js, weaponAttack.js, spellCast.js, combatants.js)

The Encounters and Initiative panels, the Build-rail encounter authoring list,
and the walked-into-an-encounter alert. It owns the transient combat state.

The shared create/edit dialog (name, HP, level/tier, placement via
`locationFields`) lives in `encounterForm.js` and backs both panels' add and
edit actions. Edits go through the pure `Encounter.editEncounter`, which keeps
live state (current HP clamped to a new max, stat block, conditions) and
resets the `noticed` flag when the encounter moves. The bestiary spawn dialog
is `encounterForm.js`'s `addFromBestiary`.

The 5e attack resolution the Initiative panel triggers is `weaponAttack.js`,
and spell resolution is `spellCast.js`. Both build on `combatants.js`, the one
place that resolves a participant id across the three combatant collections
(characters, encounters, NPCs):

- `findCombatant(app, id)` returns `{ entity, kind, store }`, where `store`
  writes an update back to the owning collection with its panel refreshes.
- `combatantsAsTargets` assembles a foe/ally target list from the running
  order.
- `applyToTarget` is the single damage/heal write path, with the defeat and
  drop-to-0 transitions each logged exactly once.
- `commitEncounters(app)` and `commitNPCs(app)` are the refresh that follows a
  write to `state.encounters` or `state.npcs`. Two separate panels show the
  same entity — the Play sidebar's list and the Build rail's authoring list —
  so a write from either side has to refresh the other, and nothing about the
  write itself says which side it came from.

  `commitEncounters` re-marks the danger tiles on the viewed map (that call
  also rebuilds the Build-rail encounter list, which is scoped to the same
  node), refreshes the Play sidebar's Encounters panel, refreshes the
  initiative panel, since authoring, moving, spawning, or defeating an
  encounter on the party's tile can start or end a fight, and marks the
  campaign dirty. Two opt-outs: pass `{ panel: false }` from an Encounters
  panel row handler, because the list helper re-renders its own rows once the
  handler resolves and updating it here would render twice; pass
  `{ dirty: false }` where the caller marks dirty itself.

  `commitNPCs` is the same for NPCs, minus the initiative panel: NPC markers
  plus the Build-rail NPC list, the Story sidebar's NPC panel, and the dirty
  mark.

New combat features should route entity resolution, HP application, and the
post-write refresh through these rather than re-writing the
character/encounter/NPC cascade.

The authoring dialogs share their field groups the same way: `gearFields.js`
(weapon/armor picker options plus the None/preset/hand-tuned read-back
cascade), `statFields.js` (the modal stat-block fields and clamped read-back;
the inline-form equivalent is `formFields.statInputRows`), and
`casterFields.js` (class/level/spell picker, `refilterSpellsOnChange`) each
back both the campaign dialog and the Library template form for their area. A
change to one of these shapes lands in the shared module, never in one form.

### storyWiring.js

The travelogue (provides `logEvent`), NPCs, quests, and handouts.

The quest and handout panels get their add/edit/delete callbacks from
`entityList.js`'s `wireEntityList(app, spec)`. A spec says which `state` list
the entries live on, the noun its dialogs are titled with, what fields those
dialogs show, and how a submitted record becomes a new or edited entry. The
helper owns the rest: prompting, rejecting an empty title, deriving a unique id
from the title, appending or replacing, marking the campaign dirty, and
confirming a delete by name.

### libraryWiring.js

The Library mode's four template lists (equipment, bestiary, NPCs, spells) and the
custom-library file controls: export, import, reset, and the startup
auto-load.

The custom library is deliberately not campaign state; it belongs to the GM,
not to any one campaign. `library/Library.js` holds the built-in defaults, the
pure merge logic, and a small module-level "active library" registry. The
merge rule: a custom entry whose name (and for equipment, type) matches a
default overrides it in place, and all others append. The preset consumers
(the item form's pickers, the enemy gear selects, "From bestiary") read that
registry at call time, since they mount far from the wiring that loads
customizations.

Inside the wiring, every list's remove flow goes through one
`makeRemoveHandler(noun, apply)`, so the revert-override-vs-delete-custom
confirm wording lives there alone. The name-keyed lists (bestiary, spells)
store edits through one `makeKeyedStore`, which owns id derivation and makes a
rename retire the old key. A fifth library kind (the planned feat catalog)
should reuse both rather than pasting a fourth copy.

### sessionControls.js

The mode and role switches (role guarded by the cross-tab GM lock), the
sidebar tabs, and the sidebar collapse; provides `setMode`. Mode is a
three-way Play / Build / Library toggle; Library mode hides the map column
entirely and shows only the template lists.

Only one tab may hold the GM view, and only one tab may play a given character.
Both locks come from `createHeartbeatLock` in `storage/GMLock.js`, one tab's side
of a lock. `claim(key)` takes the key, releases whatever key this tab held
before, and refreshes the stored record on an interval so other tabs can see the
holder is alive. `release()` gives the key up, and so does `pagehide`. The
`onYield` callback runs when another tab takes over the held key, which happens
when this tab was frozen long enough for its record to pass the TTL.
`sessionControls.js` claims the single GM key and yields by switching to the
Player view. `view/CharacterClaim.js` claims a per-character key from
`characterLockKey` and yields by dropping to spectator.

### shortcuts.js and onboarding.js

Global keyboard shortcuts and the first-run overlay.
