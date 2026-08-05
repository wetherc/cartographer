import { WEAPON_TYPES } from './Equipment.js';
import { DEFAULT_RANGES, clampWeaponRange } from './Weapons.js';
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

/** Item types that may carry a flat AC bonus while equipped. A shield is one
 * of them: its bonus is an ordinary `acBonus`, defaulting to the 5e +2 when
 * the item stores none. Body armor is not, because its AC comes from
 * `baseAC` and its weight class instead. */
export const FLAT_AC_TYPES = ['weapon', 'helmet', 'gloves', 'greaves', 'shield', 'bow', 'ring'];

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
 * @property {unknown} strength 0 for no requirement
 * @property {boolean} stealthDisadvantage
 * @property {unknown} acBonus
 * @property {string} buffStat empty for no buff
 * @property {unknown} buffAmount
 * @property {string} kind
 * @property {string} category empty for a natural weapon
 * @property {string[]} properties
 * @property {unknown} rangeNormal
 * @property {unknown} rangeLong
 * @property {DamagePart[]} versatileDamage
 * @property {DamagePart[]} damage
 * @property {string[]} statusEffects
 * @property {boolean} spellFocus
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
  const strength = Math.max(0, Math.floor(Number(draft.strength)) || 0);
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
          // Neither trait is written when it is off, so quiet armor with no
          // requirement stays the shape it was before these fields existed.
          ...(strength > 0 ? { strength } : {}),
          ...(draft.stealthDisadvantage ? { stealthDisadvantage: true } : {}),
        }
      : {}),
    ...(acBonus > 0 ? { acBonus } : {}),
    // No type gate. A quarterstaff is an arcane focus and an amulet is a
    // holy symbol, so any item can be one.
    ...(draft.spellFocus ? { spellFocus: true } : {}),
    ...(buffStat && buffAmount !== 0 ? { statBonuses: { [buffStat]: buffAmount } } : {}),
    ...(WEAPON_TYPES.includes(type) ? weaponFields(draft) : {}),
  };
}

/**
 * The weapon fields of a draft, in the same present-only style as the rest
 * of the item. The kind is always written. The range survives only on a
 * ranged or thrown weapon, and it clamps through the shared
 * `clampWeaponRange`, so a blank field reads as the default for the kind and
 * the long range never reads shorter than the normal range. The versatile
 * damage survives only with the versatile flag.
 * @param {ItemDraft} draft
 * @returns {Partial<InventoryItem>}
 */
function weaponFields(draft) {
  const kind = draft.kind === 'ranged' ? 'ranged' : 'melee';
  const category =
    draft.category === 'simple' || draft.category === 'martial' ? draft.category : undefined;
  const properties = /** @type {import('../types/entities.js').WeaponProperty[]} */ (
    draft.properties
  );
  const ranged = kind === 'ranged' || properties.includes('thrown');
  const range = clampWeaponRange(
    { normal: draft.rangeNormal, long: draft.rangeLong },
    DEFAULT_RANGES[kind],
  );
  const versatile = properties.includes('versatile') ? draft.versatileDamage : [];
  return {
    kind,
    ...(category ? { category } : {}),
    ...(properties.length ? { properties } : {}),
    ...(ranged ? { range } : {}),
    ...(versatile.length ? { versatileDamage: versatile } : {}),
    damage: draft.damage,
    ...(draft.statusEffects.length ? { statusEffects: draft.statusEffects } : {}),
  };
}

/**
 * One preset option's label. The parenthetical states whatever distinguishes
 * that kind of preset: its damage die for a weapon, its AC and weight for
 * armor, or its flat bonus for a shield or another worn piece. Other types
 * get nothing, because a list of rope variants reads better without empty
 * brackets.
 * @param {EquipmentTemplate} preset
 * @returns {string}
 */
export function presetLabel(preset) {
  const base = preset.damage?.[0];
  if (base) return `${preset.name} (${base.count}d${base.sides})`;
  if (preset.baseAC !== undefined) {
    return `${preset.name} (AC ${preset.baseAC}, ${preset.armorWeight ?? 'light'})`;
  }
  if (preset.acBonus !== undefined) return `${preset.name} (+${preset.acBonus} AC)`;
  return preset.name;
}
