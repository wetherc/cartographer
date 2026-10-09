import type { RaceSnapshot } from './race.js';
import type { ClassRef, WeaponCategory } from './class.js';
import type { DieType } from './dice.js';

export interface EncounterLocation {
  nodeId: string;
  tileId: string;
}

/** Where one character stood, kept so an undo can put them back. `location`
 * null means the character travelled with the party. A map edit that recalls
 * placed characters records these before it moves them. */
export interface CharacterPlacement {
  characterId: string;
  location: EncounterLocation | null;
}

/** Where one creature stood, kept so an undo can put it back. `location`
 * null means the creature is unplaced, so it shows everywhere. A map edit
 * that moves placed creatures records these before it moves them. */
export interface CreaturePlacement {
  creatureId: string;
  location: EncounterLocation | null;
}

/** Where a condition came from, for a condition that a spell imposed. This
 * field is present only on a chip that a cast wrote. A chip that the GM
 * added by hand carries no source, and the GM can clear it freely. The save
 * numbers are the ones the cast rolled against. The app keeps them so a
 * repeated save can roll later against the same DC, and, for a target whose
 * own bonus the app cannot read, with the same bonus. */
export interface ConditionSource {
  /** The spell that imposed it, and the caster holding it. */
  spellId: string;
  spellName: string;
  casterId: string;
  /** The caster's name when the cast wrote the chip, so a tooltip can tell
   * two casts of one spell apart. Without it, the tooltip names only the spell. */
  casterName?: string;
  saveAbility?: string;
  saveDC?: number;
  saveBonus?: number;
  /** True when the target retries the save at the end of each of its turns. */
  saveEnds?: boolean;
  /** True when damage to the holder ends the chip (Sleep). */
  endsOnDamage?: boolean;
  /** Present on the chip that a caster keeps while it can repeat a spell on
   * a later turn without a new slot (Spiritual Weapon, Witch Bolt). */
  repeat?: RepeatHold;
}

/** What a later repeat of a spell resolves with. `slotLevel` is the level of
 * the first cast, so a repeat deals the upcast damage again. `targetIds` names
 * the creatures that a repeat is locked to, for a spell such as Witch Bolt
 * that stays on the creature it hit. Absent means the caster picks again. */
export interface RepeatHold {
  slotLevel: number;
  targetIds?: string[];
}

/** A chip that ends at a turn boundary of one combatant, instead of after a
 * count of rounds. `who` is the id of that combatant, and `at` is the start or
 * the end of its turn. `count` is how many of those boundaries pass before the
 * chip ends. It starts at 2 for "the end of your next turn" when the cast
 * happens on that combatant's own turn, so the end of the current turn does
 * not count. */
export interface ChipExpiry {
  who: string;
  at: 'start' | 'end';
  count: number;
}

/** Damage that a chip deals to its holder at the end of each of the holder's
 * turns (Acid Arrow). On a chip that allows a repeated save, the damage lands
 * only when that save fails (Phantasmal Killer). The dice are already scaled
 * to the slot of the cast. */
export interface OngoingDamage {
  damage: DamagePart[];
}

/** What a chip changes on its holder besides a d20 roll. `ac` adds to the
 * holder's AC (Shield's +5, Shield of Faith's +2). `acBase` is the base AC of
 * a holder that wears no body armor, before its DEX modifier (Mage Armor's
 * 13). `acMin` is a floor under the finished AC (Barkskin's 16). Several
 * chips add their `ac` together, and the highest `acBase` and `acMin` win.
 * `maxHP` raises the holder's HP maximum and current HP while the chip lasts
 * (Aid), and the highest one wins. `immune` names the conditions the holder
 * can't take (Heroism's Frightened). `tempHPEachTurn` is the temporary HP the
 * holder gains at the start of each of its turns (Heroism), stamped from the
 * caster's spell modifier at the cast. `saveAdvantage` names the abilities
 * whose saves the holder rolls with advantage (Haste's DEX). `extraAction`
 * gives the holder one more action on each of its turns, good for one weapon
 * attack only (Haste). `blocks` names the ids of the spells that the chip
 * stops outright, so their automatic hits skip the holder (Shield names
 * Magic Missile). */
export interface ChipMods {
  ac?: number;
  acBase?: number;
  acMin?: number;
  maxHP?: number;
  immune?: string[];
  tempHPEachTurn?: number;
  saveAdvantage?: string[];
  extraAction?: boolean;
  blocks?: string[];
  /** True when the holder regains no hit points while the chip lasts (Chill
   * Touch). Temporary HP is not healing, so the holder still gains it. */
  noHealing?: boolean;
  /** True when the holder attacks the caster who wrote the chip at
   * disadvantage (Chill Touch on an undead target). */
  disadvantageVsSource?: boolean;
  /** A slant on the holder's own attack rolls (Vicious Mockery's
   * disadvantage). */
  attacks?: 'advantage' | 'disadvantage';
  /** A slant on attack rolls made against the holder (Faerie Fire's
   * advantage, Blur's disadvantage). */
  attacksAgainst?: 'advantage' | 'disadvantage';
  /** The lowercase creature types whose attacks `attacksAgainst` slants
   * (Protection from Evil and Good). Absent means every attacker. A party
   * character attacks as a humanoid, and an untyped creature is outside every
   * list. */
  attackerTypes?: string[];
  /** True when the chip ends after the first attack roll that its slant
   * applies to (Guiding Bolt, Vicious Mockery). Only kept beside `attacks`
   * or `attacksAgainst`. */
  once?: boolean;
  /** The damage types the holder resists while the chip lasts (Protection
   * from Energy). */
  resist?: string[];
  /** True when the holder resists bludgeoning, piercing, and slashing damage
   * from a nonmagical weapon attack (Stoneskin). */
  resistNonmagical?: boolean;
}

/** The fields that record what spell chips did to an entity's HP. Both a
 * character and a creature have them. `entities/HPBuffs.js` writes them. */
export interface HPBuffFields {
  /** The HP maximum that a chip adds now (Aid), already counted in the
   * stored maximum. When the chip goes, the maximum drops by this much.
   * Absent reads as 0. */
  hpBoost?: number;
  /** The lowercase name of the chip that granted the current temporary HP
   * (False Life, Heroism). The temporary HP end with that chip. Absent when
   * the GM typed them or nothing granted any. */
  bonusHPFrom?: string;
}

/** Which rolls a rider touches. `check` has no roller yet, so a check rider
 * shows on the chip and the GM applies it in the dice tray. */
export type RiderRoll = 'attack' | 'save' | 'check';

/** A bonus or penalty that a condition adds to the holder's later rolls.
 * Bless adds 1d4 to attack rolls and saving throws. Bane subtracts the same,
 * which is the identical shape with a negative dice count. */
export interface RollRider {
  /** Which rolls it touches. A rider that touches nothing is not a rider. */
  rolls: RiderRoll[];
  /** How many dice to roll. A negative count subtracts them. Absent means none. */
  dice?: number;
  /** Which die the count refers to. Absent means d4. */
  die?: DieType;
  /** A flat amount on top of the dice, negative to subtract. Absent means none. */
  flat?: number;
  /** True when the first roll the rider changes uses up its chip, as with
   * Guidance and Resistance. Absent means the chip lasts its duration. */
  once?: boolean;
}

/** A status or condition with an optional remaining-rounds counter. Null means indefinite. */
export interface Condition {
  name: string;
  rounds: number | null;
  /** What imposed the condition, for a spell-imposed condition. Absent for a hand-added one. */
  source?: ConditionSource;
  /** What the condition adds to the holder's later rolls. Absent for a chip
   * that only names a state. */
  rider?: RollRider;
  /** When a turn boundary ends the chip. A chip with this field has a null
   * `rounds`, because a round tick would end it at the wrong time. */
  expires?: ChipExpiry;
  /** Damage the chip deals at the end of each of the holder's turns. */
  ongoing?: OngoingDamage;
  /** What the chip changes besides a d20 roll, such as the holder's AC. */
  mods?: ChipMods;
  /** Extra damage dice on a hit (Divine Favor, Hunter's Mark). */
  hit?: HitRider;
}

/** Enemy authoring tier. A mob is rank-and-file. A legend runs above-normal stats for its level. */
export type EnemyTier = 'mob' | 'legend';

/** A timed adjustment to one stat, applied on top of the base stat block for
 * a set number of combat rounds. */
export interface StatModifier {
  stat: string;
  delta: number;
  rounds: number;
}

/** One contribution to a stat's current value: what shifts it, by how much,
 * and for how long. An absent `rounds` is an open-ended source, for example
 * an equipped item, which holds for as long as it stays equipped. */
export interface StatSource {
  source: string;
  delta: number;
  rounds?: number;
}

/** An enemy's weapon. It carries enough of an InventoryItem's weapon fields
 * to drive the same attack math, without the full inventory model. */
export interface EnemyWeapon {
  name: string;
  kind: WeaponKind;
  damage: DamagePart[];
  /** Absent or null means a natural weapon, outside both categories. */
  category?: WeaponCategory | null;
  properties?: WeaponProperty[];
  /** Absent or null on a weapon with no range. */
  range?: WeaponRange | null;
  versatileDamage?: DamagePart[];
  /** True when the weapon counts as magical, so resistance to nonmagical
   * weapon damage (Stoneskin) does not apply. Absent means nonmagical. */
  magical?: boolean;
  /** A save the weapon forces on a hit. Absent means none. See
   * `combat/HitSave.js`. */
  onHitSave?: HitSave;
}

/** A save a weapon forces on each hit: the defender rolls the ability
 * against the DC, and a failure puts the condition on it. */
export interface HitSave {
  ability: string;
  dc: number;
  condition: string;
}

/** An enemy's worn armor: a name, a base AC, and a weight class. The armor
 * replaces the 10 + DEX part of the creature's AC with the base AC plus the
 * DEX contribution its weight allows (`EnemyArmor.js`). */
export interface EnemyArmor {
  name: string;
  baseAC: number;
  armorWeight: ArmorWeight;
}

export type ResourceType = 'item-count' | 'mana' | 'custom';

/** The rest that refills a pool in full. A long rest refills every pool
 * except one marked 'none'. */
export type Recharge = 'short' | 'long';

/** The recharge a pool can store. 'none' marks a pool that no rest refills,
 * such as the charges of a wand that the GM restores by hand. */
export type PoolRecharge = Recharge | 'none';

export interface ResourcePool {
  id: string;
  name: string;
  type: ResourceType;
  current: number;
  max: number;
  /** The rest that refills the pool. Absent means a long rest. A short rest
   * leaves a long-rest pool as it is. HP, slot, pact, and hit-dice pools
   * follow their own rest rules and ignore this field. */
  recharge?: PoolRecharge;
  /** The points a short rest restores to a pool that refills in full only on
   * a long rest, for example the 4 sorcery points of Sorcerous Restoration.
   * Absent means none. */
  shortRestRegain?: number;
}

/** Item classification. Each equipment slot accepts only compatible types.
 * 'armor' means body armor. Helmets, gloves, and greaves are their own types. */
export type ItemType =
  | 'weapon'
  | 'armor'
  | 'helmet'
  | 'gloves'
  | 'greaves'
  | 'shield'
  | 'bow'
  | 'ring'
  | 'consumable'
  | 'gear';

/** 5e armor weight class. This alone determines how DEX scales the armor's
 * AC. Light adds the full DEX modifier. Medium caps it at +2. Heavy ignores
 * DEX entirely. */
export type ArmorWeight = 'light' | 'medium' | 'heavy';

/** Whether the weapon strikes in melee or at range. A ranged weapon uses DEX
 * for its rolls. Absent reads as melee. */
export type WeaponKind = 'melee' | 'ranged';

/** 5e weapon category, declared in class.ts beside the proficiency lists
 * that grant it. Proficiency with a category covers every weapon in it. A
 * weapon with no category is a natural weapon, for example a bite. */
export type { WeaponCategory };

/** 5e weapon property flags. `finesse` uses the higher of STR and DEX.
 * `versatile` swaps to the alternate damage dice when held two-handed.
 * The other flags are stored and shown; later combat work reads them. */
export type WeaponProperty =
  | 'finesse'
  | 'versatile'
  | 'two-handed'
  | 'light'
  | 'heavy'
  | 'reach'
  | 'thrown'
  | 'ammunition'
  | 'loading';

/** A weapon's normal and long range in feet. An attack past the normal range
 * has disadvantage. */
export interface WeaponRange {
  normal: number;
  long: number;
}

/** One dice term of a weapon's damage roll, for example 2d6 slashing. */
export interface DamagePart {
  count: number;
  sides: number;
  damageType: string;
  /** A flat amount added to this term's dice, for example Magic Missile's
   * 1d4+1. Absent reads as 0. A critical hit doubles a term's dice, and
   * leaves this bonus alone, per the 5e rule. A term that carries a bonus
   * can roll no dice at all. This is how a fixed amount with no dice is
   * written. */
  bonus?: number;
  /** A die that lands at or below this face rolls once more, and the second
   * roll stands, as Great Weapon Fighting rerolls a 1 or a 2. Absent means no
   * reroll. */
  rerollBelow?: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  notes: string;
  /** Optional flavor or rules text shown with the item. */
  description?: string;
  /** Absent on older saves. Treated as 'gear'. */
  type?: ItemType;
  /** Weapons and bows: melee or ranged. Absent reads as melee. */
  kind?: WeaponKind;
  /** Weapons and bows: simple or martial. Absent or null means a natural
   * weapon, outside both categories. */
  category?: WeaponCategory | null;
  /** Weapons and bows: the weapon's 5e property flags. Absent reads as none. */
  properties?: WeaponProperty[];
  /** Weapons and bows: normal and long range in feet, present on a ranged or
   * thrown weapon. Absent or null on a weapon with no range. */
  range?: WeaponRange | null;
  /** Versatile weapons: the damage dice when held two-handed. A permanent
   * rider term, for example a flaming blade's fire die, appears in both
   * arrays. */
  versatileDamage?: DamagePart[];
  /** Weapons and bows: true when the weapon counts as magical, so
   * resistance to nonmagical weapon damage does not apply. Absent means
   * nonmagical. */
  magical?: boolean;
  /** Weapons and bows: the damage roll as dice terms. The base damage comes
   * first, then any permanent riders, for example a burning blade's +1d4
   * fire. */
  damage?: DamagePart[];
  /** Weapons and bows: status effects the weapon inflicts on a hit. */
  statusEffects?: string[];
  /** Body armor only: its weight class, fixing the DEX scaling rule. */
  armorWeight?: ArmorWeight;
  /** Body armor only: the armor's base AC, replacing the unarmored 10. */
  baseAC?: number;
  /** Body armor only: the wearer rolls Stealth at disadvantage. Absent means
   * the armor is quiet. */
  stealthDisadvantage?: boolean;
  /** Body armor only: the Strength score the armor needs. A wearer below it
   * moves 10 feet slower. Absent means the armor has no requirement. */
  strength?: number;
  /** Flat armor-class bonus granted while equipped, for example a helmet, a
   * ring, or a shield. Ignored on body armor, which uses baseAC. A shield
   * with no value adds the 5e standard +2. */
  acBonus?: number;
  /** Ability-score buffs granted while equipped, for example { STR: 2 }. */
  statBonuses?: Record<string, number>;
  /** Set on a component pouch or a spellcasting focus. Carrying one covers a
   * spell's material component, as long as the material has no gp cost and
   * the cast does not destroy it. Any item type can carry the flag, because a
   * staff is an arcane focus and an amulet is a holy symbol. */
  spellFocus?: boolean;
  /** Consumables only: the heal dice rolled when a character drinks it, for
   * example 2d4 + 2 on a Potion of Healing. Absent means "Use one" only
   * takes the item off the stack. */
  heals?: HealDice;
}

/** The heal roll of a consumable: `count` dice of `sides` plus `bonus`. */
export interface HealDice {
  count: number;
  sides: number;
  bonus: number;
}

/** The wearable slots on a character. Older saves' 'armor' slot reads as
 * 'chest'. The two accessory slots each hold a ring. */
export type EquipmentSlot =
  | 'helmet'
  | 'chest'
  | 'gloves'
  | 'greaves'
  | 'mainHand'
  | 'offHand'
  | 'ranged'
  | 'accessory'
  | 'accessory2';

/** Inventory item id equipped in each slot. Null means the slot is empty. */
export type Equipment = Record<EquipmentSlot, string | null>;

/** A character's spellbook: the ids of the cantrips and leveled spells it
 * learns, and, for a prepared caster, which of the known leveled spells are
 * currently prepared. Absent on non-casters and on older saves. */
export interface Spellbook {
  cantrips: string[];
  known: string[];
  prepared: string[];
  /** Which class each learned spell was learned under (spell id maps to
   * class id). The app records this when a multiclass caster learns a
   * spell, so casting can use that class's ability. An absent entry falls
   * back to the first caster class. */
  sources?: Record<string, string>;
}

/** The fields that the spell helpers read from whoever is casting. A party
 * Character satisfies this type directly. A Creature reaches it through
 * `Caster.toCaster`, which normalizes its scalar class pair into the list
 * shape here. Every helper that only reads a caster, for example slot
 * pools, save DC, attack bonus, spellbook, or cast resolution, takes this
 * type instead of Character. This way a creature's cast needs no cast to a
 * type it is not. The scalar
 * `class` and `subclass` pair is here because an older Character save still
 * carries it, before `withDefaults` folds it into `classes`. */
export interface SpellCaster {
  id: string;
  name: string;
  classes?: ClassRef[];
  class?: string;
  subclass?: string;
  level: number;
  stats: Record<string, number>;
  resources: ResourcePool[];
  spellbook?: Spellbook;
  /** Exhaustion, 0 to 6. The spell attack bonus reads it. Both a Character
   * and a Creature carry it. */
  exhaustion?: number;
  /** The proficiency bonus the caster's spells use, for an entity that
   * climbs a different ladder than character level. `toCaster` stamps it
   * for a creature with a challenge rating, from the rating ladder. Absent
   * means `proficiencyBonus(level)`. A Character never carries it. */
  proficiency?: number;
  /** A warlock's invocation ids, pact boon, and Book of Shadows, which
   * `toCaster` copies so the ritual rules of Book of Ancient Secrets can
   * read them (see PactTome.js). */
  invocations?: string[];
  pactBoon?: import('./invocation.js').PactBoon;
  bookOfShadows?: { cantrips: string[]; rituals: string[] };
}

/** Weapon proficiencies, split by namespace the way MulticlassGrant already
 * splits the class grants they come from. `categories` holds whole weapon
 * categories ('simple' or 'martial'). `named` holds individual weapons by
 * lowercase name. The split keeps "is this weapon's category granted" a
 * lookup, instead of a string match across two kinds of key. */
export interface WeaponProficiencies {
  categories: WeaponCategory[];
  named: string[];
}

/** A character's proficiencies, one list per kind. Saves hold ability keys
 * (STR through CHA). Skills hold skill ids (see data/skills.js). Expertise
 * holds the skill ids rolled with double proficiency, and is always a subset
 * of `skills`. Weapons split into categories and named weapons. Armor holds
 * the armor categories. Tools and languages are free strings. The app
 * assembles this from class, race, and background, and the player can edit it
 * by hand afterward. */
export interface Proficiencies {
  saves: string[];
  skills: string[];
  expertise: string[];
  weapons: WeaponProficiencies;
  armor: string[];
  tools: string[];
  languages: string[];
}

/** Proficiencies as a save written before the weapon split kept them: one
 * flat weapon list that mixes the category words with named weapons. */
export interface LegacyProficiencies extends Omit<Proficiencies, 'weapons'> {
  weapons: string[];
}

/** One claimed ability-score-improvement slot: either a +2-total ability
 * increase, or a feat taken in its place. `classId` and `classLevel` name
 * the class ASI slot that the choice claims. Each class follows its own
 * schedule, so each earned slot is spent exactly once. */
export type AsiChoice =
  | {
      classId: string;
      classLevel: number;
      order: number;
      type: 'asi';
      increases: Record<string, number>;
    }
  | {
      classId: string;
      classLevel: number;
      order: number;
      type: 'feat';
      feat: string;
      /** The catalog entry taken, absent for a hand-typed feat name. */
      featId?: string;
      /** The ability increases the feat applied, subtracted back on undo. */
      increases?: Record<string, number>;
      /** Every proficiency the feat asked for, after vocabulary filtering. */
      requested?: import('./feat.js').FeatGrants;
      /** The proficiency entries the feat added, because the character lacked
       * them before. Undo rebuilds the lists from every record that stays. */
      granted?: import('./feat.js').FeatGrants;
      /** The standing roll rider the feat carries. */
      rider?: RollRider;
      /** The extra hit points per class level the feat grants, which
       * `HitDice.classMaxHP` adds to the maximum. */
      hpPerLevel?: number;
      /** The bonus to initiative the feat grants, which
       * `Checks.initiativeBonus` adds. */
      initiativeBonus?: number;
      /** True when the feat gives advantage on the CON save that keeps
       * concentration after damage (War Caster). */
      concentrationAdvantage?: boolean;
    };

/** Recorded ASI choices, keyed by the slot they claim (see LevelUp.slotKey).
 * A slot holds at most one choice. The key makes this structural, instead
 * of a rule every writer must enforce. `order` carries the sequence that
 * the array this record replaced got for free, so undo can still find the
 * most recent choice. */
export type AsiChoices = Record<string, AsiChoice>;

/** One applied class-feature grant: what a structured feature added when the
 * character claimed it. `classId`, `classLevel`, and `name` identify the
 * catalog feature (see FeatureGrants.featureKey). `requested` holds every
 * pick, and `granted` only what the merge actually added. */
export interface FeatureChoice {
  classId: string;
  classLevel: number;
  name: string;
  order: number;
  /** Every proficiency the feature asked for, after vocabulary filtering. */
  requested?: import('./feat.js').FeatGrants;
  /** The proficiency entries the feature added, because the character lacked
   * them before. Undo rebuilds the lists from every record that stays. */
  granted?: import('./feat.js').FeatGrants;
  /** The standing roll rider the feature carries. */
  rider?: RollRider;
  /** The fighting style id that a Fighting Style feature picked. */
  style?: string;
}

/** Applied class-feature grants, keyed by the feature they claim (see
 * FeatureGrants.featureKey). A feature holds at most one grant. An unlocked
 * feature with effects and no entry here is a pending grant. */
export type FeatureChoices = Record<string, FeatureChoice>;

/** The choice shapes that older saves carried, both of them arrays: the
 * pre-multiclass shape, keyed by bare character level, and the per-class
 * shape, which predates the keyed record and so has no `order`. Loading
 * migrates either shape (see LevelUp.migrateASIChoices). */
export type LegacyAsiChoice =
  | { level: number; type: 'asi'; increases: Record<string, number> }
  | { level: number; type: 'feat'; feat: string }
  | { classId: string; classLevel: number; type: 'asi'; increases: Record<string, number> }
  | { classId: string; classLevel: number; type: 'feat'; feat: string };

/** The one spell that a caster holds open (see Concentration.js).
 * `slotLevel` is the level it was cast at, kept so a readout can name it.
 * `remaining` counts the combat rounds left, or is null for a duration that
 * no round counter fits, for example an open-ended duration or one measured
 * in days. That duration lasts until something breaks it. */
export interface ConcentrationState {
  spellId: string;
  spellName: string;
  slotLevel: number;
  remaining: number | null;
}

/** The death-save tracker a character carries at 0 HP (see DeathSaves.js).
 * Three successes stabilize, and three failures kill. `stable` marks a
 * character who is out of danger but still at 0 HP and still unconscious; its
 * counters are reset, because damage starts the saves over. A character with
 * three or more failures is dead, and the state stays so that a readout can
 * say so. */
export interface DeathSaveState {
  successes: number;
  failures: number;
  stable: boolean;
}

export interface Character extends HPBuffFields {
  id: string;
  name: string;
  /** The race's display name. A hand-typed race carries only this. A race
   * picked from the catalog also carries `raceId` and `raceTraits`. */
  race: string;
  /** Catalog race id (see Races.js). Absent means a hand-typed race. */
  raceId?: string;
  /** Snapshot of the race definition's mechanical fields as applied. This
   * lets a custom definition removed from the library degrade gracefully.
   * Resolution prefers the live catalog, so edits propagate. This snapshot
   * is the fallback. */
  raceTraits?: RaceSnapshot;
  /** Background id (see Backgrounds.js). Absent on older saves. */
  background?: string;
  /** The character's class memberships (see Multiclass.js): one entry for a
   * single-class character, empty for a classless one. An older save
   * carried scalar `class` and `subclass` fields instead. Loading folds
   * them into a one-entry list. Entry levels sum to at most `level`. Any
   * shortfall is a pending level that still needs a class assignment. */
  classes?: ClassRef[];
  /** Proficiency lists (see Proficiencies.js). Absent on older saves, which
   * load as having none. */
  proficiencies?: Proficiencies;
  /** Ability-score-improvement choices already made, one per claimed class ASI
   * level (see LevelUp.js). Absent on older saves, which load as none made. */
  asiChoices?: AsiChoices;
  /** Class-feature grants already applied (see FeatureGrants.js). Absent on
   * older saves, which load as none applied. */
  featureChoices?: FeatureChoices;
  /** The ids of the eldritch invocations a warlock picked (see
   * Invocations.js). Absent reads as none. */
  invocations?: string[];
  /** The once-per-rest invocations spent since the last long rest. */
  invocationUses?: string[];
  /** The pact boon a warlock picked at 3rd level. Absent reads as none. */
  pactBoon?: import('./invocation.js').PactBoon;
  /** The Mystic Arcanum spell ids of a warlock, keyed by spell level 6 to 9
   * (see MysticArcanum.js). Absent reads as none. */
  mysticArcanum?: Record<string, string>;
  /** The Book of Shadows of a Pact of the Tome warlock: its three cantrips
   * from any class list, and the rituals of Book of Ancient Secrets (see
   * PactTome.js). Absent reads as an empty book. */
  bookOfShadows?: { cantrips: string[]; rituals: string[] };
  /** The inventory id of the weapon a Pact of the Blade warlock marked as
   * its pact weapon (see PactWeapon.js). Absent reads as none. */
  pactWeapon?: string;
  level: number;
  xp: number;
  stats: Record<string, number>;
  resources: ResourcePool[];
  inventory: InventoryItem[];
  /** Active status conditions (empty on older saves). */
  conditions: Condition[];
  /** Exhaustion, 0 to 6. Each level costs 2 on every d20 test and 5 feet of
   * speed, and 6 is death. Absent on older saves, which load unexhausted. */
  exhaustion?: number;
  /** The spell this character holds open, or null when it holds none.
   * Absent on older saves, which load as holding nothing. */
  concentration?: ConcentrationState | null;
  /** The death saves this character is rolling at 0 HP, or null when it is
   * not dying. Absent on older saves, which load as not dying. */
  deathSaves?: DeathSaveState | null;
  /** Equipped items by slot. Absent on older saves, where all slots are empty. */
  equipment?: Equipment;
  /** Temporary hit points from items or boons, absorbed before the HP pool
   * when the character takes damage. Tracked separately from intrinsic HP.
   * Absent reads as 0. */
  bonusHP?: number;
  /** Set once the GM types a maximum HP by hand, or levels a classed
   * character with an explicit growth. This takes the character off the
   * class-derived HP rule for good. Progression.derive stops reconciling
   * the pool's maximum against the class list and CON. Absent reads as
   * false. */
  hpOverride?: boolean;
  /** Unarmored base AC, normally 10. Effects like Mage Armor raise it. This
   * value only applies while no body armor is equipped. Absent reads as 10. */
  baseAC?: number;
  /** Own map position. Null, and absence on an older save, means the
   * character stands with the party. */
  location?: EncounterLocation | null;
  /** Learned cantrips and spells (spell ids). Absent on non-casters and on
   * older saves. */
  spellbook?: Spellbook;
}

/** Extra damage that a chip adds to hits. On a chip without `mark`, the
 * holder's own hits deal it (Divine Favor on its caster). On a chip with
 * `mark`, the holder is the target, and the hits of the caster that the
 * chip's source names deal it (Hunter's Mark). `weaponOnly` limits it to
 * weapon attacks. A spell attack does not count. A critical hit doubles
 * the dice. */
export interface HitRider {
  count: number;
  sides: number;
  /** Absent means the type of the hit's own first damage term. */
  damageType?: string;
  weaponOnly?: boolean;
  mark?: boolean;
}
