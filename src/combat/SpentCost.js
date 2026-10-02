/**
 * Which buttons of the combat action bar need a part of the turn that is
 * already spent. The bar dims such a button and names the reason in its
 * tooltip and accessible name. The button stays live, because the dialog
 * behind it is where the GM waives the refusal (for example "Ignore action
 * cost").
 */

import { COST_LABELS } from './ActionBudget.js';
import { castingCost, parseCastingTime } from '../entities/SpellTiming.js';

/** @typedef {import('../types/combat.js').ActionBudget} ActionBudget */
/** @typedef {import('../types/combat.js').ActionCost} ActionCost */

/**
 * The note for a button that spends `cost`, or null when that cost is free
 * or the button spends nothing.
 * @param {ActionBudget} used
 * @param {ActionCost | null | undefined} cost
 * @returns {string | null}
 */
export function costNote(used, cost) {
  return cost && used[cost] ? `${COST_LABELS[cost]} spent` : null;
}

/**
 * The note for a weapon button, or null while a swing is left. The swing
 * count already includes Extra Attack and the extra action of Haste.
 * @param {number} attacksLeft
 * @returns {string | null}
 */
export function attackNote(attacksLeft) {
  return attacksLeft > 0 ? null : 'No attack left this turn';
}

/**
 * The note for a spell button, from the part of the turn that its casting
 * time spends. A casting time longer than a turn spends nothing here. A spell
 * whose repeat the caster keeps open (`held`) costs what its repeat costs,
 * the same cost that the cast path charges. Mordenkainen's Sword is cast with
 * an action and repeats with a bonus action.
 * @param {ActionBudget} used
 * @param {{ castingTime?: unknown, repeat?: { cost?: ActionCost } }} spell
 * @param {boolean} [held] whether the caster keeps a repeat of the spell open
 * @returns {string | null}
 */
export function spellNote(used, spell, held = false) {
  const repeatCost = held ? spell.repeat?.cost : undefined;
  if (repeatCost) return costNote(used, repeatCost);
  if (!spell.castingTime) return null;
  return costNote(used, castingCost(parseCastingTime(spell.castingTime)));
}
