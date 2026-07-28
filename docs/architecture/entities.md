# Entities

*Back to the [architecture overview](../architecture.md).*

`src/entities/` holds the three things a campaign's rules operate on:
encounters, resource pools, and characters. All three follow one update style,
described first below. The rest of the page covers the character model, which
is by far the largest of the three.

## The shared shape: immutable updates

`entities/Encounter.js`, `entities/Resource.js`, and `entities/Character.js`
(types in `src/types/entities.ts`) are all plain immutable-update modules.
Every function takes a value and returns a new one rather than mutating:

```js
const hurt   = applyDamage(encounter, 7);   // new encounter, old one untouched
const rested = restore(pool, 2);            // new resource pool
const leveled = addXP(character, 250);      // new character
```

This is the same style `TileGrid.js` uses for tiles (`setTile`,
`updateTileMetadata`), and it is what lets the app cache derived data against
object identity: a value that has been handed out never changes underneath a
cache.

A few behaviors are baked into the models rather than validated separately:

- HP and resource pools clamp to `[0, max]` on every operation, so no caller
  can overheal or drive HP negative.
- `Character.addXP` uses an `N * XP_PER_LEVEL` (100) cost curve and loops
  internally, so one large XP award can cross several level thresholds in a
  single call.
- A character's resources and inventory are looked up by id from within
  `Character.js`: `spendResource`/`restoreResource` delegate to the matching
  `ResourcePool` via `Resource.js`, and `addItem`/`removeItem` merge or split
  inventory stacks by item id, dropping a stack once its quantity hits 0.

## The character foundation

On top of its stats and inventory, a `Character` carries a class list, a
race, a background, proficiency lists, hit dice, and a level-up flow. Each of
those is a pure module beside `Character.js`, following the same
take-a-value-return-a-value shape.

```
  data catalogs (plain data, no logic)
    data/classes.js      hit die, proficiencies, skill choices, caster type,
                         subclass level, ASI levels, features-by-level
    data/races.js        races and their traits
    data/backgrounds.js  backgrounds
    data/skills.js       the 18 skills' abilities
          |
          v
  entity modules (pure logic over character values)
    Classes.js           caster surface: spellSaveDC, spellAttackBonus,
                         cantrip/prepared limits
    Multiclass.js        the class-list accessor (see below)
    Races.js             resolveRace: catalog first, stored snapshot fallback
    Backgrounds.js       resolve a stored id to its definition
    Proficiencies.js     assemble + edit the six proficiency lists
    HitDice.js           max HP derivation, hit dice as resource pools
    LevelUp.js           pending levels, ASI/feat choices
    LevelAssign.js       commit a pending level to a class
          |
          v
    Character.js         the character value itself; withDefaults is the
                         load-time migration point
```

The split matters when you go looking for something: the catalogs hold what a
class or race *is*, and the entity modules hold what happens when a character
*has* one. The catalogs' shapes are declared in `types/class.ts` and
`types/race.ts`.

### Classes and multiclassing

`entities/Multiclass.js` is the class-list accessor. `getClasses` returns the
memberships (folding an older save's scalar `class`/`subclass` into a
one-entry list at read time), `withClasses` sanitizes writes, and
`primaryClass`/`classLevelOf`/`pendingLevels` read across the list.
Everything class-aware goes through it rather than touching
`character.classes` directly. That is what keeps the single-class and
multiclass paths identical: a fighter is just a character whose class list has
one entry.

`entities/Races.js` and `entities/Backgrounds.js` resolve a stored id to its
definition, with `resolveRace` preferring the live catalog and falling back to
a stored `raceTraits` snapshot, so a hand-typed or since-deleted race still
round-trips.

### Proficiencies

`entities/Proficiencies.js` assembles the six proficiency lists plus expertise
from class + race + background (`assembleProficiencies`) and applies or
hand-edits them (`withProficiencies`, which keeps expertise a subset of
skills). The `isProficient*`/`hasExpertise` predicates return `false` for a
legacy character with no lists.

### Hit points and hit dice

`entities/HitDice.js` derives max HP from the class hit die plus CON modifier
per level (`classMaxHP`, the 5e average rule) and models hit dice as spendable
resource pools sized to the assigned class levels: `withHitDice` creates them,
`syncHitDice` re-derives them keeping the spent count, and `spendHitDie` heals
on a short rest.

### Leveling up

`entities/LevelUp.js` and `entities/LevelAssign.js` run the level-up flow.
`addXP` leaves each earned level *pending* for a classed character rather than
applying it silently, and `assignLevel` commits a pending level to a chosen
class: growing HP, adding a hit die, and advancing spell slots. Crossing a
class ASI level leaves a pending improvement, spent later by `applyASI` or
`takeFeat`. A choice is stored against the class and class level that earned
it — `slotKey` builds that key — so a slot can hold at most one, and each
choice carries the order it was made in for `undoLastChoice` to read.

### Loading old saves

`entities/Character.js`'s `withDefaults` is the one load-time migration point. It
folds all of the above onto an older save: a legacy scalar class becomes a
list, a missing proficiency scaffold is created empty, a race string is
preserved. `campaign/Campaigns.js` maps every loaded character through it.

## The UI layer over entities

`ui/CharacterSheet.js`, `ui/InventoryPanel.js`, and `ui/EncounterPanel.js` are
the DOM-wiring layer over these modules, following the same mount-function
pattern as `ui/DiceTray.js`: each holds a local mutable copy of its entity,
re-renders after every interaction, and reports the updated value through an
`onChange` callback for a caller to persist. The sheet re-renders by writing
values into the DOM it already has whenever the shape has not changed, which is
described in
[UI components](ui-components.md#the-character-sheets-structure-check).

The sheet's parts live in their own modules: the ability badges and their
breakdown popover in `ui/CharacterStatBadge.js`, the HP bar and slot pips in
`ui/CharacterBars.js`, the castable-spell list in `ui/CharacterSpells.js`, and
the progression surface (class rows with subclass, the pending-level class
assignment, pending ASI/feat choices, unlocked features, and the hit-dice pool)
in `ui/CharacterProgress.js`. The background name and the assembled
proficiency lists are stored but not rendered there yet; they are meant to
appear inside saving-throw and skill blocks rather than as a static list.
