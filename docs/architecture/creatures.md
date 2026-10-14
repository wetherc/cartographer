# Creatures

*Explanation. Back to [Entities](entities.md) and the [architecture overview](../architecture.md).*

`entities/Creature.js` and `entities/CreatureMap.js` (types in
`src/types/creature.ts`) define one model for everything that the party can
meet on the map. One `Creature` covers a foe, a townsperson, and everything
between them. Its `disposition` field decides its side in a fight. A hostile
creature fights the party, and every other creature stands with the party.
The state has one `creatures` list, which every combat, map, and story panel
reads.

A creature has `maxHP`, `currentHP`, a `stats` block, a `weapons` list, an
`armor`, `conditions`, a `location`, and a `met` flag. Optional fields add a
`role` and `notes`, a challenge rating, saves and skills, damage defenses, and
spellcasting, which the subsections below describe. `level` and `tier` are
optional authoring inputs that pick the default stats and gear for a new foe.
A townsperson has no level.

`createCreature` resolves the weapons and the armor once, at creation. An
absent value takes the level default when the creature has a level, and an
empty list or null when it has none. A stored empty list therefore means
unarmed on purpose, and a stored null armor means unarmored on purpose. The
first weapon is the main weapon, which the on-hit save of the creature form
applies to. `withDefaults` fills absent gear with an empty list or null only,
and it reads the single `weapon` field of an older save as a list of one.
No read path derives gear from the level again, so an absent field has one
meaning everywhere.

`isCreature(entity)` tells a creature from a character. A creature always has
a `disposition`, and a character never has one. Every caller that tells the
two apart uses this one test.

## Contents

- [Creature terms](#creature-terms)
- [Creature AC](#creature-ac)
- [Placement and templates](#placement-and-templates)
- [Defeat and cleanup](#defeat-and-cleanup)
- [Authoring](#authoring)
- [The challenge rating](#the-challenge-rating)
- [The difficulty hint](#the-difficulty-hint)
- [A creature's saves and skills](#a-creatures-saves-and-skills)
- [Creature types and condition immunities](#creature-types-and-condition-immunities)
- [Damage defenses](#damage-defenses)
- [Creature casters](#creature-casters)

## Creature terms

The UI and the code use several words for the creature record and the
records near it. The table gives the meaning of each word.

| Term | Meaning | Where it appears |
| --- | --- | --- |
| Creature | Any entry of `state.creatures`, of type `Creature`. | The **New creature** button, the creature form, `Creature.js` |
| Foe | A creature with `disposition: 'hostile'`, which fights the party. | The **Foes** sub-tab of the Build **Encounters** tab, the **Foes** group of the combat board |
| NPC | A creature whose disposition is not hostile, such as a townsperson or an ally. | The **NPCs** sub-tab in Build, the **NPCs** card of the Story tab, `storyWiring.js` |
| Bestiary template | A `CreatureTemplate`. It is a reusable blueprint and not a creature on the map. The campaign keeps its own templates in `state.bestiary`, and the Library keeps the built-in and custom ones. | **Add from bestiary**, the Library **Creatures** tab, `CreatureTemplate.js` |
| Encounter | The foes near the party. The Active tab lists the encounter group of the party's tile (`hostileGroup`), and the Nearby tab lists the other foes in range. | The **Encounters** card in Play, the Build **Encounters** tab, `views.encounterPanel`, `app/encounterPanels.js` |
| Mob, Legend | The two tiers of a foe (`'mob'` and `'legend'`). A mob gets rank-and-file default stats for its level, and a legend gets higher ones. The tier only picks the defaults of a new foe. | The **Tier** select of the creature form, `ENEMY_TIERS` in `Modifiers.js` |

The gear and tier types use the `Creature` prefix (`CreatureWeapon`,
`CreatureArmor`, and `CreatureTier`) because they apply to foes and NPCs
alike. Other code names with "enemy", such as `EnemyArmor.js` and
`defaultEnemyGear` in `CreatureLoadout.js`, also mean any creature, friendly or hostile.

## Creature AC

`effectiveStatBlock(creature)` is the only AC read. It returns the stat block
with the worn armor in place of the unarmored 10 + DEX, plus every active
timed stat modifier. The stored AC is the AC without armor.

`EnemyArmor.js` has the armor rule. The AC is the armor's `baseAC`, plus the
DEX modifier that its `armorWeight` allows (all of it for light, at most +2
for medium, and none for heavy). Any authored AC above 10 + DEX adds on top.
A flat bonus over the unarmored AC would give a DEX 16 creature in plate an AC
of 21, where the rule gives 18.

## Placement and templates

`CreatureMap.js` has the placement reads and writes. `meetCreatures` marks
every creature on the party's tile as met. `followParty` moves each companion (a
creature with `travelsWithParty` and HP above 0) to the party tile through
`moveCreature`, which leaves `met` alone. The GM tab runs it at the start of
`refreshLocationPanels` in `app/mapArrival.js`. `toTemplate` never copies
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

`Creature.TRAIT_KEYS` lists the optional stat block traits, such as `cr`,
`multiattack`, `legendaryActions`, and `actions`. `creatureTraitFields`
coerces all of them in one call. `withDefaults` and `editCreature` drop the
listed keys with `omitTraits` before they write the coerced values back, and
`fromTemplate` copies them from a template with `pickTraits`. To add a trait,
add its key to the list and its coercer to `creatureTraitFields`.
`tests/CreatureTraits.test.js` fails when the list and the coercers disagree.

## Defeat and cleanup

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

## Authoring

One dialog edits the one model. `view/forms/creatureFields.js` describes the fields,
and `app/creatureForm.js` writes `state.creatures` through `createCreature`
and `editCreature`. A blank level marks a townsperson, which stores no level
and no tier, and its gear pickers start at None. A typed level fills the
pickers and the `STAT_KEYS` inputs with the defaults of that level. The
read-back has no gear fallback, so the creature gets what the picker shows,
and an empty picker means unarmed.

## The challenge rating

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

## The difficulty hint

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

## A creature's saves and skills

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
plus `creatureProficiencyBonus` where the creature is trained.
`proficiencySummary` is the line that both creature panels
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

## Creature types and condition immunities

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
An optional `actions` list keeps save actions such as a breath weapon
(`entities/CreatureActions.js`). Each action has a name, a save ability, a
DC from 1 to 30, damage terms, a half-on-save flag, and an optional
recharge face of 4, 5, or 6. `actionList` repairs a loaded list, and the
creature, template, and library paths all run it. `actionSpell` turns an
action into a level 0 save spell with a `creatureAction` marker, so
`spellsOf` lists it and `castPlan` uses the action DC and casts it free.
A use of a recharge action sets `spent`. `startTurnEffects` rolls
`rollRecharges` for the creature whose turn starts, and `endFightEffects`
readies every action. `toTemplate` stores the actions ready.
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

## Damage defenses

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
`CreatureWeapon`. `assembleItem`, `normalizeLibrary`, and `copyEnemyWeapon`
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
the 5e order. The half keeps its fraction until the end. The types that no
defense touches add up and round down once together, so a spell with two
damage types and no defenses rounds down once. Each type that a defense
touches takes its half, then resistance or vulnerability, and rounds down on
its own. On a save, 7 bludgeoning and 13 cold give 10 with no defenses, 6
with cold resistance, and 16 with cold vulnerability.

`combatants.defendedDamage` finds the target by id and calls `applyDefenses`.
The weapon path, the spell attack path (once for each ray), and the save path
all apply its total. Damage typed into an HP stepper has no damage type, so no
defense applies to it.

## Creature casters

A creature casts through the same class rules as a character. It has one
scalar `class` with an optional `subclass`, a `casterLevel`, a `spellbook`,
and slot pools in its `resources`. `entities/Caster.js` connects the two
models. `toCaster` presents any combatant in the field layout that the pure
spell helpers read, and it reads the scalar pair as a class list with one
entry at the caster level. `withCasterFields` writes the fields on a create or
an edit, and it rebuilds the slot pools from the class and the level.

A subclass can make a creature a caster (see
[Subclass casting](characters.md#subclass-casting)). `withCasterFields`,
`ensureCasterFields`, and `casterTemplateFields` ask
`ClassCasting.castsAs(class, subclass, level)`. A fighter with the Eldritch
Knight subclass at caster level 3 or more therefore gets slots. A template
with no caster level is judged at level 20, because its spawn level is not
known.

In the creature form, `view/forms/casterFields.js` offers each casting subclass as an
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
