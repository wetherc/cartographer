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

### Reserved resource pools

HP, spell slots, pact slots, and hit dice are not special-cased types — they are
ordinary `ResourcePool`s under ids the app reserves, so spending a spell slot and
spending an arrow run through the same `spend`/`restore` code. `entities/PoolIds.js`
holds those ids (`hp`, the `slots-`/`pact-` prefixes, the `hit-dice-d` prefix) and
imports nothing, so the three modules that own the rules for them — `Character.js`,
`SpellSlots.js`, `HitDice.js` — can all read the same string no matter where they
sit in the import graph. Each re-exports the ids it owns, so `HP_RESOURCE_ID` is
still imported from `Character.js`.

What makes a pool reserved is that its maximum is derived, not typed in. Three
helpers in `Resource.js` cover what the deriving writers need:

- `adjustMax(pool, max)` moves the maximum and carries current by the same
  delta, so a CON increase grants the hit points instead of only raising the
  ceiling. This is the re-derive rule (`HitDice.reconcileMaxHP`, `addXP`).
- `growMax(pool, max)` carries a gain but never refunds a loss, so a level-up
  hands over new slots unspent while losing capacity does not un-spend a die.
  This is the keep-what-is-spent rule (`syncSlotsToLevel`, `syncHitDice`).
- `spliceReservedPools(resources, next, owns, after?)` swaps a whole family of
  pools for a freshly derived set, putting them back where the first one sat so
  the order the resource card reads in survives. With no pool of the family
  present it falls back to following the pools named by `after`.

`Roster.js`'s `updateById(list, id, fn)` is the matching helper for the by-id
patch, which the resource and inventory writers were each spelling out inline.

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

## Spell timing

A `Spell` (`types/spell.ts`) lives in the library rather than in a campaign
save, so it has no version number and no migration chain — see
[Persistence](persistence.md) for how the library merges. That is why its two
timing fields, `castingTime` and `duration`, are read rather than assumed.

Both are structured values, not text: a `castingTime` is a kind
(`action`, `bonus`, `reaction`, `minutes`, `hours`) with an amount for the
counted kinds and a trigger clause for a reaction, and a `duration` is a kind
(`instantaneous`, `rounds`, `minutes`, `hours`, `days`, `until-dispelled`) with
an amount and an `upTo` flag for a duration the caster can end early.
`entities/SpellTiming.js` holds the four functions over them:

- `parseCastingTime` / `parseDuration` accept either the structured object or
  the printed string an older library or a hand-written JSON file carries — `1
  bonus action`, `10 minutes`, `Concentration, up to 1 minute`. A
  `Concentration, ` prefix is dropped, since the spell already carries
  `concentration` as its own flag. Anything neither parser can classify becomes
  `{ kind: 'special', text }`, so a phrase a GM typed is never thrown away.
- `formatCastingTime` / `formatDuration` turn a value back into the printed
  phrasing the detail modal shows. Pass `concentration` to `formatDuration` to
  get the SRD's own `Concentration, up to 1 minute` wording back.
- `durationInRounds` converts a duration into a round count, which is what puts
  a timer on a condition a spell imposes; days and open-ended durations return
  null, meaning the GM clears the chip by hand.

The authoring form and the library normalizer both route their raw values
through the parsers, so a spell typed into the Library rail and one imported
from a file are validated by the same code.

## Multi-projectile spells

Scorching Ray, Eldritch Blast, and Magic Missile each fire several projectiles
from one cast, and each projectile rolls on its own. An attack effect says so
with `projectiles: { count, perStep?, autoHit? }`, and its presence changes what
the effect's `damage` means: what one projectile deals rather than what the whole
cast deals. An effect without the field rolls once, which is what every other
attack spell does, so nothing had to be migrated when the field was added.

`entities/Casting.js` owns the rules over it:

- `projectileCount(effect, steps)` — `count` plus `perStep` per scaling
  increment. Those increments are the same ones the damage scaling uses: a slot
  level above the spell's own for a leveled spell, a cantrip breakpoint for a
  cantrip. `maxTargets` returns this for a projectile spell, since a creature
  cannot be picked without a projectile to send at it.
- `allocateProjectiles(targets, count)` — how many projectiles each target
  catches. A target carrying `projectiles` states its own share, clamped in order
  so the total can never exceed what the spell fires; with nothing stated they
  spread as evenly as possible, which puts all of them on the single target of
  the common case.
- Resolution rolls one attack per projectile — its own d20, its own crit
  doubling its own dice only, or no roll at all when `autoHit` — and then merges
  the damage per target, so a creature caught by two rays takes one hit carrying
  both. The outcome keeps each projectile's roll under `shots`, plus `fired` and
  `hits`, which is what lets the log read `2 of 3 hit Grelka`.

The cast dialog offers the allocation grid instead of the target checkboxes for
these spells, because a checkbox cannot say "two rays here, one there". The grid
doubles as the target picker: a creature allocated no projectile is not a target.
Its total is how many the cast fires at the level being cast, restated whenever
the slot picker changes, so the GM is never offered a projectile the cast cannot
fire.

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
