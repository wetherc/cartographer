/**
 * The weapon attack dialog's per-swing options that depend on the weapon and
 * on what the attacker holds. The dialog shows an option only when the rule
 * allows it for this swing, so a GM cannot tick a choice that 5e forbids.
 */

import { getEquipped } from '../entities/Equipment.js';
import { hasWeaponProperty, weaponKind } from '../entities/Weapons.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').InventoryItem | import('../types/entities.js').EnemyWeapon} Weapon */

/**
 * Whether Sneak Attack can add its dice to a swing of this weapon. The 5e rule
 * needs a finesse or a ranged weapon, so a greataxe cannot carry it.
 * @param {Weapon} weapon
 * @returns {boolean}
 */
export function allowsSneakAttack(weapon) {
  return weaponKind(weapon) === 'ranged' || hasWeaponProperty(weapon, 'finesse');
}

/**
 * Whether the attacker has a hand free to grip this weapon with two hands.
 * Both hand slots must be empty or hold the weapon itself, so a shield or a
 * second weapon in the other hand rules out the versatile grip. A creature
 * has no equipment slots, and its stat block decides how it holds a weapon,
 * so it always passes: with no `equipment` field, both hands read as empty.
 * @param {object} attacker
 * @param {Weapon} weapon
 * @returns {boolean}
 */
export function hasFreeHandFor(attacker, weapon) {
  const character = /** @type {Character} */ (attacker);
  return /** @type {const} */ (['mainHand', 'offHand']).every((slot) => {
    const held = getEquipped(character, slot);
    return held === null || held.id === /** @type {{ id?: string }} */ (weapon).id;
  });
}
