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
}

/** A reusable encounter blueprint saved to the campaign's bestiary. */
export interface EncounterTemplate {
  id: string;
  name: string;
  maxHP: number;
  statBlock: Record<string, number>;
  level: number;
  tier: EnemyTier;
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

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  notes: string;
  /** Absent on older saves; treated as 'gear'. */
  type?: ItemType;
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

/** The wearable slots on a character. Older saves' 'armor' slot reads as 'chest'. */
export type EquipmentSlot =
  | 'helmet'
  | 'chest'
  | 'gloves'
  | 'greaves'
  | 'mainHand'
  | 'offHand'
  | 'ranged'
  | 'accessory';

/** Inventory item id equipped in each slot; null = slot empty. */
export type Equipment = Record<EquipmentSlot, string | null>;

export interface Character {
  id: string;
  name: string;
  race: string;
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
}
