# Characters

*Explanation. Back to [Entities](entities.md) and the [architecture overview](../architecture.md).*

Besides its stats and inventory, a `Character` has a class list, a race, a
background, proficiency lists, hit dice, and a level-up flow. Each of these
is a pure module beside `Character.js`, and each takes a value and returns a
new value.

```
  data catalogs (plain data, no logic)
    data/classCatalog.js       hit die, proficiencies, skill choices, caster type,
                               subclasses (with subclass casting),
                               subclass level, ASI levels, features by level
    data/arcaneClasses.js      the Sorcerer, Warlock, and Wizard entries
    data/classParts.js         the curves, shared features, and subclasses
                               that both class files build from
    data/raceCatalog.js        races and their traits
    data/backgroundCatalog.js  backgrounds
    data/skills.js             the ability of each of the 18 skills
    data/feats.js              the built-in feat catalog
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
    Purse.js             the coins of a character: add, set, spend, format,
                         and the load step that moves a "Gold (gp)" stack
                         into gp
    Shop.js              buy a priced library entry with the coins of a
                         character
          |
          v
    Character.js         the character value itself; withDefaults runs on
                         every load
```

The catalogs describe what a class or a race *is*, and the entity modules
describe what happens when a character *has* one. `types/class.ts`,
`types/race.ts`, and `types/feat.ts` declare the catalog types.

## Contents

- [Derived pools](#derived-pools)
- [Classes and multiclassing](#classes-and-multiclassing)
- [Subclass casting](#subclass-casting)
- [Proficiencies](#proficiencies)
- [Hit points and hit dice](#hit-points-and-hit-dice)
- [Leveling up](#leveling-up)
- [Feats](#feats)
- [Class features](#class-features)
- [Eldritch invocations](#eldritch-invocations)
- [Pact of the Tome](#pact-of-the-tome)
- [Mystic Arcanum](#mystic-arcanum)
- [Load-time defaults](#load-time-defaults)

## Derived pools

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
uses: Second Wind, Action Surge, Indomitable, Rage, Bardic Inspiration, Channel Divinity,
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
`'long'`, or `'none'`. A `'long'` pool can also set `shortRestRegain`, and
the other two drop it, because a short-rest pool refills in full and a
`'none'` pool refills on no rest. The sheet offers Add pool, and an Edit and a
Remove button on each such pool. A derived pool gets no Edit button, because the
next `derive` would write its size and recharge again.


`Progression.js` also exports the writers that app and UI code call:
`withClasses`, `withRace`, `withCustomRace`, `withProficiencies`, `withExpertise`, `applyASI`,
`takeFeat`, `undoLastChoice`, `applyFeatureGrant`, `undoFeatureGrant`,
and `withEquipped`. Each is the writer of a lower module followed
by `derive`. The lower modules keep the raw writers so that they can stay
plain list arithmetic. A call to a raw writer from app code skips the
reconcile and leaves the pools out of date.

## Classes and multiclassing

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

A race can define an `abilityChoice` (a count of abilities, the gain for each,
and the abilities it excludes) and a `skillChoice` (a count of skills). The
Half-Elf has both. `withRace` takes the picks as a third argument and checks
them with `validRacePicks`. The chosen abilities join the snapshot's
`abilityIncreases`, so a later race change takes them back off the scores.
The chosen skills go to the snapshot's `chosenSkills`, which `resolveRace`
keeps and `assembleProficiencies` merges with the fixed race skills.
A `resistanceChoice` (the Dragonborn ancestry) lists damage types, and the
picked one joins the snapshot's `resistances` as `chosenResistance`, where
`defensesOf` reads it. A `toolChoice` (the Dwarf) works the same way, and the
picked tool joins `tools` as `chosenTool`. A `cantripChoice` (the High Elf) names a
class list. `withRace` adds the picked cantrip to the spellbook cantrips
with that class as its source, so `spellSaveDC` and `spellAttackBonus` read
the class spell ability (INT) through `casterDefOf` even for a character
with no caster class. The snapshot records it as `chosenCantrip`.
`Races.raceCantrips` lists it while the book still has it, and
`Classes.cantripLimit` adds that count, so the cantrip does not use a class
cantrip. A race change or a new pick takes the old cantrip out of the book,
and `unlearnCantrip` clears `chosenCantrip`.

`entities/RaceTraits.js` turns some trait names into roll effects.
`isLucky` makes `resolveD20` in Checks.js roll a natural 1 again on a
character's save or check, and on a spell target save through the `lucky`
flag of `CastTarget`. A weapon attack and a death save roll in the dice tray,
so `app/luckyRoll.js` rolls the tray selection again when a Lucky roller
shows a natural 1 on the kept d20. `raceSaveSlant` returns advantage for Brave, Fey
Ancestry, Dwarven Resilience, and Gnome Cunning, and `spellCastResolve`
folds it into each spell target's save mode with the context from
`spellRaceSave`, which treats a creature action as a save that is not
magic. `repeatSaves` takes a `slantOf` callback and a `lucky` flag, so the
end-of-turn retry in `retryImposedSaves` gets the same race effects. A
creature has no race, so these functions return no
effect for it.

## Subclass casting

A class membership (`ClassRef`) stores its subclass as a name. Each class in
`data/classCatalog.js` lists its catalog subclasses in `subclasses`, and each entry
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

## Proficiencies

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

## Hit points and hit dice

`entities/HitDice.js` derives max HP from the class hit die plus the CON
modifier per level (`classMaxHP`, the 5e average rule). `traitHPBonus` adds
the per-level grants on top. A race snapshot and a taken feat record each
keep an `hpPerLevel` value that counts once per assigned class level (the
Hill Dwarf's Dwarven Toughness, the Tough feat). A subclass `hpPerLevel`
counts once per level of its own class from the class's `subclassLevel` on
(Draconic Resilience). A GM who types a maximum in the HP and AC dialog sets
`hpOverride`, and `reconcileMaxHP` then leaves the pool alone.
`Character.clearMaxHPOverride` drops the flag and derives the pool again,
which is what "Use class HP" in the dialog does. The dialog
(`app/characterEdit.js`) sets the override only when the typed maximum
differs from the one it showed, so an AC-only edit does not pin HP. It also models hit
dice as resource pools sized to the assigned class levels. `withHitDice`
creates the pools, and `syncHitDice` derives them again and keeps the spent
count. `spendHitDie` spends one die and heals through `restoreResource`, so a
dying character who rises above 0 HP stops dying, and a dead character spends
nothing. `restoreHitDice` gives back half
of the total dice on a long rest, largest die size first.
`entities/RestHitDice.js` spends the counts that the Short rest dialog
(`ui/ShortRestDialog.js`) collects. `spendRestDice` rolls each pool's count
and stops at full HP, and `spendablePools` leaves out a dead character.

## Leveling up

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

## Feats

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
only prerequisite text is open to everyone. The Library feat form sets
`requires` through `ui/FeatRequirementFields.js`, with one minimum score, one
armor proficiency, and the spellcasting box, and `requirementFromDraft`
turns those controls into the stored field.

The dialogs are in `ui/EffectPicks.js`. The class-feature grant flow uses the
same picks, so a feat and a feature with the same effects prompt the same way.
A pick whose pool has no more options than the count grants them all with no
prompt. The expertise prompt runs after the skill picks, because its options
depend on them. `ui/LevelAssignFlow.js` and `ui/ImprovementFlow.js` run both flows,
and `ui/CharacterProgress.js` places their buttons on the sheet.

## Class features

A class feature in `featuresByLevel` (`data/classCatalog.js`) is a plain name or a
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
The Rogue's expertise choice also names `tools: ["thieves' tools"]`, so
`FeatChoices.expertisePool` offers thieves' tools when the rogue holds them.
`Proficiencies.EXPERTISE_TOOLS` lists the tools that can keep expertise, and
`normalizeProficiencies` drops an expertise entry for any other tool, or for
a tool the character does not hold.

A second class-only effect, `{ kind: 'abilityRaise', abilities, amount, cap }`
(`AbilityRaise` in `types/class.ts`), raises scores with no pick. Primal
Champion at barbarian 20 raises STR and CON by 4, to at most 24.
`FeatureGrants.needsGrant` leaves a feature with only raises out of the
pending list. `entities/AbilityRaises.js` collects the raises from the
catalog, and `Equipment.effectiveStats` applies them to the base scores
before the item buffs. A level taken away removes the raise, because the
raise is read from the class levels and has no record. The module reads the
catalog directly, because an import of `LevelUp.js` from `Equipment.js`
closes a cycle through `Classes.js`.

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

[Adding a class mechanic](../adding-a-class-mechanic.md) lists the files to
change for each kind of class feature.

## Eldritch invocations

`entities/Invocations.js` defines the rules of the warlock's eldritch
invocations and pact boon, and `data/invocationCatalog.js` lists the SRD
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
their spells through it, and `castPlan` in `app/castPlan.js` maps its spell
again. A spell that the caster also knows lists as the book has it, because
those lists pass `atWill: false`, and `castPlan` applies the at-will
changes only on the at-will cast. `invocationCast` tells `castPlan` how the
cast is paid. An at-will cast is a free cast at the spell's own level. A
once-per-rest cast offers only the pact slot level (`pactSlotLevels`) and
passes `granted` and `pool: 'pact'` to `castSpell`, which skips the
spellbook check and pays from the pact pool only. `resolveCast` reads the use
again off the live caster, refuses a use that another tab spent while the
dialog was open, and then marks the use with `markInvocationUsed`.

## Pact of the Tome

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

## Mystic Arcanum

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

## Load-time defaults

`Character.withDefaults` runs on every character that the app loads, and
`campaign/Campaigns.js` maps every loaded character through it. It converts a
scalar class to a list, creates an empty proficiency structure where one is
missing, and keeps a race string as it is. It also reconciles the loaded pools
through `Progression.derive`, so a save that was edited by hand comes back
with pools that match its class list, level, and CON.
