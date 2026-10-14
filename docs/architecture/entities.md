---
---
# Entities

*Explanation. Back to the [architecture overview](../architecture.md).*

`src/entities/` contains the values that the campaign's rules act on:
creatures, resource pools, and characters. Every module in the directory is
pure logic, and every write returns a new value. The plain data catalogs that
these modules read (classes, races, backgrounds, skills, spells, feats, the
challenge-rating tables, and the built-in creatures) live in `src/data/`.

Each topic has its own guide:

| Guide | What it covers |
| --- | --- |
| [Creatures](creatures.md) | The creature model: AC, placement and templates, defeat, the challenge rating, saves and skills, creature types, damage defenses, and creature casters |
| [Characters](characters.md) | The character foundation: derived pools, classes and multiclassing, proficiencies, hit points, leveling up, feats, class features, and the warlock options |
| [Weapons and armor](weapons-and-armor.md) | Damage terms, the weapon property model, armor class and its chips, and armor and weapon proficiency |
| [Spells and casting](spells.md) | Spell effects, spell timing, multi-projectile spells, material components, ritual casting, and known and prepared casters |
| [Rolls and lasting states](rolls-and-states.md) | Saving throws and ability checks, exhaustion, concentration, and death saves |
| [Effects that spells leave](spell-aftermath.md) | Conditions a spell imposed, effects on later turns, effects of a hit, hit-point rules, summoned creatures, condition effects, and riders |

This page covers [Immutable updates](#immutable-updates), which every
entity module follows, and
[the UI layer over entities](#the-ui-layer-over-entities).

The fight itself, with its turn order and action budget, is in
[Combat](combat.md).

## Immutable updates

`entities/Creature.js`, `entities/Resource.js`, and `entities/Character.js`
(types in `src/types/creature.ts` and `src/types/entities.ts`) are
immutable-update modules. Each function takes a value and returns a new
value, and it does not change the original:

```js
const hurt   = applyDamage(creature, 7);    // new creature, old one untouched
const rested = restore(pool, 2);            // new resource pool
const leveled = addXP(character, 250);      // new character
```

`TileGrid.js` uses the same style for tiles (`setTile`,
`updateTileMetadata`). This style lets the app cache derived data against
object identity, because a value that the app already returned never changes
under a cache.

The models include these behaviors directly rather than validating them
separately:

- HP and resource pools stay within `[0, max]` on every operation. No caller
  can overheal or drive HP negative.
- A character's `xp` is the total XP earned. `Character.addXP` reads the
  level from the SRD table in `Experience.js`, the same scale as the CR XP
  values and the encounter thresholds. One large XP award can cross several
  level thresholds in a single call, and the load path raises a total below
  the start of the stored level to that start.
- `Character.js` looks up a character's resources and inventory by id.
  `spendResource` and `restoreResource` delegate to the matching
  `ResourcePool` through `Resource.js`. `addItem` merges a new item into a
  stack only when every field other than the id and the quantity matches
  (`sameStack`), and an item that matches no stack gets a fresh id from
  `slugId` when its own id is taken. `removeItem` splits a stack by item id,
  and each stack drops once its quantity reaches 0.

### Reserved resource pools

HP, spell slots, pact slots, and hit dice are ordinary `ResourcePool`s under
ids that the app reserves, so spending a spell slot and spending an arrow run
through the same `spend`/`restore` code.

`entities/PoolIds.js` defines those ids: `hp`, the `slots-` and `pact-`
prefixes, the `hit-dice-d` prefix, and the ids of the class-feature pools
(`second-wind`, `rage`, `ki`, and the others in `CLASS_POOL_IDS`). The module imports nothing, so the
three modules that own the rules for the pools (`Character.js`,
`SpellSlots.js`, and `HitDice.js`) can all import it without an import cycle.
Each of the three re-exports the ids that it owns, so callers import
`HP_RESOURCE_ID` from `Character.js`.

A pool is reserved when its maximum is derived rather than typed in. The
deriving writers move a maximum through `Resource.js`:

- `adjustMax(pool, max)` moves the maximum and shifts the current value by
  the same amount. A CON increase grants the hit points instead of only
  raising the ceiling. This is the re-derive rule (`HitDice.reconcileMaxHP`,
  `addXP`).
- `growMax(pool, max)` passes on a gain but never refunds a loss. A level-up
  hands over new slots unspent, but losing capacity does not un-spend a die.
  This is the keep-what-is-spent rule (`syncSlotsToLevel`, `syncHitDice`).
- `spliceReservedPools(resources, next, owns, after?)` swaps a whole family of
  pools for a freshly derived set. It puts the new set back where the first
  pool sat, so the order that the resource card reads in stays the same. When
  no pool of the family is present, it follows the pools named by `after`.

`Roster.js`'s `updateById(list, id, fn)` is the helper for the by-id patch,
and the resource and inventory writers call it instead of spelling the patch
out inline.

## The UI layer over entities

`ui/CharacterSheet.js`, `ui/InventoryPanel.js`, and `ui/EncounterPanel.js` are
the DOM layer over these modules. They follow the same mount-function pattern
as `ui/DiceTray.js`. Each keeps a local mutable copy of its entity, renders
again after every interaction, and reports the new value through an
`onChange` callback for a caller to save. When the structure has not changed,
the sheet renders by writing values into the DOM that it already has, as
[UI components](ui-components.md#the-character-sheets-structure-check)
describes.

The parts of the sheet have their own modules:

| Module | Part |
| --- | --- |
| `ui/CharacterStatBadge.js` | The ability badges and their breakdown popover |
| `ui/CharacterBars.js` | The HP bar and the slot pips (the elements and the update loop) |
| `ui/CharacterHead.js` | The headline lines of the sheet: the HP line with its Damage and Heal steppers, the slot pips, and the banner of level, AC, speed, initiative, passive Perception, proficiency, exhaustion, and XP |
| `ui/FullSheet.js` | The full-page view of the sheet: the party switcher and Back to the map. It moves the sheet card into its body while open, and `view/SheetSwitcher.js` decides the arrow-key moves of the switcher. In the sidebar the card is a summary: `styles/sheet-summary.css` hides the tab strip and every piece that the sheet marks `sheet-full-only`, and the full sheet hides the pieces marked `sheet-summary-only` |
| `ui/CharacterLevelBanner.js` | The level-up banner at the top of the sheet, and the level-up text that the party roster also shows |
| `ui/InventoryEquipment.js` | The paperdoll of the Equipment tab and the item picker that a slot card opens. `view/EquipSlots.js` lists the items a slot can take and writes the short stat line of a card and the detail line of a picker option |
| `ui/InventoryPanel.js` | The Inventory tab: the search box, the item tiles under one heading per type, and the detail pane with the full row of the chosen item. `view/ItemTiles.js` writes the tile text and picks the item that the pane shows |
| `ui/SpellbookPanel.js` | The Spellbook tab: the spell cards under one heading per level. `view/SpellCards.js` writes the line of a card and the free slot count of a level heading |
| `ui/CharacterChecks.js` | The saves, the skills, passive Perception, and the quick-roll grid of plain ability checks and saves on the summary card |
| `ui/CharacterSpells.js` | The castable-spell list |
| `ui/CharacterConditions.js` | The condition chips, the held concentration, the exhaustion pips, and the death-save block |
| `ui/CharacterProgress.js` | The class rows with subclass, the pending-level assignment, pending ASI and feat choices, feature grants, and the hit-dice pool |
| `ui/CharacterFeatures.js` | The Features section: one card per class feature, race trait, and feat, with the Change button of a claimed feature grant. `view/FeatureCards.js` groups the cards and writes the detail line of a feat |
| `ui/LevelAssignFlow.js` | The dialogs of assigning a level: class, multiclass skills, subclass, and feature picks |
| `ui/ImprovementFlow.js` | The dialogs of an ability score improvement or a feat |

`view/StatBars.js` decides what the HP bar and the slot pips *say*: the fill
percentage, the low-HP threshold, the column headings, the free count of a
slot line, such as "2 of 3", and every string that a screen reader gets.
`view/LevelUpCue.js` writes the text of the level-up banner from the counts
of pending levels, improvements, and feature choices.

The two Library authoring forms split the same way. `ui/ItemForm.js` and
`ui/SpellForm.js` read their controls, and `entities/ItemDraft.js` and
`entities/SpellDraft.js` decide what the values mean. `assembleItem` and
`assembleSpell` take the strings and booleans of a form and return the
finished item or spell. They drop the fields that the chosen type or effect
kind does not use, so a type change before submit cannot leave armor fields on
a rope or a save ability on an attack. `assembleSpell` applies the two form
gates (a save that deals no damage, an attack that fires no projectiles) and
then calls `SpellEntry.normalizeSpellBody`, the same repair that a library
import runs through `normalizeSpell`. So a typed spell and an imported spell
read a value the same way.

The app stores the background and the assembled proficiency lists, but the
sheet shows only part of them. Save and skill training shows in the check rows
of `ui/CharacterChecks.js`. The background name and the weapon, armor, tool,
and language lists do not show on the sheet.
