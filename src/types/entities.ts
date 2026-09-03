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
  saveAbility?: string;
  saveDC?: number;
  saveBonus?: number;
  /** True when the target retries the save at the end of each of its turns. */
  saveEnds?: boolean;
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
}

/** An enemy's worn armor: a name, and the flat AC it adds on top of the stat
 * block's base AC. The effective AC includes this bonus. */
export interface EnemyArmor {
  name: string;
  acBonus: number;
}

export type ResourceType = 'item-count' | 'mana' | 'custom';

export interface ResourcePool {
  id: string;
  name: string;
  type: ResourceType;
  current: number;
  max: number;
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

export interface Character {
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
