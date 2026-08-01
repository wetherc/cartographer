import { WEAPON_TYPES } from './Equipment.js';
import { clampInt } from '../util/num.js';

/**
 * This module turns the item form's raw control values into an inventory
 * item. It is split out of `ui/ItemForm.js` for the same reason as
 * `SpellDraft.js`. Which fields survive the chosen type is a rule about
 * items, not about the form. That rule decides whether a library template
 * round-trips intact.
 */

/** @typedef {import('../types/entities.js').InventoryItem} InventoryItem */
/** @typedef {import('../types/entities.js').ItemType} ItemType */
/** @typedef {import('../types/library.js').EquipmentTemplate} EquipmentTemplate */
/** @typedef {import('../types/entities.js').DamagePart} DamagePart */

/** Item types that may carry a flat AC bonus while equipped. */
export const FLAT_AC_TYPES = ['weapon', 'helmet', 'gloves', 'greaves', 'bow', 'ring'];

/** Item types that can be equipped somewhere, and so may buff a stat. */
export const EQUIPPABLE_TYPES = [
  'weapon',
  'armor',
  'helmet',
  'gloves',
  'greaves',
  'shield',
  'bow',
  'ring',
];

/**
 * The whole submitted item form. Fields that the chosen type does not use
 * are still present, because the controls that hold them still exist.
 * `assembleItem` drops them.
 * @typedef {object} ItemDraft
 * @property {string} name
 * @property {string} description
 * @property {unknown} quantity
 * @property {string} type
 * @property {string} notes carried from the original item during an edit
 * @property {string} armorWeight
 * @property {unknown} baseAC
 * @property {unknown} acBonus
 * @property {string} buffStat empty for no buff
 * @property {unknown} buffAmount
 * @property {string} handling
 * @property {DamagePart[]} damage
 * @property {string[]} statusEffects
 */

/**
 * The item that a submitted form describes, minus its id. A null return
 * rejects the submission the same way an empty name does: a stack of zero
 * or fewer is not an item.
 *
 * Each optional block is gated on the type that uses it, so switching the
 * type before submission cannot leave armor fields on a rope. The function
 * leaves out a zero AC bonus, an empty buff, and an empty status list,
 * instead of storing them as zeroes. This keeps a saved item the same shape
 * as a fresh one.
 * @param {ItemDraft} draft
 * @returns {Omit<InventoryItem, 'id'> | null}
 */
export function assembleItem(draft) {
  const quantity = Number(draft.quantity);
  if (!(quantity > 0)) return null;
  const type = /** @type {ItemType} */ (draft.type);
  const description = draft.description.trim();
  const acBonus = FLAT_AC_TYPES.includes(type) ? Math.max(0, Number(draft.acBonus) || 0) : 0;
  const buffStat = EQUIPPABLE_TYPES.includes(type) ? draft.buffStat : '';
  const buffAmount = Number(draft.buffAmount) || 0;
  return {
    name: draft.name.trim(),
    quantity,
    notes: draft.notes,
    type,
    ...(description ? { description } : {}),
    ...(type === 'armor'
      ? {
          armorWeight: /** @type {import('../types/entities.js').ArmorWeight} */ (
            draft.armorWeight
          ),
          baseAC: clampInt(draft.baseAC, 1, Infinity, 10),
        }
      : {}),
    ...(acBonus > 0 ? { acBonus } : {}),
    ...(buffStat && buffAmount !== 0 ? { statBonuses: { [buffStat]: buffAmount } } : {}),
    ...(WEAPON_TYPES.includes(type)
      ? {
          handling: /** @type {import('../types/entities.js').WeaponHandling} */ (draft.handling),
          damage: draft.damage,
          ...(draft.statusEffects.length ? { statusEffects: draft.statusEffects } : {}),
        }
      : {}),
  };
}

/**
 * One preset option's label. The parenthetical states whatever distinguishes
 * that kind of preset: its damage die for a weapon, or its AC and weight for
 * armor. Other types get nothing, because a list of rope variants reads
 * better without empty brackets.
 * @param {EquipmentTemplate} preset
 * @returns {string}
 */
export function presetLabel(preset) {
  const base = preset.damage?.[0];
  if (base) return `${preset.name} (${base.count}d${base.sides})`;
  if (preset.baseAC !== undefined) {
    return `${preset.name} (AC ${preset.baseAC}, ${preset.armorWeight ?? 'light'})`;
  }
  return preset.name;
}
