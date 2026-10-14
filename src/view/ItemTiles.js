import { equippedIndex } from '../entities/Equipment.js';
import { slotStat } from './EquipSlots.js';

/**
 * The text of the item tiles in the Inventory tab, and which tile the detail
 * pane shows. A tile has room for the name, one short stat line, a quantity
 * badge, and an equipped mark. The full row with its actions goes in the
 * detail pane. This module is pure.
 */

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').InventoryItem} InventoryItem */

/**
 * @param {Character} character
 * @param {InventoryItem} item
 * @returns {{ name: string, stat: string, count: string, equipped: boolean }}
 */
export function tileText(character, item) {
  const equipped = [...equippedIndex(character).values()].some((i) => i.id === item.id);
  return {
    name: item.name,
    stat: slotStat(item),
    count: item.quantity > 1 ? `x${item.quantity}` : '',
    equipped,
  };
}

/**
 * The item the detail pane shows: the chosen one while it is still in the
 * list, otherwise the first item, or null for an empty list. A discard or a
 * filter change can take the chosen item out of the list.
 * @param {InventoryItem[]} items the visible items, in display order
 * @param {string | null} chosenId
 * @returns {InventoryItem | null}
 */
export function shownItem(items, chosenId) {
  return items.find((i) => i.id === chosenId) ?? items[0] ?? null;
}
