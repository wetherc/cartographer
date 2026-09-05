# Conventions

*Reference. Back to the [architecture overview](../architecture.md).*

These patterns keep the hot paths fast, the UI coherent, and the tests
runnable. Each one records a decision already made, and each names what
breaks when code departs from it.

## Performance

Most collections (characters, creatures, quests, handouts, library
templates) are small, and their linear scans cost little in absolute terms,
so leave them alone until a real need appears. Cost concentrates in a small
number of places, each with an established pattern that new code in the same
area follows.

### Coalesced canvas redraws

`MapCanvas.render()` only *schedules* a frame, so bursts of pointermove and
wheel events, and multi-setter updates such as the party-marker sync,
collapse into one redraw through one `requestAnimationFrame`. Within a
frame, `MapRenderer` gathers shared derived data into one `frame` object, and
every render pass reads that object, so a new render pass reads from it or
extends it rather than re-scanning `node.tiles`.

Per-frame DOM chrome hanging off the render loop (`MapControls.update`
through `onViewChange`) compares the new value against what it last wrote
and skips the DOM write when nothing changed. `mapWiring.js`'s
`refreshMapDescription` does the same for the text of the map's
screen-reader live region, where the comparison also prevents a false
announcement, because a rewrite of a live region's text node re-announces it
to a screen reader even when the text is unchanged.

### TileIndex

`src/map/TileIndex.js` keeps a WeakMap-cached layout for each node.
`tileAt(node, id)` resolves an id and `tileAtXY(node, x, y)` resolves a grid
coordinate, both at O(1) with no allocation. New code that resolves tiles in
a loop (painting, fog, hit-testing) uses these functions instead of scanning
the flat `tiles` array.

The cache stays valid because the code replaces nodes immutably on every tile
mutation, so a stale node object can never serve a fresh read. The reverse
is a requirement: a new mutation path keeps replacing the node, because
mutating tiles in place leaves the cached layout pointing at positions the
node no longer has.

The layout contains only position data, an id-to-position map plus a flat
cell-to-position buffer over the node's extent, and no tiles at all, which
lets a mutation hand the new node the previous node's maps instead of
re-indexing from scratch. `withTileReplaced`, `withTilesReplaced`, and
`withTileAppended` are the three helpers that pass the layout forward, and
`setTile` and the fog writers build on them, so a paint or fog drag costs
O(cells crossed) across the whole stroke instead of a full re-index for each
cell. A full re-index per cell costs 1.74 ms on a 40-cell drag at 30x30 and
30.0 ms at 100x100, against 0.05 ms and 0.10 ms when the layout passes
forward. A mutation that *removes* a tile shifts every later position, so it
rebuilds the index.

The code records appends in override maps private to the new node and never
writes them into the shared base, so two nodes that branch off one parent can
never see each other's tiles. A stroke plus its pre-stroke undo snapshot is
exactly two nodes that share one parent. In a new mutation helper, route
through those three helpers, or hand the finished list to `withNodeTiles`,
which leaves the new node uncached and handles every case at the cost of one
rebuild.

### Frozen tiles

`src/map/TileFreeze.js` freezes a tile as it enters a node, so a later write
to that tile raises a `TypeError` at the write instead of leaving a render
that silently disagrees with the state. The three per-cell helpers freeze the
tile they receive, and `withNodeTiles` freezes the list and its contents.

Freezing a *tile* is bounded work, but freezing an *array* walks each of its
elements, so the per-cell helpers leave the list writable and the code
protects membership only when a node is entered. Freezing also covers the
tile's `metadata` record and an `overlayRef` stack, because the code hands
out both by reference.

`createTile` does not freeze a tile, because the generators build a layout by
mutating freshly created tiles and only then hand the list over, which stays
legal while no node contains those tiles.

Freezing is on in development and off elsewhere, because a throw that reaches
a GM mid-session stops the session, while the stale render it replaces does
not. `setTileFreezing` overrides this detection.

### WeakMap caches per node

The revealed-id set (`MapRenderer.js`), span blocks (`TilePaint.spanBlocks`),
region groups (`RegionGroups.findRegionGroups`), and group image chunks
(`groupImageChunks`) all follow the TileIndex pattern. Each is a pure function
of an immutable node, and each caches its result under the node object as the
key. This pattern covers anything a hot path recomputes that the code can
derive from a node alone. The returned arrays and sets are shared, so treat
them as read-only.

Chunks are the one entry with a narrower key than the node. Their key is the
group object, which the group cache keeps stable for each node and stamps
with `node.tiles`, because a chunk's contents depend only on the group's
geometry and on its member tiles' art. Keying chunks on the node instead
would break reuse across a stroke, because a stroke replaces the node for
each cell while the canvas's groups stay memoized against the pre-stroke
node. Key a derived value on what it reads, and when part of that is a node
field, stamp the field onto the key instead of nesting the key inside the
node.

The tile pass itself iterates only the visible cell range, because it inverts
the view transform once and then looks up cells by coordinate, which keeps
the pass at O(visible) and never at O(total tiles). It parses no regular
expression for each tile in each frame, and builds and hashes no id string
for each visible cell in each frame.

Derived data keeps the coordinates it already parsed, so the reader does not
parse them again. A region group has a `cells` array that is index-aligned
with its `tileIds`, which lets the overlay's clip path walk a group's
revealed members with no parse and no allocation for each tile. The
renderer's block and marker passes follow the same rule: when a pass
consumes a rect immediately, the code computes it as arithmetic on the cell
extent rather than as a `tileRect` object, because these passes run for each
block and each marker in every frame. `tileRect` remains the right choice
for chrome that runs once for each frame (selection, cursor, marquee,
keyboard scroll-into-view). The code releases anything a pass memoizes
against the view snapshot at the end of the frame (`MapMarkers.releaseFrame`),
so an idle map keeps no reference to the finished view or to the node behind
it.

The same pattern covers the combat rosters. `combatants.js` memoizes an
id-index Map for each characters or creatures array, which stays valid because
every mutation goes through `replaceById` and replaces the array, so
participant lookups during a fight run at O(1) with no explicit invalidation
step.

### Deferred work during a stroke

A paint, erase, or fog drag updates each cell through
`MapCanvas.refreshNodeTiles`, which only swaps the node and redraws. The
region-group recompute and the screen-reader map description settle once, in
`onStrokeEnd` (`mapAuthoring.js`). Before you add per-cell gesture work,
check whether anyone can observe that work mid-drag, and if not, defer it the
same way.

### Fog reveal cost

`revealAround` iterates the radius's bounding square by coordinate and copies
the tile array once. It also returns the *same* node object when nothing was
newly revealed, so the WeakMap caches above stay warm on a party step through
explored ground. Other hot-path mutation helpers preserve identity on a no-op
for the same reason.

### Delta saves

A save writes the campaign string once, and appends one delta that describes
the edit (`storage/HistoryLog.js`). A ring that copies the previous save's
whole string to a second key writes 139,996 bytes per save for the example
campaign, where the delta log writes 70,488. The code caches the previous
state a delta needs in memory, stamped with the raw string it was parsed
from, so the steady state costs one `getItem` call and one string compare
instead of a parse.

Code that touches save and history paths keeps this pattern. A path that
parses and restringifies a whole campaign for each write puts the parse back
on every autosave, and a path that ignores the byte cap or the quota
fallbacks already in place (drop the oldest steps first, then the log) turns
a full origin into a failed save.

### Incremental rendering of growing lists

The travelogue panel builds its DOM skeleton once, then prepends only the
entries newer than the last-rendered id (pure `entriesAfter`,
`src/log/Travelogue.js`). It rebuilds only when that anchor id vanishes,
which means the log was cleared or replaced. The same diff-by-anchor-id
approach fits any append-mostly list, and it costs less than clearing and
rebuilding the list for each event.

### Memoized library lists

The library's `active*` getters cache their merged defaults-plus-customs
lists in module state. Only `setActiveLibrary` (`src/library/Library.js`)
invalidates this cache, and every mutation path routes through it. The
projections over these lists (entry-only lists, filters for each type, the
spell id index) live in the same cache object, so a getter never
re-allocates data on a repeat call. A further derived collection hangs off
the same cache-and-invalidate point, because a getter that re-merges per call
allocates on every read.

Callers treat the returned arrays as read-only, because the code shares them.
The four built-in catalogs behind them (`defaultEquipmentTemplates()`,
`DEFAULT_CREATURES`, `DEFAULT_SPELLS`, and `DEFAULT_FEATS`) are
`deepFreeze`d (`src/util/deepFreeze.js`), so a write to a shared array
throws instead of changing every reader. A path that copies library data
into campaign state says so by name, which is what `Creature.fromTemplate`,
`Library.activeEnemyArmor`, `EquipmentPresets.copyEnemyWeapon`, and
`Character.copySpellbook` exist for.

## UI and style

New code follows these patterns instead of deciding the same question again
locally. [UI components](ui-components.md) lists the components and tokens
they apply to.

### Design tokens

Color, spacing, radius, and type values all come from custom properties, and
all of these properties live in `styles/base.css`. Never write an inline
fallback (`var(--border, rgba(...))`), because a reference to a token that
does not exist renders as nothing, which is visible, while a fallback hides
the typo.

If a needed token does not exist (for example, a contrast color for a new
accent), add it to `base.css` as a `light-dark()` pair next to its relatives.
Every `*` accent token has a matching `*-contrast` token for text drawn on top
of it.

### Choosing a dialog

Use `confirmModal` only for questions with two real answers. For pure
notifications, use `alertModal` (blocking, needs acknowledgment) or
`app.toasts.show` (non-blocking, self-dismissing). Never use a confirm dialog
with a dead Cancel button. Give the same event the same presentation
everywhere, so a no-op undo is a toast no matter which undo stack it came
from.

### Confirmation before destructive actions

For plain entity deletes, use `confirmDelete(name, detail?)` (`Modal.js`),
which owns the `Delete "X"?` wording and the danger-styled Delete button, so
no call site restates the options object. Some deletes have a message that
this wording cannot give, such as a node's "and everything inside it" or the
library's revert-versus-delete pair, and non-delete destruction (Discard,
Replace, Reset) does not fit this wording either. For these cases, use
`confirmModal` with `danger: true`, an imperative `confirmLabel`, and the
affected item named in the message.

This rule applies to any action that throws away more state than one click
created, including bulk variants (remove-all, clear) of actions that are
otherwise safe as single steps.

### Shared button builders

`iconButton` and `textButton` in `src/ui/buttons.js` own the `btn` class
assembly. They always set an aria-label on icon-only buttons, and default
the hover `title` to that label, because a hand-rolled button drifts on
exactly these attributes. `emptyState(message)` is the one "nothing here"
paragraph. `segSwitch` is the one segmented group of mutually exclusive
buttons, and it owns the pairing of the active class with `aria-pressed`. A
control that is a button for the keyboard but has no `btn` chrome, a tab or
a tree row for example, is a `bareButton` with its own class. A new panel
builds no `<button>` element of its own.

### Numeric coercion

`clampInt(value, min, max, fallback)` in `src/util/num.js` floors a value,
limits it to the range, and reads anything it cannot parse (blank, text,
`undefined`, zero) as `fallback`, which defaults to `min`. Numbers off a form
or a file go through it.

For a whole value that has several such fields, add a named normalizer
beside the constants it checks against, rather than a second copy of the
coercion at each reader. `Equipment.normalizeDamagePart` is the function
that both the library importer and the item form's damage editor call, so
the code checks the supported die sizes and damage types in one place.

### Danger styling

A delete, discard, or clear button passes `variant: 'danger'`, and no such
button is ever hover-revealed. Hiding a destructive control until hover
makes it hard to discover without making it safer, because the confirm
dialog is the protection.

### Button order in forms and dialogs

Modals, inline forms (`formFields.buildInlineForm`), the spell-detail action
bar, and the inventory give form all order Cancel or Close on the left and
the affirmative action on the right, and a new form keeps the same order.

### HP icons

Use `icon('minus')` and `icon('heal')` wherever HP moves. The character
sheet's steppers and the encounter panel's amount buttons share this pair,
in danger red and success green. A subtract or add symbol reads instantly
where a pictorial glyph such as a sword does not, so the sword stays reserved
for attack actions (the combat screen's action bar and its foe markers) and
never marks HP arithmetic.

### Shared widget classes

`.seg-switch` is the segmented toggle (mode, theme, and role switches, the
dice tray's d20 mode). `.row-select` is the selectable list row (world tree,
roster). `.section-label` is the in-panel sub-heading: uppercase, tracked,
muted, the one treatment for that role. `.empty-state` is the "nothing here"
paragraph. Each of these lives in `base.css` rather than a per-feature sheet,
because a per-feature copy drifts from the others. In a new switch, list
row, or group heading, reuse the class, and keep only layout (margins, grid
placement) in its own component class. Badges everywhere pad
`0 var(--space-1)`.

### Overlay tokens

`--overlay-bg`, `--overlay-text`, and `--overlay-npc` in `base.css` are
pinned dark in both themes, because map controls, toasts, tooltips, and the
onboarding scrim float over map art rather than over the page background, so
they do not follow `light-dark()`. Derive translucent variants through
`color-mix` from the same tokens, instead of restating the hex value.

## Testing

Pure logic takes its side effects (RNG, the current time, and so on) as
arguments and returns data, so it can be unit tested with `node --test` and
no DOM. Thin wrapper code then wires that logic to the DOM or canvas, and
that wrapper code is verified visually instead. The split, area by area:

| Pure, unit-tested | DOM glue, verified visually |
| --- | --- |
| `roll(selection, rng)` | `ui/DiceTray.js` |
| `MapNavigator`, `RegionGroups`, `FogOfWar`, `PartyTracker` | `MapCanvas`'s event handlers |
| `Creature`, `Resource`, `Character` | `ui/CharacterSheet.js`, `ui/InventoryPanel.js`, `ui/EncounterPanel.js` |
| `SaveManager`'s serialize/deserialize/toTileGrid | its localStorage/download/file wrappers |
| `combat/AttackResolve.js` | `app/weaponAttack.js`'s dialog and dice tray |
| `entities/ItemDraft.js`, `entities/SpellDraft.js` | `ui/ItemForm.js`, `ui/SpellForm.js` |
| `view/StatBars.js`, `view/Shortcuts.js` | `ui/CharacterBars.js`, `app/shortcuts.js` |
| `map/NodeEdits.js`, `map/NodeCleanup.js`, `storage/SaveNotices.js` | `app/nodeActions.js`, `app/campaignActions.js` |

The bottom four rows all split a wiring module the same way. Make the same
split whenever you touch one, because the decision a piece of glue makes
usually does not need the DOM at all: a submit handler that reads six inputs
and builds an object is a control read plus a pure function, and a keydown
handler is a lookup plus a click. The part with the rules then goes under
test, and the part that cannot be tested stays as small as possible.
`pnpm coverage` shows which modules still need this split.

See `docs/testing.md` for the practical steps:

- how to run single test files
- how to read the coverage report
- what the pre-commit hook does
- how to verify a change visually against the dev server
