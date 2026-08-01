import type {
  ItemType,
  WeaponHandling,
  DamagePart,
  ArmorWeight,
  EncounterTemplate,
} from './entities.js';
import type { Spellbook } from './entities.js';
import type { Disposition } from './npc.js';
import type { Spell } from './spell.js';

/** A reusable item blueprint: an InventoryItem minus identity and stack
 * fields. The built-in 5e preset lists and the GM's custom entries share
 * this shape, so the same template can seed an inventory item, an enemy's
 * weapon, or an armor choice. */
export interface EquipmentTemplate {
  name: string;
  type: ItemType;
  description?: string;
  handling?: WeaponHandling;
  damage?: DamagePart[];
  statusEffects?: string[];
  armorWeight?: ArmorWeight;
  baseAC?: number;
  acBonus?: number;
  statBonuses?: Record<string, number>;
}

/** A reusable NPC blueprint: an NPC minus identity, placement, and met
 * state. Caster fields keep a spellcasting NPC. The app rebuilds slot pools
 * from class and casterLevel when the NPC is created, so the template
 * stores none. */
export interface NPCTemplate {
  name: string;
  role: string;
  disposition: Disposition;
  notes: string;
  stats: Record<string, number>;
  class?: string;
  casterLevel?: number;
  spellbook?: Spellbook;
}

/**
 * The GM's custom library: overrides of built-in entries, matched by name
 * and, for equipment, also by item type, plus wholly new entries. This
 * library lives outside any campaign save, and round-trips through a
 * portable JSON file.
 */
export interface CustomLibrary {
  equipment: EquipmentTemplate[];
  bestiary: EncounterTemplate[];
  npcs: NPCTemplate[];
  spells: Spell[];
}

/** Where a merged library entry comes from: a built-in default, a custom
 * entry that replaces a default of the same key, or a wholly new custom
 * entry. */
export type LibrarySource = 'default' | 'override' | 'custom';
