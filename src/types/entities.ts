import type { RaceSnapshot } from './race.js';

export interface EncounterLocation {
  nodeId: string;
  tileId: string;
}

/** A status/condition with an optional remaining-rounds counter (null = indefinite). */
export interface Condition {
  name: string;
  rounds: number | null;
}

/** Enemy authoring tier: mobs are rank-and-file, legends run above-normal stats for their level. */
export type EnemyTier = 'mob' | 'legend';

/** A timed adjustment to one stat, applied on top of the base stat block for
 * a set number of combat rounds. */
export interface StatModifier {
  stat: string;
  delta: number;
  rounds: number;
}

/** An enemy's weapon: enough of an InventoryItem's weapon fields to drive the
 * same attack math, without dragging in the full inventory model. */
export interface EnemyWeapon {
  name: string;
  handling: WeaponHandling;
  damage: DamagePart[];
}

/** An enemy's worn armor: a name and the flat AC it adds on top of the stat
 * block's base AC (its effective AC includes this bonus). */
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
  /** Map location the encounter is staged at; null = not location-bound (always shown). */
  location: EncounterLocation | null;
  /** Active status conditions (empty on older saves). */
  conditions: Condition[];
  /** Timed stat adjustments, ticked down each combat round (empty on older saves). */
  statMods?: StatModifier[];
  /** True once the party has walked into this encounter, so the travelogue
   * records the first meeting exactly once. Absent on older saves. */
  noticed?: boolean;
  /** The enemy's weapon; stamped with a level/tier default on creation and on
   * older saves, so every enemy can attack. An explicit null means the enemy
   * is deliberately weaponless (a non-bipedal beast, an ooze) and gets no
   * default and no attack button. */
  weapon?: EnemyWeapon | null;
  /** The enemy's armor; stamped with a level/tier default like the weapon,
   * with the same null = deliberately unarmored escape hatch. */
  armor?: EnemyArmor | null;
  /** Spellcaster class id (see Classes.js). Present (and a caster class) makes
   * this a spellcasting foe; absent = a non-caster. */
  class?: string;
  /** The chosen subclass id, if any. */
  subclass?: string;
  /** Caster level driving slot maxima and save DC; defaults to `level` when a
   * caster class is assigned without an explicit value. */
  casterLevel?: number;
  /** Learned cantrips/spells (spell ids); present only on casters. */
  spellbook?: Spellbook;
  /** Spell-slot pools (`slots-1` .. `slots-9`); present only on casters. */
  resources?: ResourcePool[];
}

/** A reusable encounter blueprint saved to the campaign's bestiary (or to the
 * campaign-independent library). Weapon/armor carry the same null semantics
 * as Encounter: null = deliberately none, absent = stamp a default. Caster
 * fields persist a spellcasting foe; slot pools are rebuilt from
 * class/casterLevel on spawn, so the template stores no resources. */
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

/** Item classification; each equipment slot accepts only compatible types.
 * 'armor' is body armor — helmets, gloves, and greaves are their own types. */
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

/** 5e armor weight class, which alone determines how DEX scales the armor's
 * AC: light adds the full DEX modifier, medium caps it at +2, heavy ignores
 * DEX entirely. */
export type ArmorWeight = 'light' | 'medium' | 'heavy';

/** How a weapon is wielded, which alone fixes the ability behind its damage:
 * melee weapons use STR; finesse and ranged weapons use DEX. */
export type WeaponHandling = 'melee' | 'finesse' | 'ranged';

/** One dice term of a weapon's damage roll, e.g. 2d6 slashing. */
export interface DamagePart {
  count: number;
  sides: number;
  damageType: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  notes: string;
  /** Optional flavor/rules text shown with the item. */
  description?: string;
  /** Absent on older saves; treated as 'gear'. */
  type?: ItemType;
  /** Weapons and bows: how the weapon is wielded, fixing whether STR or DEX
   * modifies its damage. Absent reads as melee. */
  handling?: WeaponHandling;
  /** Weapons and bows: the damage roll as dice terms — the base damage first,
   * then any permanent riders (a burning blade's + 1d4 fire). */
  damage?: DamagePart[];
  /** Weapons and bows: status effects the weapon inflicts on a hit. */
  statusEffects?: string[];
  /** Body armor only: its weight class, fixing the DEX scaling rule. */
  armorWeight?: ArmorWeight;
  /** Body armor only: the armor's base AC, replacing the unarmored 10. */
  baseAC?: number;
  /** Flat armor-class bonus granted while equipped (helmets, rings, etc.).
   * Ignored on body armor (which uses baseAC) and shields (always +2). */
  acBonus?: number;
  /** Ability-score buffs granted while equipped, e.g. { STR: 2 }. */
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

/** Inventory item id equipped in each slot; null = slot empty. */
export type Equipment = Record<EquipmentSlot, string | null>;

/** A character's spellbook: the ids of the cantrips and leveled spells it has
 * learned, and (for prepared casters) which of the known leveled spells are
 * currently prepared. Absent on non-casters and older saves. */
export interface Spellbook {
  cantrips: string[];
  known: string[];
  prepared: string[];
}

/** A character's proficiencies, one list per kind. Saves hold ability keys
 * (STR..CHA), skills hold skill ids (see data/skills.js), weapons mix the
 * category words ('simple'/'martial') with named weapons (lowercase), armor
 * holds the armor categories, tools and languages are free strings. Assembled
 * from class + race + background and hand-editable afterwards. */
export interface Proficiencies {
  saves: string[];
  skills: string[];
  weapons: string[];
  armor: string[];
  tools: string[];
  languages: string[];
}

/** One claimed ability-score-improvement level: either a +2-total ability
 * increase or a feat taken in its place. `level` is the class ASI level the
 * choice claims, so each earned level is spent exactly once. */
export type AsiChoice =
  | { level: number; type: 'asi'; increases: Record<string, number> }
  | { level: number; type: 'feat'; feat: string };

export interface Character {
  id: string;
  name: string;
  /** The race's display name. A hand-typed race carries only this; a race
   * picked from the catalog also carries `raceId` and `raceTraits`. */
  race: string;
  /** Catalog race id (see Races.js); absent = hand-typed race. */
  raceId?: string;
  /** Snapshot of the race definition's mechanical fields as applied, so a
   * custom definition deleted from the library degrades gracefully. Resolution
   * prefers the live catalog (edits propagate); this is the fallback. */
  raceTraits?: RaceSnapshot;
  /** Background id (see Backgrounds.js); absent on older saves. */
  background?: string;
  /** The character's class id (see Classes.js); absent on older saves and
   * classless characters, which cast nothing. */
  class?: string;
  /** The chosen subclass id, if any. */
  subclass?: string;
  /** Proficiency lists (see Proficiencies.js); absent on older saves, which
   * load as having none. */
  proficiencies?: Proficiencies;
  /** Skill ids rolled with double proficiency; always a subset of
   * `proficiencies.skills`. Absent on older saves. */
  expertise?: string[];
  /** Ability-score-improvement choices already made, one per claimed class ASI
   * level (see LevelUp.js). Absent on older saves, which load as none made. */
  asiChoices?: AsiChoice[];
  level: number;
  xp: number;
  stats: Record<string, number>;
  resources: ResourcePool[];
  inventory: InventoryItem[];
  /** Active status conditions (empty on older saves). */
  conditions: Condition[];
  /** Equipped items by slot (absent on older saves; all slots empty). */
  equipment?: Equipment;
  /** Temporary hit points from items/boons, absorbed before the HP pool when
   * taking damage. Tracked separately from intrinsic HP; absent reads as 0. */
  bonusHP?: number;
  /** Unarmored base AC, normally 10; effects like Mage Armor raise it.
   * Only applies while no body armor is equipped. Absent reads as 10. */
  baseAC?: number;
  /** Own map position; null (and older saves' absence) = with the party. */
  location?: EncounterLocation | null;
  /** Learned cantrips/spells (spell ids); absent on non-casters and older
   * saves. */
  spellbook?: Spellbook;
}
