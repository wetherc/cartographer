---
---
# Entities

*Explanation. Back to the [architecture overview](../architecture.md).*

`src/entities/` contains the values that the campaign's rules act on:
creatures, resource pools, and characters. Every module in the directory is
pure logic, and every write returns a new value. The plain data catalogs that
these modules read (classes, races, backgrounds, skills, spells, feats, the
challenge-rating tables, and the built-in creatures) live in `src/data/`.

| Topic | Sections |
| --- | --- |
| The models | [Immutable updates](#immutable-updates), [The creature](#the-creature), [The character foundation](#the-character-foundation) |
| Weapons and armor | [Damage terms](#damage-terms), [The weapon property model](#the-weapon-property-model), [Armor class](#armor-class), [Armor proficiency](#armor-proficiency) |
| Spells | [Spell timing](#spell-timing), [Multi-projectile spells](#multi-projectile-spells), [Material components](#material-components), [Ritual casting](#ritual-casting), [Known and prepared casters](#known-and-prepared-casters) |
| Rolls and lasting states | [Saving throws](#saving-throws), [Exhaustion](#exhaustion), [Concentration](#concentration), [Death saves](#death-saves) |
| Effects that spells leave | [Conditions a spell imposed](#conditions-a-spell-imposed), [Summoned creatures](#summoned-creatures), [Condition effects](#condition-effects), [Riders on later rolls](#riders-on-later-rolls) |
| The DOM layer | [The UI layer over entities](#the-ui-layer-over-entities) |

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
  `ResourcePool` through `Resource.js`. `addItem` and `removeItem` merge or
  split inventory stacks by item id, and each stack drops once its quantity
  reaches 0.

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

## The creature

`entities/Creature.js` and `entities/CreatureMap.js` (types in
`src/types/creature.ts`) define one model for everything that the party can
meet on the map. One `Creature` covers a foe, a townsperson, and everything
between them. Its `disposition` field decides its side in a fight. A hostile
creature fights the party, and every other creature stands with the party.
The state has one `creatures` list, which every combat, map, and story panel
reads.

A creature has `maxHP`, `currentHP`, a `stats` block, a `weapon`, an
`armor`, `conditions`, a `location`, and a `met` flag. Optional fields add a
`role` and `notes`, a challenge rating, saves and skills, damage defenses, and
spellcasting, which the subsections below describe. `level` and `tier` are
optional authoring inputs that pick the default stats and gear for a new foe.
A townsperson has no level.

`createCreature` resolves the weapon and the armor once, at creation. An
absent value takes the level default when the creature has a level, and null
when it has none. A stored null therefore means unarmed or unarmored on
purpose. `withDefaults` fills absent gear with null only, and no read path
derives gear from the level again, so an absent field has one meaning
everywhere.

`isCreature(entity)` tells a creature from a character. A creature always has
a `disposition`, and a character never has one. Every caller that tells the
two apart uses this one test.

### Creature AC

`effectiveStatBlock(creature)` is the only AC read. It returns the stat block
with the worn armor in place of the unarmored 10 + DEX, plus every active
timed stat modifier. The stored AC is the AC without armor.

`EnemyArmor.js` has the armor rule. The AC is the armor's `baseAC`, plus the
DEX modifier that its `armorWeight` allows (all of it for light, at most +2
for medium, and none for heavy). Any authored AC above 10 + DEX adds on top.
A flat bonus over the unarmored AC would give a DEX 16 creature in plate an AC
of 21, where the rule gives 18.

### Placement and templates

`CreatureMap.js` has the placement reads and writes. `meetCreatures` marks
every creature on the party's tile as met. `followParty` moves each companion (a
creature with `travelsWithParty` and HP above 0) to the party tile through
`moveCreature`, which leaves `met` alone. The GM tab runs it at the start of
`refreshLocationPanels` in `app/mapTravel.js`. `toTemplate` never copies
`travelsWithParty`. `knownCreaturesAt` is the player
view of the non-hostile creatures, and `discoveredHostiles` is the player view
of the hostile creatures, through the fog of war. `encounterGroup` lists every
creature within `ENCOUNTER_RADIUS` grid steps of the party's tile, and
`hostileGroup` keeps its undefeated hostiles. The [Combat](combat.md) guide
describes how the encounter reads them.

`CreatureTemplate.fromTemplate` builds a creature from a library template, and
`toTemplate` builds a template from a creature. A library file has no version
field, so `fromTemplate` reads every template format that a file can contain.
A `statBlock` field reads as `stats`, and a template with no disposition reads
as hostile.

### Defeat and cleanup

Every creature follows the same combat rules. `maxHP` defaults to 4, the HP of
the 5e commoner, and hit points are never absent. A creature at 0 HP is
defeated, with no death saves, because only characters roll them. The combat
code branches on `isCreature`, so a character and a creature never convert
into each other.

A defeated creature stays in `state.creatures` until the GM removes it. Each
defeated foe adds about 500 characters to the save, and every save packs it.
`CreatureMap.clearableDefeated` picks the hostile creatures at 0 HP in one
node that no running fight lists. The Build rail passes it the node in view,
and `clearDefeated` in `app/creatureForm.js` removes them after one confirm.

`clearDefeated` writes through `commitCreatures`, the same path as a single
delete, so `pruneCreatureLinks` removes their quest links. The travelogue note
uses `nameTally` ("Goblin x3, Wolf"), and the campaign keeps no other record
of the removed foes. A foe in the order of a running fight stays, because the
fight end still counts its experience points.

### Authoring

One dialog edits the one model. `app/creatureFields.js` describes the fields,
and `app/creatureForm.js` writes `state.creatures` through `createCreature`
and `editCreature`. A blank level marks a townsperson, which stores no level
and no tier, and its gear pickers start at None. A typed level fills the
pickers and the `STAT_KEYS` inputs with the defaults of that level. The
read-back has no gear fallback, so the creature gets what the picker shows,
and an empty picker means unarmed.

### The challenge rating

`src/data/challenge.js` has the rating tables. A rating is a plain number, so
the four ratings below 1 are stored as `0`, `0.125`, `0.25`, and `0.5`.
`crLabel` prints the fractions in the usual way (`1/8`), and `crOptions` builds
the picker. `crXP` is the SRD experience-point table, which the difficulty hint
and the XP award at the end of a fight both add up. A rating of 0 is worth
10 XP, which is one of the two values that the rules give it.

`Modifiers.crProficiencyBonus` is the proficiency bonus of a rating. It calls
`proficiencyBonus` at the rating, because the rating ladder and the character
level ladder take the same steps, so one function computes both.

The `cr` field on a creature is optional, and an absent field means unrated.
`CreatureChecks.creatureProficiencyBonus` is the only reader of the ladder. A
rated creature reads it at its rating. An unrated creature reads it at its
level, then at its caster level, and at 1 when it has neither. Saves, skills,
spells, and weapon attacks (`AttackResolve.attackerProficiency`) all call this
function, so a creature swings and saves with the same bonus. An unrated
creature is worth no XP.

`coerceCR` is the only gate for the field. It accepts a number or a written
rating such as `"1/4"`, and it drops any value that is not a defined step. It
does not round the value to a nearby step. `Creature.js` and
`CreatureTemplate.js` run every write path (`createCreature`, `editCreature`,
`withDefaults`, `toTemplate`, and `fromTemplate`) through it, and `Library.normalizeLibrary` runs library entries
through it. A saved creature with no `cr` field is unrated, so the field needs
no migration step.

Each built-in hostile creature has the rating of its SRD counterpart. The
built-in townsfolk are unrated.

### The difficulty hint

`src/entities/EncounterDifficulty.js` rates a fight by the 5e experience-point
budget. `XP_THRESHOLDS` lists the four thresholds (easy, medium, hard, and
deadly) for each level from 1 to 20, and `partyThresholds` adds up the row of
each character. `rateEncounter` counts living characters only. A dead
character adds no budget and does not count toward the party size, but a dying
character counts.

`adjustedXP` adds up the `crXP` of the foes and multiplies the sum by a
multiplier for the foe count. The multiplier is 1 for a single foe and 4 for
fifteen or more. The party size moves the multiplier one step along the ladder
instead of scaling the value. A party of one or two moves it one step up, and a
party of six or more moves it one step down. The end steps of the ladder, 0.5
and 5, are reachable only through that shift.

`rateEncounter` compares the adjusted XP with the thresholds and names the
band. A total that meets a threshold is in that band, so a total exactly on the
medium line is medium. Below the easy threshold, the band is `Trivial`, which
the rules leave unnamed. An unrated foe is worth no XP but still counts toward
the multiplier, because it still takes a turn. `rateEncounter` reports the
number of unrated foes, so the hint can say that its total is low.

`difficultyLine` is the line that the Encounters panel prints for the GM, over
the same live creature list that the Active tab shows. The hint changes
nothing, awards no XP, and never blocks a fight. The XP award at the end of a
fight is separate (see [Combat](combat.md#ending-a-fight)).

### A creature's saves and skills

A creature has an optional `proficiencies` field with two lists: the saving
throws it is trained in, and the skills it is trained in. A creature records
no armor, weapon, tool, or language training, because no rule checks a
creature for those, and it has no expertise. An absent field means that the
creature is trained in nothing.

`Proficiencies.normalizeCreatureProficiencies` cleans the set, and the write
paths spread `creatureProficiencyFields`. A creature trained in nothing stores
no field, so clearing both pickers removes the record. The cleaner drops an
entry that names no ability and no skill, so no bonus can apply to a roll that
the app cannot make. The same two functions gate `Library.normalizeLibrary`,
so a hand-edited library file goes through the same cleaner.

`src/entities/CreatureChecks.js` derives the numbers. `creatureSaveBonus` and
`creatureCheckBonus` are the creature versions of `Checks.saveBonus` and
`Checks.checkBonus`. Each is the ability modifier from `effectiveStatBlock`,
plus `creatureProficiencyBonus` where the creature is trained, minus the
exhaustion penalty. `proficiencySummary` is the line that both creature panels
print.

The creature and character functions are separate because a creature keeps
its scores in a different field and reads the ladder by rating, not by level.
One merged function would also make `Checks.js` import `Creature.js`, which
imports `Character.js`, and the imports of `Character.js` lead back to
`Checks.js`, which is an import cycle.

No creature stores a bonus. `combatants.targetSaveBonus` derives one for
either kind of combatant, so the cast dialog does not ask the GM to type a
foe's save. The panel and the save roll get the number from the same function,
so an edit to a rating or a stat cannot leave an old bonus behind.

A derived bonus can be lower than the bonus in an SRD stat block. A printed
bonus can include a trait that this app does not model, such as the goblin's
Nimble Escape.

### Creature types and condition immunities

A creature has an optional `creatureType`, one of the fourteen SRD types in
`CreatureType.CREATURE_TYPES`, and an optional `conditionImmunities` list of
condition names. `entities/CreatureType.js` cleans both, and the write paths,
load coercion, template capture and spawn, and `Library.normalizeLibrary`
spread `creatureTypeFields`, so a creature with neither stores no field. An
unknown type or condition name drops out. A party character stores no type
and counts as humanoid through `creatureTypeOf`.

An optional `multiattack` count says how many times a creature swings its
weapon for one Attack action. A creature has one weapon, so the count is all
the trait needs. `entities/CreatureAttacks.js` cleans it: a value below 2
stores no key, and a value above `MAX_MULTIATTACK` (6) stops there. The same
paths spread `attackTraitFields`, so an older save loads with one swing.
`swingsPerAction` takes the higher of `Features.attacksPerAction` and the
Multiattack count, and the combat code asks it in place of
`attacksPerAction`.
An optional `multiattackDisadvantage` names the swing of the Multiattack that
rolls with disadvantage, counted from 1. `coerceWeakSwing` drops a number
below 1 or past the last swing, and a creature with no Multiattack stores no
key. A `redirectAttack` flag stores only `true` and marks the reaction that
makes an ally the target of an attack (see the Redirect Attack pause in
[Combat](combat.md)). It is not an attack trait, but `attackTraitFields`
cleans it, so the creature, template, and library paths all copy it.
`legendaryActions` (per round) and `legendaryResistance` (per day) go
through `attackTraitFields` for the same reason. `coerceLegendary` drops a
count below 1 and stops at `MAX_LEGENDARY` (5). The combat screen spends
both (see [Combat](combat.md)). The creature records its spent uses of
Legendary Resistance in `legendaryResistanceUsed`, and the party long rest
removes that field.
A `packTactics` flag stores only `true`. A `surpriseAttack` stores a dice count and a
die size (d4 to d12), and `coerceSurpriseAttack` drops any other value. A creature weapon can store an
`onHitSave` of an ability, a DC, and a condition, which `combat/HitSave.js`
cleans. `EquipmentPresets.copyEnemyWeapon` and `Library.normalizeLibrary`
keep a clean rider and drop a broken one, so a hand-edited library file
loads with no save rather than a save of an unknown ability. The combat code
cleans the rider again before it rolls.

`applyConditionToTarget` in `app/combatantWrites.js` checks the immunity list
before it writes a chip. A creature immune to the condition keeps its chips,
and the log says so. The spell resolver reads the type through the type rules
of a spell (see [Combat](combat.md)).

A chip with the `noHealing` mod (Chill Touch) stops its holder from regaining
hit points. `HealTarget.healBlocked` reports it for a spell heal, and
`applyToTarget` refuses every other heal of the holder. Temporary HP takes a
separate path, so the chip does not stop it.

### Damage defenses

A creature has an optional `defenses` field with three lists of damage types:
`resist`, `vulnerable`, and `immune`. `entities/DamageDefenses.js` cleans the
lists with `normalizeDefenses`. The write paths and `Library.normalizeLibrary`
spread `defenseFields`, so a creature with no defenses stores no field. A party
character has no lists of its own, and `defensesOf` reads its resistances from
the race snapshot in `raceTraits`.

Both kinds of combatant also resist what their chips name. `defensesOf` adds
the types in each chip's `mods.resist`. A chip with `mods.resistNonmagical`
(Stoneskin) adds bludgeoning, piercing, and slashing only when the caller
passes `nonmagical`. `combatants.defendedDamage` passes it for a weapon hit
whose weapon has no true `magical` field, and never for a spell, so a spell
and a magic weapon get through Stoneskin. The `magical` field is a plain
boolean on an inventory weapon, a library weapon template, and an
`EnemyWeapon`. `assembleItem`, `normalizeLibrary`, and `copyEnemyWeapon`
keep it only when it is `true`, so any code that sets the field to `true`
marks a weapon magical. `MagicWeapon.weaponIsMagical(attacker, weapon)`
makes the call for a weapon hit. It also counts the pact weapon of a Pact
of the Blade warlock, through `PactWeapon.isPactWeapon`.

A buff effect with a `resistChoice` list (Protection from Energy) adds a
Resist select to the cast dialog in `app/spellCastFields.js`.
`spellCastResolve` passes the pick to `castSpell` as `resistPick`, and
`BuffCast.castMods` adds it to the chip's `mods.resist`. A pick outside
the list falls back to the first type in it.

`applyDefenses(groups, defenses, { halve })` takes the `byType` groups of a
damage roll. It returns the total damage taken and a note for each defense
that changed a type. `halve` means a successful save against a spell that
deals half damage, and the function applies it before the defenses, which is
the 5e order. When no defense applies, the function halves the whole total and
not each type, so a spell with two damage types rounds down once.

`combatants.defendedDamage` finds the target by id and calls `applyDefenses`.
The weapon path, the spell attack path (once for each ray), and the save path
all apply its total. Damage typed into an HP stepper has no damage type, so no
defense applies to it.

### Creature casters

A creature casts through the same class rules as a character. It has one
scalar `class` with an optional `subclass`, a `casterLevel`, a `spellbook`,
and slot pools in its `resources`. `entities/Caster.js` connects the two
models. `toCaster` presents any combatant in the field layout that the pure
spell helpers read, and it reads the scalar pair as a class list with one
entry at the caster level. `withCasterFields` writes the fields on a create or
an edit, and it rebuilds the slot pools from the class and the level.

A subclass can make a creature a caster (see
[Subclass casting](#subclass-casting)). `withCasterFields`,
`ensureCasterFields`, and `casterTemplateFields` ask
`ClassCasting.castsAs(class, subclass, level)`. A fighter with the Eldritch
Knight subclass at caster level 3 or more therefore gets slots. A template
with no caster level is judged at level 20, because its spawn level is not
known.

In the creature form, `app/casterFields.js` offers each casting subclass as an
option such as "Fighter (Eldritch Knight)". The option value is
`fighter:eldritch-knight` (`casterValue` and `parseCasterValue`).
`readCasterOptions` raises a caster level under 3 to the subclass level. An
edit keeps a stored subclass while the class stays the same, because the form
sends a subclass only for a casting subclass.

A rated creature takes the proficiency bonus for its spells from the rating
ladder. `toCaster` writes a `proficiency` field on the view from
`crProficiencyBonus`, and `Classes.spellSaveDC` and `spellAttackBonus` use that
field in place of the level ladder. The saves and skills above use the same
source. A character never has the field, so the field does not change a
character's spell numbers. An unrated creature uses the level ladder at its
caster level.

`Caster.casterSummary` is one line with the class and its level, the spell save
DC, the spell attack bonus, and each slot pool as current over maximum. Both
creature panels print it under the proficiency line. The combat card shows the
DC and the attack bonus through the `spellStats` field of the loadout
(`combat/Loadout.js`). The field is null for a viewer with public access, by
the same rule that hides spells and slots.

The built-in creatures include three casters: the Acolyte, the Cult Fanatic,
and the Mage. Their templates are in `src/data/creatures.js` with the other
built-in creatures. A template stores no slot pools, because the pools rebuild
from the class and the caster level on spawn. Where the default spell list
lacks a spell of the SRD stat block, the template uses a similar spell, and a
comment on the entry records the swap.

## The character foundation

Besides its stats and inventory, a `Character` has a class list, a race, a
background, proficiency lists, hit dice, and a level-up flow. Each of these
is a pure module beside `Character.js`, and each takes a value and returns a
new value.

```
  data catalogs (plain data, no logic)
    data/classes.js      hit die, proficiencies, skill choices, caster type,
                         subclasses (with subclass casting),
                         subclass level, ASI levels, features by level
    data/races.js        races and their traits
    data/backgrounds.js  backgrounds
    data/skills.js       the ability of each of the 18 skills
    data/feats.js        the built-in feat catalog
          |
          v
  entity modules (pure logic over character values)
    ClassCasting.js      the caster fields of a class membership, with the
                         subclass applied
    Classes.js           caster reads: spellSaveDC, spellAttackBonus,
                         cantrip and prepared limits
    SpellLearning.js     which spells each caster class can learn at its level
    Multiclass.js        the class-list accessor (see below)
    Races.js             resolveRace: catalog first, stored snapshot fallback
    Backgrounds.js       resolve a stored id to its definition
    Proficiencies.js     assemble and edit the seven proficiency lists
    HitDice.js           max HP derivation, hit dice as resource pools
    ClassPools.js        the use counts of class features as resource pools
    Experience.js        the SRD table of XP per level
    LevelUp.js           pending levels, ASI and feat choices, unlocked features
    LevelAssign.js       commit a pending level to a class
    Subclass.js          set or clear a subclass, then resync slots and spells
    FeatChoices.js       the picks of the take-feat dialog, and feat riders
    FeatRequirement.js   check the ability, armor, and spellcasting
                         requirements of a feat
    FeatureGrants.js     apply and undo the grants of a structured feature
    GrantLedger.js       the grant records of feats and features, rebuilt
                         on undo
    Features.js          class features as numbers that the combat paths use
    Progression.js       the writers that app and UI code call, each followed
                         by derive
    CharacterSpellbook.js  learn, prepare, and copy the spells of a spellbook
    CharacterInventory.js  add, hand over, edit, and remove inventory stacks
          |
          v
    Character.js         the character value itself; withDefaults runs on
                         every load
```

The catalogs describe what a class or a race *is*, and the entity modules
describe what happens when a character *has* one. `types/class.ts`,
`types/race.ts`, and `types/feat.ts` declare the catalog types.

### Derived pools

Spell slots, hit dice, and maximum HP are functions of the class list, the
character level, the ability scores, and the class catalog. The app stores
them as resource pools and does not compute them again on read. Every write
that can change an input therefore has to derive them again, or the pools
stay wrong.

`Progression.derive` is that step. It runs `syncSlotsToLevel`, then
`syncHitDice`, then `syncClassPools`, then `reconcileMaxHP`, and it keeps
what the character already spent from each pool. A character whose pools
already match comes back as the same object.

`ClassPools.js` derives the pools of the class features that have a count of
uses: Second Wind, Action Surge, Rage, Bardic Inspiration, Channel Divinity,
Divine Sense, Lay on Hands, ki, Wild Shape, sorcery points, and Arcane
Recovery. A table of rules gives the 5e SRD count at each class level. Some
counts also read the CHA modifier: Bardic Inspiration uses at least 1, and
Divine Sense uses 1 plus the modifier. Each pool also gets a `recharge` of
`'short'` or `'long'`. Channel Divinity comes from the cleric and the
paladin, and a character with both classes gets the larger count, because a
second class that grants the feature adds no use. Rage and Wild Shape have no
pool at level 20, where their uses have no limit. The pools go after HP, the
slot pools, and the hit dice, ahead of any pool that the GM adds. The ids come
from `PoolIds.js`, so the combat actions can spend a use by the same
constant.

`Character.restAll(character, kind)` refills the pools for a rest of the kind
`'short'` or `'long'`. A long rest refills every pool except one whose
`recharge` is `'none'`, and it restores half of the hit dice. A short rest
refills the pact slots and each pool whose `recharge` is `'short'`. It
leaves HP, spell slots, hit dice, and every other pool as they are, apart
from the `shortRestRegain` points of a pool that sets that field. A pool with
no `recharge` waits for a long rest. The sorcery points get a
`shortRestRegain` of 4 at sorcerer 20, for Sorcerous Restoration.

`CustomPools.js` owns the pools that the GM adds on the character sheet. Such
a pool has an id of the form `pool-N` and a `recharge` of `'short'`,
`'long'`, or `'none'`. The sheet offers Add pool, and an Edit and a Remove
button on each such pool. A derived pool gets no Edit button, because the
next `derive` would write its size and recharge again.


`Progression.js` also exports the writers that app and UI code call:
`withClasses`, `withRace`, `withCustomRace`, `withProficiencies`, `withExpertise`, `applyASI`,
`takeFeat`, `undoLastChoice`, `applyFeatureGrant`, `undoFeatureGrant`,
`setStat`, and `withEquipped`. Each is the writer of a lower module followed
by `derive`. The lower modules keep the raw writers so that they can stay
plain list arithmetic. A call to a raw writer from app code skips the
reconcile and leaves the pools out of date.

### Classes and multiclassing

`entities/Multiclass.js` is the class-list accessor. `getClasses` returns the
memberships. A save that stores scalar `class` and `subclass` fields reads as
a list with one entry. `withClasses` cleans each write, and `primaryClass`,
`classLevelOf`, and `pendingLevels` read across the list. Every class-aware
function goes through this accessor and does not read `character.classes`
directly. The single-class and multiclass paths are then the same path,
because a fighter is a character whose class list has one entry.

`entities/Races.js` and `entities/Backgrounds.js` resolve a stored id to its
definition. `resolveRace` uses the live catalog first and falls back to the
stored `raceTraits` snapshot. A hand-typed race, or a race that the GM deleted
from the catalog, therefore still loads and saves with its traits.

### Subclass casting

A class membership (`ClassRef`) stores its subclass as a name. Each class in
`data/classes.js` lists its catalog subclasses in `subclasses`, and each entry
has an `id` and a `name`. A subclass with a `casting` entry replaces these
caster fields of its class: `casterType`, `spellAbility`, `spellListId`,
`knownRule`, `cantripsKnown`, and the ritual flags. The Fighter's Eldritch
Knight and the Rogue's Arcane Trickster have this entry. Both are `'third'`
casters on the wizard list, with INT.

`entities/ClassCasting.js` resolves a membership to its caster fields.
`casterDefFor(ref)` returns the class definition, or a frozen merge of the
class and the `casting` entry of its subclass. The match compares the stored
name with the subclass `id` or `name` and ignores case, so an imported
`'eldritch-knight'` and a typed `'Eldritch Knight'` resolve the same.

The merge applies only from the class's `subclassLevel`. A Fighter 2 with an
Eldritch Knight subclass on record reads the plain Fighter definition, so it
has no spell ability and no slots. Each class and subclass pair has one merged
object, so `withSubclass` and the creature edit can compare two results by
identity to find a change in casting.

Every reader of caster fields takes the membership, not the class id alone.
`casterTypeOf`, `isCasterRef`, `spellListOf`, and `casterName` are the small
readers. `Classes.casterDefOf(character, classId)` finds the character's
membership for a class id, because the spellbook's `sources` map and the cast
paths record a class id. `Classes.isCasterClass(classId)` answers for the
class alone. A creature caster or a template asks
`ClassCasting.castsAs(classId, subclass, level)` instead.

`SpellSlots.js` imports `ClassCasting.js` and not `Classes.js`, because
`Classes.js` imports `SpellSlots.js`. `ClassCasting.js` imports only the class
data, so it cannot close an import cycle.

The third-caster slot table in `SpellSlots.js` starts with two 1st-level slots
at class level 3 and ends with one 4th-level slot at level 19. In a
multiclass, `casterLevelContribution('third', n)` adds `floor(n / 3)`.
`characterSlots` counts only the classes whose own table grants slots at their
level, which is the 5e rule that a class counts once it has its Spellcasting
feature. Without this filter, a Fighter 4 (Eldritch Knight) / Paladin 1 would
read the combined table at level 1 and get two slots in place of three.

`entities/Subclass.js` writes the subclass. `withSubclass(character, classId,
text)` stores the catalog name for a catalog match and the trimmed text for
any other name. An empty text clears the subclass. The write derives again
only when the casting changes, so naming a cleric's domain keeps its spent
slots.

A class that stops casting loses the spellbook entries that `sources` records
under it. A character with no caster class left loses all slot and pact
pools. `syncSlotsToLevel` returns a martial character unchanged and does not
remove these pools, because `derive` runs on every load and would remove pools
that a GM added by hand.

`LevelAssign.hasChoiceAt` counts a set subclass as a claim on the class's
subclass level. The donor path moves a class's newest level to a new class.
Without the claim, an Eldritch Knight moved from level 3 to level 2 would keep
a subclass that casts nothing.

### Proficiencies

`entities/Proficiencies.js` assembles the seven proficiency lists (saves,
skills, expertise, weapons, armor, tools, and languages) from the class, the
race, and the background (`assembleProficiencies`). `withProficiencies`
applies or edits the lists, and `withExpertise` sets the expertise list on its
own. The weapons list has two parts, the categories (`simple`, `martial`) and
the named weapons.

Both writers run `normalizeProficiencies`, which is the only place that
removes duplicates and cuts expertise down to the skills that the character is
proficient in. Expertise doubles a proficiency, so it cannot exist without
one, and no writer has to prune it. A patch that names no expertise keeps the
character's expertise, so an edit to the tool list does not clear a player's
picks.

A save with a top-level `Character.expertise` field loads with that list
inside the proficiencies, so the field needs no migration step. The
`isProficient*` predicates and `hasExpertise` return `false` for a character
with no proficiency lists.

### Hit points and hit dice

`entities/HitDice.js` derives max HP from the class hit die plus the CON
modifier per level (`classMaxHP`, the 5e average rule). It also models hit
dice as resource pools sized to the assigned class levels. `withHitDice`
creates the pools, and `syncHitDice` derives them again and keeps the spent
count. `spendHitDie` spends one die and heals. `restoreHitDice` gives back half
of the total dice on a long rest, largest die size first.
`entities/RestHitDice.js` spends the counts that the Short rest dialog
(`ui/ShortRestDialog.js`) collects. `spendRestDice` rolls each pool's count
and stops at full HP, and `spendablePools` leaves out a dead character.

### Leveling up

`entities/LevelUp.js` and `entities/LevelAssign.js` run the level-up flow. For
a character with a class, `addXP` leaves each earned level *pending* and does
not apply it. `assignLevel` commits a pending level to a chosen class. It
grows HP, adds a hit die, and advances spell slots.

A class ASI level leaves a pending improvement, which `applyASI` or `takeFeat`
spends. The app stores each choice against the class and class level that
earned it (`slotKey` builds that key), so a slot can have at most one choice.
Each choice also records its order, which `undoLastChoice` reads.

A single-class character with no pending level can move their newest level
into a new class. `assignLevel` refuses that move while an ASI, feat, or
feature record claims the level (`hasChoiceAt`). The moved level would
otherwise leave the record and its increases with no level to claim them. The
assign dialog lists each new class as disabled and asks the player to undo the
choice first.

`LevelAssign.js` also builds the options of the assign dialog.
`assignOptions(character)` lists every held class one level up and every new
class that the prerequisites allow. It then adds the classes that the
character cannot take, as disabled entries that name the requirement. The
requirement is the new class's own, unless the blocked entry is a held class
whose prerequisite the character no longer meets. In 5e, the prerequisites
gate leaving a class the same way as they gate entering one. `prereqText`
writes the requirement ("STR 13 or DEX 13"), and `className` resolves a class
id for display.

### Feats

A feat choice stores a stamp of what the feat did, not a reference to the
catalog. `takeFeat` takes a plain name or a `FeatStamp` (`types/feat.ts`),
which holds the resolved picks of a library feat. It applies the ability
increases to the stats and merges the proficiency grants through
`normalizeProficiencies`. It records these fields on the choice:

- the ability increases and the roll rider
- `requested`, every proficiency that the feat asked for
- `granted`, the entries that the merge added

`undoLastChoice` and the sheet read the stamp, as they do for the increases of
a race. A later edit to the library entry therefore does not change a
character that already took the feat.

Undo subtracts the increases and passes the proficiencies to
`GrantLedger.rebuildGrants`. That function takes the current lists, removes
every entry that a feat or feature record added, and merges the requests of
the remaining records back on top. A proficiency that two records both ask for
therefore stays through the undo of either one. Each remaining record is
stamped again with what it added in that replay, so the next undo reads the
right difference. An expertise on a removed skill goes with the skill.

The rebuild has limits. A matching grant that the GM made by hand between the
take and the undo also comes off, which is the same risk that a stat edit
poses to an ASI undo. A choice with none of the stamp fields undoes as a bare
name, and a choice with `granted` but no `requested` reads its `granted` list
as its request.

`entities/FeatChoices.js` computes the take-feat dialog. `availableFeats`
filters the catalog to the feats that the character has not taken, and a
repeatable feat stays on offer. `abilityPool` and `choicePool` compute the
options of each pick minus what the character already has. `buildStamp` folds
the picks and the fixed grants of the feat into the stamp that `takeFeat`
applies.

`entities/FeatRequirement.js` checks the structured `requires` field of a feat:
minimum scores, an armor proficiency, or the ability to cast. `featOptions`
lists an unmet feat last and disabled, with its prerequisite text. A feat with
only prerequisite text, such as one that the GM wrote, is open to everyone.

The dialogs are in `ui/EffectPicks.js`. The class-feature grant flow uses the
same picks, so a feat and a feature with the same effects prompt the same way.
A pick whose pool has no more options than the count grants them all with no
prompt. The expertise prompt runs after the skill picks, because its options
depend on them. `ui/LevelAssignFlow.js` and `ui/ImprovementFlow.js` run both flows,
and `ui/CharacterProgress.js` places their buttons on the sheet.

### Class features

A class feature in `featuresByLevel` (`data/classes.js`) is a plain name or a
`{ name, effects }` object (`ClassFeatureDef` in `types/class.ts`). The effects
use the feat effect vocabulary from `types/feat.ts`. A plain name is for
display only. `LevelUp.unlockedFeatures` collects the entries that the class
levels of a character reach, and the sheet prints that list.

`entities/FeatureGrants.js` owns the grant lifecycle of a structured feature.
An unlocked feature with effects and no record in `character.featureChoices`
is *pending*. The app stores no pending flag, so a character created at
level 1, an imported save, and a hand-edited class list all show their
unclaimed grants the same way.

`applyFeatureGrant` merges the picks through `normalizeProficiencies`. It
records what the feature asked for and what the merge added, the same stamp
that a feat choice records. `undoFeatureGrant` rebuilds the lists through
`GrantLedger.rebuildGrants`, so a pick that a feat or another feature also
grants stays, and the feature becomes pending again. The stamp never lists a
grant that the character already had from the GM, so undo cannot remove it.
`featureRiders` adds the standing roll riders of a feature to
`FeatChoices.riderSources`, which every roll site calls. The Rogue grants
Expertise this way at levels 1 and 6, and the Bard at levels 3 and 10.

The Fighting Style feature of the fighter (level 1), the paladin (level 2),
and the ranger (level 2) carries one class-only effect,
`{ kind: 'fightingStyle', from }` (`ClassFeatureEffect` in `types/class.ts`).
`from` lists the style ids from `data/fightingStyles.js` that the class
offers. The grant dialog offers one select over the styles the character has
not taken yet, and `applyFeatureGrant` stores the pick as `style` on the
feature's record. `entities/FightingStyle.js` reads the style ids back from
`featureChoices` and works out the numbers:

| Style | Where it applies |
| --- | --- |
| Archery | `WeaponSwing.prepareSwing` adds 2 to the attack of a ranged weapon |
| Defense | `Armor.armorClass` adds 1 while the chest slot holds body armor |
| Dueling | `WeaponSwing.hitDamage` adds 2 to one-handed melee damage when no other weapon is in hand |
| Great Weapon Fighting | `hitDamage` sets `rerollBelow: 2` on the damage parts of a two-handed melee swing, and `rollDamage` rerolls each 1 or 2 once |
| Two-Weapon Fighting | `hitDamage` keeps the ability modifier on the off-hand swing |

Protection needs a reaction and the positions of allies, which the app does
not model, so the sheet shows it as text only.


`entities/Features.js` reads the names of level-scaling features as numbers.
`attacksPerAction` gives 2 for 'Extra Attack', and 3 or 4 for the numbered
Fighter features that follow it. It takes the best count across the class
list, because Extra Attack does not stack in 5e. It also takes the higher of that count and
`PactWeapon.pactAttacks`, so a warlock with Thirsting Blade swings twice, and
a fighter 5 / warlock 5 with the invocation still swings twice. The optional
`weapon` argument names the weapon of the swing, and Thirsting Blade counts
only when that weapon is the pact weapon. `sneakAttackDice` gives the
number of d6 that Sneak Attack adds, from the level in the class that granted
it. `hasFeature` and `featureSource` are the exact-name lookups under both.

A structured effect models a grant made once. A value that scales with the
class level stays a name match, because the app derives it on each read. A
homebrew class that uses the same names gets the same rules.

### Eldritch invocations

`entities/Invocations.js` defines the rules of the warlock's eldritch
invocations and pact boon, and `data/invocations.js` lists the SRD
invocations. A character stores its picked ids in `invocations`, its boon
in `pactBoon`, and the once-per-rest invocations it spent in
`invocationUses`, which `Character.longRest` clears. `getInvocations`
keeps only the stored picks that the character still qualifies for, up to
the count of its warlock level. A warlock that loses a level or changes its
boon loses the invocations that no longer apply, and no writer has to prune
the list. `setInvocations` writes the list through the same filter.
`InvocationLevelUp.js` keeps the level-up rules. `pendingInvocationCount`
and `pactBoonPending` tell the sheet and the level-up what is left to
pick, and `swapInvocation` replaces one known pick in place with an
invocation that qualifies and is not picked. `ui/InvocationLevelFlow.js`
gathers the boon, the new picks, and the swap against a preview of the
level, and `applyWarlockPicks` applies them again, boon first, to the
character read after the last dialog closes.

Beguiling Influence grants two skills through the grant ledger. Its record
sits in `featureChoices` under the key `warlock 2 Beguiling Influence`, so
`GrantLedger.rebuildGrants` treats it like a claimed class feature. An undo
of the invocation keeps a skill that a feat also grants. `Progression.derive`
calls `settleInvocationSkills`, which matches the record to the invocations
that apply, so a warlock that drops below 2nd level loses the skills. The
donor path of `LevelAssign` asks `invocationsClaim` whether a warlock level
keeps an invocation or the pact boon, and it refuses to move such a level,
the same as a level with any other choice record. `LoadCoercion.warlockPicks`
coerces the three stored fields on load: a list that is not an array of
strings reads as empty, and an unknown boon drops.

`invokedSpell` returns a spell as the invocations change it: Eldritch Blast
with `addsModifier` or a new range, and an at-will spell with a Self range
or with no material. `app/combatants.spellsOf` and the sheet spell list map
their spells through it, and `castPlan` in `app/spellCast.js` maps its spell
again. A spell that the caster also knows lists as the book has it, because
those lists pass `atWill: false`, and `castPlan` applies the at-will
changes only on the at-will cast. `invocationCast` tells `castPlan` how the
cast is paid. An at-will cast is a free cast at the spell's own level. A
once-per-rest cast offers only the pact slot level (`pactSlotLevels`) and
passes `granted` and `pool: 'pact'` to `castSpell`, which skips the
spellbook check and pays from the pact pool only. `resolveCast` reads the use
again off the live caster, refuses a use that another tab spent while the
dialog was open, and then marks the use with `markInvocationUsed`.

### Pact of the Tome

`entities/PactTome.js` defines the Book of Shadows. The three book cantrips
sit in `spellbook.cantrips` with the warlock as their source, so every cast
path reads them as warlock cantrips with CHA, and `bookOfShadows.cantrips`
marks them. `Classes.cantripLimit` adds the book cantrips that the
spellbook still has to the class limit, so they do not count against it.
The rituals of Book of Ancient Secrets sit in `bookOfShadows.rituals` only,
and not in the known list, because a known spell of a known-rule class
casts with a slot. `SpellView.isRitualOnly` is true for a ritual in the
book, so `castPlan` offers no slot, `payForCast` accepts the ritual cast,
and the sheet lists it. `Classes.hasRitualCasting` is true for a warlock
with the invocation, and with a spell id only for a ritual in the book.
`PactTome.settleTome` takes back what a lost tome granted, and
`Invocations.setInvocations` calls it, so `setPactBoon` and every
invocation change run it. Without the Tome boon, the ids in
`bookOfShadows.cantrips` leave `spellbook.cantrips` and `spellbook.sources`,
and `bookOfShadows` goes. Without Book of Ancient Secrets, the rituals empty.
`setTomeCantrips` never lists a cantrip that the spellbook already has, and
`unlearnCantrip` drops a forgotten id from the book, so the list names only
the cantrips the book granted and a class cantrip never leaves.
`toCaster` copies `invocations`, `pactBoon`, and `bookOfShadows`, so these
checks read the caster view. `PactTome.js` imports only `Multiclass.js`,
because `Classes.js` imports it and `Invocations.js` imports the
spellbook, so its invocation check reads the stored picks and the Tome
boon directly.

### Mystic Arcanum

`entities/MysticArcanum.js` defines the Mystic Arcanum. At warlock levels 11,
13, 15, and 17 the warlock picks one warlock spell of 6th, 7th, 8th, and 9th
level, and the character stores the picks in `mysticArcanum`, keyed by spell
level. `getArcana` keeps only the picks that the warlock level still grants.
`arcanumCast` returns an `InvocationCast` with `oncePerRest` and `free` set,
and `warlockCast` asks the invocations first and the arcanum second.
`castPlan`, `resolveCast`, and `castRoutes` read `warlockCast`, so an
arcanum casts at the spell's own level with no slot and no spellbook check.
A spent arcanum sits in `invocationUses` under the id `arcanum-<level>`, so
`markInvocationUsed` spends it and `Character.longRest` gives it back. A
spent arcanum of a spell that the spellbook also has casts the usual way
with a slot. The level-up flow asks for each arcanum pick through
`applyWarlockPicks`, and `arcanaClaim` tells the donor path of
`LevelAssign` that a warlock level keeps a pick.

`entities/CastRoute.js` lists the ways to pay for a spell that has more
than one. A caster with an open repeat can repeat it or cast it anew, and a
warlock that knows an at-will spell can cast it at will or with a slot.
`runCast` asks the GM first when the list is not empty, and it passes the
answer to `castPlan` as its `route`. A fresh cast of a repeat spell removes
the old repeat chip with `SpellRepeat.dropRepeat`, because the old chip can
outlast the new one.

`entities/PactWeapon.js` reads the pact weapon of a Pact of the Blade
warlock. The character stores the inventory id of that weapon in
`pactWeapon`, and `pactWeapon` returns the item only while the character has
the Blade boon and still carries a weapon or bow with that id.
`CharacterInventory.removeItem` clears the id when the stack leaves, so a
given or discarded weapon never keeps the mark. `pactAttacks` gives 2 for a
warlock with Thirsting Blade (the `pactAttack` effect) and a marked pact
weapon. With a weapon passed, it gives 2 only when that weapon is the pact
weapon, and 1 for any other. `pactDamage` gives the flat necrotic term of Lifedrinker (the
`pactDamage` effect), equal to the CHA modifier with a minimum of 1, for a hit
with the pact weapon. The weapon swing adds that term after the crit
doubling, because a crit doubles only dice. `MagicWeapon.weaponIsMagical`
calls `isPactWeapon`, so the pact weapon counts as magical against
Stoneskin.

### Load-time defaults

`Character.withDefaults` runs on every character that the app loads, and
`campaign/Campaigns.js` maps every loaded character through it. It converts a
scalar class to a list, creates an empty proficiency structure where one is
missing, and keeps a race string as it is. It also reconciles the loaded pools
through `Progression.derive`, so a save that was edited by hand comes back
with pools that match its class list, level, and CON.

## Damage terms

A weapon's damage and a spell's damage or healing use the same type, a list of
`DamagePart`s. Each part rolls `count` dice of `sides` in a damage type, plus
an optional flat `bonus` on that term (the `1d4+1` of Magic Missile). An absent
bonus means no bonus, so a stored term without the field needs no repair.

`Equipment.normalizeDamagePart` is the only validator. It repairs a term with a
bonus and a term without one differently:

- A term with a bonus can roll no dice. The app writes a fixed amount this way,
  such as the one hit point of Revivify.
- A term without a bonus always rolls at least one die, so a garbled count
  reads as `1` and not as an empty term.
- The app stores the bonus only when it is not zero, so a term with no bonus
  has no `bonus` field.

The validator also takes the list of types that a term can have, and the
default is the 13 damage types. Healing is not one of them, because a weapon
with healing dice would heal on a hit. The restorative dice of a spell
normalize against `HEALING_TYPES` instead, and the authoring form sets them to
that one type with no picker. A check against the damage list would rewrite
the dice of a heal spell as slashing each time a GM edited or imported it.

A healing item is a consumable with a `heals` field: a dice count, a die
size, and a flat bonus. `entities/HealDice.js` coerces the field, and
`migrateItem` runs its `withHeals` on every saved item. That step drops a
broken `heals`, and gives a consumable with no `heals` the dice of the
`CONSUMABLE_PRESETS` potion with the same name, so a potion from an older
save still heals. The library normalizer runs the same step on equipment
templates. `HealDice.js` imports only the presets, because `Equipment.js`
imports it and a path through the rules modules would form an import cycle.
`Potions.potionHeals` reads the item's own field, so a renamed or custom
item heals by its dice. `app/potions.drinkPotion` asks who drinks it, rolls the dice
through the tray, takes one potion off the stack with `removeItem`, and heals
through `applyToTarget`. The inventory panel hands the use to the wiring
through its `drink` hook, because a heal written during the panel's own
commit goes under the panel's copy of the character from before the heal.

A heal effect with `addsModifier` adds the caster's spellcasting ability
modifier to the roll (`Casting.castSpell` takes it as `spellModifier`). Cure
Wounds, Healing Word, Prayer of Healing, Mass Healing Word, and Mass Cure
Wounds ship with it, and the spell form offers it as the "Add spellcasting
modifier" box. `castSpell` also takes a `healBonus`, a flat amount that a class
feature adds to each target. `entities/HealingBonus.js` gives 2 + the slot level
for a caster with Disciple of Life, on a heal of 1st level or higher that rolls
dice and neither revives nor stabilizes. The feature comes from the
`features` field of the Life Domain entry in `data/classes.js`, and
`LevelUp.unlockedFeatures` adds the features of a catalog subclass to the
class features. The heal line ends in ", Disciple of Life +N". A heal effect with `revives` raises the dead, and it heals only
a dead target (see [Damage and healing at 0 HP](#damage-and-healing-at-0-hp)).
Revivify and Raise Dead ship with it, and the spell form offers it as the
"Raises the dead" box. A heal effect with `stabilizes` heals nothing and
stabilizes a dying character through `app/deathSaves.stabilizeCharacter`.
`HealTarget.healBlocked` gives any other target the reason `notDying`.
Spare the Dying ships with it, and the spell form offers it as the
"Stabilizes the dying" box. `Library.normalizeSpell` and
`SpellDraft.assembleEffect` keep each flag only when it is true.

`DiceRoller.rollDamage` groups the terms by damage type and adds the bonus of
each term to its own group. The `modifier` argument (the attacker's ability
modifier) joins the first group only, as 5e says. Both go into one `bonus`
number per group, so a readout shows `7 slashing [2,3 +2]` and not two
separate signs. No group can go below zero, so a negative rider cannot heal.

A critical hit doubles the dice of a term and not its bonus.
`AttackResolve.damageParts` and `CastRolls.js` do this by doubling `count`.

`damageReadout` builds the `text` and `detail` lines from the groups. The
projectile merge in `CastRolls.js` uses it too, so a hit made of three darts
reads like one roll.

## The weapon property model

A weapon has `kind`, `category`, `properties`, `range`, and
`versatileDamage` fields. `entities/Weapons.js` owns the vocabularies and
these reads:

- `weaponKind(weapon)` returns `'melee'` or `'ranged'`. An absent `kind`
  reads as melee.
- `hasWeaponProperty(weapon, property)` reads the `properties` list. The nine
  properties are the 5e set: finesse, versatile, two-handed, light, heavy,
  reach, thrown, ammunition, and loading.
- `attackAbility(weapon, stats)` picks the ability for an attack. A ranged
  weapon uses DEX, a finesse weapon uses the higher of the roller's STR and
  DEX, and every other weapon uses STR.
- `abilityLabel(weapon)` is the label for a weapon shown with no roller. A
  finesse weapon reads `STR/DEX`, because the choice depends on who holds it.

`category` is `'simple'` or `'martial'`, the 5e proficiency categories. A
weapon with no category is a natural weapon, such as a bite. A versatile
weapon stores its two-handed dice as a full `versatileDamage` array, so the
damage code needs no special case for it. A permanent rider term therefore
appears in both arrays.

The strings `light` and `heavy` are also armor weight classes. The two
vocabularies are separate constants (`WEAPON_PROPERTIES` in `Weapons.js` and
`ARMOR_WEIGHTS` in `Equipment.js`), and the code never mixes them.

`clampWeaponRange(value, fallback)` reads a range as whole feet and keeps the
long range at or above the normal range. A field under one foot, or a field
that is not a number, takes the matching fallback from `DEFAULT_RANGES`:
80/320 feet for a ranged weapon, and 20/60 feet for a thrown melee weapon. The
item form and `coerceWeapon` both limit the range through this function, so an
imported file cannot contain a range that the form cannot produce.

### Weapon coercion

`EquipmentPresets.coerceWeapon` reads any weapon-like value and returns the
current fields. Every value that it returns has a `kind` field, so the field
shows whether the input is already in the current format.

- A value with `kind` keeps its own fields, filtered to the known vocabulary.
- A value without `kind` that matches a name in `WEAPON_PRESETS` takes the
  preset's property fields and keeps its own damage dice, because a GM can
  edit the dice.
- Any other value without `kind` maps from its `handling` field and gets the
  simple category. Every class is proficient with simple weapons, so the
  character keeps the proficiency bonus on those attacks.

The `kind` check comes first so that a GM can edit a copy of a built-in
weapon. The copy has the same name as the built-in weapon, and the library
gate coerces every entry on every load. A preset match before the `kind`
check would undo the edit on each load.

Migration step 6 in `storage/Migrations.js` runs the weapons of a campaign save
through the coercer once. The library gate runs library entries through it on
every load, because a library file has no version.

## Armor class

`entities/Armor.js` has the rules for wearing armor: what the worn pieces do
to AC, to Stealth, and to a character who is not trained for them. These rules
read the character's classes and proficiency lists, and the item readers in
`Equipment.js` never do, so the rules have their own module. `Equipment.js`
keeps the slots, the equip rules, and the field readers for one item, such as
`armorTraits` and `itemACBonus`.

`Armor.armorClass(character)` is the only function that derives the AC of a
character. Equipped body armor replaces the unarmored base with its own
`baseAC`, and its weight class sets how much DEX it adds. Without body armor,
the AC is `character.baseAC` plus the full DEX modifier. `baseAC` is 10 unless
the GM set another value on the sheet. Every other equipped piece then adds
its own `acBonus`, and the AC chips of the character apply last.

### Shields

A shield is one of those other pieces. It stores its bonus in `acBonus`, the
same field that a helmet or a ring uses, so a homebrew tower shield can add
more than the 5e standard. `SHIELD_AC` is the value that an absent field reads
as, not a fixed rule. The item form gives a shield a minimum of 1 and fills in
2 when the GM picks that type. A stored 0 therefore cannot come from the form,
and an absent field means that the GM never set it. `SHIELD_PRESETS` adds one
entry to the preset picker.

A library file or a hand-edited save can store any value in `acBonus`, so
`Equipment.itemACBonus` reads the field with tolerance, the same way that
`armorTraits` reads the armor traits. A value that is not a whole number reads
as absent. A shield then adds `SHIELD_AC`, and any other piece adds nothing.

### Unarmored defense

A Barbarian or a Monk also gets an unarmored defense formula: 10, plus the DEX
modifier, plus the modifier of one more ability. The class definition stores
the ability, and whether a shield cancels the formula, as `unarmoredDefense`.
`Classes.unarmoredDefenses(character)` collects the grants of the whole class
list. `armorClass` takes the higher of the plain unarmored AC and the formula,
so a higher `baseAC` or Mage Armor base wins.

The formula has two conditions. The chest slot has to be empty, because a
chest item with no `baseAC` still means that the character wears something.
`baseAC` has to be at least 10, because a GM can lower it as a curse, and the
formula would otherwise remove that penalty. A Monk with a shield loses the
formula but still gets the AC that the shield adds.

### AC chips

A buff spell can write `mods` onto its chip (see `ChipMods.js`). `ac` is a
flat bonus, `acBase` is a base AC for a holder without body armor, and
`acMin` is a floor under the finished AC. `ChipMods.heldMods` combines the
chips of one holder. The flat bonuses add up, because Shield and Shield of
Faith stack, and the highest base and the highest floor win. `blocks` names
the ids of spells that the chip stops outright, and Shield names
`magic-missile`. `ChipMods.heldBoost` takes the highest `maxHP` of each
spell and adds the results across spells, so two casts of Aid count once.

`armorClass` uses the higher of `baseAC` and the chip base in its unarmored
branch, so body armor ignores Mage Armor. `ChipMods.withChipAC` then adds
the bonuses and applies the floor. The floor comes last, so Shield of Faith
on a holder with AC 12 under Barkskin gives AC 16 and not 18.
`Creature.effectiveStatBlock` reads the same chips. A creature has no
unarmored branch, because its stat block AC already includes natural armor,
so a chip base replaces a lower AC on a creature with no worn armor.

The chip leaves with its spell, so the AC goes back without a separate
undo. A turn boundary on the buff (`until`) ends the chip of Shield at the
start of the caster's next turn.

### HP chips

A chip can also change hit points. `mods.maxHP` raises the HP maximum and
current HP of its holder (Aid), and the highest raise wins. The raise goes
into the stored maximum, the pool max of a character and `maxHP` of a
creature, so every HP reader works unchanged. `hpBoost` records how much of
the maximum is the raise. `HPBuffs.settleHPBuffs` compares that record with
the chips the entity holds and moves the maximum by the difference. Every
writer that changes a chip list calls it: the chip write in
`app/combatantWrites.js`, the round tick and the game time in `TimedEffects.js`,
the turn-boundary sweep, the end of a spell, and the conditions bar of the
character sheet, the NPC panel, and the encounter panel. A writer that
skips it leaves the raise in the maximum after the chip is gone.
`HitDice.reconcileMaxHP` adds `hpBoost` on top of the class maximum, so a
level-up during Aid keeps the raise.

Temporary hit points are `bonusHP`, on a character and on a creature alike,
and damage takes them first. `HPBuffs.grantTempHP` keeps the larger of the
old and the new amount, because temporary hit points never add up. A grant
from a spell records the chip name in `bonusHPFrom`, and `settleHPBuffs`
sets `bonusHP` to 0 once that chip is gone. `Character.setBonusHP` clears
`bonusHPFrom`, so an amount the GM types stays. A buff spell grants them at
the cast (`tempHP`, False Life) or through `mods.tempHPEachTurn` at the start
of each turn of the holder (Heroism), which the cast stamps from the spell
modifier of the caster. `CreatureHit.settleConcentration` counts the damage
that temporary hit points absorb, and it asks for no save when the HP drop
comes from an HP chip that ends.

`mods.immune` names the conditions that its holder can't take.
`combatantWrites.applyConditionToTarget` refuses such a condition and logs the
chip that blocks it, and a new chip with an immunity ends the chips it
names.

### Save and action chips

`mods.saveAdvantage` lists the abilities whose saves the holder rolls with
advantage (Haste's DEX). A chip of this kind is not one of the named
conditions, so `ConditionEffects.rollMode` reads the list from the chip
itself. `Checks.resolveSave` takes an `ability` and folds the chips in when
the caller passes no mode, which covers the repeated save of
`ImposedConditions.repeatSaves` and the concentration save of a character
(through `Checks.savingThrow`) and of a creature. The spell resolver and the sheet
roll already fold the chips into the mode they pass.

`mods.extraAction` gives the holder one more weapon swing on each turn
(Haste). `ChipMods.hasExtraAction` reads it, and the weapon swing passes the
result to the action budget (see
[the action budget](combat.md#the-action-budget)). When such a chip ends,
`Lethargy.withLethargy` adds a Lethargic chip that ends at the end of the
next turn of the holder. `Lethargy.endedEffects` compares the chip lists
before and after a write, and a chip whose name and cast no longer appear
has ended, so a count-down does not trigger it. Every chip writer in the
wiring layer passes its write through `app/lethargy.js`: the turn sweep,
the round tick, the end of a concentration, a replacing cast, and the hand
edits of the sheet and the creature panels.

### Attack slant chips

`mods.attacks` slants the attack rolls of the holder (Vicious Mockery's
disadvantage), and `mods.attacksAgainst` slants the attack rolls made
against the holder (Faerie Fire's advantage, Blur's disadvantage).
`ChipSlants.chipSlants` reads both, and `ConditionEffects.slantsFor` adds
them to the slants of the named conditions. The weapon swing and the spell
attack both ask `rollMode`, so both read these chips, and the 5e rule
cancels an advantage against a disadvantage as it does for any other slant.

`mods.attackerTypes` limits `attacksAgainst` to attackers of the listed
creature types (Protection from Evil and Good). The query names the
attacker's type in `rollerType`, which `ChipSlants.attackerType` reads from
the entity's `type` field. An attacker with no type matches no list, so a
party character and a creature with no type get no slant from such a chip.

`mods.once` makes a slant chip end after the first attack roll it applies
to (Guiding Bolt, Vicious Mockery). `ChipSlants.spentOnce` names the
one-shot chips of a roll, and `app/riderSpend.spendOnceChips` removes them
and logs the end. A chip counts as used when the GM picks the mode by hand,
because the spell ends on the roll. A spell attack spends the chips before
its outcomes land, so a new Guiding Bolt chip from the same cast stays on
its target. A save effect and an attack's `onHit` both take `mods`, so a
failed save or a hit can leave such a chip.

### Stealth and Strength

Body armor has two more traits, both optional, and each absent trait means
"not set". `stealthDisadvantage` gives disadvantage on every Stealth check of
the wearer, and `strength` is the Strength score that the armor needs.
`Equipment.armorTraits(item)` is the only reader of either field, because a
library file can store anything in them. It treats only a literal `true` and
a positive whole number as set.

`Armor.stealthPenalty(character)` names the worn armor when it is noisy.
`app/checkRolls.js` turns that into a disadvantage slant, and the skill block
turns it into a marker on the Stealth row. No migration adds the traits, so
armor in a save has neither trait until the GM picks it again from the
presets or ticks the box.

### Walking speed

`entities/Movement.js` owns walking speed. `baseSpeed` reads the speed of the
race through `Races.resolveRace`, so a catalog edit reaches every character of
that race, and a hand-typed race walks at `DEFAULT_SPEED`.
`armorSpeedPenalty` costs 10 feet when the effective Strength, buffs included,
is below what the armor needs. `walkSpeed` subtracts that penalty and the
exhaustion penalty, with a floor of 0. `speedNote` is the sentence that the
sheet badge shows, and it names each cause that applies.

The module is separate from `Equipment.js` so that every rule that cuts speed
goes into `walkSpeed`, and the app has one speed calculation. Nothing moves a
token by feet, so the value is for display only.

## Armor proficiency

`Proficiencies.isProficientArmor(character, weight)` reads the armor list.
The list has the weight classes plus `'shield'`, so a shield goes through the
same check as a breastplate.

`Armor.unproficientWear(character)` turns the check into phrases. It reads the
memoized `equippedIndex`, checks the chest piece against its weight class and
an off-hand shield against the shield grant, and returns a list such as
`['heavy armor', 'a shield']`. Those two slots cover every case, because
`armorClass` reads body armor from the chest slot, and `EQUIPMENT_SLOTS` allows
a shield in the off hand only. A character with no proficiency lists gets an
empty list.

The call sites act on the list in these ways:

- `app/checkRolls.js` adds a disadvantage slant to a STR or DEX save or check,
  through the `extra` parameter of `rollMode`, so a chip that grants advantage
  cancels it.
- `combat/WeaponSwing.js` adds the same slant to every weapon attack, because an
  attack uses STR or DEX whatever the weapon is.
- `app/spellCast.js` refuses a cast before the resolver runs, so a refused cast
  spends no slot. The dialog offers an "Ignore armor" opt-out beside the
  components opt-out.
- `app/spellCast.js` also marks a character that is the target of a STR or DEX
  save spell with `armorPenalty`. The resolver adds that slant to the target's
  save through the `extra` parameter of `saveOutcome`.

Untrained armor changes rolls only. The AC of the armor stays the same.

### Weapon proficiency

`Proficiencies.isProficientWeapon(character, name, category)` is true when the
weapons list grants the whole category or names the weapon. The comparison of
names ignores case, because the list stores a named grant in lowercase and the
GM can type an item name in any case. `combat/WeaponSwing.js` adds the
proficiency bonus to the attack only when this check passes. An attacker with
no `proficiencies` field is always proficient, because a creature's attack
bonus includes proficiency, the way a 5e stat block does.

## Spell timing

A `Spell` (`types/spell.ts`) lives in the library and not in a campaign save,
so it has no version number and no migration chain (see
[Persistence](persistence.md) for how the library merges). The app therefore
parses its two timing fields, `castingTime` and `duration`, on every read.

Both fields are structured values, not text. A `castingTime` has a kind
(`action`, `bonus`, `reaction`, `minutes`, or `hours`), an amount for the
counted kinds, and a trigger clause for a reaction. A `duration` has a kind
(`instantaneous`, `rounds`, `minutes`, `hours`, `days`, or `until-dispelled`),
an amount, and an `upTo` flag for a duration that the caster can end early.
`entities/SpellTiming.js` has these functions over them:

- `parseCastingTime` and `parseDuration` accept the structured object or the
  printed string that a library file can contain, such as `1 bonus action`,
  `10 minutes`, or `Concentration, up to 1 minute`. The parsers drop a
  `Concentration, ` prefix, because the spell has `concentration` as its own
  flag. A phrase that neither parser can classify becomes
  `{ kind: 'special', text }`, so the app keeps every phrase that a GM typed.
- `formatCastingTime` and `formatDuration` turn a value back into the printed
  text that the detail modal shows. Pass `concentration` to `formatDuration`
  to get the SRD wording `Concentration, up to 1 minute`.
- `castingCost` names the part of a turn that a cast spends, which the action
  budget of the combat screen then takes. A casting time of minutes or hours,
  or of the `special` kind, returns null, because no part of a turn pays for
  it.
- `durationInRounds` converts a duration into a round count, which gives a
  timer to a condition that a spell imposes. Days and open-ended durations
  return null, and the GM clears the chip by hand.

The authoring form and the library normalizer both send their raw values
through the parsers, so the same code validates a spell typed into the Library
rail and a spell imported from a file.

## Multi-projectile spells

Scorching Ray, Eldritch Blast, and Magic Missile each fire several projectiles
from one cast, and each projectile rolls on its own. An attack effect states
this with `projectiles: { count, perStep?, autoHit? }`. When the field is
present, the effect's `damage` is what one projectile deals, not what the
whole cast deals. An effect without the field rolls once, like every other
attack spell, so a spell without the field needs no migration.

`entities/CastScaling.js` counts the projectiles, and `entities/Casting.js`
resolves the cast. These rules apply:

- `projectileCount(effect, steps)` returns `count` plus `perStep` for each
  scaling step. The steps are the same as for damage scaling: each slot level
  above the spell's own level for a leveled spell, or each cantrip breakpoint
  for a cantrip. `maxTargets` returns this value for a projectile spell,
  because a target needs at least one projectile.
- `allocateProjectiles(targets, count)` decides how many projectiles each
  target gets. A target with a `projectiles` value states its own share, and
  the function limits the shares in order so the total never exceeds what the
  spell fires. With no stated shares, the projectiles spread as evenly as
  possible, which puts all of them on the only target in the common case.
- `CastRolls.resolveAttack` rolls one attack per projectile. Each projectile has its own d20
  and its own critical hit, which doubles only its own dice, or it rolls
  nothing when `autoHit` is set. The outcome keeps each projectile's roll and
  damage under `shots`, plus `fired` and `hits`, so the log can read
  `2 of 3 hit Grelka`. The app applies each ray that lands as its own hit, so
  a concentrating target saves once per ray, and a dying target takes one
  failure per ray.
- A hit from a Touch-range spell on a target with a Paralyzed or Unconscious
  chip is a critical hit, the same rule as for a melee weapon. The cast path
  sets `autoCrit` on that target.

For these spells, the cast dialog shows an allocation grid in place of target
checkboxes, because a checkbox cannot say "two rays here, one there". The grid
is also the target picker, so a creature with no projectiles is not a target.
The grid's total is the number of projectiles that the cast fires at the
chosen level. The total updates when the slot picker changes, so the grid
never offers a projectile that the cast cannot fire.

## Material components

A spell's `components` list has the component letters, such as
`['V', 'S', 'M']`. The letters cannot say what the material is, what it costs,
or whether the cast destroys it. A spell that needs a material therefore
describes it in `materials: { text, costGP?, consumed }`. Most spells have no
such block, so the field is optional. Revivify names its diamonds, and Fire
Bolt has nothing to name.

`MaterialCheck.materialCheck(caster, spell)` applies the rule and returns
`{ required, satisfied, item, consumes }`. These fields say whether the caster
has to hold the material, whether a stack of it is there, which stack it is,
and whether the cast spends it.

The inventory has to contain a material that the cast destroys, and also a
material with a gp cost, because a pouch or a focus never covers a priced
component. A component pouch or a spellcasting focus covers any other
material. A caster with neither needs the printed material itself.

`required` and `consumes` are separate fields, because holding a material is
not the same as spending it. Revivify destroys its diamonds, and they come off
the stack. The 50 gp diamond of Chromatic Orb has to be in the inventory, and
it stays there.

An item is a pouch or a focus when it sets `spellFocus`. The flag is the only
signal, so a stack that a GM named "Component Pouch" without the flag is
ordinary gear. `Equipment.isSpellFocus(item)` and
`Equipment.carriesSpellFocus(inventory)` read the flag. `GEAR_PRESETS` has four
entries with the flag (a component pouch and an arcane, a druidic, and a holy
focus). The item form offers the checkbox on every item type in
`ItemDraft.FOCUS_TYPES`, because a staff can be an arcane focus and an amulet
can be a holy symbol. A consumable is left out, since the holder uses it up,
and `assembleItem` drops the flag from one. The caster only has
to carry the focus, because the app does not track which hand is free, and
gear has no equipment slot.

A printed phrase does not always match a stack name exactly. The comparison
therefore ignores case and runs in both directions, so a stack named
`Diamond` covers `diamonds worth 300 gp`. A material with no printed text names
nothing to look for and is never required. A creature has no inventory, and
the app never asks it for a component.

`app/spellCast.js` acts on the result. A cast with a missing material stops
before `castSpell` runs, so a refused cast spends no slot. The refusal names
the missing material or the missing pouch, whichever is the cheaper fix. When
`consumes` is true, a cast that succeeds takes one item from the stack, in the
same write that stores the spent slot. `InventoryLog` reports the item with its
`use` verb. The cast dialog also offers an "Ignore components" checkbox, which
skips the check and the consumption, for tables that treat components as
flavor.

`normalizeSpell` adds the `M` letter to any entry that names a material but
does not list the letter, because the authoring form shows the material fields
only when M is ticked. Without this repair, an imported spell would lose its
material the first time a GM edited it. The app reads `costGP` only as the
signal that a focus cannot cover the component. It never charges the party,
because the app does not track money.

## Ritual casting

A ritual cast takes ten minutes longer than a normal cast and spends no spell
slot. The spell has to have `ritual: true`, and the caster has to have a class
with the ritual-casting feature. `data/classes.js` gives that feature to the
bard, cleric, druid, and wizard. `Classes.hasRitualCasting(character)` is true
when any caster class of the character has it.

`Casting.castSpell` takes `{ ritual: true }`. The cast resolves at the spell's
own level, because no slot is spent that could raise it, and returns
`spent: false` with the caster value unchanged. A ritual cast of a spell with
no ritual, or of a cantrip, returns `{ ok: false, reason: 'not-ritual' }`.

The cast dialog offers a "Cast as ritual" checkbox when both conditions are
true. Ticking it hides the slot picker. For a caster with no slots left, a
ritual is the only cast still available, so the dialog opens with no slot
picker and the box ticked.

A wizard can also cast a ritual from the spellbook without preparing it. The
Wizard's class entry sets `ritualFromBook`, and `SpellView.isRitualOnly` is
true for a known, unprepared ritual of such a class. `Casting.castSpell`
accepts that spell as a ritual cast only, and the cast dialog offers no slot
and opens with the ritual box ticked.

The game clock divides a day into six named watches (`time/GameClock.js`), so
it cannot count ten minutes, and a ritual does not advance it. The session log
states the extra time instead (`casts Detect Magic as a ritual (10 minutes
longer)`), and the GM decides what it costs.

No built-in spell in `src/data/spells/` is a ritual, so the flag applies only
to spells that a GM writes or imports. See
[the curated-spells note](../spells-missing.md) for what the built-in list
covers.

## Known and prepared casters

Each caster class manages its leveled spells as a prepared caster or as a
known caster, and `data/classes.js` records the rule as `knownRule`.

- A *prepared* caster (cleric, druid, paladin, wizard) keeps a larger book and
  readies a subset each day. Only the spellbook's `prepared` list is castable.
  `Classes.preparedLimit` sets the size of that list for each prepared-rule
  class: the spell-ability modifier plus the caster level, with a minimum of 1.
  The caster level is the class level for a cleric, druid, or wizard, and half
  the class level, rounded down, for a paladin.
- A *known* caster (bard, ranger, sorcerer, warlock) casts every spell that it
  knows. The `known` list is castable directly, with no prepare step.

Cantrips are in their own list, outside both rules.

`SpellView.spellRule(character, spellId)` says which rule applies to a spell.
It uses the rule of the class that the character learned the spell under (the
spellbook's `sources` map). When no source is recorded, it uses the first
caster class, and when that is missing too, it uses `'known'`, so a character
with no recorded rule keeps casting what it knows. `isSpellCastable` and
`castableLeveledIds` apply the rule, and `Casting.canCast` calls them. The cast
validator, the spell section of the sheet, and the action bar of the combat
screen therefore agree on what is castable.

The Spellbook tab follows the same rule. The Prepare and Unprepare actions and
the prepared count show only for a character with a prepared-rule class
(`Classes.hasPreparedCaster`). The entries of a known caster show only Learn
and Forget. A multiclass character mixes the two rules, and each learned spell
follows the rule of its own class.

The rule does not limit creature casters. Their authoring dialogs write every
picked leveled spell into both `known` and `prepared` (`spellbookFromIds`), so
the whole picked set is castable whichever list the class reads.

### Learning spells

`SpellLearning.js` decides which spells the Spellbook tab offers. Each caster
class learns as a single-class caster of its own class level, which is the 5e
multiclass rule. `classSpellLevelCap` reads the top row of the class's own slot
table, or the pact slot level for a warlock. Its optional `subclass` argument
applies a casting subclass, so an Eldritch Knight 7 learns 2nd-level spells.

`canLearnSpell` then needs a class whose spell list has the spell
(`ClassCasting.spellListOf`, which is the wizard list for an Eldritch Knight)
and whose cap reaches the spell's level. A cleric 3 / wizard 3 has 3rd-level
slots on the combined table, but neither class can learn Fireball. The module
never reads the character's slot pools, because the combined slot level is not
the limit for learning.

The app does not model these parts of the rules:

- the number of spells that a known caster can know at each level, so a known
  caster has no limit
- the school limits of the Eldritch Knight and the Arcane Trickster, so both
  learn from the whole wizard list
- the long-rest limit on changing prepared spells, so a prepared caster can
  change the list at any time

## Saving throws

`entities/Checks.js` has both halves of a save. `saveBonus(character, ability)`
returns what a character adds: the ability modifier from the scores with
equipment applied, plus the proficiency bonus when a class granted that save.
`resolveSave(bonus, dc, { mode, rng, conditions })` rolls one d20 through the
shared dice roller and returns `{ roll, total, dc, natural, success, rider }`.
A total equal to the DC succeeds. `savingThrow(character, ability, dc, opts)`
combines the two functions and adds `proficient`, so a readout can explain the
number. `conditions` are the chips of the roller (see
[Riders on later rolls](#riders-on-later-rolls)).

The two entry points exist because not every save is a character's save. The
save effect in `Casting.js` resolves every target through `resolveSave`, and a
target can be a creature, which keeps its scores in a different field and
reads proficiency by challenge rating. The resolver therefore takes a bonus
that the caller computed, and only the character path goes through
`saveBonus`.

The cast dialog follows that split. `targetSaveBonus` in `app/combatants.js`
returns a derived bonus for either kind of combatant. It returns nothing only
for a target that was deleted while the dialog was open. `app/spellCast.js`
adds the returned bonus to each target of a save spell and shows it in the
target picker, such as `Rook (WIS +6)`, in place of the AC that a save never
reads. The dialog asks for one typed number for the targets that have no
bonus, and it leaves that field out when every target has one. The session log
names the bonus beside the roll, in the same way that the log of a weapon
attack names the ability and the proficiency behind its total.

A natural 1 and a natural 20 are ordinary results on a save, unlike on an
attack roll, so the app reports `natural` for the log and takes no other
action on it.

### Ability checks

Ability checks work the same way. `checkBonus` is the ability modifier, plus
the proficiency bonus for a skill that the character is proficient in, doubled
where the character has expertise. `checkAbility` says which ability a key
uses. A skill id resolves through `data/skills.js`, and each of the six ability
keys stands for itself, which is how a plain Strength check works.
`resolveCheck` and `abilityCheck` match the two save entry points. Their DC can
be null, because a GM often calls for a check with no number in mind and reads
the total out loud. `passiveScore` is 10 plus a bonus, plus or minus 5 for
advantage or disadvantage, and `passivePerception` applies it to the
Perception bonus.

`ui/CharacterChecks.js` shows the six saves and the 18 skills on the sheet,
with passive Perception under the skills. A training dot is hollow for
untrained, solid for proficient, and ringed for expertise. A row is a button
when the host sets `onCheck`, and a plain line otherwise, which is the sheet
that a spectator sees.

`app/checkRolls.js` is the `onCheck` handler. It takes the bonus from the pure
helpers, rolls the rider dice, and gives one flat modifier to the dice tray.
The tray therefore throws the only d20, and the log line breaks the number
back into its parts. A roll from the sheet has no DC.

A character gets expertise in two ways. The Expertise features of the Rogue
and the Bard grant it through the pending-grant flow (see
[Class features](#class-features)). The Set expertise button in the Progression
section lets the GM grant it by hand to any character with a skill
proficiency, for subclasses and homebrew. The button opens a multiselect over the character's proficient skills and commits through
`Progression.withExpertise`. A creature has no expertise, so its bonus comes
from its training alone.

## Exhaustion

`entities/Exhaustion.js` models exhaustion by the 2024 rule, where one rule
scales with the level in place of a table of six different penalties. Each
level costs 2 on every d20 test and 5 feet of speed, and the sixth level kills.

The level is one number, `exhaustion`, on the character or the creature, and
nothing else is stored. `exhaustionLevel` reads the number and limits it to
the range 0 through `MAX_EXHAUSTION` (6), so a hand-edited save cannot go past
death or below zero. `d20Penalty` and `speedPenalty` derive from the level.
`atDeathLevel` reports the fatal level, and `exhaustionNote` is the sentence
for a badge or a log line. `setExhaustion`, `gainExhaustion`, and
`easeExhaustion` are the writers, and each limits its result to the same
range.

The module imports nothing. `Checks.js` imports this module, and `DeathSaves.js`
is built on `Checks.js`, so an import of either one from here would close a
cycle. The rules that combine exhaustion with death therefore live with their
callers.

### The penalty on rolls

The penalty reaches a roll through the bonus and not through a condition chip
with a rider. A rider applies only when dice are thrown, but the sheet prints
its saving-throw and skill bonuses without dice. A chip would therefore leave
the sheet at +5 while the roll gave -1.

`Checks.saveBonus` and `Checks.checkBonus` include the penalty, so the printed
number and the rolled number agree, and a passive score gets the penalty with
no extra code. Each other kind of d20 test includes the penalty too:

- `combat/WeaponSwing.js` subtracts it from the attack bonus, for a character or
  a creature.
- `Classes.spellAttackBonus` subtracts it from a spell attack.
  `Classes.spellSaveDC` does not, because the target rolls against a DC and the
  caster does not roll it.
- `DeathSaves.deathSaveBonus` is the whole bonus of a death save, and both
  death-save paths read it.
- `combat/InitiativeRoll.js` subtracts it from the initiative roll that the
  setup dialog fills.
- `creatureSaveBonus` subtracts it from a creature's saving throw.

The app logs the penalty as its own part, next to the ability modifier and the
proficiency bonus. `app/checkRolls.js` therefore subtracts the penalty from the
bonus to get the ability part. Without that step, the log would print a
modifier that the stat block does not have.

### The sixth level

`app/exhaustion.js` has the write that kills. `setCombatantExhaustion` sets the
level of one combatant by id, logs what the level costs, and then applies the
sixth level, which differs by the kind of combatant.

A character gets three failed death saves from `DeathSaves.killOutright`,
because the whole app reads three failures as dead, and the Unconscious chip
goes on with them. HP does not change, because exhaustion kills without damage,
and a damage write would show a wound that did not happen.

A creature goes to 0 HP through `Creature.applyDamage`, which is the only way
that a creature leaves a fight, and `logDefeatTransition` names it. A combatant
that is already dead takes the level and nothing else, so a second write
cannot log a second death.

A revive removes one level, because a combatant that comes back at the sixth
level would be alive and dead at the same time. `DeathSaves.clearDying` does
this for a character, which covers a heal above 0 HP and a natural 20 on a
death save. `Creature.heal` does it for a creature that the heal brings above
0 HP. This rule is not in `app/exhaustion.js`, because a revive happens in more
places than that module can see.

A long rest removes one level through `Character.longRest`, and a dead
character keeps the level that killed it. The guard is in `longRest` and not
at the call site, because the Time panel rests every character at once and
does not check who is alive. A short rest removes no level.

### Exhaustion stored as a chip

`exhaustionFields` coerces a save that stores exhaustion as a hand-added
condition chip with no level, and both `withDefaults` functions call it. A chip
with no stored level reads as level 1, the least that a GM can mean by the
chip, and the chip comes off. A stored level wins over a chip beside it, and
the chip still comes off. The level and the chip therefore can never disagree.

## Concentration

Many spells last only while the caster concentrates on them, and a caster can
concentrate on only one spell at a time. `entities/Concentration.js` models
this with a `concentration` field on the caster, which can be a party
character or a creature. The field records the spell's id and name, the level
it was cast at, and `remaining`, the rounds left. The field is null or absent
when the caster concentrates on nothing.

- `begin(character, spell, slotLevel)` starts concentration. It takes
  `remaining` from the spell's duration through `durationInRounds`. A duration
  that no round count fits, such as an open-ended one or one in days, reads as
  null and lasts until something breaks it. A second spell ends the first, and
  the ended spell comes back in `dropped`, so the caller can report it and
  clear its effects.
- `drop(character)` ends concentration for any reason.
- `dropIfHelpless(character)` ends concentration when the character's chips
  leave it unable to act, such as Paralyzed, Stunned, or the Unconscious chip
  that a death adds. It returns the ended spell, so the caller can release
  what the spell held.
- `concentrationDC(damage)` is 10, or half the damage when that is more.
  `checkOnDamage(character, damage, opts)` rolls the CON save against that DC
  through `savingThrow` and drops the spell on a failure. It returns the whole
  save, so the log can show the DC and the roll.
- `tick(character)` spends one round of the duration and reports `expired`
  when the duration runs out.

The `Concentrating` chip is for display only. `begin` writes it, `drop`
removes it, and `tick` writes its counter again from `remaining` instead of
counting it down. The round wrap calls `TimedEffects.passRound`, which ticks
the chips first and then calls `tick`, so the GM reads the counter of the
state. `Conditions.js` exports the chip's name as `CONCENTRATING`, so the two
modules use the same spelling.

### Where concentration begins and ends

- `app/spellCastResolve.js` begins concentration when a cast of a
  concentration spell succeeds. It writes the field onto the same entity as
  the spent slot and the consumed component, so one store call covers all
  three.
- `applyToTarget` in `app/combatantWrites.js` calls for the save on damage. Weapon
  hits and spell damage both arrive through this function. A character
  knocked to 0 HP loses the spell with no roll.
- The round wrap in `app/encounterWiring.js` ticks the duration and logs a
  spell that ran out.
- `storeCharacterChips` in `app/combatantWrites.js` stores a character whose chips
  changed, through `dropIfHelpless`. A spell that paralyzes the caster and a
  death from exhaustion both go through it.
- The conditions bar of the character sheet ends the spell in the same way
  when the GM adds a chip that stops actions.

Every damage path checks a character's concentration, the `-1 HP` button of
the character sheet included, because all of them go through
`CharacterHit.hitCharacter` (see [Death saves](#death-saves)).

A creature caster concentrates in the same way. `settleConcentration(prev,
next)` in `entities/CreatureHit.js` reads one write to a creature. It ends the
creature's spell on a drop to 0 HP, a failed CON save after damage, a chip that
stops it acting, or a hand removal of the `Concentrating` chip. The save uses
the creature's own bonus from `creatureSaveBonus`. `storeCreature` in
`app/combatantWrites.js` applies it to every creature write: `applyToTarget`,
`applyConditionToTarget`, the exhaustion stepper, and the `onUpdate` of the
Encounters and NPC panels. The Drop control of the combat screen works for a
creature caster too, and the round wrap ticks its duration.

## Death saves

A party character at 0 HP is not dead yet. It rolls death saves until three
succeed or three fail. `entities/DeathSaves.js` models this with a
`deathSaves` field on the character, which records `successes`, `failures`,
and `stable`. The field is null for a character who is not dying.

- `isDying`, `isStable`, and `isDead` tell the four states apart: standing,
  rolling, out of danger at 0 HP, and killed by three failures.
- `dropToDying(character)` starts the tracker. A second call on a character
  who already has one changes nothing, so the failures already rolled stay.
- `clearDying(character)` removes the tracker, which a heal above 0 HP and a
  natural 20 both do.
- `stabilize(character)` sets `stable` and resets the counters. The character
  stays at 0 HP and unconscious. A dead character cannot be stabilized.
- `judgeDeathSave(state, roll)` maps one rolled d20 to the next tracker state
  and names the outcome: `revive`, `success`, `stable`, `failure`, or `dead`.
- `applyJudged(character, state)` writes a judged tracker back. A revive
  restores 1 HP and then calls `clearDying`.
- `rollDeathSave(character, opts)` rolls the save and applies the outcome. It
  is the path for tests and for callers with no dice tray.
- `recordDamage(character, { crit })` applies damage to a character already at
  0 HP.

### The roll

The DC is a flat 10. A natural 20 revives the character at 1 HP, whatever the
counters say. A natural 1 counts as two failures, and it fails even when a
rider raises the total past the DC. Otherwise, a total equal to the DC
succeeds, as on every other save.

The roll goes through `Checks.resolveSave` with a bonus of 0, because a death
save adds no ability modifier and no proficiency. Going through that function
lets a rider such as Bless reach the roll. The call passes no ability key, so
the automatic failure that unconsciousness imposes on Strength and Dexterity
saves does not apply to a death save.

### Damage and healing at 0 HP

A heal above 0 HP clears the tracker of a dying or stable character. The rule
is in `Character.restoreResource`, because every heal in the app goes through
that function: the heal control of the combat screen, the HP stepper of the
sheet, a healing spell, and a rest. A character at 5 HP can therefore never
read as dying.

The same function refuses HP to a dead character (three failures), and
`Character.restAll` skips its HP pool. Without the guard, a Healing Word or a
long rest would bring the character back. Only a heal effect with
`revives: true` (Revivify) raises the dead. `CharacterHit.healCharacter` reads
the flag: it clears the tracker with `clearDying` and then heals, and it has no
effect on a character that is not dead. Each refusal comes back as a `dead` or
`living` event for the log.

A cast checks each target with `HealTarget.healBlocked` before it heals. The
check covers creatures too. A creature at 0 HP takes no healing from a spell
that does not revive, and a reviving spell has no effect on a creature above
0 HP. The heal control of the combat screen skips the creature check, so the
GM can still bring back an NPC that was only knocked out.

Damage on a character already at 0 HP is an automatic failure with no roll,
and a critical hit counts as two failures. Damage on a stable character makes
it dying again, with that failure against it, which is the 2014 rule. The hit
that drops the character to 0 HP costs no failure.

Damage left over past 0 HP that is at least the HP maximum kills at once,
which is the 5e massive damage rule. Bonus HP (temporary hit points) absorbs
the hit first, so it does not count toward the leftover. The rule applies to
the hit that drops the character and to a hit on a character already at 0 HP.

The `Unconscious` chip goes on with the tracker and comes off with it, so no
caller tracks both. `Conditions.js` exports the chip's name as `UNCONSCIOUS`.
The chip gives an attacker advantage and makes a melee hit a critical hit,
through the condition-effect table, so the crit rule needs no special case
here.

### Where the rules run

`entities/CharacterHit.js` applies these rules. `hitCharacter` and
`healCharacter` return the character after the change, the events to log, and
the spell that the hit ended. The events are the drop to 0, massive damage, a
failure while down, a heal above 0, and the concentration outcome. The
consequences go into the same write as the HP change.

`applyToTarget` in `app/combatantWrites.js` calls these functions and logs the
events. Every hit and every heal arrives through that function, including the
HP steppers of the character sheet, which reach it through the sheet's
`hpStep` host. `applyToTarget` takes `opts.crit` for the doubled failure, and
`app/weaponAttack.js` passes it. Spell damage does not pass it.

The death save roll comes from a button, in the active column of the combat
screen and on the character sheet, and not from the turn advance.
`retryImposedSaves` rolls bookkeeping saves automatically, but a death save is
the player's roll, and the dice tray shows only throws that someone asked for.
`app/deathSaves.js` owns both buttons. It follows the same split as
`app/checkRolls.js`: the riders roll in the app, the tray throws the only d20,
and `judgeDeathSave` reads the result. This path does not call
`rollDeathSave`, because that function would throw a second d20.

`view/DeathSaveView.js` turns one tracker into the words and pip counts that a
panel draws, and `ui/DeathSaveBlock.js` builds the line from them. The combat
screen and the character sheet both call that builder, so they always describe
a tracker the same way. `CombatantRow.deathSaves` puts the tracker on the
board, where a card shows a Dying, Stable, or Dead chip beside its conditions.

Only characters roll death saves. A creature is defeated at 0 HP.

## Conditions a spell imposed

A failed save against a spell can leave a condition on the target, and that
chip records where it came from. `Condition.source` records the spell's id and
name, the caster's id, and the ability, DC, and bonus of the save. A chip that
the GM adds by hand has no source, so the rules in this section do not apply
to it. `entities/ImposedConditions.js` owns the rules over the record:

- `removeImposed(list, casterId, spellId)` removes every chip that one cast
  wrote and reports them. It returns the original list when no chip matches.
- `repeatSaves(list, { bonusOf, rng })` rolls one save for each chip whose
  source says that a save ends the effect, against the DC on the chip, and
  drops the chips whose save succeeded. `bonusOf` gives the bonus. The default
  is the bonus recorded at cast time, which is the only bonus a foe has.

Both functions match on the caster and the spell. A caster with two spells
running ends one at a time, and two casters that put the same spell on one
target each keep their own chips.

### The sweep

`app/combatantWrites.js` runs these functions, because only the wiring can see
every collection that a target can be in. `endSpellEffects(app, casterId,
spellId)` sweeps the characters and the creatures and logs each one that the
sweep freed. It also removes the creatures that the cast summoned (see
[Summoned creatures](#summoned-creatures)). It runs whenever a caster stops
concentrating on a spell:

- the Drop control of the sheet, or a hand removal of its `Concentrating`
  chip, through `onConcentrationEnd` in `app/partyWiring.js`
- a failed CON save or a drop to 0 HP in `applyToTarget`
- a chip that stops the caster acting
- a new concentration cast in `app/spellCastResolve.js`
- a duration that runs out at the round wrap

The sweep always runs after the write that it follows. Both writes change
`state.characters` and `state.creatures`, so a copy stored before the sweep
would bring the chips back.

### Repeated saves

`retryImposedSaves(app, combatantId)` rolls the repeated saves.
`app/turnAdvance.js` calls it from the turn advance (`advanceCombatTurn`) for
the combatant whose turn ends, and for each held combatant that the pointer
steps past. A Paralyzed or Stunned combatant never takes a turn, so without
the second call it would never roll to end Hold Person. A party character
rolls its current bonus there, not the recorded one, so a save proficiency
gained after the cast counts.

A spell allows the repeated save with `saveEnds` on its save effect.
`Library.normalizeSpell` keeps the flag when the effect names a condition and
drops it otherwise. The spell form offers it as the "Save ends each turn" box,
which shows once a save names a condition, and `SpellDraft.assembleEffect`
follows the same rule. Hold Person, Blindness/Deafness, Hold Monster,
Phantasmal Killer, Power Word Stun, and Sunburst ship with it.

The repeated save, the condition-effect table, and the rider are the rules
that read a chip. A spell whose only target ended the effect still leaves the
caster concentrating, because nothing tracks how many targets a cast has left.

## Effects on later turns

A round tick ends a chip at the top of a round, but several spells end at a
turn of one combatant. Sunbeam blinds a creature until the start of the
caster's next turn, and Acid Arrow burns a creature at the end of that
creature's next turn. The rules live in `entities/TurnEffects.js` and
`entities/SpellRepeat.js`, and `app/turnEffects.js` runs them at each turn
boundary (see
[The turn advance](combat.md#the-turn-advance)).

### Turn-boundary chips

A chip with `expires` ends at a turn boundary of one combatant: `who` names
it, `at` is `start` or `end`, and `count` is how many such boundaries pass
first. `TurnEffects.chipTiming` builds the field from the `until` of a
spell, which is `caster-start`, `caster-end`, or `target-end`. "The end of
your next turn" skips the end of the turn that is running, so a chip keyed
to the end of the acting combatant's turn starts at a count of 2.

A chip with `expires` has a null `rounds`. With a count of rounds as well,
the round tick would end it at the top of the round, before the turn it
waits for. A chip keyed to a combatant outside the running order, or
written outside a fight, gets `rounds: 1` and no `expires`, because no turn
of that combatant will come.

`TurnEffects.passBoundary` counts one boundary, and `dropBoundaryChips`
removes the chips when the combatant leaves the fight or the fight ends.
Both return the list that they received when nothing matched. The wiring
sweep runs on every turn of a fight, and a new object per entity per turn
misses the pack cache of the save.

A creature keeps one chip per place, and `Conditions.sameSlot` decides the
place. Chips of one name share a place, except when a chip deals ongoing
damage or allows a repeated save (`Conditions.tracksCast`). Such a chip
shares a place only with a chip from the same caster and spell, so two
casters' Acid Arrow each roll their own damage, and Phantasmal Killer lands
its own chip beside a longer Frightened from another spell. The condition
that the name states still applies once, because the readers ask whether
some chip has the name. Inside one place, `Conditions.outlasts` keeps a
longer chip from another cast, so the one-round Blinded of Sunbeam does not
replace the one-minute Blinded of Blindness/Deafness. Two casts of one spell
with different mods keep the stronger chip whatever its length, so a
2nd-level Aid does not replace a 3rd-level Aid. The weaker chip is dropped
and not kept for later, so the +5 of the weaker Aid does not return when the
stronger Aid ends first.

### Damage on later turns

An attack or a save effect with `ongoing` leaves dice on the target. The
resolver scales them with the cast (`ongoing.perStep`) and returns them on
the outcome of each hit or failed save. `app/spellOutcomes.js` writes them
to a chip as `ongoing.damage`. A save that imposes a condition puts them on
that chip. Any other cast writes a chip named after the spell, which ends at
`ongoing.until`, or at the end of the target's next turn by default.

At the end of the holder's turn, `TurnEffects.ongoingChips` names the chips
that deal their damage. A chip that allows a repeated save is not among
them. Its damage lands only when the retry fails, so a success ends the
spell and spares the damage, as Phantasmal Killer does.

Three attack flags help these spells. `halfOnMiss` rolls the damage on a
miss and deals half, which is the splash of Acid Arrow. `addsModifier` adds
the spellcasting modifier to each hit, which a critical hit does not
double. `melee` marks a melee spell attack whose range is not Touch, such
as Spiritual Weapon, so Prone and an automatic critical hit read it as
melee. `scaling.levelsPerStep` counts one scaling increment per that many
slot levels, inside `CastScaling.scalingSteps`, so the damage, the target cap,
and the projectile count agree.

### Repeats

A spell with `repeat` can be used again on each later turn while it lasts,
with no new slot. The first cast gives the caster a chip named after the
spell, whose source keeps `repeat.slotLevel`. A spell with fixed repeat
damage, such as Witch Bolt, also records the creatures that it hit in
`repeat.targetIds`, and it opens the repeat only on a hit
(`SpellRepeat.opensRepeat`).

`castPlan` in `app/spellCast.js` finds the chip with
`SpellRepeat.heldRepeat` and builds a free plan: no slot, no component
check, no armor check, and the cost of `repeat.cost` or of the casting time.
`castSpell` takes the `free` option and skips the spellbook check and the
slot. `resolveCast` starts no new concentration for a repeat, because a new
concentration on the same spell would end the old one and sweep the repeat
chip with it. For the same reason, the first cast writes the chip after the
sweep of a displaced spell. A repeat with fixed damage resolves through
`SpellRepeat.repeatedSpell`, an automatic hit with no scaling.

The chip ticks down with the duration of the spell, and a concentration
spell loses it with every other chip of the cast.

## Effects of a hit

An attack effect can do more on a hit than deal damage. `Casting.js` pays
for the cast and scales the dice, and `entities/CastRolls.js` rolls them
against each target. The save of a save effect and the save that a hit
brings both go through `CastRolls.targetSave`, so the chips and the feat
riders of the target join both in the same way.

`onHit` names a condition that the hit imposes. With `onHit.saveAbility`,
the target rolls that save against the DC of the cast after the damage roll,
and the outcome keeps the roll under `onHit`. A target that several
projectiles hit rolls once. `castPlan` reads the save bonus of each target
for `onHit.saveAbility` the same way as for a save spell, and the cast
dialog adds a DC field. `app/spellOutcomes.js` writes the chip with the
cast as its source. The chip ends at `onHit.until` when the spell names a
turn boundary, and after the duration of the spell otherwise. Ray of
Sickness uses this.

`drain` gives the caster hit points equal to `half` or all (`full`) of the
damage that the hits deal. `spellOutcomes.js` sums the damage after the
defenses of each target, including a splash on a miss, and heals the caster
once after the last target. Vampiric Touch uses this.

## Hit-point rules

A save effect can read the current HP of each target in place of a save
roll. `hpLimit` fails the first save with no roll for a target at or under
the limit, and leaves a target above it unaffected. `hpPool` rolls a pool
of dice once per cast. `entities/HpPool.js` sorts the targets by current HP
and walks them, and each target whose HP fits in what the pool has left
takes the effect and spends its HP. `SpellFields.rollsNoSave` is true for a
pool, and for a limit with no repeated save. For such a spell `castPlan`
reads no save bonus, and the dialog shows no DC field. Power Word Stun keeps
its DC, because its target retries the save on later turns.

`spellCastResolve.js` reads the HP of each target from the roster when the
GM submits the cast. A pool also reads the chips there, because it passes
over an Unconscious target and a target that already has the condition.
A target with no HP to read (a character with no HP pool, or a creature
that left the roster) takes the effect and spends nothing, so the GM can
still apply the spell.

`kills` makes a failed save fatal. `app/slay.js` kills a creature by
setting its HP to 0 (`Creature.slay`), and a character through
`DeathSaves.killOutright`, which leaves its HP alone. The character store
then drops the spell it concentrated on. Power Word Kill uses a limit and
`kills`.

`endsOnDamage` stamps `source.endsOnDamage` on the chip. The two damage
writes, `Character.damageCharacter` and `Creature.applyDamage`, take such a
chip off on any damage above 0, and `combatantWrites.applyToTarget` logs it.
Sleep uses a pool and `endsOnDamage`, and Color Spray uses a pool and a
turn boundary.

## Summoned creatures

A spell can put new creatures on the map. Its `summons` effect names one
library creature template and a count, and Conjure Animals ships with one.
`entities/Summons.js` owns the rules over a `summonedBy` field on the
creature. The field records the spell's id and name and the caster's id,
which is the same record that `Condition.source` keeps. One sweep therefore
ends both the chips and the summons of a spell. A creature that the GM placed
has no such field.

- `summonCount(effect, steps)`, in `CastScaling.js`, is the base `count` plus
  `countPerStep` for each scaling step. The spell's `scaling.levelsPerStep`
  sets how many slot levels make one step, so Conjure Animals (count 8,
  `countPerStep` 8, `levelsPerStep` 2) brings 8, 16, 24, or 32 wolves.
- `stampSummon(creature, source)` writes the record onto a new creature.
- `isSummonedBy(creature, casterId, spellId)` matches one cast, on both the
  caster and the spell, for the same reason as `removeImposed`.
- `despawnSummons(list, casterId, spellId)` removes every creature of one cast
  and reports them. It returns the original list when no creature matches.

The effect names its template, and does not use an id. The library merges
creature entries by name, so the name still finds the template after a GM
customizes it. `Library.activeCreatureByName` is the lookup. `castPlan`
refuses a cast whose name matches no template, before the dialog opens and so
before a slot is spent.

`spawnSummons` in `app/summons.js` reads the template, builds one creature per
count through `CreatureTemplate.fromTemplate`, and puts all of them on the party's
tile. That tile is the only place that a cast can reach, because the app
cannot measure the distance between two tokens. Each creature gets its own id.
Its side is the disposition of the template, so a hostile template fights the
party. For a summon that stands with the party, the GM writes a friendly
template.

`endSpellEffects` removes the summons in the same pass that sweeps the chips.
The removal runs before the early return for an empty sweep, because a
summoning spell usually imposes no chip. A defeated summon leaves with the
living ones, and the log names each creature that vanishes. A summoning spell
without concentration still spawns its creatures, and the log marks the cast
as untracked. The GM removes those creatures by hand.

A summons cast during a fight joins the running order.
`Initiative.addParticipant` sorts the new creature in and keeps the turn on
the combatant that has it. The initiative is a plain d20 plus the DEX
modifier, the same roll that the setup dialog makes. A new creature that sorts
above the current combatant therefore acts first on the next round. When the
removal takes away the last creature of the fight near the party, the fight ends
through `syncCombatLocation`.

## Condition effects

`Conditions.js` owns the pick-list and the list operations, and it says which
names exist. `entities/ConditionEffects.js` says what those names do.
`CONDITION_EFFECTS` is a table keyed by the lowercased name. A chip that a GM
typed by hand gets the rule of a row when its name matches one, and no rule
when it does not. A row has up to seven fields:

| Field | Effect |
| --- | --- |
| `attacks` | Slants the attack rolls that the holder makes |
| `attacksAgainst` | Slants the attack rolls made against the holder. It is one slant, or a `{ melee, ranged }` pair for Prone, the only condition that helps one reach and hurts the other |
| `checks` | Slants the holder's ability checks |
| `saves` | Names the abilities whose saves the holder rolls with disadvantage |
| `autoFailSaves` | Names the abilities whose saves fail with no roll |
| `meleeAutoCrit` | Makes any melee hit on the holder a critical hit |
| `noActions` | Costs the holder its turn |

Eleven of the fifteen names in the pick-list have a row. Charmed has none,
because it needs a charmer, and no part of the app relates two combatants.
Grappled has none, because it sets speed to zero and nothing tracks movement.
Deafened costs only hearing, and Concentrating is a display chip for the
concentration state. Exhaustion is not in the pick-list, because it is a
level and not an on-or-off state, and `Exhaustion.js` owns it.

The reads over the table are pure and take chip lists only:

- `conditionEffect(name)` is the table lookup, and `effectsOf(conditions)`
  pairs each chip that has a row with its row and drops the rest.
- `combineModes(slants)` combines a set of slants by the 5e rule. Any
  advantage and any disadvantage cancel to a straight roll, and otherwise the
  one kind present wins. The function counts the kinds, so the order of the
  slants does not matter. It returns null, not `'normal'`, when nothing
  applies. The dice tray adds its own advantage toggle when a caller names no
  mode, and a function that always returned a mode would cancel that toggle on
  every roll.
- `rollMode({ roller, target, kind, melee, ability })` is the mode that one
  roll gets from the chips on both sides. Only an attack reads the target's
  chips, because a save or a check rolls against a number that the other side
  does not change.
- `modeReasons(query)` names the chips behind the mode, so a log line can
  explain a cancelled pair instead of printing a straight roll with no reason.
- `canAct(conditions)` is false when any chip has `noActions`.
- `losesTurn(conditions)` is true when any chip has `noActions` or `noTurn`.
  Lethargic has only `noTurn`, so it takes the turn but keeps concentration
  and reactions, which read `canAct`.
- `autoCrits(conditions, { melee })` is true when a melee hit on the holder is
  a critical hit. The printed rule is a hit from within 5 feet. The app
  measures no distance, so it uses a melee attack as the closest match.
- `saveOutcome(conditions, ability)` returns `{ autoFail, failedBy, mode }` for
  one save. The caller checks `autoFail` first, because that save never
  reaches the dice.

These sites read the table:

- `combat/WeaponSwing.js` builds one query from both combatants and takes the
  reach from the weapon's kind (`Weapons.weaponKind`). It also asks `autoCrits`
  about the defender, so any hit on a paralyzed target is a critical hit.
- `app/spellCastResolve.js` combines the mode from the chips with the GM's
  choice in the dialog through `combineModes`, so neither replaces the other.
  A save spell marks a target that fails with no roll with `autoFailSave`, and
  an attack spell treats a touch range as melee reach. The caster view has no
  chips, so the list of the real combatant arrives as `casterConditions`.
- `app/checkRolls.js` handles a save or a check rolled from the sheet. An
  automatic failure logs and stops before the tray opens.
- `combat/CombatView.js` asks `losesTurn`. `skipsTurn(found)` is true for a
  combatant that is downed, that resolves to nothing, or that loses its turn,
  and `app/turnAdvance.js` passes it to `advanceTurn`. The answer of `canAct`
  marks the row `incapacitated`, which is how a card and a ribbon chip show a combatant
  that keeps its place in the order but loses its turn.

Every attack, check, and save in the app reaches one of those sites, so a chip
applies wherever the roll happens. The sites only read chips. The GM or a
spell writes them.

## Riders on later rolls

A chip can change the later rolls of its holder. Bless adds 1d4 to an ally's
attack rolls and saving throws, and Bane subtracts 1d4 from a foe's.
`Condition.rider` records this as `{ rolls, dice, die, flat, once }`: the rolls
it changes, the number of dice, the die, a flat amount, and whether the first
roll uses it up. The dice count is signed, so Bane is Bless with a minus sign,
and no second field is needed for the direction. `entities/Riders.js` owns the
model:

- `normalizeRider(value)` cleans a written block, with the same tolerant
  parse as every other spell field. A rider that changes no roll, or that adds
  neither dice nor a flat amount, reads as absent.
- `chipRider(condition)` reads the rider of a stored chip through that parse.
  Chips are in the campaign save, and nothing checks their fields on load, so a
  hand-edited save can contain a rider with no roll list or with a die that
  does not exist. Every read of a stored rider goes through this function, and
  a rider that the app cannot use reads as no rider.
- `activeRiders(sources, kind)` picks the sources that change one kind of roll
  and pairs each with its cleaned rider.
- `rollRiders(sources, kind, rng)` rolls them and returns
  `{ modifier, note, spent }`. The note names each source and the faces it
  rolled, so a log line can explain the number. `spent` names each source
  whose rider has `once` set.
- `spendRiders(conditions, spent)` removes the chips that a roll used up.
- `riderText` and `riderSummary` describe a rider for a chip tooltip or a
  spell readout.

### Rider sources

A source is anything with a name and a rider. A condition chip is a source,
and so is the stamp of a taken feat. `FeatChoices.featRiders` reads the feat
riders of a character as sources, and `FeatChoices.riderSources` joins them
with the condition list. The roll sites call `riderSources` and do not read
`conditions` directly, so a feat bonus and a chip bonus take the same path and
print in the same note.

A feat rider lasts as long as the feat. It is a standing bonus, with no
duration and no chip on the conditions bar. The condition-effect table matches
chips by name, and a feat source never enters a list that the table scans, so
a feat with the same name as a condition cannot slant a roll. The target of a
cast therefore has its chips in `conditions` and its feat riders in a separate
`riders` field. Both apply to its saving throw, but only the chips decide
advantage or an automatic failure.

The rider dice roll inside `rollRiders`, not in the caller's own dice
selection. A bonus and a penalty therefore resolve the same way, and a save,
which has no dice tray, works the same as an attack, which has one.

### Roll sites

- `combat/WeaponSwing.js` reads the attacker's own chips before it loads the
  tray, and puts the note in the log beside the dialog's own modifiers.
- `CastRolls.js` rolls the caster's chips once per projectile, because each
  projectile is its own attack roll. An auto-hit projectile rolls no attack, so
  no rider applies to it. The caster view has no conditions, so
  `app/spellCast.js` passes in the chips of the real combatant as
  `casterConditions`. The log lines name the dice of every ray, because the
  tally line prints no to-hit numbers of its own.
- `Checks.resolveSave` rolls the roller's chips. Every save in the app goes
  through it, so `savingThrow`, the save effect of a spell, and a repeated
  save all get riders from that one place. `savingThrow` reads the
  character's own chips, so a blessed caster has a better chance to keep
  concentration through damage.
- `app/checkRolls.js` reads the roller's chips for a save or a check rolled
  from the sheet. It calls `rollRiders` itself and not `resolveSave`, because
  the tray throws the d20 there. The log names the faces beside the ability
  modifier and the proficiency.

### How long a rider lasts

A rider lasts as long as its chip, unless it has `once` set. Guidance and
Resistance ship with `once`, so the first check or save that the rider changes
uses up the chip. `spendRollRiders` in `app/riderSpend.js` removes those chips
after the roll. `app/weaponAttack.js`, `app/checkRolls.js`, and
`app/spellCastResolve.js` call it: the last for the caster's attack rolls and
for each target's save. A chip without `once` ends by its duration, a
concentration drop, or a GM removal. The spell form offers the flag as the
"One roll only" box.

A rider reaches a target in one of two ways:

- a save spell's `effect.rider`, which goes onto the chip that a failed save
  imposes (Bane works this way)
- a `buff` effect, which puts a chip on each willing target with no roll
  (Bless, Guidance, and Resistance work this way)

A buff names its chip through `effect.condition`, and `Casting.buffCondition`
uses the spell's own name when the effect names none. The chip has the same
`ConditionSource` that a failed save writes, so `endSpellEffects` sweeps a buff
off every recipient when the caster stops concentrating.

Two riders on one creature both apply, so Bless and Bane cancel out on average
and neither one wins. `addCondition` matches names without case, and the
newer chip replaces the older one in the same place (see `sameSlot`) with its
source and its rider.

The hand-add dialog in `ui/ConditionsBar.js` takes only a name and a duration.
A chip that a GM adds by hand has no rider, so a chip named `Bless` by hand
changes no roll. For that case, the dice tray already takes a bonus die.

## Riders on hits

A chip can also add damage dice to hits. Divine Favor puts a chip on its
caster, and each weapon hit of the caster deals 1d4 radiant more. Hunter's
Mark puts a chip on a foe, and each weapon hit of the caster against that foe
deals 1d6 more. `Condition.hit` records this as a `HitRider`:
`{ count, sides, damageType, weaponOnly, mark }`. A rider with no
`damageType` takes the type of the hit's first damage term, which is how
Hunter's Mark deals the weapon's own type. `weaponOnly` limits the rider to
weapon hits, so a spell attack does not add it. `mark` puts the chip on the
target instead of the attacker, and only the caster that the chip's
`source.casterId` names gets the dice. A mark from one ranger therefore adds
nothing to the hits of another.

`entities/HitRiders.js` owns the model:

- `normalizeHitRider(value)` cleans a written block. A rider with no dice, or
  with a die that the dice tray does not know, reads as absent.
- `hitRiders(attacker, defender, { weapon })` lists the riders of one hit:
  the attacker's own chips without `mark`, and the defender's chips with a
  `mark` that the attacker cast.
- `hitRiderParts(riders, crit, baseType)` turns them into damage terms. A
  critical hit doubles the dice, like every other damage die of the hit.
- `hitRiderNote` names the riders for the damage line of the log, and
  `hitRiderSummary` describes one for the spell detail and the cast log.

A buff spell writes the rider through `SpellBuffEffect.hit`, and
`BuffCast.buffOutcomes` copies it onto each outcome, so the chip of the cast
contains it. A buff with `mark` set reaches foes rather than allies, because
`app/spellTargets.aids` excludes it from the helping kinds. The weapon swing
(`WeaponSwing.hitDamage`) reads the riders with `weapon: true`.
`CastRolls.resolveAttack` reads them with `weapon: false` for each attack
roll, and reports the note as `hitNote` on a single-attack outcome. A spell
with `autoHit` projectiles (Magic Missile) makes no attack roll, so it takes
no rider. A GM authors Hex as a buff with a `mark` rider of 1d6 necrotic and
no `weaponOnly`.

Hunter's Mark has `repeat: { cost: 'bonus' }`. The first cast opens a repeat
on the caster (see `SpellRepeat.js`), and a later turn offers **Repeat (no
slot)** for a bonus action, which marks a new creature under the same
concentration. The app does not check that the old target dropped to 0 HP,
and it leaves the old chip in place.

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
a rope or a save ability on an attack. Both run the same tolerant parsers as a
library import, so a typed entry and an imported entry read a value the same
way.

The app stores the background and the assembled proficiency lists, but the
sheet shows only part of them. Save and skill training shows in the check rows
of `ui/CharacterChecks.js`. The background name and the weapon, armor, tool,
and language lists do not show on the sheet.
