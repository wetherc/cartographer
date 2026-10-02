---
---
# Conventions

*Reference. Back to the [architecture overview](../architecture.md).*

Code in this repository follows fixed rules for hot-path performance, for
UI and CSS, and for the split between unit-tested logic and DOM glue. Each
rule names the failure that follows when new code departs from it.

## Performance

Most collections (characters, creatures, quests, handouts, library
templates) are small, so a linear scan over one of them costs little. Leave
those scans alone until a measurement shows a cost. The real costs sit in
the map, the save path, and a few growing lists, and each of these places
has a pattern that new code in the same area follows.

### Coalesced canvas redraws

`MapCanvas.render()` schedules a frame and does not draw. A burst of
pointermove or wheel events, or an update that calls several setters (such
as the party-marker sync), therefore produces one redraw through one
`requestAnimationFrame`.

Within a frame, `MapRenderer` collects shared derived data into one `frame`
object, and every render pass reads that object. A new render pass reads
from `frame` or extends it. A pass that scans `node.tiles` again repeats
work that the frame already did.

DOM controls that update on every frame compare the new value with the
value they last wrote, and skip the write when nothing changed.
`MapControls.update` (through `onViewChange`) does this. The `refresh` method of
`mountMapNarration` in `mapNarration.js` does the same for the text of the map's screen-reader live
region. A screen reader announces a live region again each time its text
node is rewritten, even with the same text, so a skipped comparison produces
a false announcement.

### TileIndex

`src/map/TileIndex.js` keeps a layout for each node in a WeakMap.
`tileAt(node, id)` resolves a tile id and `tileAtXY(node, x, y)` resolves a
grid coordinate. Both run in O(1) time and allocate nothing. Code that
resolves tiles in a loop (painting, fog, hit-testing) uses these functions
and does not scan the flat `tiles` array.

The cache stays valid because every tile mutation replaces the node object,
so a stale node never answers a fresh read. A new mutation path keeps
replacing the node. If code changes the tiles of a node in place, the cached
layout points at positions that the node no longer has.

The layout stores positions only, not tiles. A flat buffer from cell to
position covers the node's extent. It answers a coordinate lookup and also a
lookup of a grid id such as "3,4", because the code reads the cell from the
characters of the id. A small map from id to position covers every other id,
such as "loose" or "01,2". On a 200x200 node, the layout needs about 4 bytes
per tile, where a map entry for every tile needs about 47.

Because the layout keeps only positions, a mutation can give the new node
the maps of the previous node instead of indexing it again. Three helpers
pass the layout forward: `withTileReplaced`, `withTilesReplaced`, and
`withTileAppended`. `setTile` and the fog writers build on them, so a paint
or fog drag costs O(cells crossed) for the whole stroke. On a 40-cell drag, a
full re-index for each cell costs 1.74 ms at 30x30 and 30.0 ms at 100x100.
Passing the layout forward costs 0.05 ms and 0.10 ms. A mutation that
removes a tile shifts every later position, so it rebuilds the index.

The code records appended tiles in override maps that belong to the new
node, and never writes them into the shared base. Two nodes that branch from
one parent therefore never see each other's tiles. A stroke and its
pre-stroke undo snapshot are exactly this case. A new mutation helper routes
through the three helpers above, or gives the finished list to
`withNodeTiles`. `withNodeTiles` handles every case, leaves the new node
without a cached layout, and costs one rebuild on the next read.

### Frozen tiles

`src/map/TileFreeze.js` freezes a tile when the tile enters a node. A later
write to that tile then throws a `TypeError` at the write. Without the
freeze, the write succeeds and the render silently disagrees with the
state. The three per-cell helpers freeze the tile they receive, and
`withNodeTiles` freezes the list and every tile in it.

Freezing one tile is bounded work, but freezing an array visits every
element. The per-cell helpers therefore leave the list writable, and the
code freezes the list only when a whole list enters a node. Freezing also
covers the tile's `metadata` record and its `overlayRef` stack, because the
code hands out both by reference.

`createTile` does not freeze a tile. The generators build a layout by
changing freshly created tiles and only then hand the list to a node. This
is safe while no node contains those tiles.

`DEFAULT_TILE_METADATA` (`TileGrid.js`) is frozen in every build. It is the
metadata of every tile with no point of interest, no discovery flags, and no
notes. `createTile` and `withTileDefaults` give every such tile this one
object, which saves about 6 MB at 400 extra regions. A write to it in place
would change every default tile at once. A generator that marks a tile
replaces the record instead, as in
`tile.metadata = { ...tile.metadata, poiType }`.

Tile freezing is on under Node (unless `NODE_ENV` is `production`) and on a
page served over `http:` from `localhost` or `127.0.0.1`. It is off
everywhere else. A throw that reaches a GM in the middle of a session stops
the session, and the stale render that the freeze replaces does not.
`setTileFreezing` overrides the detection for a benchmark or a test.

### WeakMap caches per node

A value that a hot path recomputes, and that the code can derive from a node
alone, follows the TileIndex pattern. The function is pure over an immutable
node and caches its result in a WeakMap, so an entry never goes stale. The
returned arrays and sets are shared, so treat them as read-only.

The region caches, the span blocks, and the map description use keys that
are narrower than the node. A fog reveal or a painted cell makes a new node,
but the fields that these caches read stay the same. The TileIndex layout
keeps three stamps. A stamp is an empty object that stands for one state of
some tile fields:

| Stamp | Fields it covers |
| --- | --- |
| `linkStamp` | The tile ids and their `childNodeId` values |
| `artStamp` | The tile ids, their `imageRef` and `span` values, and their point-of-interest types |
| `fogStamp` | The tile ids and their `revealed` flags |

The replace helpers give the stamp to the new node when no replaced tile
changes a field that the stamp covers. The caches key on these stamps:

- Region groups (`findRegionGroups`) cache on the link stamp.
- Span blocks (`TilePaint.spanBlocks`) cache on the art stamp.
- The placed count and the point-of-interest positions of `describeNode`
  cache on the art stamp.
- The group outline (`groupOutline`), the color slots (`regionSlots`, keyed
  on the groups array), and the image chunks (`groupImageChunks`) cache on
  the group objects. The chunks also record the art stamp.

A party step therefore rebuilds none of these caches. Key a derived value on
the fields it reads. When one of those fields is a node field, put the stamp
for that field in the key, and do not key on the whole node.

A rebuild of the region caches runs over flat typed arrays with one entry
for each cell, and not over "x,y" strings. `findRegionGroups` fills an
Int32Array that keeps the index of the child id of each cell. `groupOutline`
marks the members in a Uint8Array over the group's bounding box, and
`regionSlots` finds the owner of a neighbor cell in an Int32Array. On a
200x200 node with 100 regions, the groups cost 1.9 ms, where a Map keyed by
"x,y" costs 17.5 ms. A linked tile id that the grid cannot express, such as
"01,2", sends its node to the keyed version, so both versions give the same
groups in the same order.

The tile pass visits only the visible cell range. It inverts the view
transform once and then looks up cells by coordinate, so the pass costs
O(visible tiles) and never O(total tiles). In each frame it parses no
regular expression for each tile, and it builds and hashes no id string for
each visible cell.

A pass that visits every tile of a node reads each id through
`MapGeometry.gridCellOf`. This function scans the characters of a canonical
"x,y" id and allocates nothing. The pass calls `parseCoords` only for an id
outside that form. `describeNode` and the nearest-tile searches of
`EntryPoint.js` follow this rule. A lookup of one known id goes through
`tileAt`, not `tiles.find`. On a 200x200 node, the scan behind `describeNode`
costs 0.8 ms, where a `parseCoords` call for each tile costs 2.6 ms.

Derived data keeps the coordinates it already parsed, so a reader does not
parse them again. A region group has a `cells` array that is index-aligned
with its `tileIds`. The overlay's clip path walks the revealed members of a
group with no parse and no allocation for each tile.

The renderer's block and marker passes run for each block and each marker in
every frame. When one of these passes uses a rectangle at once, the code
computes it with arithmetic on the cell extent and does not build a
`tileRect` object. `tileRect` stays the right choice for controls that run
once per frame (selection, cursor, keyboard scroll-into-view). Anything that
a pass memoizes against the view snapshot is released at the end of the
frame (`MapMarkers.releaseFrame`). An idle map therefore keeps no reference
to the finished view or to the node behind it.

The combat rosters follow the same pattern. `combatants.js` memoizes an
id-to-index Map for each characters or creatures array. Every mutation goes
through `replaceById` and replaces the array, so the Map stays valid with no
invalidation step, and participant lookups during a fight run in O(1) time.

### Deferred work during a stroke

A paint, erase, or fog drag updates each cell through
`MapCanvas.refreshNodeTiles`, which only swaps the node and redraws. The
region groups and the screen-reader map description update once, in
`onStrokeEnd` (`mapAuthoring.js`). Before you add work for each cell of a
gesture, check whether anything can observe that work during the drag. If
nothing can, defer it to `onStrokeEnd` in the same way.

### Fog reveal cost

`revealAround` visits the bounding square of the radius by coordinate and
copies the tile array once. When it reveals nothing new, it returns the
same node object, so the WeakMap caches above stay warm on a party step
through explored ground. Other hot-path mutation helpers also return the
same object for a no-op, for the same reason.

The reads that follow a reveal cost the cells that it flips, not the tiles
of the node. The layout keeps an explored count (`TileIndex.exploredCount`):
the number of revealed tiles with a grid id. The first read of a layout
counts every tile. After that, each replace helper adds the flips of its
replaced tiles to the count of the new layout.

The renderer's revealed-id lookup (`TileIndex.revealedIds`) builds no set.
Its `has` reads the `revealed` flag of the tile at the cell of the id. A
lookup costs about 25 ns, where a hit in a `Set` of ids costs about 17 ns,
and a frame makes at most one lookup for each cell of a visible region or
block. Both readers answer from the node they receive, so an older node that
undo or a cross-tab adoption brings back reads its own fog. `describeNode`
reads the cached point-of-interest positions and then the tile at each
position, because the art stamp does not cover `revealed`, `discovered`, or
`notes`.

On a 200x200 node, a party step costs 0.04 ms, where a scan of every tile
costs 0.9 ms. The copy of the tile array in `withTilesReplaced` is the one
part of a step that still grows with the node: about 0.03 ms on a 200x200
node and 0.11 ms on a 400x400 node. `pnpm bench:step` prints the step cost
for each node size (see `bench/README.md`).

### Delta saves

A save writes the campaign string once and appends one delta that describes
the edit (`storage/HistoryLog.js`). For the example campaign, the delta log
writes 70,488 bytes per save, where a ring that copies the previous save's
whole string to a second key writes 139,996. The code caches in memory the
previous state that a delta needs, stamped with the raw string it was parsed
from. In the steady state, a save therefore costs one `getItem` call and one
string compare, with no parse.

Code that changes the save and history paths keeps this pattern. A path
that parses and stringifies the whole campaign again for each write adds a
full parse to every autosave. A path that skips the byte cap or the quota
fallbacks (drop the oldest steps first, then the log) turns a full origin
into a failed save.

### Incremental rendering of growing lists

The travelogue panel builds its DOM skeleton once. After that, it prepends
only the entries newer than the last rendered id (`entriesAfter` in
`src/log/Travelogue.js`, a pure function). It rebuilds only when that anchor
id is gone, which means that the log was cleared or replaced. The combat log
uses the same `entriesAfter` call. The same approach fits any list that
mostly grows at one end, and it costs less than clearing and rebuilding the
list for each event.

### Memoized library lists

The library's `active*` getters cache their merged lists of defaults and
custom entries in module state. Only `setActiveLibrary`
(`src/library/Library.js`) clears this cache, and every mutation path goes
through it. The projections over these lists (entry-only lists, filters for
each type, the spell id index) live in the same cache object, so a repeat
call to a getter allocates nothing. Add a new derived collection to the same
cache and clear it at the same point. A getter that merges again on each
call allocates on every read.

Callers treat the returned arrays as read-only, because the code shares
them. The four built-in catalogs behind them (`defaultEquipmentTemplates()`,
`DEFAULT_CREATURES`, `DEFAULT_SPELLS`, and `DEFAULT_FEATS`) pass through
`deepFreeze` (`src/util/deepFreeze.js`). A write to a shared array then
throws, and does not change the data for every reader. A path that copies
library data into campaign state says so in its name: `CreatureTemplate.fromTemplate`,
`Library.activeEnemyArmor`, `EquipmentPresets.copyEnemyWeapon`, and
`CharacterSpellbook.copySpellbook`.

## UI and style

New code follows these patterns and does not decide the same question again
in one place. [UI components](ui-components.md) lists the builders and
tokens that the rules apply to.

### Design tokens

Color, spacing, radius, type, shadow, and motion values come from custom
properties in `styles/base.css`. The one group of tokens outside it is the
character sheet's width measures (`--sheet-measure` and its relatives) in
`styles/character.css`.

Do not write an inline fallback such as `var(--border, rgba(...))`. A
reference to a token that does not exist renders as nothing, which you can
see. A fallback hides the typo.

If a token that you need does not exist (for example, a contrast color for a
new accent), add it to `base.css` as a `light-dark()` pair next to its
relatives. Each accent token (`--accent`, `--danger`, `--success`,
`--warning`, `--mana`) has a matching `*-contrast` token for text drawn on
top of it.

### Choosing a dialog

Use `confirmModal` only for a question with two real answers, and
`choiceModal` for a question with three or more. For a
notification, use `alertModal` when the GM must acknowledge it, or
`app.toasts.show` when it can dismiss itself. A confirm dialog whose Cancel
does nothing is a notification in the wrong form. Give the same event the
same presentation everywhere: a no-op undo is a toast, whichever undo stack
it came from.

### Confirmation before destructive actions

For a plain entity delete, use `confirmDelete(name, detail?)` (`Modal.js`).
It owns the `Delete "X"?` wording and the danger-styled Delete button, so no
call site restates the options object.

Some deletes need a message that this wording cannot give, such as a node's
"and everything inside it" or the library's choice between revert and
delete. Destructive actions that are not deletes (Discard, Replace, Reset)
do not fit it either. For these cases, use `confirmModal` with
`danger: true`, an imperative `confirmLabel`, and the affected item named in
the message.

The rule applies to any action that throws away more state than one click
created. That includes the bulk variants (remove all, clear) of actions that
are safe as single steps.

### Shared button builders

`iconButton` and `textButton` in `src/ui/buttons.js` build the `btn` class
list. They always set an `aria-label` on an icon-only button, and they
default the hover tooltip to that label. A button built by hand tends to
miss exactly these attributes.

`emptyState(message)` is the one "nothing here" paragraph. `segSwitch` is
the one segmented group of mutually exclusive buttons, and it keeps the
active class and `aria-pressed` in step. A control that acts as a button for
the keyboard but has no `btn` presentation, such as a tab or a tree row, is
a `bareButton` with its own class. A new panel builds no `<button>` element
of its own.

### Numeric coercion

`clampInt(value, min, max, fallback)` in `src/util/num.js` floors a value
and limits it to the range. Anything that does not parse to a nonzero number
(a blank, text, `undefined`, or zero) becomes `fallback`. The fallback
defaults to `min` when `min` is finite, and to 0 otherwise. Numbers read from
a form or a file go through `clampInt`.

For a value that has several such fields, add a named normalizer beside the
constants it checks against. Do not copy the coercion into each reader. For
example, the library importer and the item form's damage editor both call
`Equipment.normalizeDamagePart`, so one function checks the supported die
sizes and damage types.

### Danger styling

A delete, discard, or clear button passes `variant: 'danger'`, and no such
button appears only on hover. A control that shows only on hover is harder
to find and no safer, because the confirm dialog is the protection.

### Button order in forms and dialogs

Modals, inline forms (`formFields.buildInlineForm`), the spell-detail action
bar, and the inventory give form all put Cancel or Close on the left and the
affirmative action on the right. A new form uses the same order.

### HP icons

Use `icon('minus')` and `icon('heal')` wherever HP changes. The character
sheet's steppers and the encounter panel's amount buttons share this pair,
in danger red and success green. A subtract or add symbol reads at once,
where a picture such as a sword does not. The sword marks attacks and foes
only: the attack buttons of the combat action bar and the combatant cards,
the Start combat and Open combat buttons, and the foe marks on the combat
ribbon and the combatant cards. It never marks HP arithmetic.

### Shared widget classes

These classes live in `base.css`, not in a feature sheet, so every switch,
list row, and group heading looks the same:

| Class | Role |
| --- | --- |
| `.seg-switch` | The segmented toggle (mode, theme, and role switches, and the dice tray's d20 mode) |
| `.row-select` | The selectable list row (world tree, roster) |
| `.section-label` | The in-panel sub-heading: uppercase, tracked, and muted |
| `.empty-state` | The "nothing here" paragraph |

In a new switch, list row, or group heading, reuse the class. Keep only
layout (margins, grid placement) in the component's own class, because a
copy of the treatment in a feature sheet drifts from the shared one. Badges
use `0 var(--space-1)` padding everywhere.

### Overlay tokens

`--overlay-bg`, `--overlay-text`, and `--overlay-npc` in `base.css` are dark
in both themes. Map controls, toasts, tooltips, and the onboarding scrim
float over map art and not over the page background, so they do not follow
`light-dark()`. Derive a translucent variant with `color-mix` from the same
tokens, and do not restate the hex value.

## Testing

Pure logic takes its side effects (the random number generator, the current
time, and similar inputs) as arguments and returns data. `node --test` can
then test it with no DOM. Thin glue code connects that logic to the DOM or
the canvas, and you check the glue in a browser.

| Pure, unit-tested | DOM glue, checked in a browser |
| --- | --- |
| `roll(selection, rng)` | `ui/DiceTray.js` |
| `MapNavigator`, `RegionGroups`, `FogOfWar`, `PartyTracker` | The event handlers of `MapCanvas` |
| `Creature`, `Resource`, `Character` | `ui/CharacterSheet.js`, `ui/InventoryPanel.js`, `ui/EncounterPanel.js` |
| `serialize`, `deserialize`, and `toTileGrid` in `SaveManager` | The localStorage, download, and file wrappers in `SaveManager` |
| `combat/AttackResolve.js`, `combat/WeaponSwing.js` | The dialog and dice-tray code in `app/weaponAttack.js` |
| `entities/ItemDraft.js`, `entities/SpellDraft.js` | `ui/ItemForm.js`, `ui/SpellForm.js` |
| `view/StatBars.js`, `view/Shortcuts.js` | `ui/CharacterBars.js`, `app/shortcuts.js` |
| `map/NodeEdits.js`, `map/NodeCleanup.js`, `storage/SaveNotices.js` | `app/nodeActions.js`, `app/campaignActions.js` |

The last four rows split a UI or wiring module in the same way. Make the
same split when you change such a module, because the decision that glue
makes usually does not need the DOM. A submit handler that reads six inputs
and builds an object is a control read plus a pure function. A keydown
handler is a table lookup plus a click. The rules then go under test, and
the untested part stays small. `pnpm coverage` shows which modules still
need this split.

[Testing a change](../testing.md) gives the practical steps:

- how to run one test file
- how to read the coverage report
- what the pre-commit hook does
- how to check a change in the browser against the dev server
