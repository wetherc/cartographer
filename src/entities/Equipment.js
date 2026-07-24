import { abilityModifier } from './Modifiers.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').InventoryItem} InventoryItem */
/** @typedef {import('../types/entities.js').ItemType} ItemType */
/** @typedef {import('../types/entities.js').Equipment} Equipment */
/** @typedef {import('../types/entities.js').EquipmentSlot} EquipmentSlot */

/**
 * The wearable slots on a character, in display order. Each slot accepts only
 * the item types listed — a potion can't be worn as armor — and armor is worn
 * piecewise: helmet, chest, gloves, and greaves are separate slots.
 * @type {{ key: EquipmentSlot, label: string, accepts: ItemType[] }[]}
 */
export const EQUIPMENT_SLOTS = [
  { key: 'helmet', label: 'Helmet', accepts: ['helmet'] },
  { key: 'chest', label: 'Chest', accepts: ['armor'] },
  { key: 'gloves', label: 'Gloves', accepts: ['gloves'] },
  { key: 'greaves', label: 'Greaves', accepts: ['greaves'] },
  { key: 'mainHand', label: 'Main hand', accepts: ['weapon'] },
  { key: 'offHand', label: 'Off hand', accepts: ['shield', 'weapon'] },
  { key: 'ranged', label: 'Ranged', accepts: ['bow'] },
];

/** The item classifications, in the add-form's display order. 'armor' is
 * chest armor; consumables and gear can't be equipped anywhere.
 * @type {ItemType[]} */
export const ITEM_TYPES = ['gear', 'weapon', 'armor', 'helmet', 'gloves', 'greaves', 'shield', 'bow', 'consumable'];

/** @returns {Equipment} every slot empty */
export function emptyEquipment() {
  return {
    helmet: null,
    chest: null,
    gloves: null,
    greaves: null,
    mainHand: null,
    offHand: null,
    ranged: null,
  };
}

/**
 * Normalize an equipment record from any era: the pre-piecewise 'armor' slot
 * carries over into 'chest' (unless chest is already set), unknown keys drop,
 * and missing slots fill in empty. Pure.
 * @param {Record<string, string | null> | undefined} equipment
 * @returns {Equipment}
 */
export function migrateEquipment(equipment) {
  const empty = emptyEquipment();
  if (!equipment) return empty;
  /** @type {Equipment} */
  const next = { ...empty };
  for (const key of Object.keys(empty)) {
    const value = equipment[key];
    if (value !== undefined) next[/** @type {EquipmentSlot} */ (key)] = value;
  }
  if (next.chest === null && typeof equipment.armor === 'string') next.chest = equipment.armor;
  return next;
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
 * Whether a slot accepts an item's type — the rule the pickers filter by and
 * `equip` enforces.
 * @param {EquipmentSlot} slot
 * @param {InventoryItem} item
 * @returns {boolean}
 */
export function slotAccepts(slot, item) {
  const spec = EQUIPMENT_SLOTS.find((s) => s.key === slot);
  return spec !== undefined && spec.accepts.includes(itemType(item));
}

/**
 * Equip an inventory item (by id) into a slot, or clear the slot with null.
 * Equipping an item the slot doesn't accept (or one not in the inventory) is
 * a no-op, so a potion can never end up worn as armor. Pure.
 * @param {Character} character
 * @param {EquipmentSlot} slot
 * @param {string | null} itemId
 * @returns {Character}
 */
export function equip(character, slot, itemId) {
  if (itemId !== null) {
    const item = character.inventory.find((i) => i.id === itemId);
    if (!item || !slotAccepts(slot, item)) return character;
  }
  return { ...character, equipment: { ...migrateEquipment(character.equipment), [slot]: itemId } };
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
 * A character's armor class: the unarmored 10 + DEX modifier baseline plus
 * the AC bonus of every equipped item that grants one (armor pieces, shields).
 * @param {Character} character
 * @returns {number}
 */
export function armorClass(character) {
  const base = 10 + abilityModifier(character.stats.DEX ?? 10);
  return EQUIPMENT_SLOTS.reduce(
    (ac, slot) => ac + (getEquipped(character, slot.key)?.acBonus ?? 0),
    base,
  );
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
