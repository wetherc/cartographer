/**
 * Two-weapon fighting: which weapons a second hand can swing, when the swing is
 * available, and what the second hand does to damage.
 *
 * The 5e rule reads: attack with a light melee weapon in one hand, then spend
 * the bonus action to attack with a different light melee weapon in the other
 * hand, and add no ability modifier to the damage of that second attack. This
 * module states the three parts of that rule that a caller can ask about. It
 * reads a participant's budget and a weapon list, and nothing else.
 *
 * The list of hands is not modeled. A character with two light melee weapons
 * equipped can offer either of them as the off-hand swing, and the GM picks. The
 * app has no notion of which hand holds which weapon beyond the equipment slot,
 * and the slot is already the main hand or the off hand for reasons of its own.
 */

import { hasWeaponProperty, weaponKind } from '../entities/Weapons.js';
import { budgetOf, canSpend } from './ActionBudget.js';

/** @typedef {import('../types/combat.js').Participant} Participant */
/** @typedef {import('../types/entities.js').InventoryItem} InventoryItem */
/** @typedef {import('../types/entities.js').EnemyWeapon} EnemyWeapon */
/** @typedef {InventoryItem | EnemyWeapon} Weapon */

/**
 * Whether one weapon can take part in two-weapon fighting: a melee weapon with
 * the light property. A thrown melee weapon still counts, because the rule cares
 * about the weapon, not about how this swing is delivered.
 * @param {Weapon} weapon
 * @returns {boolean}
 */
export function isLightMelee(weapon) {
  return weaponKind(weapon) === 'melee' && hasWeaponProperty(weapon, 'light');
}

/**
 * The weapons a second hand can swing. It takes two light melee weapons to
 * fight with two of them, so a single dagger offers nothing.
 * @param {Weapon[]} weapons
 * @returns {Weapon[]}
 */
export function offhandWeapons(weapons) {
  const light = weapons.filter(isLightMelee);
  return light.length >= 2 ? light : [];
}

/**
 * Whether the off-hand swing is available this turn: the combatant holds two
 * light melee weapons, already took the Attack action, and still holds the
 * bonus action. The `attacked` mark is the test, not the `action` flag alone:
 * an action spent on a cast is not the Attack action, and the rule wants the
 * attack.
 * @param {Participant} participant
 * @param {Weapon[]} weapons
 * @returns {boolean}
 */
export function canOffhand(participant, weapons) {
  if (offhandWeapons(weapons).length === 0) return false;
  return budgetOf(participant.used).attacked && canSpend(participant, 'bonus');
}

/**
 * The ability modifier that off-hand damage carries. The rule takes the bonus
 * away, and a penalty is not a bonus: a weak character still swings weakly with
 * the second hand.
 * @param {number} abilityMod
 * @returns {number}
 */
export function offhandDamageModifier(abilityMod) {
  return Math.min(abilityMod, 0);
}
