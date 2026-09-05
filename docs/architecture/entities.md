# Entities

*Explanation. Back to the [architecture overview](../architecture.md).*

`src/entities/` contains the things that a campaign's rules operate on:
creatures, resource pools, and characters, which all follow one update
style.

## Immutable updates

`entities/Creature.js`, `entities/Resource.js`, and `entities/Character.js`
(types in `src/types/creature.ts` and `src/types/entities.ts`) are all plain
immutable-update modules. Each function takes a value and returns a new
value. It does not change the original:

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
- `Character.addXP` uses an `N * XP_PER_LEVEL` (100) cost curve and loops
  internally. One large XP award can cross several level thresholds in a
  single call.
- `Character.js` looks up a character's resources and inventory by id.
  `spendResource` and `restoreResource` delegate to the matching
  `ResourcePool` through `Resource.js`. `addItem` and `removeItem` merge or
  split inventory stacks by item id, and each stack drops once its quantity
  reaches 0.

### Reserved resource pools

HP, spell slots, pact slots, and hit dice are ordinary `ResourcePool`s under
ids that the app reserves, so spending a spell slot and spending an arrow run
through the same `spend`/`restore` code.
`entities/PoolIds.js` defines those ids (`hp`, the `slots-`/`pact-` prefixes, the
`hit-dice-d` prefix) and imports nothing. The three modules that own the rules
for them, `Character.js`, `SpellSlots.js`, and `HitDice.js`, can all read the
same string no matter where they sit in the import graph. Each module
re-exports the ids that it owns, so `HP_RESOURCE_ID` is still imported from
`Character.js`.

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

## The creature

`entities/Creature.js` and `entities/CreatureMap.js` (types in
`src/types/creature.ts`) define the one model for everything the party can
meet on the map. One `Creature` covers a foe, a townsperson, and anything
between, and its `disposition` field decides its side in a fight: a hostile
creature fights the party, and every other creature stands with it. The state
has one `creatures` list, which every combat, map, and story panel reads.

A creature has `maxHP`, `currentHP`, a `stats` block, a `weapon`, an
`armor`, `conditions`, a `location`, and a `met` flag. `level` and `tier` are
optional authoring inputs that pick the default stats and gear for a new foe,
and a townsperson has no level.

`createCreature` resolves the weapon and the armor once, at creation. An
absent value takes the level default when the creature has a level and null
when it has none, so a stored null means unarmed or unarmored on purpose.
`withDefaults` backfills gear to null only, and no read path derives gear
from the level again, so an absent field has one meaning everywhere.

`isCreature(entity)` tells a creature from a character: a creature always
has a `disposition`, and a character never does. Every caller that tells
the two apart uses this one test.

`effectiveStatBlock(creature)` is the one AC read: the closed stat block, plus
the `acBonus` of the worn armor, plus every active timed stat modifier.
`CreatureMap.js` has the placement reads. `meetCreatures` marks every
creature on the party's tile as met. `knownCreaturesAt` is the player view of
the non-hostile roster. `discoveredHostiles` is the player view of the hostile
roster, through the fog of war. `fromTemplate` reads older template formats on
purpose, because a library file has no version field.

Every creature follows the same combat rules. `maxHP` defaults to 4, the 5e
commoner, and hit points are never absent. 0 HP is defeat with no death
saves, which only characters roll. The combat code branches on `isCreature`,
so a character and a creature never convert into each other.

The authoring side is one dialog over one model. `app/creatureFields.js`
describes the fields, and `app/creatureForm.js` writes `state.creatures`
through `createCreature` and `editCreature`. A blank level marks a
townsperson: it stores no level and no tier, and the gear pickers start at
None. A typed level pre-fills the pickers and the `STAT_KEYS` inputs with
the level's defaults. The read-back has no gear fallback, so what the picker
shows is what the creature gets, and an empty picker means unarmed.

### The challenge rating

`src/data/challenge.js` has the rating tables. A rating is a plain number,
so the four ratings below 1 are stored as `0`, `0.125`, `0.25`, and `0.5`.
`crLabel` prints the fractions the conventional way, and `crOptions` builds
the picker. `crXP` is the SRD experience-point table, which the difficulty
hint adds up. A rating of 0 is worth 10 XP, which is one of the two values
the rules give it.

`Modifiers.crProficiencyBonus` is the proficiency bonus of a rating. It calls
`proficiencyBonus` at the rating, because the rating ladder and the character
level ladder take the same steps, so the ladder has one implementation.

The `cr` field on a creature is optional, and an absent field means unrated.
An unrated creature falls back to its level for proficiency, then to its
caster level, and it counts for no XP. `CreatureChecks.creatureProficiencyBonus`
is the one reader of that ladder. Saves, skills, spells, and weapon attacks
(`AttackResolve.attackerProficiency`) all call it, so a creature swings and
saves with the same bonus. `coerceCR` is the one gate. It accepts a number or a written
rating such as `"1/4"`, and it drops anything that names no defined step
rather than snapping the value to a nearby one. `Creature.js` runs every
write path (`createCreature`, `editCreature`, `withDefaults`, `toTemplate`,
and `fromTemplate`) through it, and `Library.normalizeLibrary` runs library
entries through it. A save needs no migration step, because an old creature
simply has no field.

Each built-in hostile creature has the rating of its SRD counterpart. The
built-in townsfolk stay unrated, because nothing fights them.

### The difficulty hint

`src/entities/EncounterDifficulty.js` rates a fight by the 5e
experience-point budget. `XP_THRESHOLDS` lists the four thresholds for each
level from 1 to 20, and `partyThresholds` sums the row of every character.
`rateEncounter` counts the living characters only: a dead character buys no
budget and does not count toward the party size, while a dying one still does.
`adjustedXP` adds up what the foes are worth through `crXP` and multiplies by
the count, from 1 for a lone foe to 4 for fifteen or more. The party size moves
one step along that multiplier ladder rather than scaling the value: a party of
one or two steps up, a party of six or more steps down. The ladder's end rungs,
0.5 and 5, are reachable through that shift alone.

`rateEncounter` compares the two and names the band. A threshold counts as met,
so a total exactly on the medium line is medium. Below the easy threshold the
band is `Trivial`, which the rules leave unnamed. An unrated foe is worth no
experience points but still counts toward the multiplier, because it still takes
a turn, and `rateEncounter` reports how many such foes there are so the hint can
say the number is short.

`difficultyLine` is the one line the Encounters panel prints for the GM, over
the same live creature list the Active tab shows. The hint acts on nothing,
awards no experience points, and never blocks a fight.

### A creature's saves and skills

A creature has an optional `proficiencies` field with two lists: the saving
throws it is trained in and the skills it is trained in. This is the slim half
of a character's record. A creature records no armor, weapon, tool, or language
training, because nothing gates a creature on those, and it has no expertise.
An absent field means trained in nothing.

`Proficiencies.normalizeCreatureProficiencies` cleans the set, and the write
paths spread `creatureProficiencyFields`. A creature trained
in nothing stores no field at all, so clearing both pickers removes the record.
An entry that names no ability and no skill is dropped, so nothing can put a
bonus on something the app cannot roll. The same two functions gate
`Library.normalizeLibrary`, so a hand-edited library file goes through one
cleaner.

`src/entities/CreatureChecks.js` derives the numbers. `creatureSaveBonus` and
`creatureCheckBonus` are the creature counterparts of `Checks.saveBonus` and
`Checks.checkBonus`. Each is the ability modifier from `effectiveStatBlock`,
plus `creatureProficiencyBonus` where the creature is trained, less the
exhaustion penalty. `creatureProficiencyBonus` reads the ladder at the challenge
rating, and falls back to the level, then to 1, for an unrated creature.
`proficiencySummary` is the one line both creature panels print.

The two modules are split rather than one function that branches, because a
creature keeps its scores in a different field and climbs the ladder by rating
rather than by level. Merging them would also make `Checks.js` import
`Creature.js`, which imports `Character.js`, which reaches `Checks.js` again.

Nothing stores a bonus. `combatants.targetSaveBonus` derives one for either kind
of combatant, so the cast dialog does not ask the GM to type a foe's save. The
number the panel prints and the number the save rolls come from the same
function, and an edit to a rating or a stat cannot leave a stale bonus behind.

A derived bonus can sit below the one an SRD stat block prints. A printed bonus
can include a trait this app does not model, such as the goblin's Nimble
Escape.

### Creature casters

A creature casts through the same class machinery as a character. It has
one scalar `class` with an optional `subclass`, a `casterLevel`, a `spellbook`,
and slot pools in its `resources`. `entities/Caster.js` is the bridge.
`toCaster` presents any combatant in the field layout that the pure spell
helpers read, and it reads the scalar pair as a one-entry class list at the
caster level. `withCasterFields` stamps the fields on a create or an edit, and
it rebuilds the slot pools from the class and the level.

A rated creature takes the proficiency bonus for its spells from the rating
ladder. `toCaster` stamps a `proficiency` field on the view from
`crProficiencyBonus`, and `Classes.spellSaveDC` and `spellAttackBonus` prefer
that field over the level ladder. This is the same source that
`creatureProficiencyBonus` gives the saves and the skills above. A character
never has the field, so a character's spell numbers do not change. An
unrated creature keeps the level ladder, read at its caster level.

`Caster.casterSummary` is one line with the class and its level, the spell
save DC, the spell attack bonus, and each slot pool as current over max. Both
creature panels print it under the proficiency line. The combat card shows
the same two numbers through the `spellStats` field of the loadout
(`combat/Loadout.js`). The field stays null for a viewer with public access,
the same rule that hides spells and slots.

The built-in creatures include three caster foes: the Acolyte, the Cult
Fanatic, and the Mage. The templates live in `src/data/creatures.js` with the
rest of the built-in creatures. A template stores no slot pools, because the
pools rebuild from the class and the caster level on spawn. A spellbook id
that the default spell list lacks is swapped for a near spell, and a comment
on the entry records the swap.

## The character foundation

Beyond its stats and inventory, a `Character` has a class list, a race, a
background, proficiency lists, hit dice, and a level-up flow, each a pure
module beside `Character.js` that follows the same take-a-value,
return-a-value pattern.

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
    Classes.js           caster reads: spellSaveDC, spellAttackBonus,
                         cantrip/prepared limits
    SpellLearning.js     which spells each caster class can learn at its level
    Multiclass.js        the class-list accessor (see below)
    Races.js             resolveRace: catalog first, stored snapshot fallback
    Backgrounds.js       resolve a stored id to its definition
    Proficiencies.js     assemble + edit the six proficiency lists
    HitDice.js           max HP derivation, hit dice as resource pools
    LevelUp.js           pending levels, ASI/feat choices, unlocked features
    LevelAssign.js       commit a pending level to a class
    FeatureGrants.js     apply and undo the grants of a structured feature
    GrantLedger.js       the grant records of feats and features; rebuild on undo
    Features.js          class features as numbers the combat paths use
          |
          v
    Character.js         the character value itself; withDefaults is the
                         load-time migration point
```

The catalogs describe what a class or race *is*, and the entity modules
describe what happens when a character *has* one. The catalog types are declared in `types/class.ts` and `types/race.ts`.

### Classes and multiclassing

`entities/Multiclass.js` is the class-list accessor. `getClasses` returns the
memberships. It folds an older save's scalar `class`/`subclass` fields into a
one-entry list at read time. `withClasses` sanitizes writes, and
`primaryClass`, `classLevelOf`, and `pendingLevels` read across the list.
Everything class-aware goes through this accessor rather than touching
`character.classes` directly, which keeps the single-class and multiclass
paths identical: a fighter is a character whose class list has one entry.

`entities/Races.js` and `entities/Backgrounds.js` resolve a stored id to its
definition. `resolveRace` prefers the live catalog and falls back to a stored
`raceTraits` snapshot, so a hand-typed or since-deleted race still round-trips.

### Proficiencies

`entities/Proficiencies.js` assembles the seven proficiency lists from class,
race, and background (`assembleProficiencies`). It applies or hand-edits them
with `withProficiencies`, and it sets the expertise list on its own with
`withExpertise`. Both writers run `normalizeProficiencies`, which is the one
place that deduplicates the lists and cuts expertise down to the skills the
character is proficient in. Expertise doubles a proficiency, so it
cannot exist without one, and no writer has to remember to prune. A patch that
names no expertise keeps whatever the character already had, so editing the
tool list does not clear a player's picks.

A save with a top-level `Character.expertise` field loads with the list
folded inside the proficiencies, so no migration step is involved. The
`isProficient*` and `hasExpertise` predicates return `false` for a legacy
character with no lists at all.

### Hit points and hit dice

`entities/HitDice.js` derives max HP from the class hit die plus the CON
modifier per level (`classMaxHP`, the 5e average rule). It also models hit
dice as spendable resource pools sized to the assigned class levels.
`withHitDice` creates them, `syncHitDice` re-derives them while it keeps the
spent count, and `spendHitDie` heals on a short rest.

### Leveling up

`entities/LevelUp.js` and `entities/LevelAssign.js` run the level-up flow.
`addXP` leaves each earned level *pending* for a classed character rather than
applying it silently. `assignLevel` commits a pending level to a chosen class:
it grows HP, adds a hit die, and advances spell slots. Crossing a class ASI
level leaves a pending improvement, spent later by `applyASI` or `takeFeat`. A
choice is stored against the class and class level that earned it (`slotKey`
builds that key), so a slot can have at most one choice. Each choice also
records the order in which the player made it, for `undoLastChoice` to read.

A feat choice stores a stamp of what it did, not a reference to the catalog.
`takeFeat` takes either a plain name or a `FeatStamp` (`types/feat.ts`): the
resolved picks of a library feat. It applies the ability increases to the
stats, merges the proficiency grants through `normalizeProficiencies`, and
records on the choice the increases, the rider, every proficiency the feat
asked for (`requested`), and the entries the merge added (`granted`). This
mirrors how a race applies its increases: `undoLastChoice` and the sheet read
the stamp, so a later edit to the library entry does not reach a character
that already took the feat. Undo subtracts the increases and hands the
proficiencies to `GrantLedger.rebuildGrants`. That function takes the current
lists, removes every entry any feat or feature record added, and merges the
requests of the records that stay back on top. A proficiency that two records
both ask for therefore stays through the undo of either one. Each record that stays
is stamped again with what it added in that replay, so the next undo reads an
accurate diff. An expertise that rode a removed skill prunes with it. A
matching grant made by hand between take and undo comes off anyway, the same
hazard a stat edit poses to an ASI undo. A choice written before these fields
has none of them and undoes as a bare name. A choice
with `granted` but no `requested` reads its `granted` list as its request.

`entities/FeatChoices.js` has the arithmetic behind the take-feat dialog:
`availableFeats` filters the catalog to what the character has not taken
(a repeatable feat stays on offer), `abilityPool` and `choicePool` compute
each pick's options minus what the character already has, and `buildStamp`
folds the picks and the feat's fixed grants into the stamp `takeFeat`
applies. The dialogs live in `ui/EffectPicks.js`, and the class-feature
grant flow runs its choices through the same engine, so a feat and a
feature with the same effects prompt the same way. A pick whose pool has
no more options than the count grants outright with no prompt, and the
expertise prompt runs after the skill picks because its options depend on
them. `ui/CharacterProgress.js` wires both flows to the sheet.

`LevelAssign.js` also builds the picks that the assign dialog offers.
`assignOptions(character)` lists every held class one level up and every new
class that the prerequisites allow. It then appends the classes that the
character cannot take, as disabled entries that name what they want. The
requirement quoted is the new class's own, unless the block is a held class
whose prerequisite has since been lost. 5e gates leaving a class the same way
as entering one. `prereqText` writes that phrasing ("STR 13 or DEX 13"), and
`className` resolves a class id for display.

### Class features

A class feature in `featuresByLevel` (`data/classes.js`) is a plain name or
a `{ name, effects }` object (`ClassFeatureDef` in `types/class.ts`). The
effects use the feat effect vocabulary from `types/feat.ts`. A plain name is
display only. `LevelUp.unlockedFeatures` collects the entries that the class
levels of a character reach, and the sheet prints that list.

`entities/FeatureGrants.js` owns the grant lifecycle of a structured
feature. An unlocked feature with effects and no record in
`character.featureChoices` is *pending*. Nothing stores that state, so a
character created at level 1, an imported save, and a hand-edited class list
all show their unclaimed grants the same way. `applyFeatureGrant` merges
the picks through `normalizeProficiencies` and records what the feature asked
for and what the merge added, the same stamp a feat choice records.
`undoFeatureGrant` rebuilds the lists through `GrantLedger.rebuildGrants`,
so a pick that a feat or another feature also grants stays, and the feature
turns pending again. A grant the character already had from the GM is never
stamped as added, so undo cannot take it away. `featureRiders` feeds a feature's standing roll
riders into `FeatChoices.riderSources`, which every roll site already calls.
The Rogue grants Expertise this way at levels 1 and 6, and the Bard at
levels 3 and 10.

`entities/Features.js` reads the level-scaling names as numbers.
`attacksPerAction` gives 2 to a character with 'Extra Attack', and 3 or 4
for the numbered follow-ups of the Fighter. It takes the best count across
the class list, because Extra Attack does not stack in 5e. `sneakAttackDice`
gives the count of d6 that Sneak Attack adds, from the level in the class
that granted it. `hasFeature` and `featureSource` are the exact-name lookups
below both.

A structured effect models a one-time grant, while a value that scales with
the class level stays a name match, because it is derived on read instead of
granted once. A homebrew class that uses the same
names gets the same mechanics.

### Loading old saves

`entities/Character.js`'s `withDefaults` is the one load-time migration point.
It folds all of the above onto an older save. A legacy scalar class becomes a
list, a missing proficiency scaffold is created empty, and a race string is
preserved. `campaign/Campaigns.js` maps every loaded character through it.

## Damage terms

A weapon's damage and a spell's damage or healing are the same thing: a list
of `DamagePart`s. Each part rolls `count` dice of `sides` in a damage type,
plus an optional flat `bonus` that rides that term (Magic Missile's `1d4+1`).
An absent bonus means no bonus, so a term written before the field existed
needs no repair. `Equipment.normalizeDamagePart` is the single validator. It
decides how a term with a bonus and a term without one are each repaired:

- A term with a bonus can roll no dice, which is how the app writes a
  fixed amount with no dice behind it (Revivify's one hit point). A term
  without a bonus always rolls at least one die, so a garbled count reads as
  `1` rather than as an empty term.
- The app stores the bonus only when it is nonzero. This keeps an unbonused
  term identical to what it was before.

The validator also takes the vocabulary of types that a term can have, and it
defaults to the 13 damage types. Healing is not one of them, because a weapon
that dealt it would heal on a hit. A spell's restorative dice normalize against
`HEALING_TYPES` instead, and the authoring form pins them to that one type
rather than offering a picker. Validating healing dice against the damage list
would rewrite a heal spell's dice as slashing whenever a GM edited or
imported it.

`DiceRoller.rollDamage` groups terms by damage type and adds each term's bonus
to its own group. The `modifier` argument (the attacker's ability modifier)
joins the first group only, per 5e. Both land in one `bonus` number per group,
so a readout shows `7 slashing [2,3 +2]` rather than two separate signs.
Doubling a term on a critical hit multiplies its dice and leaves its bonus
alone, which the callers in `weaponAttack.js` and `Casting.js` already do by
touching `count`. No group can go below zero, so a negative rider
cannot heal.

`damageReadout` builds the `text` and `detail` lines from those groups.
`Casting.js`'s projectile merge reuses it, so a hit made of three darts
reads like a single roll.

## The weapon property model

A weapon has `kind`, `category`, `properties`, `range`, and
`versatileDamage`. `entities/Weapons.js` owns the vocabularies and the reads:

- `weaponKind(weapon)` returns `'melee'` or `'ranged'`. An absent `kind`
  reads as melee.
- `hasWeaponProperty(weapon, property)` reads the `properties` list. The nine
  flags are the 5e set: finesse, versatile, two-handed, light, heavy, reach,
  thrown, ammunition, and loading.
- `attackAbility(weapon, stats)` picks the ability behind an attack. A ranged
  weapon uses DEX, a finesse weapon uses the higher of the roller's STR and
  DEX, and every other weapon uses STR.
- `abilityLabel(weapon)` is the label for a weapon shown without a roller. A
  finesse weapon reads `STR/DEX`, because the choice depends on who holds it.

`category` is `'simple'` or `'martial'`, the 5e proficiency categories. A
weapon with no category is a natural weapon, for example a bite. A versatile
weapon stores its two-handed dice as a full `versatileDamage` array, so the
damage pipeline handles it with no special case, and a permanent rider term
appears in both arrays.

The property strings `light` and `heavy` also exist as armor weight classes.
The two vocabularies live in separate constants (`WEAPON_PROPERTIES` in
`Weapons.js`, `ARMOR_WEIGHTS` in `Equipment.js`) and never mix.

`clampWeaponRange(value, fallback)` reads a range as whole feet, with the long
range kept at or above the normal one. A field under one foot, or one that does
not read as a number, takes the matching fallback from `DEFAULT_RANGES`, which
is 80/320 feet for a ranged weapon and 20/60 for a thrown melee one. The item
form and the legacy coercer both limit the range here, so an imported file
cannot have a range the form refuses to produce.

`EquipmentPresets.coerceWeapon` reads a weapon-like value from any era and
returns the current fields. The `kind` field says which era the value comes
from, because every value the coercer returns has one. A value that has it
keeps its own fields, filtered to the known vocabulary. A value without it is
legacy: a name match against `WEAPON_PRESETS` adopts the preset's property
fields and keeps the value's own damage dice, because a GM can edit them, and
an unmatched one maps from its `handling` and gets the simple category, which
keeps the old always-proficient rolls unchanged. Reading `kind` first lets a
GM edit a copy of a built-in weapon: the copy shares the built-in's
name, and the library gate coerces every entry on every load, so a preset read
over the top would undo the edit each time.

Migration step 6 runs saved weapons through the coercer once. The library
normalize gate runs its entries through it on every load, because library
files have no version.

## Armor class

`entities/Armor.js` has the rules for wearing armor: what the worn pieces
do to AC, to Stealth, and to a character who is not trained for them. These
rules read the character's classes and proficiency lists, which the item
readers in `Equipment.js` never do, so they sit in their own module.
`Equipment.js` keeps the slots, the equip rules, and the per-item field
readers such as `armorTraits` and `itemACBonus`.

`Armor.armorClass(character)` is the only place that derives the AC of a
character. Equipped body armor replaces the unarmored baseline with its own
`baseAC`, and its weight class fixes how much DEX it adds. Without body armor
the AC is `character.baseAC`, which is 10 unless an effect such as Mage Armor
raised it, plus the full DEX modifier. Every other equipped piece then adds
its own `acBonus`.

A shield is one of those pieces. It stores its bonus in `acBonus`, the same
field a helmet or a ring uses, so a homebrew tower shield can add more than
the 5e standard. `SHIELD_AC` is the value an absent field reads as, not a
fixed rule. The item form gives a shield a minimum of 1 and fills 2 when the
GM picks that type, so a stored 0 cannot happen and absence always means the
GM never touched the field. `SHIELD_PRESETS` puts one entry in the preset
picker.

The form is not the only writer, though. A library file or a hand-edited save
can store anything in `acBonus`, so `Equipment.itemACBonus` reads the field
tolerantly, the same way `armorTraits` reads the armor traits. A value that
is not a whole number reads as absent: a shield then adds `SHIELD_AC`, and
any other piece adds nothing.

A Barbarian or a Monk also gets an unarmored defense formula, which is
10 plus the DEX modifier plus the modifier of one more ability. The ability
and whether a shield cancels the formula are stored on the class definition as
`unarmoredDefense`, and `Classes.unarmoredDefenses(character)` gathers the
grants of the whole class list. `armorClass` takes whichever is higher, the
plain unarmored AC or the formula, so a raised `baseAC` from Mage Armor still
wins when it beats the class feature. The formula needs an empty chest slot,
because a chest item with no `baseAC` still means the character wears
something, and a `baseAC` of at least 10, because a GM who lowers it as a
curse would otherwise see the formula erase the debuff. A Monk who takes a shield loses the formula but
still gains the AC the shield adds.

Body armor has two more traits, both optional and both absence-defaulted.
`stealthDisadvantage` slants every Stealth check of the wearer, and `strength`
is the Strength score the armor needs. `Equipment.armorTraits(item)` is the one
place that reads either field, because a library file can store anything in
them, and it treats only a literal `true` and a positive whole number as set.
`Armor.stealthPenalty(character)` names the worn armor when it is noisy,
which `app/checkRolls.js` turns into a disadvantage slant and the skill block
turns into a marker on the Stealth row. Nothing migrates: armor already in a
save has neither trait until the GM re-picks it from the presets or ticks
the box.

`entities/Movement.js` owns walking speed. `baseSpeed` reads the speed of the
race through `Races.resolveRace`, so a catalog edit reaches every character of
that race, and a hand-typed race walks `DEFAULT_SPEED`. `armorSpeedPenalty`
costs 10 feet when the effective Strength, buffs included, falls short of what
the armor asks. `walkSpeed` subtracts both that penalty and the exhaustion
penalty, and it floors the result at 0. `speedNote` is the sentence that the
sheet badge shows, and it names each cause that applies. The module is
separate from `Equipment` because more rules will cut a speed, and each one
belongs in `walkSpeed` rather than in a second speed calculation. Nothing
moves a token by feet yet, so the value is informational.

## Exhaustion

`entities/Exhaustion.js` owns exhaustion in its 2024 form, where one rule
scales with the level instead of a table of six different penalties: each
level costs 2 on every d20 test and 5 feet of speed, and the sixth level
kills.

The level is one number, `exhaustion`, on the character or the creature.
Nothing else is stored. `exhaustionLevel` reads that number and limits it to
the range 0 through `MAX_EXHAUSTION`. A hand-edited save therefore cannot go
past death or under zero. `d20Penalty` and `speedPenalty` derive from the
level. `atDeathLevel` reports the fatal level, and `exhaustionNote` is the
sentence for a badge or a log line.

`setExhaustion`, `gainExhaustion`, and `easeExhaustion` are the writers. Each
one limits the result to the same range.

The penalty reaches a roll through the bonus rather than through a condition
chip with a rider on it, because a rider appears only after dice are thrown
while the sheet prints its saving-throw and skill bonuses without dice, so a
chip would leave the sheet at +5 where the roll gave -1.

`Checks.saveBonus` and `Checks.checkBonus` include the penalty instead, so the
printed number and the rolled number agree, and a passive score gets the
penalty with no extra code.

The other bonus sites include the penalty as well, one for each remaining
kind of d20 test. `app/weaponAttack.js` subtracts it from the attack bonus,
and both a character and a creature have a level there. `Classes.spellAttackBonus`
subtracts it from a spell attack. `Classes.spellSaveDC` does not, because a DC
is a number the target rolls against and not a roll the caster makes.
`DeathSaves.deathSaveBonus` is the whole bonus of a death save, and the two
death-save paths both read it.

The app logs the penalty as its own part, next to the ability modifier and the
proficiency bonus. `app/checkRolls.js` therefore subtracts the penalty back out
of the bonus to get the ability part. Without that step the log prints a
modifier that the stat block does not have.

`combat/InitiativeRoll.js` subtracts it from the initiative roll that the
setup dialog fills. A creature's saving throw derives through
`creatureSaveBonus`, which subtracts it as described above.

The module imports `Conditions.js` and nothing else, because `Checks.js`
reads this module and `DeathSaves.js` is built on `Checks.js`, so an import
of either one from here would close a cycle. The rules that mix exhaustion
with death therefore live with their callers.

`app/exhaustion.js` has the write that kills. `setCombatantExhaustion` sets
the level of one combatant by id, writes a log line for what the level costs,
and then applies the sixth level, which the two kinds of combatant take
differently.

A character gets three failed death saves from `DeathSaves.killOutright`,
because three failures is what the whole app reads as dead, and the
Unconscious chip goes on beside them. HP is untouched, because exhaustion
kills without damage, and a damage write would show a wound that the fiction
does not have.

A creature goes to 0 HP through `Creature.applyDamage`, which is the only way a
creature leaves a fight, and `logDefeatTransition` names it. A combatant that is
already dead takes the level and nothing else. A second write therefore cannot
write a second death line.

A revive applies the opposite rule, because a combatant that comes back at
the sixth level would be alive and dead at the same time, so one level comes
off.
`DeathSaves.clearDying` does this for a character. That covers a heal above 0 HP
and a natural 20 on a death save. `Creature.heal` does it for a creature that the
heal brings off 0 HP. This half is not in `app/exhaustion.js`, because a revive
happens in more places than that module can see.

`Character.longRest` applies the third rule of this kind: a long rest calls
`easeExhaustion` for one level, and a dead character keeps the level that
killed it. The guard is in `longRest` and not at its call site, because the Time panel
rests every character at once and does not ask who is alive. A short rest eases
nothing.

`exhaustionFields` is the load-path coercion for a save that stores
exhaustion as a hand-added condition chip with no level behind it, and both
`withDefaults` functions call it. A chip with no stored level reads as level 1, which is the
least a GM can mean by the chip. The chip then comes off. A stored level wins
over a stray chip beside it, and the chip still comes off. The two values
therefore can never disagree.

## Armor proficiency

`Proficiencies.isProficientArmor(character, weight)` reads the armor list.
The list contains weight classes plus `'shield'`, so a shield goes through the
same check as a breastplate. `Armor.unproficientWear(character)` turns
the check into phrases: it reads the memoized `equippedIndex`, checks the
chest piece against its weight class and an off-hand shield against the
shield grant, and returns a list such as `['heavy armor', 'a shield']`. Those
two slots cover every case, because `armorClass` reads body armor from the
chest slot and `EQUIPMENT_SLOTS` admits a shield to the off hand alone. A
character without proficiency lists returns an empty list,
the same rule the weapon gate applies.

The call sites act on the list as follows. `app/checkRolls.js` folds a disadvantage
slant into a STR or DEX save or check, through the `extra` parameter of
`rollMode`, so a chip that grants advantage cancels it. `app/weaponAttack.js`
folds the same slant into every weapon attack, because an attack rolls off STR
or DEX whatever the weapon is. `app/spellCast.js` refuses a cast before the
resolver runs, so a refused cast spends no slot, and the dialog offers an
"Ignore armor" opt-out beside the component one.
The same module marks a character target of a STR or DEX save spell with
`armorPenalty`, and the resolver folds that slant into the target's save
through the `extra` parameter of `saveOutcome`. The AC of the armor is not
touched: wearing armor untrained changes rolls, not the armor.

## Spell timing

A `Spell` (`types/spell.ts`) lives in the library rather than in a campaign
save, so it has no version number and no migration chain (see
[Persistence](persistence.md) for how the library merges), and the app
therefore reads its two timing fields, `castingTime` and `duration`, rather
than assuming them.

Both are structured values rather than text. A `castingTime` is a kind (`action`,
`bonus`, `reaction`, `minutes`, `hours`) with an amount for the counted kinds
and a trigger clause for a reaction. A `duration` is a kind
(`instantaneous`, `rounds`, `minutes`, `hours`, `days`, `until-dispelled`) with
an amount and an `upTo` flag for a duration that the caster can end early.
`entities/SpellTiming.js` has these functions over them:

- `parseCastingTime` and `parseDuration` accept either the structured object
  or the printed string that an older library or a hand-written JSON file
  contains, such as `1 bonus action`, `10 minutes`, or `Concentration, up to 1
  minute`. The parsers drop a `Concentration, ` prefix, because the spell
  already has `concentration` as its own flag. Anything that neither
  parser can classify becomes `{ kind: 'special', text }`, so the app never
  discards a phrase that a GM typed.
- `formatCastingTime` and `formatDuration` turn a value back into the printed
  phrasing that the detail modal shows. Pass `concentration` to
  `formatDuration` to get the SRD's own `Concentration, up to 1 minute`
  wording back.
- `castingCost` names the part of a turn that a cast spends, which the action
  budget of the combat screen then takes. A casting time of minutes or hours,
  and a `special` one, return null: no part of a turn pays for them.
- `durationInRounds` converts a duration into a round count, which puts a
  timer on a condition that a spell imposes. Days and open-ended durations
  return null, so the GM clears the chip by hand.

The authoring form and the library normalizer both route their raw values
through the parsers, so a spell typed into the Library rail and one imported
from a file are validated by the same code.

## Multi-projectile spells

Scorching Ray, Eldritch Blast, and Magic Missile each fire several
projectiles from one cast, and each projectile rolls on its own. An attack
effect states this with `projectiles: { count, perStep?, autoHit? }`. Its
presence changes what the effect's `damage` means: what one projectile deals,
rather than what the whole cast deals. An effect without the field rolls
once, the same as every other attack spell, so a spell written without the field
needs no migration.

`entities/Casting.js` owns the rules over it:

- `projectileCount(effect, steps)` returns `count` plus `perStep` for each
  scaling increment. These increments are the same ones that damage scaling
  uses: a slot level above the spell's own for a leveled spell, or a cantrip
  breakpoint for a cantrip. `maxTargets` returns this value for a projectile
  spell, because a creature cannot be picked without a projectile to send at
  it.
- `allocateProjectiles(targets, count)` decides how many projectiles each
  target catches. A target with a `projectiles` value states its own share,
  limited in order so the total never exceeds what the spell fires. With
  nothing stated, the projectiles spread as evenly as possible, which puts
  all of them on the single target in the common case.
- Resolution rolls one attack per projectile: its own d20, its own critical
  hit that doubles only its own dice, or no roll at all when `autoHit` is
  set. It then merges the damage per target, so a creature caught by two rays
  takes one hit that includes both. The outcome keeps each projectile's roll
  under `shots`, plus `fired` and `hits`, which lets the log read `2 of 3 hit
  Grelka`.

The cast dialog offers the allocation grid instead of target checkboxes for
these spells, because a checkbox cannot say "two rays here, one there". The
grid also works as the target picker: a creature allocated no projectile is
not a target. Its total is how many projectiles the cast fires at the level
being cast. The total updates whenever the slot picker changes, so the GM is
never offered a projectile that the cast cannot fire.

## Material components

A spell's `components` list has the component letters, such as
`['V', 'S', 'M']`. Those letters alone cannot express what the material is,
what it costs, or whether casting the spell destroys it, so a spell that
needs a material describes it in `materials: { text, costGP?, consumed }`.
Most spells have no such block, so the field is optional rather than
migrated in: Revivify names its diamonds, and Fire Bolt has nothing to name.

Both `consumed` and `costGP` change what happens at the table.
`Casting.materialCheck(caster, spell)` applies the rule and returns
`{ required, satisfied, item, consumes }`: whether the caster has to hold the
material, whether a stack of it is there, which stack it is, and whether the
cast spends it.

A material that the cast destroys has to be in the inventory, and so does one
with a gp cost, because a pouch and a focus never cover a priced component.
Anything else is covered, but only while the caster carries a component pouch
or a spellcasting focus, and a caster with neither needs the printed material
itself.

`required` and `consumes` are separate fields, because holding a material is
not the same as spending it. Revivify's diamonds are destroyed and come off
the stack. Chromatic Orb's 50 gp diamond has to be in hand and stays there.

An item is a pouch or a focus when it sets `spellFocus`. The flag is the only
signal, so a stack that a GM named "Component Pouch" without ticking the box
is ordinary gear. `Equipment.isSpellFocus(item)` and
`Equipment.carriesSpellFocus(inventory)` read it. `GEAR_PRESETS` ships four
flagged entries (a component pouch and an arcane, druidic, and holy focus),
and the item form offers the checkbox on every item type, because a staff is
an arcane focus and an amulet is a holy symbol. Carrying the focus is enough.
The app does not track which hand is free, and gear has no equipment slot.

Matching a printed phrase against a stack name is inexact by nature, so the
comparison is case-insensitive and runs in both directions: a stack named
`Diamond` covers `diamonds worth 300 gp`. A material with no printed text
names nothing to look for and is never required. A creature has no
inventory at all, and the app never asks it for a component.

`app/spellCast.js` acts on the result. A cast whose material is missing stops
before `castSpell` runs, which keeps a refused cast from spending a slot. The
refusal names the missing material, or the missing pouch, whichever is the
cheaper fix. A cast that succeeds takes one item from the stack, but only
when `consumes` is true, in the same write-back that stores the spent slot,
and reports it through `InventoryLog`'s `use` verb. The cast dialog also
offers an "Ignore components" checkbox, which skips both the check and the
consumption, for tables that treat components as flavor.

`normalizeSpell` adds the `M` letter to any entry that names a material
without listing it, because the authoring form shows the material fields only
under a ticked M. If the app skips this repair, an imported spell loses its
material the first time a GM edits it. The app reads `costGP` only as the
signal that a focus cannot cover the component. It never charges the party
for it, because nothing in the app tracks how much money a party has.

## Ritual casting

A ritual cast takes ten minutes longer than normal and spends no spell slot.
It needs both halves of the rule: the spell has `ritual: true`, and the
caster has a class with the ritual-casting feature. `data/classes.js` marks
that feature on bard, cleric, druid, and wizard.
`Classes.hasRitualCasting(character)` is true when any of the character's
caster classes has it.

`Casting.castSpell` takes `{ ritual: true }`. The cast resolves at the
spell's own level, because there is no slot to upcast from, and returns
`spent: false` with the caster value unchanged. Asking for a ritual cast of a
spell that has no ritual, or of a cantrip, returns
`{ ok: false, reason: 'not-ritual' }`.

The cast dialog offers a "Cast as ritual" checkbox when both halves line up.
Ticking it hides the slot picker. For a caster with no slots left, a ritual
is the one cast still available, so the dialog drops the slot picker rather
than refusing to open, and the box starts ticked.

The game clock divides a day into six named watches of four hours each
(`time/GameClock.js`), so it cannot represent ten minutes, and a ritual does
not advance it. The session log states the extra time instead
(`casts Detect Magic as a ritual (10 minutes longer)`), and the GM adjudicates
it.

In 5e, a wizard can also ritual-cast a spell from the spellbook without
preparing it. `canCast` requires a prepared caster's spell to be prepared,
ritual or not, so the app does not yet support this piece of the rule. No
built-in spell in `src/data/spells.js` is a ritual either, so the flag
currently serves only GM-authored and imported spells. See
[the curated-spells note](../spells-missing.md) for what the built-in list
covers.

## Known and prepared casters

Each caster class manages its leveled spells as a prepared caster or as a
known caster, and `data/classes.js` records which as `knownRule`. A *prepared* caster (cleric,
druid, paladin, wizard) keeps a wider book and readies a daily subset. Only
the spellbook's `prepared` list is castable, and `Classes.preparedLimit` caps
it at the spell-ability modifier plus caster level, per prepared-rule class.
The caster level is the class level for a cleric, druid, or wizard, and half
the class level, rounded down, for a paladin. The cap is at least 1. A
*known* caster (bard, ranger, sorcerer, warlock) casts everything it knows.
The `known` list is castable directly, and there is no prepare step at all.
Cantrips sit outside this distinction in their own list.

`SpellView.spellRule(character, spellId)` says which rule governs a spell.
It uses the rule of the class that the character learned the spell under
(the spellbook's `sources` map), falls back to the first caster class when no
source was recorded, and falls back to `'known'` when even that is missing,
so a legacy character keeps casting what it knows. `isSpellCastable` and
`castableLeveledIds` apply the rule, and `Casting.canCast` delegates to them,
so the cast validator, the sheet's spell section, and the combat screen's
action bar all agree on what is castable.

The Spellbook tab follows the same rule. Prepare and Unprepare actions and
the prepared count appear only for a character with a prepared-rule class
(`Classes.hasPreparedCaster`). A known caster's entries show Learn and Forget
alone. A multiclass character mixes the two rules per spell, and each learned
spell follows its own class's rule.

Creature casters are not affected. Their authoring dialogs stamp every
picked leveled spell into both `known` and `prepared` (`spellbookFromIds`),
so whichever list their class reads, the whole picked set stays castable.

`SpellLearning.js` decides which spells the Spellbook tab offers. Each caster
class learns as a single-class caster of its own class level, which is the
5e multiclass rule. `classSpellLevelCap` reads the top row of the class's
own slot table, or the pact slot level for a warlock. `canLearnSpell` then
requires a class that lists the spell and reaches its level. A cleric 3 /
wizard 3 has third-level slots on the combined table, but neither class
reaches Fireball. The module never reads the character's slot pools, because
the combined slot level is the wrong cap for learning.

Known casters have no spells-known cap, because the app does not model a
per-level spells-known curve. Prepared casters swap their list freely,
rather than only on a long rest.

## Saving throws

`entities/Checks.js` has both halves of a save. `saveBonus(character, ability)`
returns what a character adds: the ability modifier taken from the
equipment-adjusted scores, plus the proficiency bonus when the class granted
that save. `resolveSave(bonus, dc, { mode, rng, conditions })` rolls one d20
through the shared dice roller and reports
`{ roll, total, dc, natural, success, rider }`. It succeeds on a tie with the
DC. `savingThrow(character, ability, dc, opts)` composes the two functions and
adds `proficient`, so a readout can state why the number is what it is.
`conditions` are the chips the roller has (see
[Riders on later rolls](#riders-on-later-rolls) below).

The two entry points exist because a character does not always roll a save.
`Casting.js`'s save effect resolves every target through `resolveSave`, and
its targets can be creatures, which do not record ability scores the way a
character does and have no proficiency lists. The resolver therefore
takes a bonus that the caller worked out, and only the character path goes
through `saveBonus`.

The cast dialog reflects that split. `app/combatants.js`'s `targetSaveBonus`
returns a derived bonus for either kind of combatant, and nothing only for a
target deleted while the dialog sat open.
`app/spellCast.js` decorates a save spell's targets with whatever comes back,
shows it in the target picker (`Rook (WIS +6)`, in place of the AC that a
save never reads), and asks for one hand-entered number to cover the targets
that have none. When every target has its own bonus, the app leaves the
field out. The session log names the bonus beside the roll, matching how a
weapon attack's log names the ability and proficiency behind its total.

A natural 1 and a natural 20 are ordinary results on a save, unlike on an
attack roll, so the app reports `natural` for the log rather than acting on
it.

Ability checks work the same way. `checkBonus` is the ability modifier plus the
proficiency bonus for a skill the character is proficient in, doubled where the
character has expertise. `checkAbility` says which ability a key rolls: a skill
id resolves through `data/skills.js`, and one of the six ability keys stands for
itself, which is how a bare Strength check works. `resolveCheck` and
`abilityCheck` mirror the two save entry points, and the DC is nullable, because
a GM often calls for a check with no number in mind and reads the total out
loud. `passiveScore` is 10 plus a bonus, plus or minus 5 for advantage or
disadvantage, and `passivePerception` applies it to the Perception bonus.

`ui/CharacterChecks.js` puts the six saves and the 18 skills on the sheet, with
a training dot that reads hollow, solid, or ringed for untrained, proficient, or
expertise, and passive Perception under the skills. A row is a button when the
host wires `onCheck`, and a plain line otherwise, which is a spectator's sheet.
`app/checkRolls.js` is that handler. It takes the bonus from the pure helpers,
rolls the rider dice, and hands one flat modifier to the dice tray, so the tray
throws the only d20 and the log line breaks the number back down. A sheet roll
has no DC.

Expertise reaches a character in two ways. The Expertise features of the
Rogue and the Bard grant it through the pending-grant flow (see Class
features above). The Set expertise button on the Progression section is the
GM's hand grant for subclasses and homebrew: a multiselect over the
character's proficient skills, committed through `Progression.withExpertise`.
A creature has no expertise, so its bonus comes from its training alone.

## Concentration

Many spells last only as long as the caster keeps concentrating on them, and
a caster holds only one at a time. `entities/Concentration.js` models this
over a `concentration` field on the character. The field records the spell's
id and name, the level it was cast at, and `remaining`, the rounds left. A
character concentrating on nothing has this field set to null.

- `begin(character, spell, slotLevel)` starts one. It takes `remaining` from
  the spell's duration through `durationInRounds`. A duration that no round
  counter fits, such as open-ended or measured in days, reads null and lasts
  until something breaks it. Beginning a second spell ends the first. The
  displaced spell comes back in `dropped`, so the caller can state what was
  lost and clear its effects.
- `drop(character)` ends concentration, however it ended.
- `concentrationDC(damage)` is 10, or half the damage when that amount is
  more. `checkOnDamage(character, damage, opts)` rolls the CON save against
  it through `savingThrow`, and drops the spell on a failure. It reports the
  whole save, so the log can show the DC and the roll behind the outcome.
- `tick(character)` spends one round of the duration and reports `expired`
  when the duration runs out.

The `Concentrating` chip beside the state is a display element only. `begin`
writes it, `drop` removes it, and `tick` rewrites its counter from
`remaining` rather than decrementing it. This lets the round wrap run the
shared `tickConditions` over the same list first: whatever that function did
to the chip, the number the GM reads afterward is the state's own.
`Conditions.js` exports the chip's name as `CONCENTRATING`, so the two
modules agree on the spelling.

`app/spellCastResolve.js` begins concentration when a cast of a
concentration spell succeeds. It writes this onto the same entity that the
spent slot and the consumed component are written to, so one store call
covers all three.
`app/combatants.js`'s `applyToTarget` calls for the save on damage. This
covers weapon hits and spell damage alike, because both arrive through this
function. A character knocked to 0 HP loses the spell outright without
rolling. The round wrap in `app/encounterWiring.js` ticks the duration and
logs a spell that ran out.

Only characters concentrate. A creature has no field to write, so a foe's
concentration is still a chip that the GM adds and removes by hand, which is
the reason `Concentrating` stays in the pick-list. The character
sheet's `-1 HP` button is bookkeeping rather than a damage event, so it
calls for no save. Damage that tests concentration goes through an attack
or a cast.

## Death saves

A party character at 0 HP is not dead yet. It rolls death saves until three
succeed or three fail. `entities/DeathSaves.js` models this over a
`deathSaves` field on the character, which records `successes`, `failures`,
and `stable`. A character who is not dying has this field set to null.

- `isDying`, `isStable`, and `isDead` read the four positions apart: standing,
  rolling, out of danger at 0 HP, and killed by three failures.
- `dropToDying(character)` starts the tracker. A second call on a character
  who already has one changes nothing, so the failures already rolled stay.
- `clearDying(character)` takes the tracker away, which is what a heal above 0
  HP and a natural 20 both do.
- `stabilize(character)` sets `stable` and resets the counters. The character
  stays at 0 HP and stays unconscious. A dead character cannot be stabilized.
- `judgeDeathSave(state, roll)` maps one rolled d20 to the next tracker state
  and names the outcome: `revive`, `success`, `stable`, `failure`, or `dead`.
- `rollDeathSave(character, opts)` rolls the save and applies the outcome. It
  is the headless path, for tests and for callers with no dice tray.
- `recordDamage(character, { crit })` is damage on a character already at 0 HP.

The DC is a flat 10. A natural 20 revives the character at 1 HP, whatever the
counters say. A natural 1 counts as two failures, and it fails even when a
rider pushes the total past the DC. Otherwise the total beats the DC on a tie,
as every other save does.

The roll goes through `Checks.resolveSave` with a bonus of 0, because a death
save adds no ability modifier and no proficiency, and going through that
function lets a rider such as Bless reach the roll. No ability key is passed, so
the automatic failure that unconsciousness imposes on Strength and Dexterity
saves does not catch a death save.

A heal above 0 HP clears the tracker whatever it recorded, a dead one included.
Nothing else brings a dead character back, so this is the GM's way of deciding
that the death did not stand. That rule lives in `Character.restoreResource`,
because that is the one function every heal in the app goes through: the combat
screen's heal control, the sheet's HP stepper, a healing spell, and a rest. A
character standing at 5 HP can therefore never still read as dying.

Damage on a character who is already at 0 HP skips the roll and is an
automatic failure, and a critical hit counts as two. Damage on a stable
character makes it dying again, with that failure against it, which is the 2014
rule. The hit that drops the character to 0 HP in the first place costs no
failure. Damage large enough for instant death is out of scope.

`Unconscious` goes on with the tracker and comes off with it, so no caller tracks
both halves. `Conditions.js` exports the chip's name as `UNCONSCIOUS`.
That chip gives an attacker advantage and a melee hit an automatic crit,
through the condition-effect table below, so the crit rule needs no special
case here.

`app/combatants.js`'s `applyToTarget` drives all of this, in `foldDeathSaves`.
Every hit and every heal arrives through that one function, so the three cases
(the drop to 0, a hit while down, and a heal back above 0) are decided in one
place. The consequence folds into the same write as the HP change.
`applyToTarget` takes `opts.crit` for the doubled failure, and
`app/weaponAttack.js` passes it. Spell damage does not crit here and leaves it
off.

The roll itself comes from a button, on the combat screen's active column and
on the character sheet, not from the turn advance. `retryImposedSaves`
auto-rolls bookkeeping saves, but a death save is the player's roll, and the
dice-tray convention wants a throw that somebody asked for.
`app/deathSaves.js` owns both controls. It follows the split that
`app/checkRolls.js` describes: the riders roll app-side, the tray throws the
only d20, and `judgeDeathSave` reads the result. Because the tray throws the
d20, this path does not call `rollDeathSave`, which would throw a second one.

`view/DeathSaveView.js` turns one tracker into the words and the pip counts a
panel draws, and `ui/DeathSaveBlock.js` builds the line from it. The combat
screen and the character sheet both call that builder, so neither can describe
the same state differently. `CombatantRow.deathSaves` brings the tracker onto
the board, where a card shows a Dying, Stable, or Dead chip beside its
conditions.

Only characters roll death saves. A creature is defeated at 0 HP.

## Conditions a spell imposed

A failed save against a spell can leave the target with a condition, and
that chip records where it came from. `Condition.source` records the spell's
id and name, the caster's id, and the ability, DC, and bonus that the save
was rolled with. A chip that the GM adds by hand has no source, so nothing
below applies to it. `entities/ImposedConditions.js` owns the rules over
that record:

- `removeImposed(list, casterId, spellId)` removes every chip that one cast
  wrote, reports them, and hands the original list straight back when none
  matched.
- `repeatSaves(list, { bonusOf, rng })` rolls one save per chip whose source
  says that the save ends the effect, against the DC recorded on it, and
  drops the chips that succeeded. `bonusOf` decides what the creature adds.
  It defaults to the bonus stamped at cast time, which is all there is for a
  foe.

Both matches need the caster and the spell to agree, because a caster with
two spells running ends one at a time, and two casters that land the same
spell on one target keep their own chips.

`app/combatants.js` drives them, because only the wiring can see every
collection that a target lives in. `endSpellEffects(app, casterId, spellId)`
sweeps the characters and the creatures, then logs each one
that walked free. It also despawns the creatures that the cast summoned, which
the section below covers. It runs whenever a caster stops holding a spell: the sheet's
Drop control and its hand-removed `Concentrating` chip (through
`onConcentrationEnd`, wired in `app/partyWiring.js`), a failed CON save or a
drop to 0 HP in `applyToTarget`, a displacing cast in
`app/spellCastResolve.js`, and a duration that runs out at the round wrap.
`retryImposedSaves(app, combatantId)` rolls the repeated saves, called from
the turn advance (`advanceCombatTurn`) for whoever's turn is ending. A party
character rolls its live bonus there rather than the stamped one, so a save
granted since the cast counts.

The sweep always runs after the write that it follows, because both touch
`state.characters` and `state.creatures`, and a stored pre-sweep copy would
bring the chips back.

A spell states that its condition allows the retry with `saveEnds` on its
save effect. `Library.normalizeSpell` accepts this alongside a condition and
drops it when there is no condition. Hold Person and Power Word Stun ship
with it.

The retry, the effect table below, and the rider are the rules that read a
chip. A spell whose only target shook the effect off also leaves the caster
concentrating, because nothing tracks how many targets a cast has left.

## Summoned creatures

A spell can put new creatures on the map. Its `summons` effect names one
library creature template and a count. `entities/Summons.js` owns the rules
over a `summonedBy` field on the creature. The field records the spell's id
and name, and the caster's id, the same record that a spell-imposed chip has
in `Condition.source`, so one sweep ends both halves of a spell. A creature
that the GM placed has no such field.

- `summonCount(effect, steps)`, in `Casting.js`, is the base `count` plus
  `countPerStep` for each scaling increment.
- `stampSummon(creature, source)` writes the record onto a fresh creature.
- `isSummonedBy(creature, casterId, spellId)` matches one cast. Both halves
  have to agree, for the same reason `removeImposed` needs both.
- `despawnSummons(list, casterId, spellId)` removes every creature of one
  cast, reports them, and hands the original list back when none matched.

The template reference is a name, not an id. The library merges creature
entries by name, so a name still finds the template after a GM customizes it.
`Library.activeCreatureByName` is the lookup. `castPlan` refuses a cast whose
name matches no template. That refusal lands before the dialog opens, which is
before a slot is spent.

`app/summons.js` has the spawn. `spawnSummons` reads the template, builds one
creature per count through `Creature.fromTemplate`, and puts them all on the
tile of the party. That tile is the only place a cast can reach, because the
app cannot measure distance between two tokens. Each creature takes its own id.
The side it fights on is the disposition of the template, so a hostile template
fights the party. A GM who wants a summon that stands with the party writes a
friendly template.

`endSpellEffects` despawns them, in the same pass that sweeps the condition
chips. The despawn runs before the guard that returns early on an empty sweep,
because a summoning spell usually imposes no chip at all. A defeated summon
leaves with the living ones. The log names each creature that vanishes.

A cast that nothing concentrates on still spawns its creatures, and the log
marks that cast untracked. Only characters concentrate, so the summons of a
creature caster are always untracked. The GM removes those by hand.

A summons cast during a fight joins the running order.
`Initiative.addParticipant` sorts the newcomer in and keeps the turn on whoever
has it. The initiative is a straight d20 plus the DEX modifier, the same roll
the setup dialog fills. A newcomer that sorts above the current combatant
therefore acts for the first time on the next round. Despawning the last
creature staged on the tile of the party ends the fight, through
`syncCombatLocation`.

## Condition effects

`Conditions.js` owns the pick-list and the list algebra and says which names
exist, and `entities/ConditionEffects.js` says what those names do.
`CONDITION_EFFECTS` is a table keyed by the lowercased name, so a chip a GM
typed by hand matches a row when it happens to spell one of them, and has no
rule when it does not. A row has up to seven fields:

- `attacks` slants the attack rolls its holder makes.
- `attacksAgainst` slants the attack rolls made at its holder. It is one slant,
  or a `{ melee, ranged }` pair for prone, which is the only condition that
  helps one reach and hurts the other.
- `checks` slants the holder's ability checks.
- `saves` names the abilities whose saving throws the holder rolls at
  disadvantage, and `autoFailSaves` names the abilities that fail with no roll.
- `meleeAutoCrit` turns any melee hit on the holder into a critical one.
- `noActions` costs the holder its turn.

Eleven of the fifteen names in the pick-list have a row. Charmed and grappled
do not: charmed needs a charmer to point at, and no part of the app relates two
combatants, while grappled sets speed to zero and nothing tracks movement.
Deafened costs only hearing. Concentrating is a display chip over the
concentration state described above. Exhaustion is not in the pick-list at
all, because it is a level rather than an on-or-off state, and `Exhaustion.js`
owns it.

The reads over that table are pure and take chip lists only:

- `conditionEffect(name)` is the table lookup, and `effectsOf(conditions)`
  pairs each chip that has a row with it, dropping the rest.
- `combineModes(slants)` folds a set of slants by the 5e rule: any advantage
  and any disadvantage cancel to a straight roll, and otherwise the one kind
  present wins. Counting rather than pairing makes the arrival order
  irrelevant. It returns null, not `'normal'`, when nothing applies, because
  the dice tray injects its standing advantage toggle whenever a caller names
  no mode, and a helper that always returned a mode would cancel that toggle
  on every roll.
- `rollMode({ roller, target, kind, melee, ability })` is the mode one roll
  takes from the chips on both sides. Only an attack reads the target's chips.
  A save or a check is rolled against a number, and whoever set that number
  does not slant it.
- `modeReasons(query)` names the chips behind the mode, so a log line can
  explain a cancelled pair rather than printing a straight roll with no reason.
- `canAct(conditions)` is false when any chip has `noActions`.
- `autoCrits(conditions, { melee })` is true when a melee hit on the holder
  crits. The printed rule is a hit from within 5 feet. The app measures no
  distance by design, and a melee weapon is as close as it gets.
- `saveOutcome(conditions, ability)` reports `{ autoFail, failedBy, mode }` for
  one save. The caller checks `autoFail` first, because that save never reaches
  the dice.

The sites that read the table:

- `app/weaponAttack.js` builds one query from both combatants and takes the
  reach from the weapon's kind (`Weapons.weaponKind`). It also asks
  `autoCrits` for the defender, so a paralyzed target crits on any hit.
- `app/spellCastResolve.js` folds the chips' mode with the GM's dialog choice
  through `combineModes`, so neither overrides the other. A save spell stamps
  `autoFailSave` on a target that fails outright, and an attack spell treats a
  touch range as melee reach. The caster view has no chips, so the real
  combatant's list arrives as `casterConditions`.
- `app/checkRolls.js` handles a save or a check rolled from the sheet. An
  automatic failure logs and stops before the tray opens.
- `combat/CombatView.js` asks `canAct`. `skipsTurn(found)` is true for a
  combatant that is downed, that resolves to nothing, or that cannot act, and
  `app/encounterWiring.js` passes it to `advanceTurn`. The same answer marks the
  row `incapacitated`, which is how a card and a ribbon chip show a combatant
  that keeps its place in the order and loses the turn.

Every attack, check, and save in the app reaches one of those sites, so a chip
applies wherever the roll is thrown. Nothing writes a chip from a roll: the
sites read, and the GM or a spell writes.

## Riders on later rolls

A chip can change the rolls its holder makes afterwards. Bless adds 1d4 to an
ally's attack rolls and saving throws. Bane subtracts the same from a foe's.
`Condition.rider` records that as `{ rolls, dice, die, flat }`: which rolls it
touches, how many dice, which die, and a flat amount. The dice count is
signed, so Bane is Bless with a minus sign and there is no second field for
the direction. `entities/Riders.js` owns the model:

- `normalizeRider(value)` coerces a written block, the same tolerant parse
  that every other spell field gets. A rider that touches no roll, or that
  adds neither dice nor a flat amount, reads as absent.
- `chipRider(condition)` reads a stored chip's rider through that parse.
  Chips live in the campaign save and nothing validates their fields on the way
  in, so a hand-edited save can contain a rider with no roll list or with a
  die that does not exist. Every read of a stored rider goes through this
  function, and a rider the app cannot use reads as a chip that has none.
- `activeRiders(sources, kind)` picks the sources that touch one roll kind
  and pairs each with its cleaned rider.
- `rollRiders(sources, kind, rng)` rolls them and returns
  `{ modifier, note }`. The note names each source and the faces it rolled,
  so a log line can explain the number.
- `riderText` and `riderSummary` render a rider for a chip tooltip or a spell
  readout.


A source is anything with a name and a rider. A condition chip is one, and so
is a taken feat's stamp. `FeatChoices.featRiders` reads a character's stamped
feat riders as sources, and `FeatChoices.riderSources` joins them with the
condition list. The roll sites below call `riderSources` instead of reading
`conditions` directly, so a feat bonus and a chip bonus travel the same path
and print in the same note. A feat rider lasts as long as the feat: it is a
standing bonus with no duration and no chip on the conditions bar. The
condition-effect table in `ConditionEffects.js` matches chips by name, so a
feat source never enters a list that table scans, and a feat that shares a
condition's name cannot slant a roll. A cast's target therefore has its
chips in `conditions` and its feat riders in a separate `riders` field. Both
join its saving throw, and only the chips decide advantage or an automatic
failure.


The rider dice roll inside `rollRiders` rather than joining the caller's own
dice selection. A bonus and a penalty then resolve the same way, and a save,
which has no dice tray, works identically to an attack, which has one.

The roll sites that read riders:

- `app/weaponAttack.js` reads the attacker's own chips before it loads the
  tray, and puts the note in the log beside the dialog's own modifiers.
- `Casting.js` rolls the caster's chips once per projectile, because each
  projectile is its own attack roll. An auto-hit projectile rolls no attack,
  so no rider touches it. The caster view has no conditions, so
  `app/spellCast.js` passes them in from the real combatant as
  `casterConditions`. Its log lines name every ray's dice, because the tally
  line prints no to-hit numbers of its own.
- `Checks.resolveSave` rolls the roller's chips. Every save in the app goes
  through it, so `savingThrow`, a spell's save effect, and a repeated save all
  get riders from that one place. `savingThrow` reads the character's own
  chips without being asked, so a blessed caster keeps concentration through
  damage more easily.
- `app/checkRolls.js` reads the roller's chips for a save or a check rolled from
  the sheet. It calls `rollRiders` itself rather than going through
  `resolveSave`, because the tray owns the d20 there, and the log names the
  faces beside the ability modifier and the proficiency.

A rider lasts as long as its chip. Nothing spends a rider after one roll, so a
spell that grants a die to a single roll is wider here than in print. Guidance
is the built-in case: its chip stays until the duration runs out or the caster
stops concentrating, and the GM takes it off after the check it paid for. The
roll sites read chips and never write them, and `Condition.rider` has no uses
field, so a per-use rider would need a counter on the chip and a decrement at
every one of those sites. A chip ends by its duration, a concentration drop,
or a GM removal.

A rider reaches a target either through a save spell's `effect.rider`, which
rides the chip that a failed save imposes (how Bane works), or through a
`buff` effect, which puts a chip on each willing target with no roll at all
(how Bless and Guidance work). A buff names its chip through `effect.condition`, and
`Casting.buffCondition` falls back to the spell's own name when it names none.
The chip has the same `ConditionSource` a failed save writes, so
`endSpellEffects` sweeps a buff off every recipient when the caster stops
concentrating.

Two riders on one creature both apply, so Bless and Bane cancel out over the
long run rather than one winning. Two chips of the same name cannot coexist:
`addCondition` matches case-insensitively, and the newer chip replaces the
older one along with its source and its rider.

The hand-add dialog in `ui/ConditionsBar.js` takes a name and a duration only.
A chip a GM adds by hand has no rider, and a chip merely named `Bless`
changes no roll. The dice tray already takes a bonus die for that case.

## The UI layer over entities

`ui/CharacterSheet.js`, `ui/InventoryPanel.js`, and `ui/EncounterPanel.js` are
the DOM-wiring layer over these modules. They follow the same mount-function
pattern as `ui/DiceTray.js`. Each keeps a local mutable copy of its entity,
re-renders after every interaction, and reports the updated value through an
`onChange` callback for a caller to persist. The sheet re-renders by writing
values into the DOM that it already has whenever the structure has not
changed, as
[UI components](ui-components.md#the-character-sheets-structure-check)
describes.

The sheet's parts live in their own modules: the ability badges and their
breakdown popover in `ui/CharacterStatBadge.js`, the HP bar and slot pips in
`ui/CharacterBars.js`, the castable-spell list in `ui/CharacterSpells.js`, and
the progression section in `ui/CharacterProgress.js` (class rows with
subclass, the pending-level class assignment, pending ASI/feat choices,
unlocked features, and the hit-dice pool). What the HP bar and the slot pips
*say* is split off into `view/StatBars.js`: the fill percentage, the low-HP
threshold, the column headings, and every string that a screen reader gets.
`ui/CharacterBars.js` keeps the elements and the update loop.

The two Library authoring forms split the same way. `ui/ItemForm.js` and
`ui/SpellForm.js` read their controls. `entities/ItemDraft.js` and
`entities/SpellDraft.js` decide what the values mean. `assembleItem` and
`assembleSpell` take the strings and booleans that a form has and return
the finished item or spell. They drop the fields that the chosen type or
effect kind does not use, so switching type before submitting cannot leave
armor fields on a rope or a save ability on an attack. Both run the same
tolerant parsers that a library import does, which keeps a typed entry and
an imported one agreeing about what a value means.

The app stores the background name and the assembled proficiency lists, but
does not yet render them. They are meant to appear inside saving-throw and
skill blocks rather than as a static list.
