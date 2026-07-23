export interface EncounterLocation {
  nodeId: string;
  tileId: string;
}

/** A status/condition with an optional remaining-rounds counter (null = indefinite). */
export interface Condition {
  name: string;
  rounds: number | null;
}

export interface Encounter {
  id: string;
  name: string;
  maxHP: number;
  currentHP: number;
  statBlock: Record<string, number>;
  /** Map location the encounter is staged at; null = not location-bound (always shown). */
  location: EncounterLocation | null;
  /** Active status conditions (empty on older saves). */
  conditions: Condition[];
}

/** A reusable encounter blueprint saved to the campaign's bestiary. */
export interface EncounterTemplate {
  id: string;
  name: string;
  maxHP: number;
  statBlock: Record<string, number>;
}

export type ResourceType = 'item-count' | 'mana' | 'custom';

export interface ResourcePool {
  id: string;
  name: string;
  type: ResourceType;
  current: number;
  max: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  notes: string;
}

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
}
