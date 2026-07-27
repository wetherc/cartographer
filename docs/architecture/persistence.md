# Persistence

*Back to the [architecture overview](../architecture.md).*

A campaign lives in the browser's localStorage, which caps out around 5 MB per
origin. That single constraint shaped almost everything in `src/storage/`:
saves are aggressively packed, undo history is stored as small deltas instead
of snapshots, and image payloads are kept in their own compartment so a big
picture can't take the map down with it.

This page walks the save path from live state to stored string, then covers
loading, schema migrations, undo/redo, and the custom library's separate
store. It is the longest of the architecture guides, and deliberately so: the
invariants here are the ones that can silently destroy a GM's campaign if
broken, so the "why" notes matter as much as the "what".

## The save pipeline at a glance

```
  live state (TileGrid, characters, encounters, ...)
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
  detachAssets: payloads to their          downloadState: one
  own key, campaign string to its          self-contained JSON file
  own key, one history delta appended
```

Loading runs the same stages in reverse, with two extra steps at the front
(schema migrations, then shape coercion). The order is load-bearing and is
called out below.

The top-level shape is `CampaignState` (`src/types/storage.ts`): a flat
`nodes` array (the `TileGrid`'s node map flattened out) plus `party`,
`characters`, `encounters`, and the other collections.
`storage/SaveManager.js` owns `buildState`/`serialize`/`deserialize`/
`toTileGrid`, all pure. `toTileGrid` rebuilds a working hierarchy by simply
re-adding each node, since a `MapNode` already carries its own `parentId`.

The thin wrappers around those pure functions
(`trySaveToLocalStorage`/`loadFromLocalStorage`/`downloadState`/
`readStateFromFile`) are the only code touching the actual browser APIs:
`localStorage`, `Blob`, `FileReader`. The save wrapper reports its outcome
rather than throwing, because a quota failure must reach the GM instead of
passing for a save.

## Loading is the validation seam

`deserialize` defaults any missing top-level field to an empty value instead
of throwing, so an older or smaller save shape still loads. It is also the one
validation seam a save passes through, and it coerces every field whose
*shape* the load path trusts: collections to lists of records, the party
position and a running combat to their required members. The reason is
subtle: Import persists what it reads and then reloads, so a malformed field
that survives `deserialize` becomes the stored save of an app that no longer
boots.

`withNodeDefaults` (`map/TileGrid.js`) does the same job for nodes and their
tiles, dropping tiles it cannot read.

As a backstop, `main.js` boots through `Campaigns.loadInitialCampaignSafe`. A
save that still cannot be read yields a blank campaign plus a notice, leaving
the stored save and the history log untouched, so Undo can still step back to
the save before the broken one.

## Packing layer 1: tile defaults

The on-disk shape is not the in-memory shape. `serialize` packs every tile,
omitting each field that equals its default: `overlayRef: null`,
`revealed: false`, `childNodeId: null`, `span: 1`, any default `metadata`
member, and the `metadata` object itself once empty.

Why bother? Default tile boilerplate was 62% of the example campaign's
characters. Almost every tile of a painted map is plain unrevealed terrain
with no point of interest, and the undo history of the day multiplied whatever
a save cost by ten. This layer alone took the example campaign from 358,413 to
134,907 characters.

The inverse is `withTileDefaults` (`map/TileGrid.js`), which fills exactly
those fields from absence, and which every load already ran, so nothing states
a default twice. `deserialize` runs `withNodeDefaults` at the seam rather than
leaving the unpack to `toTileGrid`.

Two safety properties:

- `packTile` deletes keys from a *copy* of the tile rather than picking named
  fields into a fresh object, so a `Tile` member added later survives a save
  even if the packer never learns about it.
- Packed tiles exist only inside the serialized string. The renderer reads
  `tile.metadata` unguarded, so a packed tile must never reach live state. An
  explicit `span: 1` comes back absent, which the `Tile` type defines as the
  same value.

## Packing layer 2: entity defaults

The entity collections pack the same way, one level up, through
`storage/EntityPack.js`, but with a twist. `packEntity(entity, withDefaults)`
does not consult a table of what defaults are. It omits a field only after
*proving* that the entity's own `withDefaults` restores that exact value: it
deletes the field from a copy, runs `withDefaults`, and keeps the omission
only when the result is structurally identical to the loaded form of the
original.

Why not a static table of defaults? Because for entities, the default can
depend on the entity itself. `Encounter.withDefaults` resolves `weapon` and
`armor` from the encounter's own level and tier. A table of per-type defaults
would omit a level-7 boss's weapon because it matches what a level-1 mob would
be given, and loading would hand the boss different gear. Validating each
omission against the real unpacker makes packing and loading unable to
disagree by construction.

`SaveManager`'s one `ENTITY_DEFAULTS` table names the four pairs
(`characters`, `encounters`, `npcs`, `handouts`) and both directions read it,
so the halves cannot drift. `quests` and `bestiary` are absent because neither
has a `withDefaults` to pack against, and both measured at zero
default-valued bytes.

This is also why `deserialize` runs the entity `withDefaults` itself rather
than leaving them to `Campaigns.loadInitialCampaign`: a stored character
legitimately carries no `spellbook` key now, and `undoHistory` and
`readStateFromFile` hand their results to callers that do no defaulting of
their own.

One limitation, by design: the omission is per field and flat. Recursing into
a nested record would have to know whether it is filled member-wise (`stats`)
or whole (`equipment`), which the `withDefaults` contract does not say.

Measured on the example campaign: 133,948 characters to 129,715, with the
encounter collection alone dropping 49%. The win scales with the roster rather
than the map, so it is small next to the tile packing and grows with a
campaign that has hundreds of mobs.

## Packing layer 3: image payloads become a table

GM-supplied images arrive as inline `data:` URLs, meaning the whole image is
base64 text sitting right in the field that references it. Stored that way,
one imported tile painted across a 30x30 region costs its whole payload once
per cell: 18.5 MB of save for a 20 KB image. `storage/Assets.js` fixes this.
`hoistAssets` replaces every inline `data:` URL with an `asset:<key>`
reference into an `assets` table keyed by a hash of the payload's content, and
`restoreAssets` inlines them again inside `deserialize`. The 18.5 MB example
becomes 58 KB, because the payload is now stored once and referenced 900
times.

The payload-bearing fields (a tile's `imageRef` and `overlayRef`, single or
stacked, and a handout's `image`) are listed in one traversal there, so adding
a third site is a single line.

Design notes, each of which closes a real failure mode:

- The table is rebuilt from the refs actually present on every serialize, so
  it prunes itself, and an image-free campaign gets no `assets` field at all.
- Keys collide by comparing the stored payload and probing a suffix, so a hash
  collision costs a longer key and never the wrong image.
- A reference the table cannot resolve is left verbatim rather than blanked.
  The `asset:` prefix is one character off the built-in tile root
  (`assets/tiles/...`), and the worst case of leaving it is the placeholder
  the renderer already draws for a ref that will not load.
- Like a packed tile, the table is on-disk only. `deserialize` builds its
  return value field by field, so live state never holds one.
- The dedupe is within one save, which is all it needs to be: history is a log
  of deltas over parsed state, so a step that inserts a handout carries its
  payload inline once, and a step that merely retitles one carries no image
  at all.

### The localStorage split

In localStorage, that assets table does not travel inside the save at all.
`storage/AssetStore.js` keeps it under its own key
(`campaign-builder:assets`): `trySaveToLocalStorage` splits it off the packed
state with `detachAssets`, writes the payloads first, then writes the
campaign, and reports the two outcomes separately as `ok` and `assetsOk`.

The split is what makes structure and blobs fail independently. A full origin
costs the GM a handout picture instead of their map, and a history snapshot
never carries a picture it did not change. The write order (payloads first)
limits the failure to the survivable shape: a campaign referencing a payload
the sidecar lacks renders the placeholder the renderer already draws, while
the reverse order could persist structure that references nothing. It also
settles the cross-tab case, since `isExternalSaveEvent` fires on the campaign
key and the payloads are already stored by then.

Only the localStorage path splits. `downloadState` still serializes the whole
save, so an exported campaign is one self-contained document, and import needs
no special handling because the persist-then-reload path hands the inline
payloads straight back to the same writer.

`deserialize`'s optional second argument is the read half, supplying payloads
the string does not carry, with a table inside the string winning over it. Its
only two callers are the two readers of a stored string:
`loadFromLocalStorage` and `HistoryLog`'s cache of the last persisted state.

Retention spans every stored string rather than the current save: a payload is
dropped exactly when the last state referencing it becomes unreachable. Those
references are collected by matching `asset:` keys against the raw text
(`referencedAssetKeys`, in `Assets.js` beside the key alphabet it has to
match) rather than by walking parsed state. The reason is the tile codec
below: after encoding, a tile's reference lives inside an encoded node's
palette, which a state walk cannot see without decoding first. The scan is
skipped outright when there is nothing to keep, which is every campaign that
has never held an image.

## Packing layer 4: the tile codec

The three layers above cannot touch the biggest cost. A packed tile is
essentially `{"id":"12,34","imageRef":"assets/tiles/grass/grass-1.svg"}`, and
neither field is a default, so no omission rule can drop either. Meanwhile the
node list is the only part of a save that grows without bound: authoring adds
tiles, and fog reveals are monotonic, never reclaimed.

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

In other words: list each distinct piece of art once, then describe the map as
runs of "the next N cells use art number K". A painted field of 200 grass
tiles becomes one palette entry and one run, instead of 200 repeated strings.

`fog` is separate because `revealed` is the one field play changes, and a
reveal is a disc, which run-lengths compress almost perfectly.

Measured: the example campaign's save went from 129,111 characters to 34,963,
its node list from 115,430 to 21,282, and a dense 40x40 region from 93,880 to
3,621. Exploring that region fully costs 15 more characters in this form,
where the per-cell form would add 25,600.

Two properties keep the codec unable to lose data:

- **It is opt-in per node.** A node qualifies only when its dimensions are
  usable and every tile id is a canonical in-bounds `"x,y"` with no duplicate
  position; otherwise `encodeNodeTiles` returns the *same object*, so a
  hierarchy fixture or a hand-edited id falls back to the per-cell form rather
  than being coerced into the grid. Sparse-but-gridded nodes (interiors
  legitimately are; `barrow` is 94 tiles in a 14x14) encode through a
  reserved `-1` index meaning "no tile here".
- **The leftover list is built by deleting the four fields the codec
  represents itself**, exactly as `packTile` does, so a `Tile` member added
  later rides out of line instead of being dropped.

Smaller but still deliberate:

- The palette is built by row-major traversal rather than by `tiles` array
  order, because `isExternalSaveEvent` compares raw strings: re-serializing an
  unchanged campaign has to produce the same string.
- Decoding degrades rather than throwing. An unreadable palette entry skips
  its cell, and an unreadable run ends the stream, because Import persists
  what it reads before reloading, so a throw here is a save that cannot boot.
- **Ordering.** The codec runs last in `packState`, after the asset hoist, and
  first in `deserialize`, before the asset restore. The hoist's traversal
  walks `node.tiles[].imageRef`, which an encoded node no longer has; running
  the codec last means the palette holds already-hoisted `asset:` refs and
  `Assets.js` needs no knowledge of the encoding. Decoding ahead of
  `withNodeDefaults` likewise leaves a decoded tile still packed, so the codec
  states nothing about what a default is.

This is the first change whose *reader* branches on a field's presence rather
than filling one from absence, so both forms are read indefinitely.
`StateDiff` works on parsed state and never sees `cells` or `fog`.

## Schema versions and migrations

A save carries a schema `version`, stamped by `buildState` and read by
`deserialize`, with the step transforms in `storage/Migrations.js`.
`MIGRATIONS[n]` turns a version-n save into a version-n+1 one, and a missing
version reads as 0 (every save written before the field existed).

The chain runs on the raw parsed object *before* `deserialize`'s coercion,
since a step exists precisely to repair a shape that coercion would flatten or
drop. It also runs ahead of the asset restore, so a step sees hoisted refs and
has to resolve a payload through the table itself. A save stamped newer than
the app runs no steps and is read best-effort.

A version bump with no payload change registers an identity step rather than
being left absent, so a unit test can assert the table covers every step, and
a transform filed under the wrong key cannot silently do nothing.

The rule of thumb: any future change to the *meaning* of a stored field
belongs in that table. Merely *adding* a field does not; the `withDefaults`
seams already absorb absence.

## Undo and redo: a log of deltas

Undo and redo are a log of invertible deltas against the persisted save, in
`storage/HistoryLog.js`. A delta records only what one save changed, not the
whole campaign. `saveCampaign` is the one save path: it writes the campaign,
then appends one delta produced by `storage/StateDiff.js`'s `diffState` over
the previous and new parsed states.

An op records both its old and its new value, so `invertOps` is a swap, and
undo and redo are the same walk in opposite directions:

```
   deltas:   d1      d2      d3      d4
                          ^
                        cursor
   undo:  apply inverse of d3, cursor moves left
   redo:  apply d4 as written, cursor moves right
   new edit at cursor: d4 is deleted (the redo tail)
```

Both header controls step the cursor and then reload, so every module
re-initializes from the restored state through the ordinary load path, and
both grey out from `historyDepth` when that direction is empty.

The storage layout is one key per record: an index at
`campaign-builder:history` holding `{ version, deltas, cursor }`, and one
`campaign-builder:history:d<seq>` per delta. A step is therefore one small
`setItem` rather than a rewrite of the log. Measured on the example campaign,
fifty party steps cost 27,304 bytes of log where the previous ten-snapshot
ring cost 699,980 for ten, and a save writes 70,488 bytes rather than 139,996.

There is deliberately no base snapshot: undo and redo only ever apply a delta
to the *current* state, so the canonical save already is the base, and the cap
drops the oldest deltas instead of folding them into a base that would have to
be rewritten synchronously on every cap hit. (Bringing a base back is what the
deferred idea of replaying base-plus-log at load, and so not writing the
canonical save at all, would need.)

Three rules keep the log unable to corrupt a campaign:

1. **A delta is never migrated.** It was written against one schema version's
   `CampaignState` shape, so the index carries `version` and a log stamped
   with anything else is discarded whole. (That prefix scan is also how the
   previous ring's keys were reclaimed.)
2. **Every history write happens after the campaign write**, on both the save
   and the cursor-stepping paths, so the index can never describe a state that
   was not stored.
3. **A full origin degrades depth-first**: drop the oldest step and retry,
   then the whole log, reporting `{ ok, evictedAll }` either way. Undo
   silently becoming single-step is the defect that reporting exists for;
   hitting the ordinary byte cap is the design and reports no loss.

One more piece: a diff needs the previous state as a *value*, not a string,
which is the one property the old snapshot ring had for free. `HistoryLog`
caches it, stamped with the raw string it was parsed from, so the steady state
costs a string compare, and a tab that declined the cross-tab reload prompt
cannot diff against a save another tab replaced.

## The custom library's own store

The GM's custom library (equipment/bestiary/NPC template overrides) persists
separately in `storage/LibraryStore.js`, under its own localStorage key
(`campaign-builder:library`), so New/Import/Load example never touch it.

The browser copy is the working state; `downloadLibrary`/`readLibraryFromFile`
round-trip it through a portable JSON file, and `fetchLibraryFile` seeds an
empty browser from `library/campaign-library.json` (a gitignored path served
from the project root) at startup. `normalizeLibrary` (in
`library/Library.js`) makes every load tolerant, dropping invalid entries
instead of throwing.

## File IO

Both stores' file paths route through `storage/fileIO.js`, whose `downloadJSON`
and `readFileText` are the only two places the app touches `Blob`, object
URLs, or `FileReader`. New export/import features should call these rather
than re-rolling the browser plumbing; the planned Tauri desktop build swaps
this one file for native dialogs and the fs plugin.
