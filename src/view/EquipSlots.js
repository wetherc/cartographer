import {
  ARMOR_WEIGHTS,
  equipBlocker,
  formatDamage,
  getEquipped,
  itemEffects,
  itemType,
} from '../entities/Equipment.js';
import { hasWeaponProperty } from '../entities/Weapons.js';

/**
 * The text of the equipment slot cards and of the item picker that a slot
 * card opens. A slot card has room for one item name and one short stat
 * line, so the full effect list goes into the picker, where each option
 * wraps onto its own lines. This module is pure.
 */

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').InventoryItem} InventoryItem */
/** @typedef {(typeof import('../entities/Equipment.js').EQUIPMENT_SLOTS)[number]} EquipmentSlot */

/**
 * The items that one slot can take. An item that `equipBlocker` refuses
 * stays out, except the item that the slot already holds, so a GM can see
 * an item from an old save and unequip it. Items sort by the slot's type
 * preference, then by name. `bothHands` names the two-handed weapon in the
 * main hand when the off hand is empty, because that weapon fills it.
 * @param {Character} character
 * @param {EquipmentSlot} slot
 * @returns {{ equipped: InventoryItem | null, items: InventoryItem[], bothHands: string | null }}
 */
export function slotChoices(character, slot) {
  const equipped = getEquipped(character, slot.key) ?? null;
  /** @param {InventoryItem} item */
  const rank = (item) => {
    const at = slot.accepts.indexOf(itemType(item));
    return at === -1 ? slot.accepts.length : at;
  };
  const items = character.inventory
    .filter((i) => i.id === equipped?.id || !equipBlocker(character, slot.key, i))
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  const main = getEquipped(character, 'mainHand');
  const bothHands =
    slot.key === 'offHand' && !equipped && main && hasWeaponProperty(main, 'two-handed')
      ? main.name
      : null;
  return { equipped, items, bothHands };
}

/**
 * One short stat line for a slot card: "AC 17, heavy" for body armor, the
 * damage dice for a weapon, and the first effect for anything else. The
 * line is empty for an item with no effects.
 * @param {InventoryItem} item
 * @returns {string}
 */
export function slotStat(item) {
  const type = itemType(item);
  if (type === 'armor' && item.baseAC !== undefined) {
    const weight = ARMOR_WEIGHTS.find((w) => w.key === item.armorWeight) ?? ARMOR_WEIGHTS[0];
    return `AC ${item.baseAC}, ${weight.key}`;
  }
  const dice = item.damage?.length ? formatDamage(item.damage) : '';
  return dice || (itemEffects(item)[0] ?? '');
}

/**
 * The full detail line of a picker option: every effect of the item, then
 * the quantity when the stack has more than one.
 * @param {InventoryItem} item
 * @returns {string}
 */
export function pickerDetail(item) {
  const parts = itemEffects(item);
  if ((item.quantity ?? 1) > 1) parts.push(`${item.quantity} carried`);
  return parts.join(', ');
}
