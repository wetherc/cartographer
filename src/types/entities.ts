export interface Encounter {
  id: string;
  name: string;
  maxHP: number;
  currentHP: number;
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
  level: number;
  xp: number;
  stats: Record<string, number>;
  resources: ResourcePool[];
  inventory: InventoryItem[];
}
