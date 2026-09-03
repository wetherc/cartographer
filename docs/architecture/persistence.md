# Persistence

*Explanation. Back to the [architecture overview](../architecture.md).*

A campaign lives in the browser's localStorage. This storage limit is near 5 MB
for each origin. This one limit drove almost every decision in `src/storage/`.
Saves are packed tightly. The undo history stores small deltas instead of full
snapshots. Image payloads stay in their own section, so one large picture
cannot take down the whole map.

This page follows the save path from live state to a stored string. It then
covers loading, schema migrations, undo and redo, and the separate store for
the custom library. A broken rule here can destroy a GM's campaign without
warning. For this reason, each rule states why it holds, not only what it
does.

## The save pipeline at a glance

```
  live state (TileGrid, characters, creatures, ...)
      |
      |  buildState            flatten to CampaignState; stamp schema version
      v
  plain CampaignState object
      |
      |  packTile              drop tile fields equal to their defaults
      |  packEntity            drop entity fields withDefaults would restore
      |  hoistAssets           inline data: URLs -> asset:<key> + assets table
      |  encodeNodeTiles       tile codec: palette + run-length streams
      v
  packed state ---- JSON.stringify ----> one string
      |                                        |
      |  localStorage path                     |  export path
      v                                        v
  detachAssets: payloads to their          downloadCampaignFile: one
  own key, campaign string to its          self-contained JSON file,
  own key, one history delta appended      with the custom library
                                           attached as a `library` field
                                           (storage/CampaignFile.js)
```

Loading runs the same stages in reverse, with two extra steps at the front:
schema migrations, then field coercion.

The top-level type is `CampaignState` (`src/types/storage.ts`). It holds a
flat `nodes` array (the flattened node map of the `TileGrid`), plus `party`,
`characters`, `creatures`, and the other collections. `storage/SaveManager.js`
owns `buildState`, `serialize`, `deserialize`, and `toTileGrid`, and all four
are pure. `toTileGrid` rebuilds a working hierarchy by adding each node of
the state as it is, because a `MapNode` already carries its own `parentId`.
It runs no defaulting of its own. `deserialize` has already defaulted every
node, and a second pass would re-map and re-freeze every tile of the world
on each load. The grid therefore holds the parsed node objects themselves.

`buildState` takes one source object (`CampaignSource`: a `TileGrid` plus any
campaign field the caller holds) instead of a positional list. Every field
except the grid is optional. Each optional field falls back to the same empty
value that an older save reads as. As a result, adding a top-level field means
naming it in `buildState` and in `CampaignState`. No caller needs an update to
keep persisting it.

The two live callers pass a whole object. The save and export path spreads
`app.state` with the grid and party position added. The campaign-replace path
passes the `Campaign` as it stands.

Thin wrappers surround these pure functions: `trySaveToLocalStorage`,
`loadFromLocalStorage`, `downloadState`, and `readStateFromFile`. These
wrappers are the only code that touches the real browser APIs: `localStorage`,
`Blob`, and `FileReader`. The save wrapper reports its result instead of
throwing an error. A quota failure must reach the GM and must not appear as
a successful save.

The export and import buttons go through `storage/CampaignFile.js` instead
of `downloadState` and `readStateFromFile`. `serializeCampaignFile` writes
the packed state with the GM's custom library attached as a `library`
field, and omits the field when the customs are empty, so such a file
equals the plain serialized save. `readCampaignFromFile` splits the two
apart again. The library joins the byte stream in this one module and
nowhere else: `buildState`, the localStorage save, the history log, and
the tab-sync deltas never carry it, so bundling adds nothing to the
storage costs those paths account for.

## Load-time validation

`deserialize` sets any missing top-level field to an empty value instead of
throwing an error, so an older or smaller save still loads. It is also
the only validation step a save passes through. It coerces every field whose
*structure* the load path trusts. Collections become lists of records. The
party position, a running combat, the travelogue, the quest log, and the
bestiary get their required members with the right types. Those coercers
live in `storage/RecordCoercion.js`, one function per collection. The reason
is that Import persists what it reads and then reloads. As a result, a
malformed field that survives `deserialize` becomes the stored save of an app
that no longer starts. A travelogue entry whose timestamp is not a number is
one example: the panel formats every entry during startup, and an unreadable
date throws there.

`withNodeDefaults` (`map/TileGrid.js`) does the same job for nodes and their
tiles. It drops any tile it cannot read.

A bundled `library` field has its own gate. `deserialize` rebuilds the
state field by field, so the field can never enter `CampaignState` or reach
localStorage through the import's persist. `extractBundledLibrary` in
`CampaignFile.js` lifts it through `normalizeLibrary`, the same tolerant
parse a standalone library file passes, and reads anything absent,
malformed, or empty as null. A broken library therefore cannot fail the
campaign import around it.

As a backstop, `main.js` starts through `Campaigns.loadInitialCampaignSafe`. A
save that still cannot be read produces a blank campaign plus a notice. This
leaves the stored save and the history log untouched, so Undo can still step
back to the save before the broken one.

## Packing layer 1: tile defaults

The on-disk format differs from the in-memory format. `serialize` packs every
tile. It omits each field that equals its default value: `overlayRef: null`,
`revealed: false`, `childNodeId: null`, `span: 1`, any default `metadata`
member, and the empty `metadata` object itself.

This packing matters because default tile fields made up 62% of the example
campaign's characters. Almost every tile of a painted map is plain unrevealed
terrain with no point of interest. The undo history of a day multiplied
whatever a save cost by ten. This layer alone took the example campaign from
358,413 to 134,907 characters.

The inverse function is `withTileDefaults` (`map/TileGrid.js`). It fills
exactly those fields from absence, and every load already runs it, so no code
states a default twice. `deserialize` runs `withNodeDefaults` itself on load,
instead of leaving the unpack to `toTileGrid`.

Packing must not drop a field that the packer does not know about. A packed
tile must never reach live state.

- `packTile` deletes keys from a *copy* of the tile, instead of picking named
  fields into a new object. As a result, a `Tile` member added later survives
  a save, even when the packer does not know about it.
- Packed tiles exist only inside the serialized string. The renderer reads
  `tile.metadata` without a guard, so a packed tile must never reach live
  state. An explicit `span: 1` comes back absent, and the `Tile` type defines
  absence as the same value.

## Packing layer 2: entity defaults

The entity collections pack the same way, one level up, through
`storage/EntityPack.js`, but with a difference. `packEntity(entity,
withDefaults)` does not read a table of default values. It omits a field only
after it *proves* that the entity's own `withDefaults` restores that exact
value. It deletes the field from a copy, runs `withDefaults`, and keeps the
omission only when the result matches the loaded form of the original exactly.
The same trial runs for fields inside nested records, such as the lists in a
character's `proficiencies`. An empty `expertise` list goes because the load
path fills the hole with the same empty list, and a record whose fields are
all defaults goes whole.

A static table of defaults does not work, because for entities the default
value can depend on the entity itself. `Character.withDefaults` derives the
hit dice pool and the spell slots from the character's own class list, so the
value that an omitted field restores to differs per character. A table of
per-type defaults holds one value per field. It either never omits such a
field, or omits it against a value that the load puts back wrong. Validating
each omission against the real unpacker is what stops packing and loading
from disagreeing with each other.

`SaveManager`'s one `ENTITY_DEFAULTS` table names three pairs: `characters`,
`creatures`, and `handouts`. Both directions read this table, so the
two halves cannot drift apart. `quests` and `bestiary` are absent because
neither has a `withDefaults` function to pack against, and both measured at
zero default-valued bytes.

This is also why `deserialize` runs the entity `withDefaults` functions
itself, instead of leaving them to `Campaigns.loadInitialCampaign`. A stored
character is allowed to carry no `spellbook` key. `undoHistory` and
`readStateFromFile` hand their results to callers that apply no defaults of
their own.

The omission works per field, on a flat structure. This is a limit, not an
oversight. Recursion into a nested record needs to know whether the record
fills member-wise (`stats`) or as a whole (`equipment`). The `withDefaults`
contract does not state this.

Each collection packs through one `createEntityPacker`, which caches the
packed form on the entity's identity. Entities are immutable values, so an
entity that no edit touched since the last save packs to the cached object.
Without the cache, the trial loop ran for every creature on every autosave,
and it dominated the save cost of a campaign with hundreds of creatures.

Measured on the example campaign, this layer moved the save from 133,948
characters to 129,715, with the encounter collection alone dropping 49%. The
win scales with the size of the roster, not the size of the map. It is small
next to the tile packing, and it grows with a campaign that has hundreds of
mobs.

## Packing layer 3: image payloads become a table

GM-supplied images arrive as inline `data:` URLs. This means that the whole
image is base64 text sitting inside the field that references it. Stored this
way, one imported tile painted across a 30x30 region costs its whole payload
once per cell: 18.5 MB of save for a 20 KB image.

`storage/Assets.js` corrects this. `hoistAssets` replaces every inline
`data:` URL with an `asset:<key>` reference into an `assets` table, keyed by
a hash of the payload's content. `restoreAssets` inlines the payloads again
inside `deserialize`. The 18.5 MB example becomes 58 KB, because the payload
is now stored once and referenced 900 times.

`restoreAssets` also runs every ref through `storage/ImageRefs.js`. The
app loads an inline image payload, an `asset:` key, or a relative path on
this origin with no `..` segment. Any other ref, such as a protocol-relative
URL to another host, is blanked at load, and the renderer draws its placeholder for that
tile. `TileRaster.imageSrcForRef` and the handout panel repeat the check
before they hand a ref to an image element.

The fields that contain payloads (a tile's `imageRef` and `overlayRef`,
single or stacked, and a handout's `image`) are listed in one traversal
there. As a result, adding a third site takes a single line.

The design of the table closes a failure mode at each step:

- The table is rebuilt from the refs that are present on every serialize. As
  a result, it prunes itself, and an image-free campaign gets no `assets`
  field at all.
- A node that one hoist found free of payloads is remembered in a `WeakSet`.
  Nodes are immutable, and the save path packs a node once per identity, so
  a later save skips the tiles of an unchanged node instead of walking them
  again.
- Keys resolve a collision by comparing the stored payload and probing a
  suffix. A hash collision costs a longer key, and never the wrong image.
- A reference that the table cannot resolve stays as written, instead of
  being blanked. The `asset:` prefix is one character from the built-in tile
  root (`assets/tiles/...`). The worst case of leaving it is the placeholder
  that the renderer already draws for a ref that will not load.
- Like a packed tile, the table exists only on disk. `deserialize` builds its
  return value field by field, so live state never holds one.
- The deduplication works within one save, and this is all it needs to do.
  History is a log of deltas over parsed state. As a result, a step that
  inserts a handout carries its payload inline once. A step that only
  retitles one carries no image at all.

### The localStorage split

In localStorage, the assets table does not travel inside the save at all.
`storage/AssetStore.js` keeps it under its own key
(`campaign-builder:assets`). `trySaveToLocalStorage` splits the table off the
packed state with `detachAssets`. It writes the payloads first, then writes
the campaign, and reports the two results separately as `ok` and `assetsOk`.

This split lets structure and blobs fail independently. A full origin costs
the GM a handout picture instead of the whole map. A history snapshot never
carries a picture that it did not change.

The write order (payloads first) keeps the failure survivable. A campaign
that references a payload missing from the sidecar
renders the placeholder that the renderer already draws. The reverse order
can instead persist structure that references nothing. The write order also
settles the cross-tab case, because `isExternalSaveEvent` fires on the
campaign key, and by then the payloads are already stored.

Only the localStorage path splits the table out. `downloadState` still
serializes the whole save, so an exported campaign is one self-contained
document. Import needs no special handling, because the persist-then-reload
path hands the inline payloads straight back to the same writer.

The optional second argument to `deserialize` is the read half. It supplies
payloads that the string does not carry, and a table inside the string takes
priority over it. Its only two callers are the two readers of a stored
string: `loadFromLocalStorage` and the cache that `HistoryLog` keeps of the
last persisted state.

Retention spans every stored string, not only the current save. A payload is
deleted exactly when the last state that references it becomes unreachable.
These references are collected by matching `asset:` keys against the raw
text (`referencedAssetKeys`, in `Assets.js`, beside the key alphabet it must
match), instead of by walking parsed state.

The reason is the tile codec, described below. After encoding, a tile's
reference lives inside an encoded node's palette. A state walk cannot see it
without decoding first. The scan is skipped completely when there is nothing
to keep, which is true of every campaign that has never held an image.

## Packing layer 4: the tile codec

The three layers above cannot reduce the largest cost. A packed tile is
little more than `{"id":"12,34","imageRef":"assets/tiles/grass/grass-1.svg"}`,
and neither field is a default value, so no omission rule can drop either
one. The node list is the only part of a save that grows without limit.
Authoring adds tiles, and fog reveals only increase and are never reclaimed.

`storage/TileCodec.js` encodes a node's tiles positionally instead:

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
                                       tiles: only the leftovers, keyed by id
```

The encoder lists each distinct piece of art once. It then describes the map
as runs of "the next N cells use art number K". A painted field of 200 grass
tiles becomes one palette entry and one run, instead of 200 repeated strings.

`fog` is separate because `revealed` is the one field that play changes. A
reveal is a disc, and run-lengths compress a disc almost perfectly.

Measured on the example campaign, the save went from 129,111 characters to
34,963, and the node list went from 115,430 to 21,282. A dense 40x40 region
went from 93,880 to 3,621. Exploring that region fully costs 15 more
characters in this form. The per-cell form adds 25,600 characters for the
same exploration.

The codec never loses data. It refuses any node that it cannot represent,
and it carries whatever it does not represent out of line:

- **The codec is opt-in for each node.** A node qualifies only when its
  dimensions are usable and every tile id is a canonical in-bounds `"x,y"`
  with no duplicate position. Otherwise, `encodeNodeTiles` returns the *same
  object*. A hierarchy fixture or a hand-edited id then falls back to the
  per-cell form, instead of being forced into the grid. Nodes that are sparse
  but still gridded (interiors often are this way, and `barrow` is 94 tiles
  in a 14x14) encode through a reserved `-1` index that means "no tile here".
- **The leftover list is built by deleting the four fields that the codec
  represents itself**, exactly as `packTile` does. As a result, a `Tile`
  member added later rides out of line, instead of being dropped.

Smaller design choices in the codec still decide whether a save loads:

- The palette is built by row-major traversal, instead of by `tiles` array
  order, because `isExternalSaveEvent` compares raw strings. Re-serializing
  an unchanged campaign must produce the same string.
- Decoding degrades instead of throwing an error. An unreadable palette
  entry skips its cell, and an unreadable run ends the stream. Import
  persists what it reads before it reloads, so an error thrown here produces
  a save that cannot start.
- **Ordering.** The codec runs last in `packState`, after the asset hoist,
  and first in `deserialize`, before the asset restore. The hoist's
  traversal walks `node.tiles[].imageRef`, and an encoded node no longer has
  this field. Running the codec last means the palette holds refs that are
  already hoisted to `asset:` form, so `Assets.js` needs no knowledge of the
  encoding. Decoding ahead of `withNodeDefaults` likewise leaves a decoded
  tile still packed, so the codec states nothing about what a default value
  is.

This is the first change whose *reader* branches on whether a field is
present, instead of filling one from absence. As a result, the app reads
both forms indefinitely. `StateDiff` works on parsed state, and it never
sees `cells` or `fog`.

## Schema versions and migrations

A save carries a schema `version`. `buildState` stamps this version, and
`deserialize` reads it, with the step transforms living in
`storage/Migrations.js`. `MIGRATIONS[n]` turns a version-n save into a
version-n+1 one, and a missing version reads as 0 (every save written before
this field existed).

The migration chain runs on the raw parsed object *before* the coercion in
`deserialize`. A step exists precisely to repair data that coercion
flattens or drops. The chain also runs ahead of the asset restore, so a
step sees hoisted refs and must resolve a payload through the table itself. A
save stamped newer than the app runs no migration steps, and the app reads it
on a best-effort basis.

A version bump with no payload change registers an identity step, instead of
being left absent. As a result, a unit test can assert that the table covers
every step. A transform filed under the wrong key cannot silently do
nothing.

Any future change to the *meaning* of a stored field belongs in that table. Adding a field alone does not belong there,
because the `withDefaults` functions already absorb its absence.

One field is off limits: a step must never name `library`. The field a
campaign export bundles belongs to `normalizeLibrary` and passes through
the table untouched. A test runs a version-1 save with a library through
the whole chain and asserts the field survives unchanged.

## Undo and redo: a log of deltas

Undo and redo work from a log of invertible deltas against the persisted
save, in `storage/HistoryLog.js`. A delta records only what one save
changed, not the whole campaign. `saveCampaign` is the one save path. It
writes the campaign, then appends one delta produced by the `diffState`
function of `storage/StateDiff.js`, over the previous and new parsed states.

An op records both its old value and its new value, so `invertOps` performs
a swap. Undo and redo are the same walk, in opposite directions:

```
   deltas:   d1      d2      d3      d4
                          ^
                        cursor
   undo:  apply inverse of d3, cursor moves left
   redo:  apply d4 as written, cursor moves right
   new edit at cursor: d4 is deleted (the redo tail)
```

Both header controls step the cursor and then reload. As a result, every
module re-initializes from the restored state through the ordinary load
path. Both controls grey out from `historyDepth` when that direction is
empty.

The storage layout uses one key for each record: an index at
`campaign-builder:history` holding `{ version, log, deltas, cursor }`, and
one `campaign-builder:history:d<seq>` for each delta. A step is therefore
one small `setItem` call, instead of a rewrite of the whole log. Measured on
the example campaign, fifty party steps cost 27,304 bytes of log, where the
previous ten-snapshot ring cost 699,980 bytes for ten steps. A save writes
70,488 bytes, instead of 139,996.

The log also serves cross-tab adoption. A tab calls
`historyPosition()` to get a token for the delta that its live state
reflects. The tab records this token each time its live state matches the
persisted save. When another tab saves, the follower calls
`planAdoption(held)`. The answer is the head delta's ops when the save is
exactly one delta ahead of the held position. The answer is `current` when
nothing moved. The answer is `full` in every other case, and the follower
then takes the ordinary load path. The `log` field of the index is a random
id. A fresh log draws a new id when its first delta lands. Sequence numbers
restart at zero after `clearHistoryLog`. A position token pairs the id with
the number, so a token from a cleared log matches nothing in the new log.

There is deliberately no base snapshot. Undo and redo only ever apply a
delta to the *current* state, so the canonical save already is the base.
The cap drops the oldest deltas, instead of folding them into a base that
needs a synchronous rewrite on every cap hit. (Bringing a base back is what
the deferred idea of replaying base-plus-log at load needs. That idea also
means not writing the canonical save at all.)

The log's own rules keep it from corrupting the campaign that it describes:

1. **A delta is never migrated.** It was written against one schema version
   of `CampaignState`, so the index carries `version`. A log
   stamped with any other version is discarded whole. (This same prefix scan
   is also how the previous ring's keys were reclaimed.)
2. **Every history write happens after the campaign write**, on both the
   save path and the cursor-stepping path. As a result, the index can never
   describe a state that was not stored.
3. **A full origin degrades depth-first.** The app drops the oldest step and
   retries, then drops the whole log if that also fails, and reports
   `{ ok, evictedAll }` either way. Undo silently becoming single-step is the
   defect that this reporting exists for. Hitting the ordinary byte cap is
   the design, and it reports no loss.

A diff needs the previous state as a *value*, not a string. This is the one
property that the old snapshot ring had for free. `HistoryLog` caches this
value, stamped with the raw string it was parsed from, so the steady state
costs only a string compare. A tab that declined the cross-tab reload prompt
cannot diff against a save that another tab replaced.

The cache is warm from the start of a session. `Campaigns.loadInitialCampaign`
reads the save through `HistoryLog.loadPersistedCampaign`, which parses the
stored string once and keeps the result as the base for the first delta.
`toTileGrid` adds those parsed nodes to the grid as they are, so the live
nodes and the cached nodes are the same objects, and the first save of the
session diffs by identity like every later one. Before this, the first save
parsed the save a second time and ran a cold diff over two unrelated object
trees, which cost more than a hundred milliseconds at two hundred nodes.

## The custom library's own store

The GM's custom library (equipment, creature, spell, and feat overrides)
persists separately in `storage/LibraryStore.js`, under its own localStorage
key (`campaign-builder:library`). As a result, New, Import, and Load example
never touch it.

The browser copy is the working state. `downloadLibrary` and
`readLibraryFromFile` round-trip this state through a portable JSON file,
and `fetchLibraryFile` seeds an empty browser from
`library/campaign-library.json` at startup. This file is committed holding
an empty library, so the startup fetch never asks for a missing file. A
GM's export overwrites this file, and everything else under `library/` is
gitignored. `normalizeLibrary` (in `library/Library.js`) makes every load
tolerant, and it drops invalid entries instead of throwing an error. The
library file carries no version field. A file written before the creature
merge holds `bestiary` and `npcs` lists, and `normalizeLibrary` reads both
into the one `creatures` list on the way in.

A campaign export also carries the customs, as a `library` field beside the
save (see the pipeline above). On import, `libraryImportAction` in
`CampaignFile.js` decides what happens to the browser's customs:

| File `library` field | Browser customs | Behavior |
| --- | --- | --- |
| absent, empty, or malformed | anything | untouched, no prompt |
| present | empty | adopted silently |
| present | non-empty | the GM confirms; Replace adopts, decline keeps the browser library. The campaign imports either way |

An adopted library writes to the library key before the import's reload, so
the library wiring picks it up through its normal mount-time read. A quota
failure on that write falls back to importing the campaign alone, with a
toast. The standalone library export stays: it is still the way to move a
library without a campaign, and the file that seeds a fresh clone.

### Changing the spell or feat schema

Library data is versionless everywhere it is stored: the browser's library
key, the exported `campaign-library.json`, and the `library` field bundled
into a campaign export. All three pass through `normalizeLibrary` on read,
and none pass through `Migrations.js`. A schema change is therefore a
coercion change, never a migration step:

1. Update the type in `src/types/spell.ts` (or `feat.ts`). A new field is
   optional or has a stated default.
2. Teach `normalizeSpell` (or `normalizeFeat`) in `library/Library.js` to
   accept the new shape, coerce the old shape into it, and keep any
   original free text it cannot interpret. It must never throw, and it must
   never drop an entry over the changed field.
3. Update the editor form (`ui/SpellForm.js` / `ui/FeatForm.js`) to read
   and write the new field. The form assembles its draft through the same
   normalizer, so a typed entry and an imported one cannot disagree.
4. If characters carry copies of the shape, give `Character.withDefaults`
   the same default. That side rides the campaign save and is covered by
   `deserialize`, not by the library gate.
5. Add `Library.test.js` cases: the new shape passes through unchanged, the
   old shape coerces, and garbage in the field coerces to the default.
6. Do not add a `Migrations.js` step, and do not bump `CURRENT_VERSION`
   for a library-only change. A migration step must never name
   `state.library`.

## File IO

Both stores' file paths route through `storage/fileIO.js`. Its
`downloadJSON` and `readFileText` functions are the only two places where
the app touches `Blob`, object URLs, or `FileReader`. New export and import
features must call these functions, instead of building the browser
plumbing again. The planned Tauri desktop build swaps this one file for
native dialogs and the fs plugin.
