import { slugId, updateById } from './Roster.js';
import { derive } from './Progression.js';
import { pruneEquipment } from './Equipment.js';

/**
 * The inventory writes of a character: add, hand over, edit, and remove a
 * stack. A write that can move an equipped item unequips it where needed
 * and re-derives the character. `Character.js` re-exports every function
 * here, because most callers import the character model from there. Every
 * function here is pure.
 */

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').InventoryItem} InventoryItem */

/**
 * A comparable form of a stack's fields, without its id and quantity. Keys
 * sort, and an empty value (undefined, null, '', false, or an empty list or
 * record) drops out, so an item missing a field matches one that keeps it
 * blank.
 * @param {unknown} value
 * @returns {unknown}
 */
function comparable(value) {
  if (Array.isArray(value)) return value.map(comparable);
  if (value === null || typeof value !== 'object') return value;
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const key of Object.keys(value).sort()) {
    const field = comparable(/** @type {Record<string, unknown>} */ (value)[key]);
    const empty =
      field === undefined ||
      field === null ||
      field === '' ||
      field === false ||
      (Array.isArray(field) && field.length === 0) ||
      (typeof field === 'object' && Object.keys(field).length === 0);
    if (!empty) out[key] = field;
  }
  return out;
}

/**
 * Whether two items can share one stack: every field other than the id and
 * the quantity matches. A "Dagger" renamed "Dagger +1" keeps its "dagger" id,
 * so an id match alone would turn the next plain dagger into a second
 * "Dagger +1".
 * @param {InventoryItem} a
 * @param {InventoryItem} b
 * @returns {boolean}
 */
export function sameStack(a, b) {
  const { id: _a, quantity: _qa, ...left } = a;
  const { id: _b, quantity: _qb, ...right } = b;
  return JSON.stringify(comparable(left)) === JSON.stringify(comparable(right));
}

/**
 * Add an item, merging quantity into an existing stack whose fields match
 * (see `sameStack`). An item that matches no stack gets a row of its own. Its
 * id is kept when free, and otherwise `slugId` derives a fresh one from its
 * name, so two different items never share an id.
 * @param {Character} character
 * @param {InventoryItem} item
 * @returns {Character}
 */
export function addItem(character, item) {
  const existing =
    character.inventory.find((i) => i.id === item.id && sameStack(i, item)) ??
    character.inventory.find((i) => sameStack(i, item));
  if (!existing) {
    const ids = character.inventory.map((i) => i.id);
    const id = ids.includes(item.id) ? slugId(item.name, ids) : item.id;
    return { ...character, inventory: [...character.inventory, { ...item, id }] };
  }

  return {
    ...character,
    inventory: updateById(character.inventory, existing.id, (i) => ({
      ...i,
      quantity: i.quantity + item.quantity,
    })),
  };
}

/**
 * Hand part of a stack (or all of it) from one party member to another. The
 * giver loses `quantity`, unequipping the item if the whole stack goes, and
 * the receiver gains it, merging into a stack whose fields match (see
 * `addItem`).
 * A missing item, a non-positive count, or self-transfer changes nothing.
 * This function is pure and returns both updated characters.
 * @param {Character} giver
 * @param {Character} receiver
 * @param {string} itemId
 * @param {number} quantity
 * @returns {{ giver: Character, receiver: Character }}
 */
export function transferItem(giver, receiver, itemId, quantity) {
  const item = giver.inventory.find((i) => i.id === itemId);
  const count = Math.min(Math.floor(quantity), item?.quantity ?? 0);
  if (!item || count < 1 || giver.id === receiver.id) return { giver, receiver };
  return {
    giver: removeItem(giver, itemId, count),
    receiver: addItem(receiver, { ...item, quantity: count }),
  };
}

/**
 * Replace an inventory item's fields wholesale (the GM's post-creation edit),
 * keeping its id so equipment references survive. The replacement is the
 * edited item as a whole, not a patch. A field absent from `next` is gone.
 * Any slot that no longer accepts the edited item unequips it. The result
 * re-derives, so an edited CON bonus on a worn item moves max HP. This
 * function is pure.
 * @param {Character} character
 * @param {string} itemId
 * @param {InventoryItem} next
 * @returns {Character}
 */
export function updateItem(character, itemId, next) {
  return derive(
    pruneEquipment({
      ...character,
      inventory: updateById(character.inventory, itemId, (i) => ({ ...next, id: i.id })),
    }),
  );
}

/**
 * Remove quantity from a stack, dropping it from the inventory entirely once
 * it hits 0, and unequipping it from any slot it occupied. A stack that
 * leaves also clears the pact weapon mark that names it. The result
 * re-derives, so a worn CON item that leaves takes its HP with it.
 * @param {Character} character
 * @param {string} itemId
 * @param {number} quantity
 * @returns {Character}
 */
export function removeItem(character, itemId, quantity) {
  const inventory = updateById(character.inventory, itemId, (i) => ({
    ...i,
    quantity: Math.max(0, i.quantity - quantity),
  })).filter((i) => i.quantity > 0);
  return derive(settlePactWeapon(pruneEquipment({ ...character, inventory })));
}

/**
 * The character without a pact weapon mark (see `PactWeapon.js`) that names
 * no carried item. `removeItem` calls this, so the id of a weapon that left
 * the inventory never stays in the save. The same object comes back when
 * nothing changes.
 * @template {Pick<Character, 'inventory'> & { pactWeapon?: string }} T
 * @param {T} character
 * @returns {T}
 */
export function settlePactWeapon(character) {
  const id = character.pactWeapon;
  if (!id || character.inventory.some((i) => i.id === id)) return character;
  const { pactWeapon: _old, ...rest } = character;
  return /** @type {T} */ (rest);
}
