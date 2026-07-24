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

/** Broad item classification — advisory only, no slot enforcement. */
export type ItemType = 'weapon' | 'armor' | 'shield' | 'bow' | 'consumable' | 'gear';

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  notes: string;
  /** Absent on older saves; treated as 'gear'. */
  type?: ItemType;
}

/** The wearable slots on a character. */
export type EquipmentSlot = 'armor' | 'mainHand' | 'offHand' | 'ranged';

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
  /** Own map position; null (and older saves' absence) = with the party. */
  location?: EncounterLocation | null;
}
