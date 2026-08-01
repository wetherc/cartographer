/**
 * An inventory interaction that the panel reports for travelogue logging.
 * The verb carries the user's intent. A before-and-after inventory diff
 * cannot recover this intent: using the last item in a stack and discarding
 * a stack of one item produce the same state change. A give event carries
 * the recipient's name in `target`.
 * @typedef {{ verb: 'pickup' | 'use' | 'discard' | 'give', itemName: string, count: number,
 *   target?: string }} InventoryEvent
 */

/**
 * Format an inventory event as a sentence for the travelogue. If the caller
 * supplies the location and time, a pickup event records where and when the
 * item was found. Use, discard, and give events stay short.
 * @param {string} name owning character's display name
 * @param {InventoryEvent} event
 * @param {{ region?: string, time?: string }} [context]
 * @returns {string}
 */
export function formatInventoryEvent(name, { verb, itemName, count, target }, context = {}) {
  if (verb === 'pickup') {
    const where = context.region ? ` in ${context.region}` : '';
    const when = context.time ? ` (${context.time})` : '';
    return `${name} picks up ${itemName} x${count}${where}${when}.`;
  }
  if (verb === 'use')
    return count === 1 ? `${name} uses a ${itemName}.` : `${name} uses ${count} ${itemName}.`;
  if (verb === 'give') return `${name} gives ${itemName} x${count} to ${target}.`;
  return `${name} discards ${itemName} x${count}.`;
}
