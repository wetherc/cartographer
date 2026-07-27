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
other. When `partyWiring.js` mounts the character sheet, it registers a view;
when `mapTravel.js` moves the party onto an encounter, it calls an action that
`encounterWiring.js` registered. Neither file imports the other.

One rule makes this safe: **everything on the context is read at call time
inside event handlers, never captured at wiring time.** A module wired early
can hand out an event handler that calls a view a later module registers,
because the lookup happens when the event fires, not when the handler was
created.

State ownership follows the same split. Only campaign data — the stuff a save
serializes — lives on `app.state`. Per-feature UI state (the selected tile,
the active brush, the edit history, the selected character, a running combat,
the dirty flag) stays private inside the module that owns it.

## The wiring modules

Each is a `wireX(app)` factory. In rough order of what you will bump into
first:

### campaignActions.js

The dirty flag (the Save indicator and the leave-page guard) and the header's
campaign controls: Save, Undo, Redo, New, Load example, Export, Import. It
provides `markDirty`/`setDirty` for everything else to call.

It also handles cross-tab save adoption. When another browser tab saves, a
Play-mode tab with nothing unsaved adopts that campaign in place through
`rehydrate.js` instead of reloading the page; Build and Library mode, and any
failure to adopt, fall back to the reload.

### mapWiring.js (plus mapAuthoring.js and mapTravel.js)

The map mounts and location syncs: the canvas, the breadcrumb, both world
trees, the palette, the fog controls, and the Build-rail tools. It provides
the map-facing actions (`goTo`-style syncs, `onModeChanged`/`onRoleChanged`)
and the shared `MapEnv` context.

The gesture layers live beside it in their own files:

- `mapAuthoring.js` — Build-mode paint/erase/region strokes, drop-paint, the
  tile inspector, and the map-edit undo (`snapshotEdit`/`undoStroke`).
- `mapTravel.js` — Play-mode cell clicks, teleports, point-of-interest
  discovery, NPC meets, and the hover tooltip.

### generateAction.js and nodeActions.js

`generateAction.js` runs the Generate dialog flow and its non-destructive
apply. `nodeActions.js` handles node create/edit/delete; it predates the
gesture-layer split but follows the same context-object pattern.

### partyWiring.js

The roster, character sheet, inventory, and Time panel. It provides
`refreshSelectedCharacter` and the `partyPanels` view, which re-reads
everything those panels show at once.

### rehydrate.js

Writes a loaded campaign over the running one: the grid's contents, the party
position, the node in view, the ten campaign fields on `app.state`, then every
campaign-backed view. This is what makes a follower tab's update cost a
repaint rather than a page load — the parse never was the expensive part, and
after the tile codec (see [Persistence](persistence.md)) it is well under a
millisecond.

Two details worth knowing:

- It takes an already-built `Campaign` rather than reading storage, so
  migrations, asset restore, tile decode, and entity defaults stay stated once
  in `Campaigns.loadInitialCampaign` and shared with an ordinary page load.
- `mode` and `role` are deliberately *not* adopted: both are per-tab view
  state, so a display pinned to the Player view does not follow the GM tab
  into Build mode.

If you add a campaign field, it has to join `SYNCED_STATE_KEYS` — a test
holds that list against the `Campaign` shape, so forgetting will fail the
suite.

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
place that resolves a participant id across the three combatant collections:

- `findCombatant(app, id)` returns `{ entity, kind, store }`, where `store`
  writes an update back to the owning collection with its panel refreshes.
- `combatantsAsTargets` assembles a foe/ally target list from the running
  order.
- `applyToTarget` is the single damage/heal write path, with the defeat and
  drop-to-0 transitions each logged exactly once.

New combat features should route entity resolution and HP application through
these three rather than re-writing the character/encounter/NPC cascade.

The authoring dialogs share their field groups the same way: `gearFields.js`
(weapon/armor picker options plus the None/preset/hand-tuned read-back
cascade), `statFields.js` (the modal stat-block fields and clamped read-back;
the inline-form equivalent is `formFields.statInputRows`), and
`casterFields.js` (class/level/spell picker, `refilterSpellsOnChange`) each
back both the campaign dialog and the Library template form for their area. A
change to one of these shapes lands in the shared module, never in one form.

### storyWiring.js

The travelogue (provides `logEvent`), NPCs, quests, and handouts.

### libraryWiring.js

The Library mode's three template lists (equipment, bestiary, NPCs) and the
custom-library file controls: export, import, reset, and the startup
auto-load.

The custom library is deliberately not campaign state. `library/Library.js`
holds the built-in defaults, the pure merge logic (a custom entry whose name —
and for equipment, type — matches a default overrides it in place; others
append), and a small module-level "active library" registry. The preset
consumers (the item form's pickers, the enemy gear selects, "From bestiary")
read that registry at call time, since they mount far from the wiring that
loads customizations.

Inside the wiring, every list's remove flow goes through one
`makeRemoveHandler(noun, apply)` — the revert-override-vs-delete-custom
confirm wording lives there alone — and the name-keyed lists (bestiary,
spells) store edits through one `makeKeyedStore` (id derivation,
rename-retires-the-old-key). A fifth library kind (the planned feat catalog)
should reuse both rather than pasting a fourth copy.

### sessionControls.js

The mode and role switches (role guarded by the cross-tab GM lock), the
sidebar tabs, and the sidebar collapse; provides `setMode`. Mode is a
three-way Play / Build / Library toggle; Library mode hides the map column
entirely and shows only the template lists.

### shortcuts.js and onboarding.js

Global keyboard shortcuts and the first-run overlay.
