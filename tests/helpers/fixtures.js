/**
 * Builders for the entity shapes the suites assemble repeatedly. Each fills in
 * the required fields and takes the rest as an override object, so a test spells
 * out only the fields it asserts on.
 */

/**
 * An inventory item. A stack is one of its kind and carries no note unless the
 * override says otherwise.
 * @param {string} id
 * @param {string} name
 * @param {Partial<import('../../src/types/entities.js').InventoryItem>} [extra]
 * @returns {import('../../src/types/entities.js').InventoryItem}
 */
export function item(id, name, extra = {}) {
  return { id, name, quantity: 1, notes: '', ...extra };
}
