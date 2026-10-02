import { isPactWeapon } from './PactWeapon.js';

/**
 * Whether a weapon counts as magical for resistance to nonmagical weapon
 * damage (Stoneskin). A weapon with `magical: true` counts, and so does the
 * pact weapon of a Pact of the Blade warlock (see `PactWeapon.isPactWeapon`).
 * A creature's weapon has no id, so only its own flag counts. This function
 * is pure.
 * @param {object | null | undefined} attacker the character or creature that swings
 * @param {{ magical?: boolean, id?: string }} weapon
 * @returns {boolean}
 */
export function weaponIsMagical(attacker, weapon) {
  if (weapon.magical === true) return true;
  return !!attacker && isPactWeapon(attacker, weapon);
}
