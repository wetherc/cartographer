# Conventions

*Back to the [architecture overview](../architecture.md).*

The patterns that keep the codebase consistent: how the hot paths stay fast,
how the UI stays coherent, and how code gets tested. Every convention here
earned its place by drifting or costing something at least once, so each one
records a decision already made rather than a goal.

## Performance

Most collections
(characters, encounters, NPCs, quests, handouts, library templates) are
small-n, and their linear scans are cheap in absolute terms. Leave them alone
rather than optimizing preemptively. Cost concentrates in a handful of places,
each with an established pattern that new code touching the same area should
follow.

### Canvas redraws coalesce through one requestAnimationFrame

`MapCanvas.render()` only *schedules* a frame. Bursts of pointermove and wheel
events, and multi-setter updates like the party-marker sync, collapse into a
single redraw. Within a frame, `MapRenderer` gathers shared derived data into
one `frame` object that every render pass reads. Pull a new render pass from
that object, or extend it, rather than re-scanning `node.tiles`.

Per-frame DOM chrome hanging off the render loop (`MapControls.update` via
`onViewChange`) compares against what it last wrote and bails before touching
the DOM when nothing changed. `mountMapDescription` does the same with the
text of the map's screen-reader live region, where the comparison buys
correctness as much as speed: rewriting a live region's text node re-announces
it to a screen reader, so a write that changes nothing is an interruption
rather than an update.

### Per-tile lookups go through TileIndex

`src/map/TileIndex.js` keeps a WeakMap-cached layout per node: `tileAt(node,
id)` resolves an id and `tileAtXY(node, x, y)` a grid coordinate, both O(1)
and neither allocating. Any new code that resolves tiles in a loop (painting,
fog, hit-testing) should use these instead of scanning the flat `tiles` array.

The cache is safe because nodes are replaced immutably on every tile mutation:
a stale node object can never serve fresh reads. That makes the reverse a hard
requirement: any new mutation path must keep replacing the node rather than
mutating tiles in place, or the layout breaks.

What the layout holds is positional (an id-to-position map plus a
flat cell-to-position buffer over the node's extent) and holds no tiles at
all, because that is what lets a mutation hand the new node the previous
node's maps rather than re-index from scratch. `withTileReplaced`,
`withTilesReplaced`, and `withTileAppended` are the three helpers that carry
the layout forward, and `setTile` plus the fog writers are built on them, so a
paint or fog drag costs O(cells crossed) across the whole stroke instead of a
full re-index per cell. Measured on a 40-cell drag: 1.74 ms down to 0.05 ms at
30x30, and 30.0 ms down to 0.10 ms at 100x100. A mutation that *removes* a
tile shifts every later position and so still rebuilds.

Appends are recorded in override maps private to the new node, never written
into the shared base, so two nodes branching off one parent can never see each
other's tiles. That branching case is not hypothetical: a stroke plus its
pre-stroke undo snapshot is exactly two nodes sharing one parent. New mutation
helpers should either route through those three or hand their finished list to
`withNodeTiles`, which leaves the new node uncached: correct in every case, at
the cost of one rebuild.

### Tiles are frozen once a node holds them

That invariant is enforced at runtime. `src/map/TileFreeze.js` freezes
a tile as it enters a node, so a later write to it is a `TypeError` at the
write instead of a render that silently disagrees with state. The three carry
helpers freeze the tile they were handed, and `withNodeTiles` freezes the list
and its contents.

Freezing a *tile* is bounded work; freezing an *array* walks its elements.
That is why the per-cell helpers deliberately leave the list writable, and why
membership protection is applied only when a node is entered. Freezing covers the
tile's `metadata` record and an `overlayRef` stack too, since both are handed
out by reference.

`createTile` does not freeze: the generators build a layout by mutating
freshly created tiles and only then hand the list over, which stays legal
because no node holds those tiles yet.

Freezing is on in development and off elsewhere, because a throw reaching a GM
mid-session is worse than the stale render it replaces. `setTileFreezing`
overrides the detection.

### Per-node derived data is WeakMap-cached

The revealed-id set (`MapRenderer.js`), span blocks (`TilePaint.spanBlocks`),
region groups (`RegionGroups.findRegionGroups`), and group image chunks
(`groupImageChunks`) all follow the TileIndex pattern: a pure function of an
immutable node caches its result keyed by the node object. That covers
anything derivable from a node alone that a hot path recomputes. The
returned arrays and sets are shared, so treat them as read-only.

Chunks are the one entry keyed on something narrower than the node: the group
object, which the group cache makes stable per node, stamped with
`node.tiles`. A chunk's contents depend on the group's geometry and its member
tiles' art and on nothing else the node carries. Keying them on the node meant
a stroke, which replaces the node per cell while leaving the
canvas's groups memoized against the pre-stroke node, could not reuse a chunk
for the whole stroke. So a derived value is keyed on what it actually reads,
and stamped rather than nested when part of that is a node field.

The tile pass itself iterates only the visible cell range (invert the view
transform once, look cells up by coordinate). That keeps it O(visible), never
O(total tiles), with no regex parse per tile per frame and no id string built
and hashed per visible cell per frame.

Derived data carries the coordinates it parsed rather than leaving the reader
to parse them again: a region group holds a `cells` array index-aligned with
its `tileIds`, which is what lets the overlay's clip path walk a group's
revealed members without a parse or an allocation per tile. The renderer's
block and marker passes follow from the same rule. A rect that is consumed
immediately is arithmetic on the cell extent, not a `tileRect` object, since
these run per block and per marker every frame; `tileRect` remains the right
call for the once-per-frame chrome (selection, cursor, marquee, keyboard
scroll-into-view). Anything a pass memoizes against the view snapshot is
released at the end of the frame (`MapMarkers.releaseFrame`), so an idle map
holds no reference to the finished view or the node behind it.

The same pattern covers the combat rosters: `combatants.js` memoizes an
id-index Map per characters/encounters array (safe because every mutation goes
through `replaceById`, which replaces the array), so participant lookups
during a fight are O(1) without any explicit invalidation.

### Strokes defer derived work to the stroke's end

A paint/erase/fog drag updates per cell through `MapCanvas.refreshNodeTiles`
(node swap plus redraw only); region-group recompute and the screen-reader map
description settle once in `onStrokeEnd` (`mapAuthoring.js`). Before adding
per-cell gesture work, check whether anyone can observe it mid-drag; if not,
defer it the same way.

### Fog reveals iterate the radius only

`revealAround` iterates the radius's bounding square by coordinate and copies
the tile array once. It also returns the *same* node object when nothing was
newly revealed, so the WeakMap caches above stay warm on a party step through
explored ground. Other hot-path mutation helpers preserve identity on a no-op
for the same reason.

### Persistence writes the change, not the campaign

A save writes the campaign string once and appends one delta describing the
edit (`storage/HistoryLog.js`); the snapshot ring it replaced copied the
previous save's whole string to a second key first, 70,488 bytes per save
against 139,996 for the example campaign. The previous state a delta needs is
cached in memory, stamped with the raw string it was parsed from, so the
steady state costs one `getItem` and one string compare rather than a parse.

Code touching save/history paths should keep that shape: never
parse-and-restringify a whole campaign per write, and respect the byte cap and
quota fallbacks (drop the oldest steps, then the log) already in place.

### Growing lists render incrementally

The travelogue panel builds its DOM skeleton once and prepends only entries
newer than the last-rendered id (pure `entriesAfter`, `src/log/Travelogue.js`),
rebuilding only when that anchor id vanishes (log cleared or replaced). The
same diff-by-anchor-id approach fits any append-mostly list, and beats
clearing and rebuilding per event.

### Derived merged lists are memoized at their single mutation point

The library's `active*` getters cache their merged defaults-plus-customs lists
in module state, invalidated only by `setActiveLibrary`
(`src/library/Library.js`), which every mutation path already routes through.
The projections over them (entry-only lists, per-type filters, the spell id
index) live in the same cache object, so a getter never re-allocates on a
repeat call. A further derived collection (the planned feat catalog) hangs off
the same cache-and-invalidate point rather than re-merging per call.

Callers must treat the returned arrays as read-only, since they are shared.
The four built-in catalogs behind them (`defaultEquipmentTemplates()`,
`DEFAULT_BESTIARY`, `DEFAULT_NPC_TEMPLATES`, `DEFAULT_SPELLS`) are
`deepFreeze`d (`src/util/deepFreeze.js`), so that contract is enforced rather
than documented. A path that instead copies library data into campaign state
has to say so, which is what `Encounter.fromTemplate`,
`Library.activeEnemyArmor`, `EquipmentPresets.copyEnemyWeapon`, and
`Character.copySpellbook` are for.

## UI and style

Patterns that keep the UI consistent. New code should follow them rather than
re-deciding locally. These are the policies; for the components and tokens they
apply to, see [UI components](ui-components.md).

### CSS custom properties are the only source of design values

Color, spacing, radius, and type values all come from custom properties, and
they all live in `styles/base.css`. Never write an inline fallback
(`var(--border, rgba(...))`). A `var(--surface-2)` that doesn't exist renders
as *nothing*, which is visible; a fallback hides the typo instead.

If a needed token doesn't exist (say, a contrast color for a new accent), add
it to `base.css` as a `light-dark()` pair next to its relatives; every `*`
accent token has a matching `*-contrast` token for text drawn on top of it.

### Dialog discipline

`confirmModal` is only for questions with two real answers. Pure notifications
use `alertModal` (blocking, needs acknowledgment) or `app.toasts.show`
(non-blocking, self-dismissing), never a confirm with a dead Cancel button.
The same event should get the same surface everywhere: a no-op undo is a
toast, whichever undo stack it came from.

### Every destructive action confirms first

Plain entity deletes use `confirmDelete(name, detail?)` (`Modal.js`), which
owns the `Delete "X"?` wording and the danger-styled Delete button, so no site
restates the options object. Deletes whose message doesn't fit that shape (a
node's "and everything inside it", the library's revert-vs-delete pair) and
non-delete destruction (Discard, Replace, Reset) still go through
`confirmModal` with `danger: true` and an imperative `confirmLabel`, with the
affected thing named in the message.

Anything that throws away more state than one click created qualifies,
including bulk variants (remove-all, clear) of otherwise safe single-step
actions.

### Buttons and empty states come from src/ui/buttons.js

`iconButton` and `textButton` own the `btn` class assembly, always set an
aria-label on icon-only buttons, and default the hover `title` to it. The ~40
hand-rolled copies they replaced had drifted on exactly those attributes.
`emptyState(message)` is the one "nothing here" paragraph. `segSwitch` is the one
segmented group of mutually exclusive buttons, and it owns the pairing of the
active class with `aria-pressed` that its four call sites each used to repeat. A
new panel should have no `document.createElement('button')` of its own unless it
is genuinely a different control (a tab, a chip, a select-like row).

### Numbers off a form or a file go through src/util/num.js

`clampInt(value, min, max, fallback)` floors, clamps, and reads anything
unparseable (blank, text, `undefined`, zero) as `fallback`, which defaults to
`min`.

One step up from that, a whole value with several such fields gets a named
normalizer beside the constants it validates against, not a second copy of the
coercion at each reader: `Equipment.normalizeDamagePart` is what both the
library importer and the item form's damage editor call, so the supported die
sizes and damage types are checked in one place.

### Destructive controls are danger-styled and always visible

A delete/discard/clear button passes `variant: 'danger'` and is never
hover-revealed. Hiding a destructive control until hover makes it
undiscoverable without making it safer; the confirm dialog is what makes it
safe.

### Dismiss-left, primary-right, everywhere a dismiss exists

Modals, inline forms (`formFields.buildInlineForm`), the spell-detail action bar,
and the inventory give form all order Cancel/Close on the left and the
affirmative action on the right. A new form surface must not invent a third
ordering.

### Damage is a minus, healing is a cross

`icon('minus')`/`icon('heal')`, wherever HP moves. The character sheet's
steppers and the encounter panel's amount buttons share the pair, danger-red
and success-green respectively. A pictorial glyph (a sword) was tried for
damage and reverted: subtract/add reads instantly, iconography doesn't. The
sword stays reserved for attack actions (the initiative panel's weapon strip),
not HP arithmetic.

### Recurring widget shapes live in base.css, not per-feature sheets

`.seg-switch` is the segmented toggle (mode/theme/role
switches, the dice tray's d20 mode), `.row-select` the selectable list row
(world tree, roster), `.section-label` the in-panel sub-heading (uppercase,
tracked, muted; the one treatment for the role), `.empty-state` the "nothing
here" paragraph. Each replaced two to four byte-identical or drifted
per-feature blocks; a new switch, list row, or group heading should reuse the
class and keep only layout (margins, grid placement) in its own component
class. Badges everywhere pad `0 var(--space-1)`.

### Over-map chrome uses the --overlay-* tokens

`--overlay-bg`, `--overlay-text`, `--overlay-npc` in `base.css` are
deliberately pinned dark in both themes: map controls, toasts, tooltips, and
the onboarding scrim float over map art, not the page surface, so they don't
follow `light-dark()`. Translucent variants derive via `color-mix` from the
same tokens rather than restating the hex.

## Testing

The recurring split across this codebase: **pure logic takes its side effects
(RNG, current time, and so on) as arguments and returns data**, so it can be
unit tested with `node --test` and no DOM. Thin wrapper code then wires that
logic to the DOM or canvas and is verified visually instead.

Some examples of the split, from each area:

| Pure, unit-tested | DOM glue, verified visually |
| --- | --- |
| `roll(selection, rng)` | `ui/DiceTray.js` |
| `MapNavigator`, `RegionGroups`, `FogOfWar`, `PartyTracker` | `MapCanvas`'s event handlers |
| `Encounter`, `Resource`, `Character` | `ui/CharacterSheet.js`, `ui/InventoryPanel.js`, `ui/EncounterPanel.js` |
| `SaveManager`'s serialize/deserialize/toTileGrid | its localStorage/download/file wrappers |

See `docs/testing.md` for the practical how-to: running single test files,
the pre-commit hook, and how to visually verify against the dev server.
