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

## Damage terms

A weapon's damage and a spell's damage or healing are all the same thing: a list
of `DamagePart`s, each one `count` dice of `sides` in a damage type, plus an
optional flat `bonus` that rides that term (Magic Missile's `1d4+1`). Absent
means no bonus, so a term written before the field existed needs no repair.
`Equipment.normalizeDamagePart` is the single validator, and it holds two rules
worth knowing:

- A term carrying a bonus may roll no dice, which is how a fixed amount with no
  dice behind it is written (Revivify's one hit point). A term without a bonus
  always rolls at least one die, so a garbled count reads as `1` rather than as
  an empty term.
- The bonus is stored only when it is nonzero, which keeps an unbonused term
  byte-identical to what it was before.

The validator also takes the vocabulary of types a term may carry, defaulting to
the 13 damage types. Healing is not one of them — a weapon must not be able to
deal it — so a spell's restorative dice normalize against `HEALING_TYPES`
instead, and the authoring form pins them to that one type rather than offering a
picker. Validating them against the damage list is what used to rewrite a heal
spell's dice as slashing whenever it was edited or imported.

`DiceRoller.rollDamage` groups terms by damage type and adds each term's bonus to
its own group, while the `modifier` argument — the attacker's ability modifier —
joins the first group only, per 5e. Both land in one `bonus` number per group, so
a readout shows `7 slashing [2,3 +2]` rather than two separate signs. Doubling a
term on a critical hit multiplies its dice and leaves its bonus alone, which is
what the callers in `weaponAttack.js` and `Casting.js` already do by touching
`count`. No group can go below zero, so a negative rider cannot heal.

`damageReadout` builds the `text` and `detail` lines from those groups, and
`Casting.js`'s projectile merge reuses it, so a hit carrying three darts reads
like a single roll.

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

## Material components

A spell's `components` list carries the component letters, such as
`['V', 'S', 'M']`. Those letters alone cannot express what the material is, what
it costs, or whether casting the spell destroys it, so a spell that needs a
material describes it in `materials: { text, costGP?, consumed }`. Most spells
carry no such block, which is why the field is optional rather than migrated in:
Revivify names its diamonds, Fire Bolt has nothing to name.

Of the three fields, only `consumed` changes what happens at the table. A material
the cast destroys has to be in the caster's inventory; one it does not is covered
by a component pouch or a spellcasting focus, and requiring it would block nearly
every spell carrying an M. `Casting.materialCheck(caster, spell)` applies that
rule, returning `{ required, satisfied, item }` — whether this cast needs a
material, whether the caster is holding one, and which inventory stack it would
come out of. Matching a printed phrase against a stack name is inexact by nature,
so the comparison is case-insensitive and runs in both directions: a stack named
`Diamond` covers `diamonds worth 300 gp`. Encounters and NPCs have no inventory at
all, and are never asked for a component.

`app/spellCast.js` acts on the result. A cast whose material is missing stops
before `castSpell` runs, which is what keeps a refused cast from spending a slot.
A cast that succeeds takes one of the stack, in the same write-back that stores
the spent slot, and reports it through `InventoryLog`'s `use` verb. The cast
dialog also offers an "Ignore components" checkbox, which skips the check and the
consumption both, for tables that treat components as flavor.

Two details follow from the shape rather than the rules. `normalizeSpell` adds the
`M` letter to any entry that names a material without listing it, because the
authoring form only shows the material fields under a ticked M; without the
repair, an imported spell would lose its material the first time a GM edited it.
And `costGP` is displayed but never checked, since nothing in the app tracks how
much money a party has.

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
