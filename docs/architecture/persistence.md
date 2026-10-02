---
---
# Persistence

*Explanation. Back to the [architecture overview](../architecture.md).*

A campaign lives in the browser's localStorage, which gives an origin about
5 MB. That limit sets most of the design in `src/storage/`. Saves are packed
tightly, and the undo history stores small deltas instead of full snapshots.

Image payloads live apart from the campaign, in IndexedDB. A large picture
then cannot fill the localStorage quota, and a failed image write cannot take
down the whole map.

## The save pipeline

```
  live state (TileGrid, characters, creatures, ...)
      |
      |  buildState            flatten to CampaignState; stamp schema version
      v
  plain CampaignState object
      |
      |  packTile              drop tile fields equal to their defaults
      |  packEntity            drop entity fields withDefaults would restore
      |  tabulateGear          repeated weapons, armor, items -> gear table
      |  hoistAssets           inline data: URLs -> asset:<key> + assets table
      |  encodeNodeTiles       tile codec: palette + run-length streams
      |  tabulateStrings       palette strings -> one strings table
      v
  packed state ---- JSON.stringify ----> one string
      |                                        |
      |  browser storage path                  |  export path
      v                                        v
  detachAssets: payloads to                downloadCampaignFile: one
  IndexedDB, campaign string to            self-contained JSON file,
  its localStorage key, one history        with the custom library
  delta appended                           attached as a `library` field
                                           (storage/CampaignFile.js)
```

`deserialize` reads a string back in this order:

1. `JSON.parse`, then `restoreGear` and `restoreStrings`, which put the gear
   table and the string table back inline.
2. The schema migrations (`Migrations.js`).
3. The tile decoder (`decodeNodeList`), which also reuses unchanged live
   nodes.
4. `restoreAssets`, which inlines the image payloads again.
5. `withNodeDefaults` on each node, then `withRepairedParents` and
   `withRepairedLinks`.
6. Field coercion, one function per top-level field, with the entity
   `withDefaults` functions for the entity lists.

The top-level type is `CampaignState` (`src/types/storage.ts`). It has a flat
`nodes` array, which is the flattened node map of the `TileGrid`. It also has
`party`, `characters`, `creatures`, and the other collections.

`storage/SaveManager.js` owns `buildState`, `serialize`, `deserialize`, and
`toTileGrid`, and all four are pure. `toTileGrid` rebuilds a working
hierarchy by adding each node of the state as it is, because a `MapNode`
already has its own `parentId`. The grid contains the parsed node objects
themselves.

`toTileGrid` runs no defaulting of its own, because `deserialize` has already
defaulted every node. A second pass would re-map and re-freeze every tile of
the world on each load.

`buildState` takes one source object (`CampaignSource`), which is a
`TileGrid` plus any campaign field the caller has. Every field except the
grid is optional, and each optional field falls back to the empty value that
a save without that field reads as. To add a top-level field, name it in
`buildState` and in `CampaignState`, and no caller needs a change to keep
persisting it.

The two live callers pass a whole object. The save and export path spreads
`app.state` with the grid and the party position added. The campaign-replace
path passes the `Campaign` as it stands.

Thin wrappers surround these pure functions: `trySaveToLocalStorage`,
`loadFromLocalStorage`, `downloadState`, and `readStateFromFile`. These
wrappers and the image store (`AssetMirror.js` over `IndexedDbAssets.js`)
are the only code that touches `localStorage`, `indexedDB`, `Blob`, and
`FileReader`.

The save wrapper reports its result instead of throwing an error. A quota
failure then reaches the GM, and it cannot look like a successful save.

### The footprint ledger

The save wrapper also reports the localStorage footprint of the whole
origin, because the save, the history deltas, and the library share one
quota. Images count toward it only on the localStorage fallback (see
[The image store](#the-image-store)).

`storage/Footprint.js` keeps a ledger from each key to its stored length, so
the footprint check does not read every stored value after each save. Every
localStorage write in the app goes through `writeStored` and `removeStored`,
which record the write in the ledger. The theme switch, the onboarding
overlay, and the fold memory of the Story tab use them too, although they
live outside `src/storage/`. `view/FoldMemory.js` takes the writer as a
parameter, so its unit test can pass a stub.

`HistoryLog.trimToCap` reads delta sizes from the same ledger. Writes from
other tabs arrive as `storage` events, and `onExternalSave` passes each one to
the ledger. The ledger reads the origin again when the key count differs from
its own size.

A direct `setItem` that writes a new length to an existing key does not
change the key count, so the ledger cannot detect it. A test in
`tests/Footprint.test.js` scans `src/` for this reason. It fails when a file
outside `src/storage/` calls `setItem` or `removeItem` on any handle, or calls
`localStorage.clear`. A line that names `sessionStorage` does not count,
because sessionStorage has its own quota. `view/ReloadView.js` is also exempt,
because it receives sessionStorage as a parameter.

### Campaign files

The export and import buttons use `storage/CampaignFile.js`, not
`downloadState` and `readStateFromFile`. `serializeCampaignFile` writes the
packed state with the GM's custom library attached as a `library` field. When
the custom library is empty, it omits the field, and the file equals the
plain serialized save.

`readCampaignFromFile` splits the campaign and the library apart again. Only
this module adds the library to the byte stream. `buildState`, the
localStorage save, the history log, and the tab-sync deltas never include it,
so a bundled library adds nothing to their storage costs.

## Load-time validation

`deserialize` sets any missing top-level field to an empty value instead of
throwing an error, so an older or smaller save still loads. It is also the
only validation step that a save passes through. It coerces every field whose
*structure* the load path trusts.

Collections become lists of records. The party position, a running combat,
the game clock, the travelogue, the quest log, and the bestiary get their
required members with the right types. These coercers live in
`storage/RecordCoercion.js`, one function per collection.

Import persists what it reads and then reloads. A malformed field that passes
through `deserialize` therefore becomes the stored save, and the app then
fails at each start. A travelogue entry whose timestamp is not a number is
one example, because the panel formats every entry during startup and an
unreadable date throws there.

A travelogue entry can carry `gm: true` and a `player` line (see
[GM-only lines](combat.md#gm-only-lines)). The coercer keeps any truthy `gm`
flag as `true`, so a hand-edited flag such as `"yes"` still hides the line
from a Player tab. It keeps a `player` line only on a GM-only entry. The
flag goes into the undo deltas and the player patches like any other field of
an entry, because both diff the travelogue by entry id. A player tab never
sends back a GM-only line that it adopted from the GM's save, because a patch
holds only the entries that the player tab added.

A quest from a save with no `objectives` or `links` field loads with empty
lists. The quest coercer gives each objective a unique id, because the panel
keys every objective edit by id. It drops a link that names no node or no
creature.

`withNodeDefaults` (`map/TileGrid.js`) does the same job for nodes and their
tiles, and it drops any tile that it cannot read. `withRepairedParents` then
clears a `parentId` that names the node itself or a node not in the save. It
also breaks each parent loop by turning one node of the loop into a root.

Every walk up the hierarchy, such as the breadcrumb, loops forever on a
cycle, and a cycle in a save would freeze the tab at startup.
`withRepairedLinks` clears each tile link to a node that is not in the save.

The character and creature `withDefaults` functions use
`entities/LoadCoercion.js` for their list fields (resources, inventory,
conditions) and for the spellbook. A scalar in one of those fields then reads
as empty. The mods of each loaded chip go through `ChipMods.normalizeChipMods`,
so a stored `ac: "5"` adds 5 to the AC instead of joining the string onto it.
`LoadCoercion.coerceHPBuffs` keeps `hpBoost` only as a whole number above 0
and `bonusHPFrom` only as a string that is not empty.

`loadInitialCampaign` throws on a save with no map nodes, and the import
refuses such a file before it stores anything. Any JSON record parses as a
campaign, so a file such as `{"hello":"world"}` reaches this check. A party
position that names a missing node moves to tile 0,0 of the first root node
(`Campaigns.partyOnGrid`).

A bundled `library` field has its own gate. `deserialize` rebuilds the state
field by field, so the library never enters `CampaignState` and never reaches
localStorage through the import's persist. `extractBundledLibrary` in
`CampaignFile.js` reads the field through `normalizeLibrary`, the same
tolerant parse that a standalone library file passes through.
`extractBundledLibrary` reads an absent, malformed, or empty field as null, so
a broken library cannot fail the campaign import.

As a backstop, `main.js` starts through `Campaigns.loadInitialCampaignSafe`,
which also builds the map navigator and the party tracker. When a save still
cannot be read, or either object refuses its map, the function returns a
blank campaign plus a notice. The stored save and the history log stay as
they are, so Undo can still step back to the save before the broken one.

### Shortened loads

`decodeNodeList` (`TileCodec.js`) loads at most `MAX_NODES` (10,000) nodes
and `MAX_TOTAL_CELLS` (2,000,000) tiles. The limit exists because a run of
`[index, count]` costs a few characters in the file but one tile object in
memory per cell. The decoder drops the nodes past the node limit, loads a
node that does not fit in the remaining cells with no tiles, and returns both
counts.

`deserialize` notes a nonzero report in a `WeakMap` keyed on the state that
it returns, and `loadTruncation(state)` in `storage/ShortenedLoad.js` reads
it. The report stays off the state, because `StateDiff` diffs every top-level
field.

A shortened state is a copy of the save with parts missing, and the next save
stores it over the full campaign. For this reason, the import handler asks
the GM before it stores a file that loads shortened (`confirmShortenedImport`
in `app/shortenedLoadPrompts.js`).

At boot, `loadInitialCampaignSafe` returns the report as `truncated`. Then
`main.js` calls `holdShortenedBoot`, which turns on the save hold and asks the
GM. While the hold is on, `writeOut` in `campaignActions.js` skips the
autosave and the flush, and the Save button asks first.

The hold ends when the GM keeps the shortened map or saves it from the Save
button. The hold does not stop New, Load example, Import, or Undo, because
each of those stores a campaign that the GM chose.

## Tile defaults

The format on disk differs from the format in memory. `serialize` packs every
tile, and it omits each field that equals its default value: `overlayRef:
null`, `revealed: false`, `childNodeId: null`, `span: 1`, any default
`metadata` member, and the empty `metadata` object itself.

Default tile fields make up 63% of the example campaign's node data in the
per-cell form. Almost every tile of a painted map is plain unrevealed terrain
with no point of interest. Written per cell, the 20,065 tiles of the example
take 4,092,064 characters with every field and 1,506,124 characters with the
default fields omitted.

The inverse function is `withTileDefaults` (`map/TileGrid.js`). It fills
exactly those fields from absence, and every load runs it, so no code states
a default twice. `deserialize` runs `withNodeDefaults` itself on load, so the
unpack does not depend on `toTileGrid`.

`withTileDefaults` builds each tile with its fields in the order of
`createTile`, then any field it does not know, then `span`. A decoded record
lists its fields in whatever order the file gives, and V8 gives each field
order its own hidden class.

When the field order follows the record, the example campaign loads with 11
tile hidden classes. A scan over those tiles takes about three times as long
as a scan over tiles of one order. With the fixed order, loaded tiles have the
same 2 hidden classes as tiles built in memory.

Packing drops no field that the packer does not know about, and a packed tile
never reaches live state:

- `packTile` copies every field of the tile except the default-valued ones.
  It does not pick named fields into a new object. A `Tile` field added later
  therefore stays in a save, even when the packer does not know about it.
- The copy skips fields as it builds, and it never deletes one. A `delete`
  moves a V8 object to a hash-table property store. A packed tile in that
  store costs about 236 bytes, where a plain object with the same two fields
  costs about 20.
- Packed tiles exist only inside the serialized string. The renderer reads
  `tile.metadata` without a guard, so a packed tile in live state throws on
  its first draw.
- An explicit `span: 1` comes back absent, and the `Tile` type defines absence
  as the same value.

## Entity defaults

The entity collections pack the same way, one level up, through
`storage/EntityPack.js`. `packEntity(entity, withDefaults)` does not read a
table of default values. It omits a field only after it *proves* that the
entity's own `withDefaults` restores that exact value.

The proof is a trial. `packEntity` copies the entity without the field, runs
`withDefaults`, and keeps the omission only when the result matches the
loaded form of the original exactly. The same trial runs for fields inside
nested records, such as the lists in a character's `proficiencies`.

An empty `expertise` list is omitted, because the load path fills the gap
with the same empty list. A nested record whose fields are all defaults is
omitted whole.

A static table of defaults does not work for entities, because a default can
depend on the entity itself. `Character.withDefaults` derives the hit dice
pool and the spell slots from the character's own class list, so the value
that an omitted field restores to differs per character. A table has one
value per field, so it either never omits such a field or omits it against a
value that the load restores wrong.

`SaveManager`'s one `ENTITY_DEFAULTS` table names three pairs: `characters`,
`creatures`, and `handouts`. Packing and loading both read this table, so the
two directions use the same `withDefaults` function for each collection.
`quests` and `bestiary` are absent, because neither has a `withDefaults`
function to pack against, and both have zero default-valued bytes on the
example campaign.

`deserialize` runs the entity `withDefaults` functions itself, instead of
leaving them to `Campaigns.loadInitialCampaign`. A stored character can have
no `spellbook` key. `undoHistory` and `readStateFromFile` hand their results
to callers that apply no defaults of their own.

The omission works per field, on a flat structure. Recursion into a nested
record would need to know whether the record fills member by member (`stats`)
or as a whole (`equipment`), and the `withDefaults` contract does not state
this.

Each collection packs through one `createEntityPacker`, which caches the
packed form on the entity's identity. Entities are immutable values, so an
entity that no edit touched since the last save packs to the cached object.
With no cache, the trial loop runs for every creature on every autosave, and
that loop dominates the save cost of a campaign with hundreds of creatures.

On the example campaign, this layer removes about 6,100 characters. The
creature list drops 19%, the handouts 11%, and the characters 8%. The saving
grows with the size of the roster, not the size of the map, so it is small
next to the tile packing on the example and larger on a campaign with
hundreds of creatures.

### The gear table

A creature spawned from a template copies the template's weapon and armor,
and a character copies each library item that it has. Twenty goblins then
store the same Shortsword twenty times.

`tabulateGear` in `storage/GearTable.js` runs on the packed entities. It
moves every piece used two or more times into a `gear` list at the top of the
save, and the record keeps a reference such as `{"@": 0}` in its place. The
sites are `weapon` and `armor` on `creatures` and `bestiary`, and each entry
of a character's `inventory`. A piece used once stays inline, because a
reference plus a table entry costs more than the piece.

An inventory item has two fields that belong to the one copy a character
has: `quantity` and `notes`. The table entry keeps those keys with a null
value, and the reference keeps their values, as in `{"@": 2, "quantity": 5,
"notes": ""}`. `restoreGear` spreads a copy of the entry and then the
reference, so the restored item has its keys in the stored order. With any
other order, a load followed by a save gives a different string for the same
state.

`restoreGear` is the first step of `deserialize`, ahead of the migrations, so
no migration step and no coercion sees a reference. Each save builds the
table again from the state, in the order that the walk first meets each
piece. The table exists only in the stored string.

The undo log diffs parsed state, so a history op keeps gear inline. A save
with no `gear` field loads with no restore step.

The walk caches each piece's dedup key on the piece object. The entity pack
cache hands the same packed piece to every save until the entity changes, so
a save with 1,200 creatures spends about 1 ms on the table.

On the example campaign, the table saves about 3,600 characters. A goblin
spawned from the bestiary costs 281 characters, where it costs 484 with its
gear inline. The four example characters carry mostly different items, so
their inventories shrink by only about 340 characters.

## The asset table

A GM-supplied image arrives as an inline `data:` URL, so the whole image is
base64 text inside the field that references it. In that form, one imported
tile painted across a 30x30 region costs its whole payload once per cell.
That is 18.5 MB of save for a 20 KB image.

`hoistAssets` in `storage/Assets.js` replaces every inline `data:` URL with an
`asset:<key>` reference into an `assets` table. The key is a hash of the
payload's content. `restoreAssets` inlines the payloads again inside
`deserialize`. The 18.5 MB example becomes 58 KB, because the save stores the
payload once and references it 900 times.

`restoreAssets` also checks every ref through `storage/ImageRefs.js`. The app
loads three kinds of ref: an inline image payload, an `asset:` key, or a
relative path on this origin with no `..` segment. The load blanks any other
ref, such as a protocol-relative URL to another host, and the renderer draws
its placeholder for that tile. `TileRaster.imageSrcForRef` and the handout
panel repeat the check before they give a ref to an image element.

One traversal in `Assets.js` lists the fields that contain payloads: a tile's
`imageRef` and `overlayRef` (single or stacked), and a handout's `image`. A
new payload field needs one line in that traversal.

The table follows these rules:

- Every serialize builds the table again from the refs that are present. The
  table therefore prunes itself, and a campaign with no images gets no
  `assets` field at all.
- The save path hoists only the nodes that contain an inline payload
  (`nodeHoldsPayload`). A node with no payload goes straight to the tile
  codec, and its encoded form is cached on the live node (see
  [The tile codec](#the-tile-codec)).
- The undo log hoists the whole live state (`historyForm`). A `WeakSet`
  remembers each node that a hoist found free of payloads. Nodes are
  immutable, so a later save skips the tiles of an unchanged node instead of
  walking them again.
- A module-level map keeps the hash of each payload that the last hoist met,
  so a save hashes only a payload that is new since the previous save. Each
  hoist starts a new map, so a payload that leaves the campaign leaves the map
  too. With eight photos of 250,000 characters, a save that finds every hash
  in the map costs about 1.6 ms, where hashing every payload again costs
  about 5.5 ms.
- Keys resolve a collision by comparing the stored payload and probing a
  suffix. A hash collision gives a longer key, and never the wrong image.
- A reference that the table cannot resolve stays as written. The `asset:`
  prefix is one character from the built-in tile root (`assets/tiles/...`),
  so blanking such a ref can destroy a valid path. When the ref stays, the
  worst case is the placeholder that the renderer draws for any ref that does
  not load.
- Like a packed tile, the table exists only on disk. `deserialize` builds its
  return value field by field, so live state never contains one.
- The undo log names images by the same keys. `HistoryCodec.historyForm`
  hoists both states of a step before the diff. A step that attaches a
  245,000-character photo then records an 86-character delta, and a step that
  deletes the handout records 527 characters.
- Undo, redo, and a follower tab apply such a step through
  `HistoryLog.applyHistoryOps`. That function resolves the keys with
  `restoreAssets` and the stored table, as a load does.

### The image store

In browser storage, the assets table does not go inside the save.
`trySaveToLocalStorage` splits the table off the packed state with
`detachAssets`. It writes the payloads to IndexedDB through
`storage/AssetMirror.js`, writes the campaign string to its localStorage key,
and reports the two results separately as `ok` and `assetsOk`.

Images are the only stored data that the app does not limit. One compressed
handout is about 59,000 characters, which is 118 KB of the 5 MB that
localStorage gives an origin. About twenty handouts or custom tiles then fill
half of localStorage, while IndexedDB gets a share of the disk.

The campaign string, the undo log, and the save mark stay in localStorage.
Cross-tab sync runs on the `storage` event, and IndexedDB has no such event.

The split also lets structure and images fail independently. A failed image
write costs the GM a handout picture instead of the whole map, and a history
snapshot never includes a picture that it did not change.

`AssetMirror.js` talks to an `AssetBackend` (`src/types/storage.ts`), which
is an asynchronous key-value store with `getAll`, `getMany`, `putMany`, and
`deleteMany`. The browser uses `storage/IndexedDbAssets.js`, a thin layer
over one object store. The unit tests use the `Map` store of
`storage/AssetBackend.js`, so no test needs a fake IndexedDB.

#### The in-memory copy

`AssetMirror.js` keeps a copy of every payload that the backend has
committed. `main.js` fills the copy with one `getAll()` call
(`openAssetMirror`) before the campaign loads. After that, every reader stays
synchronous: `deserialize`, the undo log, and the retention scan read
`storedAssetTable()`.

A key enters the copy only after its put commits. With 20 handout images,
the boot waits about 4 ms for the copy in Chromium.

A tab that adopts another tab's save can find a key that its copy does not
have. This happens when the other tab committed the payload after this tab
read IndexedDB. `missingAssetKeys` names such keys from the save string, and
`fetchAssets` reads them into the copy. The [wiring guide](app-wiring.md)
describes how the tab then shows the images.

#### Write order

A save whose payloads are all in the copy writes the campaign at once. A save
that adds a payload writes nothing and returns `pending`, which is the
promise of the put (`stageAssets`). The caller saves again when the promise
settles, and that save finds the payload committed.

A follower tab adopts a save on its `storage` event and looks up every key
that the save names. A campaign string written before its payload commits
would show that follower a missing picture.

When a put fails, the next save writes the campaign without the payload, with
`assetsOk` false. The save after that tries the put again.

An unload cannot wait for a promise, so a page that closes while a put is
pending keeps its previous save. The campaign stays dirty in that time, and
the leave-page guard asks the GM first. A put of one 59,000-character payload
commits in about 0.5 ms in Chromium.

The first stored image also asks the browser to keep the origin's storage
under disk pressure (`navigator.storage.persist()`). Firefox shows a
permission prompt for this request, so the request waits for a GM action and
never runs at boot. A refusal changes nothing else.

#### The localStorage fallback

IndexedDB can be missing or fail to open within three seconds, for example
in an older Firefox private window or with a blocked or corrupted database.
The payloads then stay in localStorage under their own key
(`campaign-builder:assets`), and `storage/AssetStore.js` manages them.

On this path, the payload write is synchronous. It runs before the campaign
write, so a follower that wakes on the campaign key finds the payloads
already stored.

When the campaign write fails on a full origin and `makeRoom` frees space, a
failed payload write runs again first, so the freed space goes to the images.
The unit tests that install no backend run this path.

The storage notices in `SaveNotices.js` follow the path in use. With
IndexedDB, the localStorage footprint contains no image, so the Save tooltip
says "not counting images". Neither the near-quota warning nor the
failed-save notice then tells the GM to remove images. On the fallback path,
both notices do, because removing an image there frees localStorage space.

#### Moving the localStorage table

The first boot with IndexedDB moves the table under `campaign-builder:assets`
into IndexedDB (`openAssetMirror`). It puts every payload that IndexedDB does
not contain yet, and it removes the localStorage key only after that put
commits.

Two tabs can boot at once, so each tab reads the localStorage key before it
reads IndexedDB. A tab that finds no key then reads IndexedDB after the other
tab's put. A tab that finds the key puts the same payloads again, which
changes nothing.

A tab removes the key only when the key still contains the string that the
tab read. A put that fails keeps the key, and the tab stays on the
localStorage fallback.

#### Reading the stored table

Only the path to IndexedDB splits the table out. `downloadState` still
serializes the whole save, so an exported campaign is one self-contained
document. Import needs no special handling, because the persist-then-reload
path gives the inline payloads straight back to the same writer.

The optional second argument to `deserialize` is the read half. It supplies
payloads that the string does not contain, and a table inside the string
takes priority over it. Its callers are the readers of a stored string:
`loadFromLocalStorage`, and the cache that `HistoryLog` keeps of the last
persisted state.

#### Retention

Retention covers every stored string, not only the current save. A payload is
deleted exactly when the last state that references it becomes unreachable.
The references come from matching `asset:` keys against the raw text
(`referencedAssetKeys`, in `Assets.js`, beside the key alphabet it matches),
not from a walk of parsed state.

The scan reads raw text because of the tile codec (see
[The tile codec](#the-tile-codec)). After encoding, a tile's reference is
inside an encoded node's palette, where a state walk cannot see it without
decoding first.

`pruneMirror` removes a payload from the copy at once and from IndexedDB in
the background. A delete that fails leaves a payload that nothing
references, and the first scan after the next boot removes it. A later put of
the same key runs after the delete, because IndexedDB runs the transactions
of one connection in order.

A delta record that names a key lands after the scan of its own save. For
that save, `saveCampaign` passes `keepPrevious`, the same as for a snapshot
record, and the save skips the scan. The next save scans and finds the
record.

A payload whose last record drops out of the log stays in the table until a
later scan runs. A scan runs once the references of a save change or a key
that the last scan saw is gone.

The scan does not run at all when there is nothing to keep, which is true of
every campaign that has never had an image. It also does not run when it
cannot change anything. Both stores remember the keys that the last scanned
save referenced and the names of every stored key at that time.

A reference goes away only when the save stops naming a key or a stored
string disappears. The next save therefore scans only in one of three cases:
its references differ, a stored key is gone (the history log dropped a
record), or the table changed since the scan. A new key, such as the history
delta that every save adds, does not start a scan. With no such checks, one
picture in the campaign makes every autosave read every other stored string.

On the localStorage fallback, a tab reads the table string only when it can
differ from the one that the tab wrote. `storeAssets` and `persistAssets`
compare two values. The first is the length that the `Footprint.js` ledger
records for the key against the length this tab wrote. The second is
`Footprint.externalWriteSerial`, which tells them whether a `storage` event
from another tab has touched the key since.

When both match, the functions use the remembered string, because a
`getItem` of a table with eight photos copies about 2 million characters. A
write from another tab whose event has not arrived yet can get past this
check. For this reason, `storeAssets` merges new payloads into a table that
it reads fresh, and a scan that `persistAssets` runs reads the table fresh
too. After a scan, the table is written only when the kept table differs from
the stored one.

Each tab's copy knows only the keys that it read or wrote. A tab never
deletes a key that it has not seen, so a payload that another tab has just
committed stays until a tab that knows it finds it unreferenced.

A copy can still name a key that another tab deleted. Such a key had no
reference in any stored string, including the undo log. This case needs the
same image to leave the whole undo history and come back in the other tab
within one session.

## The tile codec

The three layers above cannot reduce the largest cost. A packed tile is
little more than `{"id":"12,34","imageRef":"assets/tiles/grass/grass-1.svg"}`,
and neither field is a default value, so no omission rule can drop either
one.

The node list is the only part of a save that grows without limit. Authoring
adds tiles, and fog reveals only increase and are never taken back.

`storage/TileCodec.js` encodes a node's tiles by position instead:

```
  per-cell form                        encoded form
  --------------                       ------------
  [                                    refs:  distinct (imageRef, overlayRef)
    {"id":"0,0","imageRef":"grass"},          pairs, the node's art palette
    {"id":"1,0","imageRef":"grass"},   cells: row-major run-length stream of
    {"id":"2,0","imageRef":"road",            indices into refs; a tile's id
     "revealed":true},                        is implicit in its position
    ...                                fog:   revealed as its own run-length
  ]                                           stream (alternating run lengths)
                                       links: distinct childNodeId values, and
                                              linkCells, a run-length stream
                                              of indices into links
                                       tiles: only the leftovers, keyed by id
```

The encoder lists each distinct piece of art once. It then describes the map
as runs of "the next N cells use art number K". A 40x40 field painted with one
grass variant becomes one palette entry and one run, which is 129 characters
in place of 93,601 in the per-cell form.

`fog` is a separate stream because `revealed` is the one field that play
changes. A reveal is a disc, and run lengths compress a disc almost
perfectly. When the party explores that whole field, the encoded form grows
by 15 characters, where the per-cell form grows by 25,600.

`links` and `linkCells` store the region links the same way. The generators
link every tile of a region's block to that region, so one link repeats over
hundreds of tiles in a few rows of runs. A save with links in the leftover
records still reads, because the decoder uses the link stream only when a node
has `links`.

### Palette refs

The palette writes each ref in a short form (`storage/TileRefs.js`). Each
built-in palette id equals the base name of its file, so the palette stores
`snow-3` for `assets/tiles/snow/snow-3.svg`. The decoder reads the id back
through the built-in catalog.

A ref with a `/` or a `:` is never a palette id. An `asset:` key, a `data:`
payload, and a path outside the catalog therefore pass through unchanged in
both directions, as does every path in a save that stores full paths. A bare
live ref that reads as a palette id gets a `=` prefix, so a hand-edited ref
`grass-1` does not come back as a path.

A variant family has a shorter form still. A family is a terrain type with
variants, such as `grass`, or an interior floor family, such as
`interior-floor`. `TileCatalog.variantIdAt` picks a variant from a hash of the
cell position, and the generators and the random-variant brush paint that
pick.

The codec writes a cell whose variant is the pick as the family name alone,
and the decoder expands it with the same hash. A field of mixed grass
variants then stores as one palette entry and one run, and a 40x40 field
painted with the random grass brush costs 127 characters. A variant that the
GM paints on purpose, and that differs from the pick, keeps its palette id.

A cell whose variant equals the pick can store either form. The encoder takes
the palette id when the cell before it stored that id, so a field of one
fixed variant also stays one run. A new variant in a family changes the pick,
so the stored cells of that family read back with different art.

The decoder turns each palette entry into a reader (`artReader` in
`TileRefs.js`) before it walks the cells. A reader of a fixed entry keeps one
live art object, and a reader of a family keeps one per variant. A 48x48
grass field then allocates a few art objects, not 2,304. Every reader has the
same fields, so the cell loop branches on them and makes no function call
through a closure per cell.

On the example campaign, the encoded node list is 130,825 characters, where
the same nodes in the per-cell form cost 1,506,124.

### Codec rules

The codec never loses data, because it refuses any node that it cannot
represent and writes out of line whatever it does not represent:

- **Opt-in per node.** A node qualifies only when its dimensions are usable
  and every tile id is a canonical in-bounds `"x,y"` with no duplicate
  position. Otherwise, `encodeNodeTiles` returns the *same object*, so a
  hierarchy fixture or a hand-edited id falls back to the per-cell form.
  Nodes that are sparse but still gridded, as interiors often are, encode
  through a reserved `-1` index that means "no tile here". The example's
  `barrow` node has 99 tiles in a 14x14 grid.
- **Leftovers by removal.** The leftover list is built by removing the fields
  that the codec represents itself, the same rule that `packTile` follows. A
  `Tile` field added later therefore stays in the leftover record. A
  `childNodeId` that is not a string stays there too.
- **Row-major palettes.** Each palette is built by row-major traversal, not
  by `tiles` array order. The cross-tab write check (`storageMovedOn`)
  compares raw save strings, and a palette in array order can make an
  unchanged campaign serialize to a different string, which then reads as
  another tab's save.
- **Tolerant decoding.** Decoding degrades instead of throwing an error. An
  unreadable palette entry skips its cell, and an unreadable run ends the
  stream. Import persists what it reads before it reloads, so an error thrown
  here produces a save that cannot start.
- **Order of stages.** For a node with an inline payload, the codec runs
  after the asset hoist in `packState` and before the asset restore in
  `deserialize`. A node with no payload skips the hoist. The hoist walks
  `node.tiles[].imageRef`, which an encoded node does not have. With the codec
  after the hoist, the palette already contains `asset:` refs, so `Assets.js`
  needs no knowledge of the encoding. Decoding before `withNodeDefaults` also
  leaves a decoded tile packed, so the codec does not define any default
  value.

### The encoded-node cache

`EncodedNodes.js` caches the encoded form of each node with no payload on the
live node, in a `WeakMap`. A node that no edit touched then costs one lookup
per save.

The cache keeps only the encoded node, a few hundred bytes. The packed tiles
between the live node and its encoded form become garbage once the encode
returns. A cache that kept them would keep one packed record per tile for the
whole session, about 44 MB at 400 extra regions.

`packState` fills the cache, and `encodeHistoryNode` reads it. `deserialize`
fills it too. Each decoded node keeps the record that it was decoded from,
when that record names no image payload and no `asset:` key and the asset
walk left its refs unchanged. The first save after a load then writes those
records with no pack and no encode.

### Node reuse

`deserialize` takes the node list of a state that the tab already has. A
stored record that equals the cached form of the live node with the same id
comes back as that live node (`EncodedNodes.nodeReuser`). The reused node
needs no decode, no asset walk, and no defaults pass.

The record names every `childNodeId` of the node in its link palette, so the
dead-link repair checks that palette instead of the tiles.
`HistoryLog.loadPersistedCampaign` passes the nodes of its cached state,
which is the live state after `adoptPersisted`. A follower's full read then
decodes only the nodes that changed.

At 400 extra regions, the full read and reconcile of a save with one changed
node cost about 13 ms with the live nodes and 107 ms without them. The entity
lists still decode in full, which is about 5 ms of that read.

### Encoded form in the rest of the app

The codec is the one place where the reader branches on whether a field is
present, instead of filling the field from absence. The app therefore reads
both forms. `StateDiff` works on parsed state and never sees `cells` or
`fog`.

The undo log stores whole nodes in the encoded form (see
[Undo and redo](#undo-and-redo)), through `encodeNodeTiles` and
`decodeNodeTiles` only. The codec therefore stays local to one node.

### The string table

The node palettes of one campaign repeat the same refs. The example campaign
has 3,390 palette strings, but only 119 distinct ones.

`tabulateStrings` (`storage/StringTable.js`) runs last in `packState`. It
lists each distinct palette string once, in a top-level `strings` array, and
writes the string's index into every palette in its place:

```
  "strings": ["grass", "road-h", "asset:k1"],
  "nodes": [{ "id": "world", "refs": [0, [0, [1, 2]]], "cells": [...] }]
```

On the example campaign, the palettes cost 12,187 characters and the table
1,739, where palettes of strings cost 53,584. The whole example save is
142,162 characters.

`restoreStrings` runs first in `deserialize`, beside the gear restore. It
puts the strings back and removes the table, so the migrations, the tile
decoder, and the asset restore all read palettes of strings.

Only the save string has the table. The output of `encodeNodeTiles` still
names its strings, because the undo log stores encoded nodes and decodes each
one alone, with no save around it. Code that needs one encoded node calls
`encodeNodeTiles`, never `packState(...).nodes`.

The table lists strings in the order of first use: the nodes in list order,
then each palette in order. The same state therefore gives the same table,
and an unchanged campaign saves to the same string, which the undo log and
`storageMovedOn` compare.

A new node joins the end of the node list, so its new refs join the end of
the table. A new ref that a paint adds to an earlier node shifts the indices
after it. The palettes of later nodes then change in the save string, but the
parsed state stays the same, and the undo log diffs parsed state.

Each tabulated node is cached on its encoded node, together with the indices
that it used. An unchanged node whose indices stay the same then tabulates to
the same object on the next save.

Reading depends on presence. A save with no `strings` array loads as it is,
and a number in a palette is an index only when the table is present. An
index that names no string stays a number, and the decoder skips it as an
unreadable entry. `referencedAssetKeys` scans the raw save text, so an
`asset:` key in the table still keeps its payload.

## Schema versions and migrations

A save has a schema `version`. `buildState` stamps this version, and
`deserialize` reads it. The step transforms live in `storage/Migrations.js`.
`MIGRATIONS[n]` turns a version-n save into a version-n+1 save, and a save
with no `version` field reads as version 0.

The migration chain runs on the raw parsed object *before* the coercion in
`deserialize`, so a step can repair data that coercion would flatten or drop.
The chain also runs before the asset restore, so a step sees hoisted refs. A
step that needs a payload looks it up in the table itself.

The gear restore and the string restore run before the chain. A step
therefore sees each weapon, armor, and item inline, and each palette as a
list of strings. A save stamped newer than the app runs no migration steps,
and the app reads it on a best-effort basis.

A version bump with no payload change registers an identity step instead of
leaving a gap. A unit test can then assert that the table covers every step,
and a transform filed under the wrong key fails that test.

A change to the *meaning* of a stored field needs a step in that table. A new
field alone does not, because the `withDefaults` functions already fill its
absence.

No step names `library`. The field that a campaign export bundles belongs to
`normalizeLibrary`, and it passes through the chain unchanged. A test runs a
version-1 save with a library through the whole chain and asserts that the
field is unchanged.

## Undo and redo

Undo and redo work from a log of invertible deltas against the persisted
save, in `storage/HistoryLog.js`. A delta records only what one save changed,
not the whole campaign.

`saveCampaign` is the one save path. It writes the campaign, then appends one
delta. The `diffState` function of `storage/StateDiff.js` produces that delta
from the previous and new parsed states.

An op records both its old value and its new value, so `invertOps` performs a
swap. Undo and redo are the same walk, in opposite directions:

```
   deltas:   d1      d2      d3      d4
                          ^
                        cursor
   undo:  apply inverse of d3, cursor moves left
   redo:  apply d4 as written, cursor moves right
   new edit at cursor: d4 is deleted (the redo tail)
```

### Snapshot records

A step that replaces the whole campaign can store a snapshot record in place
of a delta. New, Load example, and Import diff to ops that contain both the
old world and the new world, unpacked. `saveCampaign` compares the length of
those ops as JSON with the stored save string that they replace. When the
save string is shorter, `saveCampaign` stores `snapshot:` followed by that
string.

The length comes from `jsonLengthWithin` in `StateDiff.js`, which stops as
soon as the count passes the save's length. A replacing step therefore never
builds the string of its ops. Over the example campaign plus 200 generated
regions, that string is about 21 million characters. New saves in 11.5 ms,
where a full `JSON.stringify` of the ops takes 41.6 ms.

Undo across a snapshot writes the snapshot as the campaign. It then stores
the current save string in a new record at the same position, so redo swaps
the two back.

The save that records a snapshot passes `keepPrevious` to
`trySaveToLocalStorage`. The image table then keeps every picture of the
replaced campaign until the snapshot record references it.

### Compact ops

`diffState` works on parsed state. An inserted node therefore arrives as
every tile with every default filled in, and a regenerated node arrives as one
op per changed tile field. `HistoryCodec.compactOps` rewrites the ops of each
node into the smallest of three forms:

- The plain ops.
- One `node` op whose `f` and `t` are whole nodes in the save's own form
  (`SaveManager.encodeHistoryNode`: packed tiles, then the tile codec). An
  inserted or removed node always takes this form.
- One `fog` op, used when every op of the node flips a tile's `revealed`
  flag. Its `t` lists the tile ids that the step reveals, and its `f` lists
  the ids that it hides.

`invertOps` swaps both compact kinds like any other op. `expandOps` turns them
back into plain ops before `applyOps` runs. Sizes in characters, measured on
the example campaign:

| Step | Plain ops | Compact record |
| --- | --- | --- |
| Add a generated 48x48 region | 97,098 | 3,566 |
| Regenerate that region | 77,127 | 6,819 |
| Ten party moves on it | 4,209 | 495 |

A delta record is stored as `delta:` followed by the JSON op list. An app
version that does not know the compact ops reads that prefix as an unreadable
record and takes its full load path. Read as a plain list, a `node` op would
insert an encoded node into its live state, and its next save would write
that node with most of its tiles gone. A bare JSON list still reads as plain
ops.

`applyOps` copies each container on an op's path once per call. It keeps an
id-to-position map for each keyed list, and it drops the removals from a list
in one pass at the end of the removal phase. The plain ops of a regenerated
node (about 2,700, of which 1,820 remove a tile) apply in 1.1 ms. With a copy
of the node list and tile list per op, they take 6.5 ms.

### The byte cap

Delta records share `HISTORY_BYTE_CAP` (512 KiB), and `trimToCap` drops the
oldest records until the deltas fit. A record larger than the whole cap stays
as the only step, because `trimToCap` always keeps the newest record.

Snapshot records do not count against the cap. One snapshot of the example
campaign is about 280 KB, more than half of the cap, and a campaign with a few
more generated regions passes the whole cap. If such a snapshot counted
against the cap, it would remove every older step when it lands, and the next
save would remove the snapshot itself.

`storage/HistoryBudget.js` gives snapshots a budget of their own, as pure
arithmetic over record sizes. The newest snapshot is outside that budget,
because its write already succeeded. An older snapshot stays only while it
fits in the quota estimate (`QUOTA_BYTES`, 5 MiB) less the delta cap, every
key outside the log, and the newest snapshot.

Records always drop from the oldest end, because undo cannot reach a record
past a gap. The index lists the snapshot records in `snapshots`, so the budget
reads each record's size from the footprint ledger and never reads a record.
An index with no such list counts every record as a delta.

New, Load example, and Import call `replaceIsUndoable` before their confirm.
It estimates whether the snapshot of the current save fits beside the new
save, the images that the new campaign adds, and the other keys. When the
snapshot does not fit, the confirm says that Undo may not restore the current
campaign and suggests an export (`SaveNotices.replacePrompt`).

The estimate uses the same 5 MiB model as the footprint warning. A browser
that allows more can still store a snapshot that the estimate calls too large,
so the text says "may".

### Header controls

Both header controls step the cursor and then reload the page. Every module
then starts again from the restored state through the ordinary load path.
Each control is disabled when `historyDepth` reports no step in its
direction.

Before the reload, the step compares the live campaign with the restored
one through `storage/StepSummary.js`, and the queued toast names each part
that differs. The step also writes the mode, the selected character, the
open tab of each static tab strip, and whether the full sheet is open to
sessionStorage through `view/ReloadView.js`. The next start reads that
record once, so a plain reload later opens on the default view. Combat mode
is not written, because a reload that finds a running fight opens the
combat screen by itself.

### Storage layout

The log uses one key for each record. An index at `campaign-builder:history`
contains `{ version, log, deltas, cursor, snapshots, baseMark }`, and each
record has its own `campaign-builder:history:d<seq>` key. A step is therefore
one small `setItem` call, instead of a rewrite of the whole log.

Measured on the example campaign, fifty party steps cost 27,304 bytes of log,
where a ring of ten full snapshots costs 699,980 bytes for ten steps. A save
writes 70,488 bytes, where the ring writes 139,996.

### Cross-tab adoption

The log also serves cross-tab adoption. A tab calls `historyPosition()` to
get a token for the log position that its live state matches. The tab
records this token and the save mark each time its live state matches the
persisted save.

When another tab saves, the follower calls `planAdoption(held, heldMark)`,
which walks the log from the held position to the cursor. A walk forward
returns the ops of each record on the way, for saves and redos. A walk back
returns each record's ops inverted, for undos. The follower applies the lists
one at a time, because `applyOps` groups the ops of one list by kind.

`planAdoption` returns one of three kinds:

| Kind | When | What the follower does |
| --- | --- | --- |
| `current` | Nothing moved | Nothing |
| `delta` | The walk is `ADOPTION_WALK` (8) records or fewer, all readable deltas | Applies each list of `steps` in order |
| `full` | The walk is longer, or it meets a snapshot or an unreadable record | Takes the ordinary load path |

A tab that loaded its save before the log began has no position. A save that
starts a new log stores the save mark of the save that it diffed against as
`baseMark`, and a follower whose held mark equals it walks from position 0.
The mark applies only while the first record is still sequence number 0, so
a trim or a snapshot swap at the front retires it.

The saving tab reads the mark a second time before its write. When another
tab's save changed the mark after the cached save string was read, the new log
stores no `baseMark`, because the mark no longer names that string.

The follower calls `planAdoption` on the `storage` event of the save mark
(`campaign-builder:save-mark`), not of the campaign key. Every save, undo, and
redo writes the mark last. The browser delivers one event per write in write
order. At the campaign key's event, the follower still reads the old index,
so a plan made there applies the previous delta and shows each change one save
late.

When a mark write fails, `SaveFollower.js` adopts on a one-second fallback
timer.

The `log` field of the index is a random id, and a fresh log draws a new id
when its first delta lands. Sequence numbers restart at zero after
`clearHistoryLog`. A position token pairs the id with the number, so a token
from a cleared log matches nothing in the new log.

### No base snapshot

The log has no base snapshot, because undo and redo only apply a delta to the
*current* state, and the canonical save is already that state. The cap drops
the oldest deltas. Folding them into a base instead would need a synchronous
rewrite of the base on every cap hit. A design that replays a base plus the
log at load, in place of a canonical save, would need a base again.

### Log rules

The log follows these rules so that it cannot corrupt the campaign that it
describes:

1. **No delta is migrated.** Each delta was written against one schema
   version of `CampaignState`, so the index records `version`. The app
   discards a log stamped with any other version whole.
2. **Every history write happens after the campaign write**, on both the save
   path and the cursor-stepping path. The index therefore never describes a
   state that was not stored.
3. **A full origin degrades depth first.** A record write that fails drops
   the redo tail first, which the new step discards anyway, then the oldest
   step, and it tries again after each. It drops the whole log if that also
   fails, and it reports `{ ok, evictedAll }` either way. The report tells the
   GM when undo drops to a single step. Reaching the ordinary byte cap is
   normal operation and reports no loss.
4. **A campaign write can free history space.** When the campaign write
   fails, `saveCampaign` passes `makeRoom` to `trySaveToLocalStorage`, which
   calls `dropForSave` and writes again. `dropForSave` removes the redo tail
   first, because the save drops it anyway. It then removes the oldest step,
   one per call, and last any history key that the index does not name. A
   campaign write therefore fails only when no history is left to remove.
   After a write that still fails, autosave in `app/campaignActions.js` waits
   for the next change instead of trying again on every poll, and it shows the
   error once until a write lands.

### The cached base state

A diff needs the previous state as a *value*, not a string. `HistoryLog`
caches this value, stamped with the raw string that it was parsed from and
the save mark stored with it. A tab that declined the cross-tab reload prompt
cannot diff against a save that another tab replaced. A save from another tab
writes a new mark, and a new string fails the compare.

In the steady state, the cache reads only the mark. While the stored mark
equals the cached one, the stored save is the cached string, so
`loadPersistedCampaign` skips the `getItem` of the whole save and the string
compare.

`app/externalSaves.js` checks for another tab's write the same way
(`Autosave.markMovedOn`). A steady-state autosave therefore reads the save
string zero times, where a string compare reads it twice. A missing mark
tells neither side anything, and both fall back to the string compare.

Every write of the campaign key first removes the mark. Between the campaign
write and the new mark, the old mark therefore cannot name a save that is
gone. `writeSaveMark` also removes the mark when its own write fails, and a
follower ignores the removal event.

The cache is warm from the start of a session.
`Campaigns.loadInitialCampaign` reads the save through
`HistoryLog.loadPersistedCampaign`, which parses the stored string once and
keeps the result as the base for the first delta. `toTileGrid` adds those
parsed nodes to the grid as they are, so the live nodes and the cached nodes
are the same objects, and the first save of the session diffs by identity.

A first save that parses the stored string a second time and diffs two
unrelated object trees costs more than 100 ms at 200 nodes. A tab that adopts
another tab's save calls `adoptPersisted` with its live state for the same
reason. The full load path leaves the cache on parsed objects that the
reconciled live state does not share.

## The custom library store

The GM's custom library (equipment, creature, spell, and feat overrides)
persists separately, in `storage/LibraryStore.js`, under its own localStorage
key (`campaign-builder:library`). New, Import, and Load example therefore
never change it.

The browser copy is the working state. `downloadLibrary` and
`readLibraryFromFile` write this state to a portable JSON file and read it
back. At startup, `fetchLibraryFile` fills an empty browser library from
`library/campaign-library.json`.

The repository commits that file with an empty library, so the startup fetch
never asks for a missing file. A GM's export overwrites the file, and Git
ignores everything else under `library/`.

`normalizeLibrary` (in `library/Library.js`) makes every load tolerant, and
it drops invalid entries instead of throwing an error. The library file has
no version field. A file that has separate `bestiary` and `npcs` lists loads
with both read into the one `creatures` list.

A campaign export also includes the custom library, as a `library` field
beside the save (see [The save pipeline](#the-save-pipeline)). On import,
`libraryImportAction` in `CampaignFile.js` decides what happens to the
browser's custom library:

| File `library` field | Browser library | Behavior |
| --- | --- | --- |
| Absent, empty, or malformed | Anything | Unchanged, no prompt |
| Present | Empty | Adopted with no prompt |
| Present | Not empty | The GM confirms. Replace adopts the file's library, and a decline keeps the browser library. The campaign imports either way. |

An adopted library writes to the library key before the import's reload, so
the library wiring reads it through its normal read at mount time. When that
write fails on the quota, the app imports the campaign alone and shows a
toast.

The standalone library export stays. It moves a library without a campaign,
and it writes the file that fills the library of a fresh clone.

### Changing the spell or feat schema

Library data has no version anywhere it is stored: the browser's library key,
the exported `campaign-library.json`, and the `library` field bundled into a
campaign export. All three pass through `normalizeLibrary` on read, and none
pass through `Migrations.js`. A schema change is therefore a coercion change,
never a migration step:

1. Update the type in `src/types/spell.ts` (or `feat.ts`). Make a new field
   optional or give it a stated default.
2. Change `normalizeSpell` (or `normalizeFeat`) in `library/Library.js` so
   that it accepts the new format, coerces the old format into it, and keeps
   any original free text that it cannot interpret. A throw here fails the
   load of the whole library, and a dropped entry deletes a record that the
   GM wrote.
3. Update the editor form (`ui/SpellForm.js` or `ui/FeatForm.js`) to read and
   write the new field. The form builds its draft through the same
   normalizer, so a typed entry and an imported one cannot disagree.
4. If characters keep copies of the record, give `Character.withDefaults` the
   same default. Those copies are part of the campaign save, so `deserialize`
   covers them, not the library gate.
5. Add `Library.test.js` cases. Check that the new format passes through
   unchanged, that the old format coerces, and that garbage in the field
   coerces to the default.
6. Do not add a `Migrations.js` step, and do not increase `CURRENT_VERSION`
   for a change to the library only. `state.library` never appears in a
   migration step, because the campaign chain does not own that field.

## File IO

The file paths of both stores go through `storage/fileIO.js`. Its
`downloadJSON` and `readFileText` functions are the only two places where the
app touches `Blob`, object URLs, or `FileReader`. New export and import
features call these functions instead of building the browser code again. A
planned Tauri desktop build can then replace this one file with native
dialogs and the Tauri file system plugin.
