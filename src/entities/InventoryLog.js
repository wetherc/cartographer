/**
 * An inventory interaction the panel reports for travelogue logging. The verb
 * carries the user's intent (which a before/after inventory diff can't
 * recover: consuming the last of a stack and discarding a 1-stack are the
 * same state change).
 * @typedef {{ verb: 'pickup' | 'use' | 'discard', itemName: string, count: number }} InventoryEvent
 */

/**
 * Format an inventory event as a travelogue-ready sentence. Pickups record
 * where and when the item was found when the caller supplies that context;
 * uses and discards stay short.
 * @param {string} name owning character's display name
 * @param {InventoryEvent} event
 * @param {{ region?: string, time?: string }} [context]
 * @returns {string}
 */
export function formatInventoryEvent(name, { verb, itemName, count }, context = {}) {
  if (verb === 'pickup') {
    const where = context.region ? ` in ${context.region}` : '';
    const when = context.time ? ` (${context.time})` : '';
    return `${name} picks up ${itemName} x${count}${where}${when}.`;
  }
  if (verb === 'use') return count === 1 ? `${name} uses a ${itemName}.` : `${name} uses ${count} ${itemName}.`;
  return `${name} discards ${itemName} x${count}.`;
}
