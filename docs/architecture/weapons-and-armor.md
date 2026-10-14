---
---
# Weapons and armor

*Explanation. Back to [Entities](entities.md) and the [architecture overview](../architecture.md).*

## Contents

- [Damage terms](#damage-terms)
- [The weapon property model](#the-weapon-property-model)
  - [Weapon coercion](#weapon-coercion)
- [Armor class](#armor-class)
  - [Shields](#shields)
  - [Unarmored defense](#unarmored-defense)
  - [AC chips](#ac-chips)
  - [HP chips](#hp-chips)
  - [Save and action chips](#save-and-action-chips)
  - [Attack slant chips](#attack-slant-chips)
  - [Stealth and Strength](#stealth-and-strength)
  - [Walking speed](#walking-speed)
- [Armor proficiency](#armor-proficiency)
  - [Weapon proficiency](#weapon-proficiency)

## Damage terms

A weapon's damage and a spell's damage or healing use the same type, a list of
`DamagePart`s. Each part rolls `count` dice of `sides` in a damage type, plus
an optional flat `bonus` on that term (the `1d4+1` of Magic Missile). An absent
bonus means no bonus, so a stored term without the field needs no repair.

`DamageParts.normalizeDamagePart` is the only validator. It repairs a term with a
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
item heals by its dice. `app/potionsWiring.drinkPotion` asks who drinks it, rolls the dice
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
`features` field of the Life Domain entry in `data/classCatalog.js`, and
`LevelUp.unlockedFeatures` adds the features of a catalog subclass to the
class features. The heal line ends in ", Disciple of Life +N". A heal effect with `revives` raises the dead, and it heals only
a dead target (see
[Damage and healing at 0 HP](rolls-and-states.md#damage-and-healing-at-0-hp)).
Revivify and Raise Dead ship with it, and the spell form offers it as the
"Raises the dead" box. A heal effect with `stabilizes` heals nothing and
stabilizes a dying character through `app/deathSaveRolls.stabilizeCharacter`.
`HealTarget.healBlocked` gives any other target the reason `notDying`.
Spare the Dying ships with it, and the spell form offers it as the
"Stabilizes the dying" box. `SpellEntry.normalizeSpellEffect`, which both the
library import and the spell form use, keeps each flag only when it is true.

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

`entities/WeaponProperties.js` applies three of the properties in combat.
`ammunitionStack(attacker, weapon)` finds the inventory stack that feeds a
weapon with the Ammunition property. It matches by item name, so "Arrows"
feeds a bow and "Crossbow Bolts" feeds a crossbow, and
`app/ammunitionSpend.js` takes one piece from that stack for each paid shot.
A character with no matching stack gets a toast, and the shot still rolls.
`heavySlant(attacker, weapon)` adds one disadvantage slant to the swing of a
heavy weapon when the attacker's `raceTraits.size` is `'small'`.
`loadedSwings` caps the Extra Attack count of a loading weapon at one swing,
unless the attacker took the Crossbow Expert feat. A creature's Multiattack
count ignores that cap, because a stat block already counts its shots.

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
A subclass can store its own `unarmoredDefense`, which applies from the
class's `subclassLevel` on. The Draconic Bloodline formula has a `base` of 13
and no second ability, so it reads 13 plus the DEX modifier.
`Classes.unarmoredDefenses(character)` collects the grants of the whole class
list and its subclasses. `armorClass` takes the higher of the plain unarmored AC and the formula,
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
wiring layer passes its write through `app/lethargyWrites.js`: the turn sweep,
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
is below what the armor needs. `walkSpeed` subtracts that penalty, with a floor
of 0, and then applies `Exhaustion.tiredSpeed`. `speedNote` is the sentence that the
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
- `app/castPlan.js` also marks a character that is the target of a STR or DEX
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
