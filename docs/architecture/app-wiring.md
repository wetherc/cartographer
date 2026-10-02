---
---
# The app wiring layer

*Reference. Back to the [architecture overview](../architecture.md).*

`src/main.js` is the composition root. It builds one shared context object,
the **AppContext**, and passes it to a series of `wireX(app)` functions. Each
function lives in its own file under `src/app/` and wires one feature area.

## Boot sequence

The boot runs in this order:

1. `openAssetMirror` opens the IndexedDB image store and reads every image
   payload into memory (see "The image store" in
   [Persistence](persistence.md)). Every later read of an image is
   synchronous.
2. When that promise settles, `start` loads the campaign with
   `loadInitialCampaignSafe` and builds the AppContext.
3. `start` calls the wiring modules in the mount order below.
4. If a fight is running in the loaded save, `start` switches to combat
   mode.
5. `start` shows any toast queued before a reload, any load failure, and
   any shortened-load prompt, then the first-run overlay.

The wait in step 1 is about 4 ms in Chromium with 20 handout images, and
about 2 ms with none. The production bundle is an IIFE, which has no
top-level await, so the rest of the boot runs inside `start`.

## The AppContext

The AppContext type is declared in `src/types/app.ts`:

```
AppContext
  |
  +-- engine objects ....... palette, grid, navigator, partyTracker, toasts
  |                          (built once in main.js, live for the whole session)
  |
  +-- state ................ the campaign data that a save serializes,
  |                          plus the mode and role switches
  |
  +-- views ................ registry of mounted panels that other modules refresh
  |                          (starts empty; wiring modules fill it in)
  |
  +-- actions .............. registry of cross-module operations
                             (starts empty; wiring modules fill it in)
```

`app.state` has ten campaign fields: `entryTiles`, `characters`,
`creatures`, `travelog`, `quests`, `clock`, `handouts`, `bestiary`,
`splitParty`, and `combat`. It also has `mode` (`play`, `build`, `library`,
or `combat`) and `role` (`gm` or `player`). The role comes from
`sessionStorage`, so each tab keeps its own role.

The two registries let modules call each other without imports. For
example, `partyWiring.js` registers a view when it mounts the character
sheet. When `mapTravel.js` moves the party onto an encounter, it calls an
action that `encounterWiring.js` registered. Neither file imports the other,
so neither can create an import cycle or depend on the other's
initialization order.

### Reads at call time

The wiring modules read the context at call time, inside event handlers.
They do not copy a value from the context into a local variable while wiring
runs. A module wired early can therefore give an event handler that calls a
view that a later module registers, because the lookup happens when the
event fires.

Write `app.views.encounterPanel.update()` inside the handler. If you copy
`app.views.encounterPanel` into a local variable during wiring, the copy is
`undefined`, because the view does not exist yet.

### Mount order

Every registry entry is declared as required, and `main.js` casts the two
empty objects once so the types say so from the start. The cast is true
only after wiring finishes. A module that reads a view or an action while it
mounts therefore comes after the module that registers it, which makes the
call order in `main.js` a dependency order:

| Order | Call | Why it is here |
| --- | --- | --- |
| 1 | `wireCampaignActions` | Registers `markDirty`, which every later module calls |
| 2 | `wireLibrary` | Loads the custom library before any form offers its presets |
| 3 | `wireCombatScreen` | Registers `views.combatScreen`, which the encounter module's refresh paths use while it mounts |
| 4 | `wireEncounters` | Owns the Build-rail foe list that the first map draw rebuilds |
| 5 | `wireStory` | Owns the Build-rail NPC list that the first map draw rebuilds |
| 6 | `wireParty` | Mounts the roster, sheet, inventory, spellbook, and Time panel |
| 7 | `wireMapView` | Draws the first map, and returns the `MapEnv` |
| 8 | `wireGenerateAction` | Takes the `MapEnv` from step 7 |
| 9 | `wireDiceTray` | Mounts the dice tray and registers `rollDice` |
| 10 | `wireHeaderMenu` | Wires the phone Menu button of the header, which reads only the header markup |
| 11 | `wireSessionControls` | Applies the starting role at once, which refreshes four panels and re-points the character sheet |
| 12 | `wirePhoneViews` | Reads the sidebar tabs that step 11 wires, to follow the selected tab |
| 13 | `wireShortcuts` | Adds the global key listener |

### State that stays out of `app.state`

Only campaign data, the data that a save serializes, lives on `app.state`.
UI state for one feature stays private inside the module that owns it:

- the selected tile
- the active brush
- the stroke-undo history
- the selected character
- the dirty flag
- the combatant that the combat screen inspects

### Reads after an await

A handler can read an entity, open a dialog, and wait for the answer. After
the await, the handler reads the entity again by id and applies the edit to
that current entity. The entity can change while the dialog is open: a heal
lands, a condition is added, or another tab adopts a save. An edit applied to
the copy from before the await erases that change. `applyFresh` in
`src/entities/Roster.js` does this for a list. It returns a null entity when
the id is gone, so the handler can show a toast and stop without writing.

## The wiring modules

Each module exports a `wireX(app)` factory. The sections follow the order in
which a new contributor usually meets them.

### campaignActions.js (plus externalSaves.js, historySteps.js, replaceActions.js)

`campaignActions.js` owns the dirty flag (the Save indicator and the
leave-page guard), the Save button, autosave, and the combat flush. It
registers `markDirty`, which every other module calls after a mutation. It
also wires three helper modules, and gives each one only the parts of the
dirty state that it reads:

| Module | Owns |
| --- | --- |
| `externalSaves.js` | Saves that another tab writes |
| `historySteps.js` | Undo and Redo |
| `replaceActions.js` | New, Load example, Export, and Import |

Autosave polls every 5 seconds while the campaign is dirty
(`storage/Autosave.js`). It writes when no edit has happened for 10 seconds,
or when changes have waited 120 seconds during nonstop editing. While a
fight is running, and in a player tab that sends patches, `markDirty` also
schedules a flush 250 ms later. That flush writes one action's burst of
mutations together, so another tab sees each turn without the autosave
delay.

#### Save notices

`src/storage/SaveNotices.js` decides which message the GM sees after a
write. Autosave can repeat a write every 5 seconds, so a full origin shows
the same warning each time unless a rule decides when to stay quiet:

- `saveOutcome` turns a write result into a message and a flag that says
  whether the write landed.
- `historyLoss` and `historyLossMessage` announce a shortened or cleared
  undo history once, not on every write.
- `footprintWarning` waits until the storage footprint grows by ten percent
  before it warns again.

A failed write sets `waitForMutation`, so autosave skips its polls until the
next `markDirty`. An automatic write shows the failure once, until a write
lands. Without these two rules, the same failed write packs, diffs, and
stringifies the whole campaign every 5 seconds and shows a new error each
time.

#### Saves that wait on an image

A save that adds an image writes nothing until the IndexedDB put commits,
and `saveCampaign` returns the put's promise as `pending`. `app/assetWait.js`
runs the same action again when the promise settles:

- The Save button saves again and shows its toast.
- New, Load example, and Import store the campaign and reload.
- An automatic write flushes the latest state.

While a put is pending, `writeOut` skips the autosave and the flush, and the
campaign stays dirty, so the leave-page guard still asks. A page that closes
during the wait keeps its previous save.

#### Shortened loads

`shortenedLoadPrompts.js` contains the prompts for a campaign that loaded
shortened because it passed the decode limits (see "Shortened loads" in
[Persistence](persistence.md)):

- `holdShortenedBoot` runs at boot, from `main.js`, and turns the save hold
  on.
- `confirmShortenedImport` runs in the import handler of
  `replaceActions.js` before it stores such a file.
- `confirmSaveWhileHeld` runs when the GM clicks Save while the hold is on.

`writeOut` checks `savesHeld` and skips the autosave and the flush during
the hold.

#### Cross-tab save adoption

`externalSaves.js` handles a save from another tab.
`SaveManager.onExternalSave` reports the save once its save mark lands in
storage. Then:

- A Play-mode tab with nothing unsaved adopts that campaign in place,
  through `rehydrate.js`, with no page reload.
- A tab in Build mode or Library mode reloads, and so does a tab whose
  adoption fails.
- A tab with unsaved changes gets a prompt to reload.

Until that tab reloads or the GM clicks Save, autosave and the combat flush
do not write. The save mark in storage differs from the one that this tab
last loaded, wrote, or adopted (`Autosave.markMovedOn`). When either mark is
missing, `Autosave.storageMovedOn` compares the whole save string instead.
Without this check, the tab writes its older copy over the other tab's
change.

The tab compares against the string that the history cache keeps
(`HistoryLog.persistedSave` at boot, then `adoptPersisted` and the tab's own
save result). The tab therefore keeps one copy of the save string, about
2 MB at 400 extra regions, and not two.

#### Delta adoption

The adoption tries the recorded delta first. Every save writes its exact
edit as a delta beside the campaign (see the history log in
[Persistence](persistence.md)), and `externalSaves.js` remembers the history
position and save mark of its live state.

When the log walks from that position to the stored one in at most eight
delta records (`ADOPTION_WALK`), `HistoryLog.planAdoption` returns the ops of
each record. The walk can go forward across saves and redos, or back across
undos. The tab applies the ops to its own state with
`HistoryLog.applyHistoryOps` and does not read the whole save again.
`applyOps` copies only along the op paths, so every node and entity outside
the edits keeps its identity, and the adoption costs the size of the edits.

Every other case takes the full load path through
`Campaigns.loadInitialCampaign`: a longer walk, a snapshot record, a cleared
log, or a failed apply. After either path, the tab passes its live state to
`HistoryLog.adoptPersisted`, so its next save diffs against the objects it
keeps. Without that call, the history cache keeps the freshly parsed objects
after a full load, and they share nothing with the reconciled live state.
Over the example campaign plus 200 generated regions, the next save takes
151 ms with the parsed cache and 3.6 ms with the live one.

#### Images that arrive late

An adopted save can name an image that this tab's copy of the image store
does not have, because the other tab committed the image after this tab
read IndexedDB. `showLateImages` reads those keys
(`AssetMirror.fetchAssets`). It resolves them in the live state with
`AssetMirror.withStoredAssets` and re-hydrates, when all of these are true:

- the tab still has nothing unsaved
- the tab is in Play or combat mode
- the tab has seen no newer save

Until then, the image draws as a placeholder, and the live state keeps its
`asset:` key, so a save from this tab still names the stored image. The same
check runs once at boot, because another tab can write a save between this
tab's IndexedDB read and its read of the save.

#### Player tabs

A player tab does not write the save while a GM tab is open. If two tabs
each write the whole campaign and both change it within a few seconds, one
of the changes is lost when a tab reloads onto the other's save.

While the GM lock is live, `playerPatches.js` diffs the player tab's state
against the state that it last sent, saved, or adopted. It writes only those
ops under the tab's own key (`storage/PlayerPatch.js`), through the 250 ms
flush. The GM tab applies each patch to its live campaign through
`rehydrateCampaign` and saves at once. The player tabs then adopt that save
in the usual way.

A patch that arrives while the GM tab is in Build or Library mode waits for
the next switch to Play or combat mode (`mergeQueuedPatches`). With no GM tab
open, a player tab writes the whole campaign, after the same storage check
as a GM tab. If the GM tab saves before it merges a patch, a player tab that
adopts that save by a full load shows its own edit again only after the
merge reaches storage.

### mapWiring.js (plus mapAuthoring.js and mapTravel.js)

`mapWiring.js` mounts the map and keeps its location in step: the canvas,
the breadcrumb, both world trees, the palette, the fog controls, and the
Build-rail tools. It registers the map actions (`focusLocation`,
`centerOnLocation`, `resyncMap`, `onModeChanged`, `onRoleChanged`, and
others) and returns the shared `MapEnv` context. `src/types/mapEnv.ts`
declares that type. Every module around the map takes `MapEnv` as its second
argument.

`mapWiring.js` mounts three helpers at fixed points of its mount order:

- `mapChrome.js` mounts the HTML over the canvas: the mini-map and the zoom
  and fog toolbar. It reports their rectangles to the canvas as occluders,
  and it returns `syncMapOccluders` for the resize handler.
- `mapNarration.js` mounts the screen-reader live regions of the map: the
  map description, the list of points of interest, the exit prompt, and the
  cursor narration. The description names the place by the marker art of
  the tile that opens it on the map above (`placeNoun`), such as "a village"
  or "an inn", and "the world map" at the root. It also defines `createBuildWarning`, the Build-rail
  warning for a node that has no way in or out.
- `mapBuildTools.js` wires the Undo stroke and Export PNG buttons of the
  Build rail, and the Undo stroke button that the header shows in Build mode.
  It also mounts the empty-map card of `ui/BuildEmptyMap.js` over the canvas,
  and it returns `syncEmptyMap`, which `wireMapView` calls after each draw so
  the card shows only while the map in view has no tiles.

The palette brush paints only while the Build rail shows the Paint tab.
`MapEnv.buildTab` names the open tab, and `effectiveBrush` in
`src/view/BuildTool.js` turns any other tab into Inspect. The tool chip
(`src/ui/BuildToolChip.js`) sits at the end of the map toolbar and shows
`toolChipLabel` for the same effective brush.

#### Map resync

`mapResync.js` defines the resync step that these modules share.
`resyncMapViews(app, env, { reframe })` puts the views that show the map back
in step with the grid. It always refreshes the breadcrumb and both world
trees.

- With `reframe`, which a caller passes when it changes the node in view,
  the step also frames the canvas on the current node again, drops the tile
  selection, filters the palette to the node's kind, and places the party
  marker again.
- Without `reframe`, for a change elsewhere that the node in view still
  draws, the canvas only redraws in place, and the GM keeps the pan and
  zoom.

The helper has its own module because `mapWiring.js` imports
`nodeActions.js`, which is one of its callers.

#### Location panels

`locationPanels.js` is the other shared refresh step.
`refreshLocationPanels(app)` updates the four panels that filter their rows
by a map location: encounters, initiative, NPCs, and handouts. The map
resync does not cover them, because it reads the grid and these panels read
the campaign lists. A caller uses this step when it moves a creature,
unplaces one, or changes what a handout is bound to.

#### Gesture layers

The gesture layers live beside `mapWiring.js`, each in its own file:

- `mapAuthoring.js` handles Build mode: paint, erase, and region strokes,
  drop-paint, the tile inspector, and the map-edit undo (`snapshotEdit` and
  `finishEdit` on the `MapEnv`, and `undoStroke` as an action).
- `mapTravel.js` handles Play mode: cell clicks, discovery of
  points of interest, and meetings with NPCs. It keeps its own views in step
  and does not call `resyncMapViews`.
- `mapExitTravel.js` handles the ways out of the node in view: a return to
  the parent node, and a walk across a border into the region beside it.
  `mapTravel.js` builds it and gives it the click helpers they share.
- `mapTeleport.js` handles a Play-mode pick in the World panel. A GM pick
  of another node asks whether to view that map or to teleport the party.
- `mapSightings.js` logs "Sighted" and the name of a sub-map when a move
  reveals a tile that links to it (`Sightings.sightedLinks`).
- `mapHover.js` builds the Play-mode hover tooltip.

`mapTravel.js` also applies these rules to clicks and zooms:

- A click that pulls the party out of another node, such as a GM click on an
  ancestor opened through the breadcrumb, asks first, as a teleport does.
- A click on a tile that walls cut off (`MapPath.hasOpenPath`) asks the GM
  first. A player tab refuses it with a toast.
- A bound character's move does not move the party that the location panels
  filter on.
- A Play-mode zoom into a node leaves the tile selection and the palette
  alone.

### generateAction.js and nodeActions.js

`generateAction.js` runs the Generate dialog and applies its result.
`nodeActions.js` creates, edits, and deletes nodes. Both take `(app, env)`,
as the gesture layers do, and both end with `resyncMapViews`.

#### Regeneration

A generated layout replaces every tile of the node, so the sub-maps that the
replaced tiles led to are removed with them. A multi-level dungeon loses its
deeper levels this way, and the new level 1 gets new ones. The new nodes
come from `GeneratorTree.expandTree`, and the undo record names every one of
them in its created ids.

The decisions are pure functions in `src/map/RegenerateNode.js`:

- `linkedDescendants` names the nodes to remove: every node that a replaced
  tile links to, with its subtree. A child that no tile links to stays,
  because it was already unreachable.
- `regenerateLanding` says where the party goes, including a party that
  stood in a removed level.
- `regenerateTokenMoves` says the same for each token in the node (a split
  character or a placed creature), because the new layout can turn its tile
  into wall or void.
- `regenerateSnapshot` builds the undo record.
- `reshapeParent` gives the parent as the regeneration leaves it, with its
  entrance link and repainted block, and the terrain guide that the new
  map follows (see [Guided terrain](map.md#guided-terrain)).
- `blockSize` gives the size preset that the Size field starts on.

Every other location inside the removed levels is emptied, with the same
answers that the delete path gives. A location left on a node that no longer
exists hides its owner from every panel.

| Owner | What happens |
| --- | --- |
| A split character | Rejoins the party (`CharacterTokens.recallFrom`) |
| A placed creature | Becomes unplaced (`CreatureMap.unplaceFrom`) |
| A handout bound inside a removed level | Becomes campaign-wide (`Handouts.unbindFrom`) |
| A handout bound to a tile of the regenerated node | Binds to the whole node (`Handouts.tileBindingsLost` and `unbindTiles`), because every tile of the node is new |
| A quest link to a removed node | Leaves the quest (`questCleanup.unlinkRemovedNodes`) |

The snapshot keeps the removed quest links with their positions in
`questLinks`, and the undo puts them back with `QuestLinks.restoreLinks`.
A second random number generator, seeded from the same dialog seed, picks
the entrance art and the repaint on the parent. The preview builds the
parent with it too, so one seed gives one result, and the preview draws
the map that follows that parent.

#### The edit snapshot

The stroke-undo ring in `EditHistory.js` keeps one `EditSnapshot` for each
edit. A snapshot records:

- the rewritten nodes, as the edit found them and as it left them
- the ids of created nodes, and the removed nodes
- the party position
- the locations of the characters and creatures that the edit moved
- the nodes and tiles that freed handouts were bound to
- the entry memory

An erase stroke learns which tiles it removed only at the end of the stroke.
`mapAuthoring.js` then adds the tile bindings that the stroke drops to the
stroke's entry (`EditHistory.addHandoutBindings`). `undoStroke` in
`mapAuthoring.js` applies the whole record, then refreshes the location
panels through `app/locationPanels.js`.

Each edit calls `finishEdit` on the `MapEnv` when it is done, which records
the nodes as the edit left them. `EditRevert.revertEdit` then writes back
only the tile fields that differ between the two records. A change that
lands after the edit therefore stays through the undo: a fog reveal, a
discovered point of interest, an inspector note, or an adopted save from
another tab. A restored tile link to a node deleted since the edit is
cleared (`TileGrid.withoutDeadLinks`), and the load path clears the same
dead links (`withRepairedLinks`).

#### Shared node decisions

The decisions that node edits share are pure functions in
`src/map/NodeEdits.js`:

- `freshNodeId` picks an id that the grid does not use.
- `tileWithinBounds` says where the party goes when the node it stands in
  shrinks.
- `relandedTile` says the same for a node that was regenerated under the
  party.
- `entranceArtFor` names the marker that a generated map's entrance gets on
  its parent.

`TilePaint.ensureChildLink`, which `reshapeParent` calls, stamps that
marker when no parent tile links to the node. When a link exists, `refreshChildMarker` changes a marker whose
point-of-interest type differs from the new archetype, or one that shows the
generic marker of another archetype. It leaves stairs and doors alone.

A region block on a world map has no marker. `GeneratorNames.renamedFor`
gives a generated name the pattern of the new archetype, and the region
label on the world map follows it. `RegionRepaint.repaintRegionBlock` then
paints the linked block with the ground mix of the new climate archetype
(`REGION_GROUND`). It keeps water, coast, points of interest, spans, and
overlays. It returns the parent unchanged when `GeneratorWorld.regionFor`
already reads the block as that archetype. The regenerate snapshot records
the parent, so undo restores the old tiles.

`coerceNodeKind`, in `NodeKinds.js`, stops a dialog or a hand-edited save
from writing a node kind that the renderer does not know.

#### Delete and shrink

`src/map/NodeCleanup.js` decides where every location goes when a node is
deleted or shrinks. A party position on a missing node breaks the next load,
so `deleteLanding` names a tile in the remaining parent, beside the block
that the node used. `deleteNode` refuses when no parent remains.

- `locationsAfterDelete` recalls split characters inside the subtree,
  unplaces creatures there, and unbinds handouts from it.
- `locationsAfterShrink` moves the party, split characters, and placed
  creatures inside the new bounds through `tileWithinBounds`. A handout
  bound to a tile outside the new bounds binds to the whole node instead.

`nodeActions.js` reads the live state into these functions and writes the
answers back.

### partyWiring.js

`partyWiring.js` owns the roster, the character sheet, the inventory, the
spellbook, and the Time panel. It registers `refreshSelectedCharacter`,
`getBoundCharacterId`, `getSelectedCharacterId`, and the `partyPanels` view,
which re-reads everything those panels show.

It also mounts the full sheet (`ui/FullSheet.js`). The full sheet borrows the
sheet card of the sidebar and moves it into a view the width of the page.
The **Open full sheet** button of the card, the `onOpenSheet` action of a
roster row menu, and the `openFull` handle that partyWiring passes to the
sheet for its level-up banner all open it. The C shortcut in `shortcuts.js`
clicks the open or the back button. The party switcher of the full sheet
selects a character through the same `selectCharacter` path as a roster row,
and the `partyPanels` view calls `fullSheet.update()` so the switcher
follows the roster.

The character panels do not talk to each other. `characterScope.js` records
which character the panels point at, writes an edited character back into
the roster, and gives the new value to every panel that registered with it.
A panel gets a commit handle from `register`. The scope skips that panel
when it distributes the panel's own edit, because the panel already
re-renders from its commit path. A new character panel needs one
`register` call.

`view/CharacterClaim.js` owns this tab's claim on one character and the
"Playing as" picker. `splitParty.js` owns the GM's split switch and the
regroup that it forces. `partyWiring.js` mounts both, and both call back
into it: the claim to select a character or fall back to spectator, and the
switch to redraw the roster, whose place buttons follow it.

The helper modules below contain the rest of the character flows:

| Module | Owns |
| --- | --- |
| `rosterActions.js` | The roster's GM controls: place one character, edit its HP and AC, grant or award XP, and add or delete a character |
| `characterCreate.js` | The fields of the New character dialog and `buildCharacter`, which turns the submitted values into a level 1 character. Both are free of DOM code |
| `checkRolls.js` | Saving throws and ability checks rolled from the sheet |
| `deathSaves.js` | Death saves rolled from the sheet or the combat screen, and stabilizing by hand |
| `exhaustion.js` | The exhaustion write for a character or a creature, including the death at level 6 |
| `slay.js` | The kill of a character or a creature with no damage roll, for Power Word Kill |
| `passTime.js` | Spending game time on every timed effect, for the Time panel's Advance button, both rests, and a party walk. `passTravelTime` also logs and announces a walk that crosses into a new watch |

`checkRolls.js` and `deathSaves.js` take the bonus from the pure rules in
`entities/Checks.js` and `entities/DeathSaves.js`, but the dice tray throws
the only d20. The rules modules can roll their own d20, and the tray also
rolls to show a roll, so calling the rules module's roll throws two d20s and
shows the wrong one. `app/weaponAttack.js` uses the same split.

Every panel that this module refreshes skips the rebuild when nothing it
shows has changed:

- `ui/CharacterSheet.js` compares a dependency list and points its existing
  nodes at the new values.
- `ui/CharacterRoster.js` runs the same guard that the list panels run
  through `repaintNeeded`.
- The claim compares the option list and the displayed value before it
  replaces the picker's options.

A `partyPanels` update for an adopted save that changed nothing therefore
adds no element to the party rail.

### rehydrate.js

`rehydrate.js` writes a loaded campaign over the running one. It replaces:

- the contents of the grid
- the party position
- the node in view
- the ten campaign fields on `app.state` (`SYNCED_STATE_KEYS`)
- every campaign view, refreshed last

A follower tab's update therefore costs a repaint and not a page load. The
parse takes well under a millisecond with the tile codec (see
[Persistence](persistence.md)).

The adoption has limits:

- It takes a `Campaign` that is already built and does not read storage.
  Migrations, asset restore, tile decode, and entity defaults therefore live
  in one place, `Campaigns.loadInitialCampaign`, which an ordinary page load
  also uses. The delta adoption in `externalSaves.js` also gives it a
  `Campaign`, which `Campaigns.campaignFromLiveState` builds from the state
  that `applyOps` produced. This module cannot tell which path built it.
- It does not adopt `mode` or `role`. Both are view state for one tab, so a
  display pinned to the Player view does not follow the GM tab into Build
  mode.

A new campaign field goes into `SYNCED_STATE_KEYS`. A test compares that
list with the fields of `Campaign` and fails when one is missing.

#### Reconcile

Each adopted field passes through `reconcile` from
`src/storage/Reconcile.js` first. A parse builds a fresh object for every
entity, including the ones that no edit touched, and autosave writes after
every 10 idle seconds whether or not anything moved.

`reconcile` returns the live object wherever the two sides are structurally
equal. An unchanged collection comes back as the identical array. A changed
entity comes back as a new object whose untouched sub-objects are still the
live ones. A panel that compares its rows by identity, as `ui/listPanel.js`
does, can then tell a real edit from a repeated autosave.

`reconcile` pairs a collection by element `id`, so an insertion at the front
does not make every later entity look changed. When both lists have the same
id at every index, as the tile list of a decoded node does, pairing by index
gives the same pairs, and `reconcile` builds no id index. An unchanged
record allocates nothing, because the walk builds its result only from the
first key that differs. At 400 extra regions, reconciling a fresh read of
every node against the live nodes costs about 35 ms.

The world's nodes go through the same `reconcile` call before
`grid.replaceNodes`, because the map caches are keyed on node identity. The
tile layout in `map/TileIndex.js` is keyed on the node, and it keeps the
stamps that `findRegionGroups` in `map/RegionGroups.js` and `spanBlocks` in
`map/TilePaint.js` key on. A node that the save did not change comes back as
the object that those caches already know, so an adoption that moved nothing
leaves them warm.

### encounterWiring.js (plus encounterPanels.js, creatureForm.js, weaponAttack.js, attackFields.js, the four cast modules, combatants.js, combatantWrites.js)

`encounterWiring.js` owns the running fight and the sidebar's Initiative
card, and it is the only module that writes `state.combat`. It mounts
`encounterPanels.js`, which owns the Encounters panel, the Build-rail
encounter list, the Build-mode right-click menu of a tile, and the alert
when the party walks into an encounter (`maybeTriggerEncounter`). The
Encounters panel's Start combat button calls back into `encounterWiring.js`,
which builds the roster with the pure `combat/CombatRoster.js`.

The turn flow is registered on `app.actions` (`advanceCombatTurn`,
`endCombat`, `spendBudget`, `toggleBudget`, `addCombatant`, `removeCombatant`, and
`syncCombatLocation`), so the combat screen drives the same fight through
the same code. The fight itself renders in combat mode, which
[Combat](combat.md) describes. These helper modules support the turn flow:

| Module | Owns |
| --- | --- |
| `turnAdvance.js` | Moving the turn pointer to the next combatant who can act, and running the turn boundaries on the way |
| `turnEffects.js` | The start and the end of one turn: repeated saves, the damage that chips deal on later turns, and the chips that end at a turn boundary |
| `combatEnd.js` | The fight summary, the XP dialog that opens before the fight ends, the confirm for a fight with standing foes and no character to earn XP, and the award after the fight closes |
| `summons.js` | Spawning the creatures of a summoning spell, placing them, and joining them to a running fight |
| `riderSpend.js` | Removing one-roll rider chips, such as Guidance, after the roll that used them |
| `shieldWard.js` | The pause before a hit lands on a defender that can raise its AC with a reaction (Shield), for a weapon swing and for an attack spell |
| `tempHP.js` | The grant of temporary hit points to a combatant by id, with its log line, for a buff cast and for the start of a turn |

#### The creature dialog

`creatureForm.js` contains the shared dialog that creates and edits a
creature: identity, disposition, an optional level and tier, and placement
through `locationFields`. Every flow that authors a creature uses it: this
module's panels, the Story sidebar's lists, and the Build-mode right-click
menu. A caller that creates a creature passes a seed, either a library
template or a small preset such as the level-1 hostile of the "New foe here"
item.

Edits go through the pure `Creature.editCreature`. It keeps live state
(current HP lowered to fit a new maximum, the stat block, and conditions),
and it resets the `met` flag when the creature moves. The bestiary spawn
dialog is `addFromLibrary` in `creatureForm.js`.

#### Attacks and casts

`weaponAttack.js` resolves the 5e attacks that the combat screen's action
bar starts. Casting a spell is the same job, split across five modules:

| Module | Owns |
| --- | --- |
| `spellCast.js` | The two entry points (`castSpellAction` in combat, `castSpellOutOfCombat` outside it) and the cast plan |
| `spellTargets.js` | Which creatures a spell can reach |
| `spellCastFields.js` | The dialog fields |
| `spellCastResolve.js` | Rolling the cast, and the chip that lets the caster repeat it on a later turn |
| `spellOutcomes.js` | Writing the outcome: hit points, condition chips, the chip or save that a hit brings, the pool roll and the kill of a spell that reads HP, the hit points that a draining hit gives back, the damage a chip leaves for later turns, summons, and the log lines |

`CastPlan` in `src/types/cast.ts` passes between them.

`weaponAttack.js` itself owns the dialog prompt, the budget spend, the dice
tray call, the Shield pause, and the writes. `attackFields.js` builds the
dialog's fields with no DOM code. The rules that the swing applies are pure
functions in `src/combat/`, which have the unit tests:

- `AttackTweaks.js` reads the dialog's answers (`readAttackTweaks`), and
  keeps the table of the three swings with `swingKind` and `canSwing`.
- `WeaponSwing.js` works out the attack roll before the d20 rolls
  (`prepareSwing`), words the attack line (`attackLine`), and rolls and words
  the damage of a hit (`hitDamage` and `hitLines`).
- In `AttackResolve.js`, `resolveAttack` decides hit and critical hit, and
  the wording that both the log and the toast quote.
- `AttackResolve.damageParts` assembles the dice that a hit rolls, and
  doubles every count on a critical hit, including the dice added in the
  dialog.
- `AttackResolve.attackerStats` picks between a creature's stat block and a character's
  scores with gear bonuses.

#### Target caps

The spell decides how many creatures a cast can name. `CastScaling.maxTargets`
reads the spell's `targetCount` value. An absent value means one target,
plus one target for each scaling step. A `targetCount` of 0 marks an area
spell with no cap.

The cast dialog shows a single picker when the cap is one at every slot
level that the caster can spend, and a capped checkbox group otherwise. Both
caps start at the lowest slot level that the caster can spend.
`castChangeHandler` moves them with the slot picker, so an upcast Hold
Person can name one more creature for each level. A cast that ends up over
the cap resolves the targets that it can reach and reports the rest as
dropped.

A multi-projectile spell, such as Scorching Ray, gets the allocation grid
instead of checkboxes, because its projectiles split between creatures.
The total has to add up exactly, so a change of slot level restates it
through the form's `setTotal`. See
[Entities](entities.md#multi-projectile-spells) for the model.

Which creatures a cast can reach depends on where it is cast from. In
combat, the list comes from the initiative order. Out of combat, the list is
the undefeated hostile creatures on the party's own tile. The app has no
distance between two tokens, so the shared tile is its closest equivalent
to a range check.

#### Combatant helpers

All of this builds on `combatants.js`, the one place that resolves a
participant id across the two combatant collections (characters and
creatures). It also has the reads that the attack and cast dialogs make of a
target, such as its save bonus, its weapons, and its spells:

- `findCombatant(app, id)` returns `{ entity, kind, store }`. `store` writes
  an update back to the owning collection, with its panel refreshes.
- `combatantsAsTargets` assembles a list of foe or ally targets from the
  running order.
- `commitCreatures(app)` is the refresh that follows a write to
  `state.creatures`.

`combatantWrites.js` has the write paths that change a combatant. Each one
resolves the id through `findCombatant` and stores through its `store`:

- `applyToTarget` is the single write path for damage and healing. It logs
  the defeat and drop-to-0 transitions exactly once each. The pure
  `combat/HitEventLines.js` words the lines for the events of a hit or a
  heal.
- `applyConditionToTarget` is the same for a condition that a spell imposes.
  A failed save against a spell with a `condition` adds that chip to the
  target. The chip has a round counter, read from the spell's duration
  (`SpellTiming.durationInRounds`), and the round tick clears the chip when
  the spell ends. A spell that names a turn boundary writes the chip with
  `expires` and no round count instead. Both kinds of combatant have
  condition chips, so the write branches only to use the store of the
  target's collection. A chip of the same name from another cast that lasts
  longer stays in place (`Conditions.outlasts`).
- `endSpellEffects` removes the chips and summons of a spell when the spell
  ends.
- `retryImposedSaves` rolls the repeated saves that a combatant gets at the
  end of its turn.

Several panels can show the same creature: the Encounters and NPCs lists in
the Play sidebar, and the two authoring lists in the Build rail. Nothing
about a write says which side it came from, so `commitCreatures` refreshes
all of them. After a write, it:

1. prunes quest links to deleted creatures (`pruneCreatureLinks`)
2. marks the danger and blue tiles on the viewed map again, which also
   rebuilds both Build-rail lists scoped to the same node
3. refreshes the Encounters and NPCs panels of the Play sidebar
4. drops the running fight when no creature of it is left near the party's
   tile (`syncCombatLocation`)
5. refreshes the initiative panel, whose wrapped update also refreshes the
   combat screen
6. marks the campaign dirty

The combat screen refresh in step 5 is needed because authoring, moving,
spawning, or defeating a creature near the party's tile can start or end a
fight. A caller passes `{ panel: false }` from an Encounters row handler,
because the list helper already re-renders its own rows once the handler
resolves, and a second update renders them twice. A caller passes
`{ dirty: false }` when it marks the campaign dirty itself.

New combat features route entity lookup, HP changes, and the refresh after
a write through these functions. A copy of the character and creature
cascade in a new module misses a refresh that the helpers already make.

#### Shared field specs

An entity that the GM can author in two places (a campaign creature in a
dialog, a creature template in the Library rail) describes its fields once
as a `ModalField[]`:

| Module | Defines |
| --- | --- |
| `creatureFields.js` | The creature's fields, their live behavior (`creatureFieldsChange`), and `readCreatureFields`. One spec covers foes and townsfolk, because a blank level is the only difference |
| `gearFields.js` | The weapon and armor picker options, and the read-back order of None, preset, and custom values |
| `statFields.js` | The stat-block fields and their range-limited read-back |
| `casterFields.js` | The class, level, and spell pickers, and `refilterSpellsOnChange` |

`promptModal` renders such a spec as a dialog, and `buildSpecForm` in
`ui/SpecForm.js` renders it as an inline rail form. A field, a default, a
range limit, and a cross-field rule are each written once, in the shared
module. A dialog adds the placement fields from `locationFields.js` around
the spec. Their "Pick on map" button calls `pickMapTile` in `mapPick.js`.
The dialog closes through the form handle's `suspend`, and
`armTilePick` takes over the map callbacks for one click. Then the dialog
opens again with its values, and the picked tile goes into the fields. A template form leaves them out, because a template has no
position. `canPickOnMap` leaves the button out of Library mode and the
combat screen, which hide the map. On a phone, `pickMapTile` sets
`body[data-phone-view]` to the Map view for the wait and puts the earlier
view back after it. A second `pickMapTile` cancels the pick that waits, so
one pick waits at a time. Two waiting picks would save the first
pick's callbacks as the usual ones and put them back on the map at the end.

### combatWiring.js

`combatWiring.js` mounts the combat screen (`ui/CombatScreen.js`) and
registers `views.combatScreen`. It owns no combat state. The fight lives in
`state.combat`, which `encounterWiring.js` writes, and
`combat/CombatView.js` derives the view on each render. This module keeps
only two per-tab choices that are never saved: the combatant that the
screen inspects, and the board card picked as the attack target.

`main.js` wires this module before `wireEncounters`, so the view exists when
the fight's refresh paths run. [Combat](combat.md) covers the details,
including how the dice tray moves into the screen and back.

### storyWiring.js

`storyWiring.js` owns the travelogue (it registers `logEvent`), NPCs,
quests, and handouts. The handout part lives in `handoutWiring.js`, which
`wireStory` calls. That module mounts the panel, builds the handout dialog,
and registers `addHandoutAt` for the tile inspector's **New handout on this
tile** button.
It also calls `wireHandoutCue` (`handoutCue.js`), which registers
`cueHandouts`. `maybeTriggerEncounter` calls it after the encounter dialog
closes, and the merge of a Player tab patch calls it too. It toasts each
hidden handout on the party tile, or on a character tile, once per session.

Last, `wireStory` calls `mountStoryCards` (`ui/StoryCards.js`) on the
Story tab. It gives the Quests, NPCs, and Handouts cards a fold button,
and it puts a jump row at the top of the tab. Each jump button shows the
`data-row-count` that the list panel inside its card writes at each
paint. `view/FoldMemory.js` keeps the fold state of each card, and of each
quest group in `ui/QuestPanel.js`, per browser. It reads localStorage
directly and writes through `writeStored`, so the footprint ledger records
each write (see [Persistence](persistence.md)).

#### Handout visibility

The handout panel renders only what `Handouts.handoutsFor` and `revealedFor` return for the
tab:

- A GM tab gets every handout of the party's node.
- A player tab gets the revealed handouts that are campaign-wide, bound to
  the party's node, or bound to the party's tile. Of those, it gets only the
  ones whose `audience` is null or names the character that the tab is bound
  to (`getBoundCharacterId`). `Handouts.revealedFor` adds every other
  revealed handout for that audience, which the panel lists under
  "Revealed earlier".
- A spectator tab has no character, so it never lists a handout with an
  audience.

The body and image of a filtered handout never reach the DOM of that tab.
They are still in the save that every tab of the browser reads, which is
the same limit that the rest of the Player view has. `partyWiring.js`
refreshes the panel when the tab's binding changes.

#### Entity lists

The quest and handout panels get their add, edit, and delete callbacks from
`wireEntityList(app, spec)` in `entityList.js`. A spec says:

- which `state` list the entries live on
- the noun that titles its dialogs
- which fields those dialogs show
- how a submitted record becomes a new or edited entry

The helper does the rest:

- prompting
- rejecting an empty title
- deriving a unique id from the title
- appending or replacing the entry
- marking the campaign dirty
- confirming a delete by name

#### Quest details

The expanded GM row of a quest gets its callbacks from `questDetail.js`.
These callbacks add, edit, check off, reorder, and remove objectives, and
add and remove links. Each edit reads the quest again by id before it
writes, because another tab can change the quest while a dialog is open.

`onToggleObjective` checks an objective off and then can ask up to two
questions. For a GM-only objective of a revealed quest, it offers to reveal
the objective. When every objective is done, it offers to complete the
quest. Completion goes through `askCompletion` and `completeQuest` in
`questCompletion.js`, which the complete button of the row in
`storyWiring.js` also uses. `askCompletion` lists the hidden quests of the
quest's `unlocks` (see `quest/QuestUnlocks.js`) under "Also reveal", or
falls back to a plain confirm. When the quest has a `reward`, the dialog also shows
its gold, XP, and split, prefilled. `completeQuest` sets the status, shows a
toast, and logs a travelogue line through `logEvent`. The line is GM-only
while the quest is hidden from players. `payReward`
(`quest/QuestReward.js`) then pays the living characters through `addGold`
and `addXP`, with `partyAward` from `combat/FightEnd.js` for the split. It then reveals each ticked quest
and logs a line for each. A quest delete calls `pruneUnlocks`
(`questCleanup.js`), so no unlock list names a quest that is gone.

A place link opens through `centerOnLocation`, and a link to a whole map
centers on the middle tile of that map. A creature link opens on the tile of
the creature, and a creature that is on no map has no open action. The
creature list has no selection hook, so a creature link does not select a
row there.

`questCleanup.js` removes links whose targets are gone:

- `commitCreatures` calls `pruneCreatureLinks` after every creature write,
  so every creature delete path removes its links.
- A node delete calls `unlinkRemovedNodes`.
- A node shrink calls `shrinkNodeLinks`, which turns a link to a removed
  tile into a link to the whole node.

The save-level undo restores a deleted node and its links together, because
both changes are in the same save.

A player tab draws each quest from `Quests.playerQuestView`. That copy has
no notes, no links, and no GM-only objectives. The live state on the player
tab keeps the whole quest, because a player patch is a diff against that
state (see `playerPatches.js`). A stripped quest in the state sends the
removal of every hidden objective to the GM tab.

### libraryWiring.js

`libraryWiring.js` owns the four template lists of Library mode (equipment,
creatures, spells, and feats) and the custom-library file controls: export,
import, reset, and the automatic load at startup. The creature list has two
subtabs: Foes for the hostile templates, and People for the rest. An edit
that changes a template's disposition moves it to the other subtab. "Add to
campaign" opens the campaign's creature dialog, seeded from the template.

The custom library is not campaign state, because it belongs to the GM and
not to one campaign. `library/Library.js` has the built-in defaults, the
pure merge logic, and a small registry of the active library in module
state. A custom entry whose name (and, for equipment, type) matches a
default overrides the default in place. Every other custom entry is
appended. Code that uses the presets reads that registry at call time,
because its controls mount far from the wiring that loads the custom
entries. Examples are the item form's pickers, the enemy gear selects, and
"From bestiary".

Inside the wiring:

- Every list's remove flow goes through one `makeRemoveHandler(noun, apply)`,
  which owns the confirm wording for "revert an override" and "delete a
  custom entry".
- The lists keyed by name (creatures, spells, feats) store edits through one
  `makeKeyedStore`. It derives ids, and a rename retires the old key. It
  refuses, with a toast, a rename onto a name that another entry already
  uses. A custom entry keeps its id, so such a rename drops the other
  entry's id from the index.
- The id rules (`storedEntryId`, `renameConflict`, and the `idClaimer` that
  `normalizeLibrary` uses on import) live in `library/LibraryIdentity.js`.
- Every edit and removal writes through `updateCustom(edit)`. It reads the
  stored library first and applies the edit to that copy, so two tabs that
  edit the library do not erase each other's work.
- The row summaries live in `app/librarySummaries.js`.

### sessionControls.js

`sessionControls.js` owns the mode switch, the role switch, the sidebar
tabs, and the sidebar collapse. It registers `setMode`.

The mode switch in the header has three buttons: Play, Build, and Library.
Library mode hides the map column and shows only the template lists. The
fourth mode, combat, has no button. The app enters it through `setMode`
while a fight is running, and a request for combat mode with no fight lands
on Play. Each mode sets a body class (`mode-play`, `mode-build`,
`mode-library`, `mode-combat`), and CSS shows or hides whole regions from
it.

A tab opened with `?role=player`, or locked through the header's lock
control, stays in the Player view. The module hides its role switch and
refuses a switch to GM. This protects a shared table display from a stray
tap.

#### Heartbeat locks

Only one tab can have the GM view, and only one tab can play a given
character. Both locks come from `createHeartbeatLock` in
`storage/GMLock.js`, which builds one tab's side of a lock:

- `claim(key)` takes the key and releases the key that this tab claimed
  before. It refreshes the stored record on an interval, so other tabs can
  see that the holder is alive.
- `release()` frees the key, and so does `pagehide`.
- The `onYield` callback runs when another tab claims the held key. This
  happens when this tab stays frozen long enough for its record to pass the
  time-to-live.

`sessionControls.js` claims the single GM key and yields by switching to the
Player view. `view/CharacterClaim.js` claims a per-character key from
`characterLockKey` and yields by dropping to spectator.

### headerMenu.js

`headerMenu.js` wires the Menu button of the header. The stylesheet shows
the button only at phone width, where the class `app-header--menu-open` on
the header shows the folded actions and view switches. A press on a button
inside the menu runs that action and closes the menu. The closed menu hides
the pressed button, so the module moves focus to the Menu button when focus
was inside the menu. An action that opens a dialog moves focus into the
dialog first, and the dialog keeps it. Escape and a pointer press outside
the header also close the menu.

### phoneViews.js

`phoneViews.js` mounts the bottom bar of Play mode at phone width. It runs
after `sessionControls.js`, because it reads the sidebar tabs. The views
and the tab that each one opens come from the pure `view/PhoneViews.js`.
A press on a view sets `body[data-phone-view]` and clicks the view's tab,
and `styles/play-shell.css` hides the other areas from that attribute. The
bar listens to the tab strip as well, so a tab that opens from code, such
as the Sheet tab after a click on a party row, moves the bar to its view.
A `MutationObserver` on `body[data-phone-view]` marks the view that other
code sets, such as the Map view that `pickMapTile` shows for a pick.

### diceWiring.js

`diceWiring.js` owns the dice tray and the `rollDice` action, which a weapon
attack or a spell uses to put its own roll through the tray. Every roll is
logged to the travelogue. Each entry names the GM, the character that this
tab is bound to, or "A player" when the tab is a spectator.

### shortcuts.js and onboarding.js

`shortcuts.js` owns the global keyboard shortcuts, and `onboarding.js` owns
the first-run overlay.

The table of which key means what is in `src/view/Shortcuts.js`, so a test
can check it without a keyboard. `shortcuts.js` keeps the listener, the
test for whether the user is typing in a field (which needs real DOM
elements), and the click or call that each action becomes. Save, Undo, and
Redo click the header buttons, so a shortcut and a click run the same code.
Ctrl/Cmd+Z is the one entry that reads app state: in Build mode it undoes
the last stroke, and in every other mode it undoes the last save.

`onboarding.js` shows the overlay over a blank campaign until the GM picks
one of its three ways forward or dismisses it. After that, the overlay does
not open by itself again in this browser, and the header **Welcome** button
opens it at any time. Its **Generate a world** choice calls
`app.actions.generateWorld`, which `generateAction.js` registers. That
action goes to the root node and opens the Generate dialog on the world
archetype, and it resolves to null on Cancel or to `{ partyStart }`.
`onboardingNext.js` then shows the second card, "Your world is ready". The
card says whether the party moved to a start beside a town, and it offers
Create a character and Check the party start.
