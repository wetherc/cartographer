# Conventions

*Reference. Back to the [architecture overview](../architecture.md).*

These patterns keep the hot paths fast, the UI coherent, and the tests
runnable. Each convention exists because code drifted or cost something at
least once, and each records a decision already made rather than a goal to
reach.

## Performance

Most collections (characters, creatures, quests, handouts, library
templates) are small, and their linear scans cost little in absolute terms,
so leave them alone until a real need appears. Cost concentrates in a small
number of places, each with an established pattern that new code in the
same area follows.

### Canvas redraws coalesce through one requestAnimationFrame

`MapCanvas.render()` only *schedules* a frame. Bursts of pointermove and wheel
events, and multi-setter updates such as the party-marker sync, collapse into
one redraw. Within a frame, `MapRenderer` gathers shared derived data into one
`frame` object. Every render pass reads that object, so a new render pass
reads from it or extends it rather than re-scanning `node.tiles`.

Per-frame DOM chrome hanging off the render loop (`MapControls.update` through
`onViewChange`) compares the new value against what it last wrote and skips
the DOM write when nothing changed. `mapWiring.js`'s `refreshMapDescription`
does the same for the text of the map's screen-reader live region, where the
comparison buys correctness as well as speed, because a rewrite of a live
region's text node re-announces it to a screen reader even when the text is
unchanged.

### Per-tile lookups go through TileIndex

`src/map/TileIndex.js` keeps a WeakMap-cached layout for each node.
`tileAt(node, id)` resolves an id and `tileAtXY(node, x, y)` resolves a grid
coordinate, both at O(1) with no allocation. New code that resolves tiles in
a loop (painting, fog, hit-testing) uses these functions instead of scanning
the flat `tiles` array.

The cache is safe because the code replaces nodes immutably on every tile
mutation, so a stale node object can never serve a fresh read. The reverse is
a requirement: a new mutation path keeps replacing the node, because mutating
tiles in place breaks the layout.

The layout contains only position data, an id-to-position map plus a flat
cell-to-position buffer over the node's extent, and no tiles at all. This
lets a mutation hand the new node the previous node's maps instead of
re-indexing from scratch. `withTileReplaced`, `withTilesReplaced`, and
`withTileAppended` are the three helpers that pass the layout forward.
`setTile` and the fog writers build on these three helpers. As a result, a
paint or fog drag costs O(cells crossed) across the whole stroke, instead of a
full re-index for each cell. Measured on a 40-cell drag: 1.74 ms falls to 0.05
ms at 30x30, and 30.0 ms falls to 0.10 ms at 100x100. A mutation that
*removes* a tile shifts every later position, so it still rebuilds the index.

The code records appends in override maps private to the new node and never
writes them into the shared base, so two nodes that branch off one parent can
never see each other's tiles. A stroke plus its pre-stroke undo snapshot is
exactly two nodes that share one parent. In a new mutation helper, route
through those three helpers, or hand the finished list to `withNodeTiles`,
which leaves the new node uncached and is correct in every case at the cost
of one rebuild.

### Tiles are frozen once a node contains them

`src/map/TileFreeze.js` enforces the rule at runtime by freezing a tile as it
enters a node, so a later write to that tile raises a `TypeError` at the
write instead of leaving a render that silently disagrees with the state. The
three per-cell helpers freeze the tile they receive, and `withNodeTiles`
freezes the list and its contents.

Freezing a *tile* is bounded work, but freezing an *array* walks each of its
elements, so the per-cell helpers leave the list writable and the code
protects membership only when a node is entered. Freezing also covers the
tile's `metadata` record and an `overlayRef` stack, because the code hands
out both by reference.

`createTile` does not freeze a tile, because the generators build a layout by
mutating freshly created tiles and only then hand the list over, which stays
legal while no node contains those tiles.

Freezing is on in development and off elsewhere, because a throw that reaches
a GM mid-session is worse than the stale render it replaces.
`setTileFreezing` overrides this detection.

### Per-node derived data is WeakMap-cached

The revealed-id set (`MapRenderer.js`), span blocks (`TilePaint.spanBlocks`),
region groups (`RegionGroups.findRegionGroups`), and group image chunks
(`groupImageChunks`) all follow the TileIndex pattern. Each is a pure function
of an immutable node, and each caches its result under the node object as the
key. This pattern covers anything a hot path recomputes that the code can
derive from a node alone. The returned arrays and sets are shared, so treat
them as read-only.

Chunks are the one entry with a narrower key than the node: their key is the
group object, which the group cache keeps stable for each node and stamps
with `node.tiles`. A chunk's contents depend only on the group's geometry and
on its member tiles' art. Keying chunks on the node instead would break reuse
across a stroke, because a stroke replaces the node for each cell while the
canvas's groups stay memoized against the pre-stroke node. Key a derived
value on what it actually reads, and when part of that is a node field, stamp
the field onto the key instead of nesting the key inside the node.

The tile pass itself iterates only the visible cell range: it inverts the
view transform once, then looks up cells by coordinate. This keeps the pass at
O(visible), never at O(total tiles). It parses no regular expression for each
tile in each frame, and builds and hashes no id string for each visible cell
in each frame.

Derived data keeps the coordinates it already parsed, so the reader does
not parse them again. For example, a region group has a `cells` array that
is index-aligned with its `tileIds`. This lets the overlay's clip path walk a
group's revealed members with no parse and no allocation for each tile. The
renderer's block and marker passes follow the same rule. When a pass consumes
a rect immediately, the code computes it as arithmetic on the cell extent,
not as a `tileRect` object. These passes run for each block and each marker
in every frame. `tileRect` remains the right choice for chrome that
runs once for each frame (selection, cursor, marquee, keyboard
scroll-into-view). The code releases anything a pass memoizes against the view
snapshot at the end of the frame (`MapMarkers.releaseFrame`). As a result, an
idle map keeps no reference to the finished view or to the node behind it.

The same pattern covers the combat rosters. `combatants.js` memoizes an
id-index Map for each characters or creatures array. This is safe because
every mutation goes through `replaceById`, which replaces the array. As a
result, participant lookups during a fight run at O(1), with no explicit
invalidation step.

### Strokes defer derived work to the stroke's end

A paint, erase, or fog drag updates each cell through
`MapCanvas.refreshNodeTiles`, which only swaps the node and redraws. The
region-group recompute and the screen-reader map description settle once, in
`onStrokeEnd` (`mapAuthoring.js`). Before you add per-cell gesture work, check
whether anyone can observe that work mid-drag. If not, defer it the same way.

### Fog reveals iterate the radius only

`revealAround` iterates the radius's bounding square by coordinate, and copies
the tile array once. It also returns the *same* node object when nothing was
newly revealed. As a result, the WeakMap caches above stay warm on a party
step through explored ground. Other hot-path mutation helpers preserve
identity on a no-op, for the same reason.

### Persistence writes the change, not the campaign

A save writes the campaign string once, and appends one delta that describes
the edit (`storage/HistoryLog.js`). The snapshot ring this replaced first
copied the previous save's whole string to a second key. That cost 70,488
bytes for each save, against 139,996 bytes for the example campaign. The code
caches the previous state a delta needs in memory, stamped with the raw string it was
parsed from. As a result, the steady state costs one `getItem` call and one
string compare, instead of a parse.

Code that touches save and history paths must keep this pattern. Never parse
and restringify a whole campaign for each write. Respect the byte cap and the
quota fallbacks already in place (drop the oldest steps first, then the log).

### Growing lists render incrementally

The travelogue panel builds its DOM skeleton once, then prepends only the
entries newer than the last-rendered id (pure `entriesAfter`,
`src/log/Travelogue.js`). It rebuilds only when that anchor id vanishes (the
log is cleared or replaced). The same diff-by-anchor-id approach fits any
append-mostly list, and it performs better than clearing and rebuilding the
list for each event.

### Derived merged lists are memoized at their single mutation point

The library's `active*` getters cache their merged defaults-plus-customs
lists in module state. Only `setActiveLibrary` (`src/library/Library.js`)
invalidates this cache, and every mutation path already routes through it.
The projections over these lists (entry-only lists, filters for each type,
the spell id index) live in the same cache object. As a result, a getter
never re-allocates data on a repeat call. A further derived collection (the
planned feat catalog) must hang off the same cache-and-invalidate point,
rather than re-merge data for each call.

Callers treat the returned arrays as read-only, because the code shares them.
The three built-in catalogs behind them (`defaultEquipmentTemplates()`,
`DEFAULT_CREATURES`, `DEFAULT_SPELLS`) are `deepFreeze`d
(`src/util/deepFreeze.js`), so the code enforces this contract instead of
only documenting it. A path that copies library data into campaign state
says so by name, which is why `Creature.fromTemplate`,
`Library.activeEnemyArmor`, `EquipmentPresets.copyEnemyWeapon`, and
`Character.copySpellbook` exist.

## UI and style

New code follows these patterns instead of deciding the same question again
locally. [UI components](ui-components.md) lists the components and tokens
they apply to.

### CSS custom properties are the only source of design values

Color, spacing, radius, and type values all come from custom properties, and
all of these properties live in `styles/base.css`. Never write an inline
fallback (`var(--border, rgba(...))`), because a reference to a token that
does not exist renders as nothing, which is visible, while a fallback hides
the typo.

If a needed token does not exist (for example, a contrast color for a new
accent), add it to `base.css` as a `light-dark()` pair next to its relatives.
Every `*` accent token has a matching `*-contrast` token for text drawn on top
of it.

### Dialog discipline

Use `confirmModal` only for questions with two real answers. For pure
notifications, use `alertModal` (blocking, needs acknowledgment) or
`app.toasts.show` (non-blocking, self-dismissing). Never use a confirm dialog
with a dead Cancel button. Give the same event the same presentation everywhere:
a no-op undo is a toast, no matter which undo stack it came from.

### Every destructive action confirms first

For plain entity deletes, use `confirmDelete(name, detail?)` (`Modal.js`).
This function owns the `Delete "X"?` wording and the danger-styled Delete
button, so no call site restates the options object. Some deletes have a
message that this wording cannot give: a node's "and everything inside it",
or the library's revert-versus-delete pair. Non-delete destruction (Discard,
Replace, Reset) also does not fit this wording. For these cases, still use
`confirmModal`, with `danger: true`, an imperative `confirmLabel`, and the
affected item named in the message.

This rule applies to any action that throws away more state than one click
created. It includes bulk variants (remove-all, clear) of actions that are
otherwise safe as single steps.

### Buttons and empty states come from src/ui/buttons.js

`iconButton` and `textButton` own the `btn` class assembly. They always set
an aria-label on icon-only buttons, and default the hover `title` to that
label. The approximately 40 hand-rolled copies they replaced had drifted on
exactly these attributes. `emptyState(message)` is the one "nothing here"
paragraph. `segSwitch` is the one segmented group of mutually exclusive
buttons. It owns the pairing of the active class with `aria-pressed`. Each of
its four call sites used to repeat that pairing on its own. A control that is a
button for the keyboard but has no `btn` chrome, a tab or a tree row for
example, is a `bareButton` with its own class. A new panel builds no `<button>`
element of its own.

### Numbers off a form or a file go through src/util/num.js

`clampInt(value, min, max, fallback)` floors a value, clamps it, and reads
anything it cannot parse (blank, text, `undefined`, zero) as `fallback`.
`fallback` defaults to `min`.

For a whole value that has several such fields, add a named normalizer beside
the constants it checks against. Do not add a second copy of the coercion at
each reader. `Equipment.normalizeDamagePart` is the function that both the
library importer and the item form's damage editor call. As a result, the
code checks the supported die sizes and damage types in one place.

### Destructive controls are danger-styled and always visible

A delete, discard, or clear button passes `variant: 'danger'`, and no such
button is ever hover-revealed. Hiding a destructive control until hover makes
it hard to discover without making it safer, because the confirm dialog is
the protection.

### Dismiss-left, primary-right, everywhere a dismiss exists

Modals, inline forms (`formFields.buildInlineForm`), the spell-detail action
bar, and the inventory give form all order Cancel or Close on the left. Each
of these puts the affirmative action on the right, and a new form keeps the
same order.

### Damage is a minus, healing is a cross

Use `icon('minus')` and `icon('heal')` wherever HP moves. The character
sheet's steppers and the encounter panel's amount buttons share this pair,
in danger red and success green. The team tried a pictorial glyph (a sword)
for damage, then reverted it: a subtract or add symbol reads instantly, and
an icon does not. The sword stays reserved for attack actions (the combat
screen's action bar and its foe markers), not for HP arithmetic.

### Recurring widget styles live in base.css, not per-feature sheets

`.seg-switch` is the segmented toggle (mode, theme, and role switches, the
dice tray's d20 mode). `.row-select` is the selectable list row (world tree,
roster). `.section-label` is the in-panel sub-heading: uppercase, tracked,
muted, the one treatment for that role. `.empty-state` is the "nothing here"
paragraph. Each of these classes replaced two to four blocks that were
identical or had drifted, one per feature. In a new switch, list row, or
group heading, reuse the class, and keep only layout (margins, grid
placement) in its own component class. Badges everywhere pad
`0 var(--space-1)`.

### Over-map chrome uses the --overlay-* tokens

`--overlay-bg`, `--overlay-text`, and `--overlay-npc` in `base.css` are
deliberately pinned dark in both themes. Map controls, toasts, tooltips, and
the onboarding scrim float over map art, not over the page background, so they
do not follow `light-dark()`. Derive translucent variants through
`color-mix` from the same tokens, instead of restating the hex value.

## Testing

Pure logic takes its side effects (RNG, the current time, and so on) as
arguments and returns data, so it can be unit tested with `node --test` and
no DOM. Thin wrapper code then wires that logic to the DOM or canvas, and the
team verifies that wrapper code visually instead. The split, area by area:

| Pure, unit-tested | DOM glue, verified visually |
| --- | --- |
| `roll(selection, rng)` | `ui/DiceTray.js` |
| `MapNavigator`, `RegionGroups`, `FogOfWar`, `PartyTracker` | `MapCanvas`'s event handlers |
| `Encounter`, `Resource`, `Character` | `ui/CharacterSheet.js`, `ui/InventoryPanel.js`, `ui/EncounterPanel.js` |
| `SaveManager`'s serialize/deserialize/toTileGrid | its localStorage/download/file wrappers |
| `combat/AttackResolve.js` | `app/weaponAttack.js`'s dialog and dice tray |
| `entities/ItemDraft.js`, `entities/SpellDraft.js` | `ui/ItemForm.js`, `ui/SpellForm.js` |
| `view/StatBars.js`, `view/Shortcuts.js` | `ui/CharacterBars.js`, `app/shortcuts.js` |
| `map/NodeEdits.js`, `map/NodeCleanup.js`, `storage/SaveNotices.js` | `app/nodeActions.js`, `app/campaignActions.js` |

The bottom four rows all split a wiring module the same way, and the split
is worth making deliberately whenever you touch one, because the decision a
piece of glue makes usually does not need the DOM at all: a submit handler
that reads six inputs and builds an object is a control read plus a pure
function, and a keydown handler is a lookup plus a click. The part with the
rules then goes under test, and the part that cannot be tested stays as
small as possible. `pnpm coverage` shows which modules still need this
split.

See `docs/testing.md` for the practical steps:

- how to run single test files
- how to read the coverage report
- what the pre-commit hook does
- how to verify a change visually against the dev server
