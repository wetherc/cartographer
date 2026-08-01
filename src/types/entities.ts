import type { RaceSnapshot } from './race.js';
import type { ClassRef, WeaponCategory } from './class.js';

export interface EncounterLocation {
  nodeId: string;
  tileId: string;
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

/** A status or condition with an optional remaining-rounds counter. Null means indefinite. */
export interface Condition {
  name: string;
  rounds: number | null;
  /** What imposed the condition, for a spell-imposed condition. Absent for a hand-added one. */
  source?: ConditionSource;
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

/** An enemy's weapon. It carries enough of an InventoryItem's weapon fields
 * to drive the same attack math, without the full inventory model. */
export interface EnemyWeapon {
  name: string;
  handling: WeaponHandling;
  damage: DamagePart[];
}

/** An enemy's worn armor: a name, and the flat AC it adds on top of the stat
 * block's base AC. The effective AC includes this bonus. */
export interface EnemyArmor {
  name: string;
  acBonus: number;
}

export interface Encounter {
  id: string;
  name: string;
  maxHP: number;
  currentHP: number;
  statBlock: Record<string, number>;
  level: number;
  tier: EnemyTier;
  /** Map location where the encounter is staged. Null means the encounter is
   * not location-bound, and always shows. */
  location: EncounterLocation | null;
  /** Active status conditions (empty on older saves). */
  conditions: Condition[];
  /** Timed stat adjustments. Each combat round reduces them by one. Empty on
   * older saves. */
  statMods?: StatModifier[];
  /** True once the party walks into this encounter. This lets the
   * travelogue record the first meeting exactly once. Absent on older saves. */
  noticed?: boolean;
  /** The enemy's weapon. The app stamps a level and tier default on creation
   * and on older saves, so every enemy can attack. An explicit null means
   * the enemy is deliberately weaponless, for example a non-bipedal beast or
   * an ooze, and gets no default and no attack button. */
  weapon?: EnemyWeapon | null;
  /** The enemy's armor. The app stamps a level and tier default, like the
   * weapon. The same null value marks the enemy as deliberately unarmored. */
  armor?: EnemyArmor | null;
  /** Spellcaster class id (see Classes.js). A present value that names a
   * caster class makes this a spellcasting foe. An absent value marks a
   * non-caster. */
  class?: string;
  /** The chosen subclass id, if any. */
  subclass?: string;
  /** Caster level, which drives the slot maxima and the save DC. It defaults
   * to `level` when a caster class is assigned without an explicit value. */
  casterLevel?: number;
  /** Learned cantrips and spells (spell ids). Present only on casters. */
  spellbook?: Spellbook;
  /** Spell-slot pools (`slots-1` through `slots-9`). Present only on casters. */
  resources?: ResourcePool[];
}

/** A reusable encounter blueprint saved to the campaign's bestiary, or to
 * the campaign-independent library. Weapon and armor carry the same null
 * rule as Encounter: null means deliberately none, and absent means stamp a
 * default. Caster fields keep a spellcasting foe. The app rebuilds slot
 * pools from class and casterLevel on spawn, so the template stores no
 * resources. */
export interface EncounterTemplate {
  id: string;
  name: string;
  maxHP: number;
  statBlock: Record<string, number>;
  level: number;
  tier: EnemyTier;
  weapon?: EnemyWeapon | null;
  armor?: EnemyArmor | null;
  class?: string;
  subclass?: string;
  casterLevel?: number;
  spellbook?: Spellbook;
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

/** How a weapon is wielded. This alone fixes the ability behind its damage.
 * A melee weapon uses STR. A finesse or ranged weapon uses DEX. */
export type WeaponHandling = 'melee' | 'finesse' | 'ranged';

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
  /** Weapons and bows: how the weapon is wielded, fixing whether STR or DEX
   * modifies its damage. Absent reads as melee. */
  handling?: WeaponHandling;
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
  /** Flat armor-class bonus granted while equipped, for example a helmet or
   * ring. Ignored on body armor, which uses baseAC, and on shields, which
   * always add +2. */
  acBonus?: number;
  /** Ability-score buffs granted while equipped, for example { STR: 2 }. */
  statBonuses?: Record<string, number>;
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
 * Character satisfies this type directly. An Encounter and an NPC reach it
 * through `Caster.toCaster`, which normalizes their scalar class pair and
 * `statBlock` into the list and `stats` shape here. Every helper that only
 * reads a caster, for example slot pools, save DC, attack bonus, spellbook,
 * or cast resolution, takes this type instead of Character. This way a
 * foe's or an NPC's cast needs no cast to a type it is not. The scalar
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
 * (STR through CHA). Skills hold skill ids (see data/skills.js). Weapons
 * split into categories and named weapons. Armor holds the armor
 * categories. Tools and languages are free strings. The app assembles this
 * from class, race, and background, and the player can edit it by hand
 * afterward. */
export interface Proficiencies {
  saves: string[];
  skills: string[];
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
  | { classId: string; classLevel: number; order: number; type: 'feat'; feat: string };

/** Recorded ASI choices, keyed by the slot they claim (see LevelUp.slotKey).
 * A slot holds at most one choice. The key makes this structural, instead
 * of a rule every writer must enforce. `order` carries the sequence that
 * the array this record replaced got for free, so undo can still find the
 * most recent choice. */
export type AsiChoices = Record<string, AsiChoice>;

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
  /** Skill ids rolled with double proficiency. Always a subset of
   * `proficiencies.skills`. Absent on older saves. */
  expertise?: string[];
  /** Ability-score-improvement choices already made, one per claimed class ASI
   * level (see LevelUp.js). Absent on older saves, which load as none made. */
  asiChoices?: AsiChoices;
  level: number;
  xp: number;
  stats: Record<string, number>;
  resources: ResourcePool[];
  inventory: InventoryItem[];
  /** Active status conditions (empty on older saves). */
  conditions: Condition[];
  /** The spell this character holds open, or null when it holds none.
   * Absent on older saves, which load as holding nothing. */
  concentration?: ConcentrationState | null;
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
