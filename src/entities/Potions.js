import { isDead } from './DeathSaves.js';

/** @typedef {import('../types/entities.js').HealDice} HealDice */
/** @typedef {import('../types/entities.js').InventoryItem} InventoryItem */
/** @typedef {import('../types/dice.js').DiceSelection} DiceSelection */

/**
 * The heal dice of a consumable item, or null. Any other item returns null,
 * and "Use one" then only takes it off the stack.
 * @param {Pick<InventoryItem, 'type' | 'heals'>} item
 * @returns {HealDice | null}
 */
export function potionHeals(item) {
  return item.type === 'consumable' ? (item.heals ?? null) : null;
}

/**
 * The dice tray selection that rolls a potion's heal.
 * @param {HealDice} heals
 * @returns {DiceSelection}
 */
export function potionSelection(heals) {
  return { counts: { [`d${heals.sides}`]: heals.count }, modifier: heals.bonus };
}

/**
 * The reason a potion cannot go to a character, or null when it can. A
 * potion does not raise the dead, so a dead drinker keeps the potion.
 * @param {import('../types/entities.js').Character} recipient
 * @returns {string | null}
 */
export function potionBlocked(recipient) {
  return isDead(recipient) ? `${recipient.name} is dead. A potion does not help.` : null;
}
