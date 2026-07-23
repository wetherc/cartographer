/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').InventoryItem} InventoryItem */
/** @typedef {import('../types/entities.js').ItemType} ItemType */
/** @typedef {import('../types/entities.js').Equipment} Equipment */
/** @typedef {import('../types/entities.js').EquipmentSlot} EquipmentSlot */

/**
 * The wearable slots on a character, in display order. Item types are
 * advisory: any inventory item may be equipped in any slot (the party is
 * trusted not to equip boots as a hat), but each slot suggests the types it
 * was made for so pickers can lead with the sensible candidates.
 * @type {{ key: EquipmentSlot, label: string, suggests: ItemType[] }[]}
 */
export const EQUIPMENT_SLOTS = [
  { key: 'armor', label: 'Armor', suggests: ['armor'] },
  { key: 'mainHand', label: 'Main hand', suggests: ['weapon'] },
  { key: 'offHand', label: 'Off hand', suggests: ['shield', 'weapon'] },
  { key: 'ranged', label: 'Ranged', suggests: ['bow'] },
];

/** The broad item classifications, in the add-form's display order.
 * @type {ItemType[]} */
export const ITEM_TYPES = ['gear', 'weapon', 'armor', 'shield', 'bow', 'consumable'];

/** @returns {Equipment} every slot empty */
export function emptyEquipment() {
  return { armor: null, mainHand: null, offHand: null, ranged: null };
}

/**
 * An item's classification, defaulting the absent field on older saves.
 * @param {InventoryItem} item
 * @returns {ItemType}
 */
export function itemType(item) {
  return item.type ?? 'gear';
}

/**
 * Equip an inventory item (by id) into a slot, or clear the slot with null.
 * No type enforcement — see EQUIPMENT_SLOTS. Pure.
 * @param {Character} character
 * @param {EquipmentSlot} slot
 * @param {string | null} itemId
 * @returns {Character}
 */
export function equip(character, slot, itemId) {
  return { ...character, equipment: { ...emptyEquipment(), ...character.equipment, [slot]: itemId } };
}

/**
 * The inventory item equipped in a slot, or null when the slot is empty or
 * the referenced stack has left the inventory.
 * @param {Character} character
 * @param {EquipmentSlot} slot
 * @returns {InventoryItem | null}
 */
export function getEquipped(character, slot) {
  const id = character.equipment?.[slot] ?? null;
  return id === null ? null : character.inventory.find((i) => i.id === id) ?? null;
}

/**
 * Clear any slot referencing an item no longer in the inventory, so removing
 * the last of a stack also unequips it. Returns the character unchanged when
 * nothing dangles. Pure.
 * @param {Character} character
 * @returns {Character}
 */
export function pruneEquipment(character) {
  const equipment = character.equipment;
  if (!equipment) return character;
  const ids = new Set(character.inventory.map((i) => i.id));
  const entries = Object.entries(equipment);
  if (entries.every(([, id]) => id === null || ids.has(id))) return character;
  return {
    ...character,
    equipment: /** @type {Equipment} */ (
      Object.fromEntries(entries.map(([slot, id]) => [slot, id !== null && ids.has(id) ? id : null]))
    ),
  };
}
