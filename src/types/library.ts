import type {
  ItemType,
  WeaponHandling,
  WeaponKind,
  WeaponCategory,
  WeaponProperty,
  WeaponRange,
  DamagePart,
  ArmorWeight,
} from './entities.js';
import type { CreatureTemplate } from './creature.js';
import type { Spell } from './spell.js';

/** A reusable item blueprint: an InventoryItem minus identity and stack
 * fields. The built-in 5e preset lists and the GM's custom entries share
 * this shape, so the same template can seed an inventory item, an enemy's
 * weapon, or an armor choice. */
export interface EquipmentTemplate {
  name: string;
  type: ItemType;
  description?: string;
  /** @deprecated Replaced by `kind` and `properties`. Read only by the
   * library coercer, for files written before the weapon overhaul. */
  handling?: WeaponHandling;
  kind?: WeaponKind;
  category?: WeaponCategory;
  properties?: WeaponProperty[];
  range?: WeaponRange;
  versatileDamage?: DamagePart[];
  damage?: DamagePart[];
  statusEffects?: string[];
  armorWeight?: ArmorWeight;
  baseAC?: number;
  acBonus?: number;
  statBonuses?: Record<string, number>;
  spellFocus?: boolean;
}

/**
 * The GM's custom library: overrides of built-in entries, matched by name
 * and, for equipment, also by item type, plus wholly new entries. This
 * library lives outside any campaign save, and round-trips through a
 * portable JSON file.
 */
export interface CustomLibrary {
  equipment: EquipmentTemplate[];
  creatures: CreatureTemplate[];
  spells: Spell[];
}

/** Where a merged library entry comes from: a built-in default, a custom
 * entry that replaces a default of the same key, or a wholly new custom
 * entry. */
export type LibrarySource = 'default' | 'override' | 'custom';
