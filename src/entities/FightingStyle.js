import { equippedIndex, equippedWeapons } from './Equipment.js';
import { hasWeaponProperty, weaponKind } from './Weapons.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').InventoryItem | import('../types/entities.js').EnemyWeapon} Weapon */

/**
 * This module reads the fighting styles a character claimed through the
 * Fighting Style feature (fighter 1, paladin 2, ranger 2) and works out their
 * numbers. The style id sits on the feature's record in `featureChoices`
 * (see `FeatureGrants.buildFeatureStamp`). The module reads that record
 * directly, so `Armor.js` can import it without an import cycle through the
 * level-up modules. A creature has no feature records and gets no style.
 * Every function here is pure.
 */

/**
 * The style ids the character claimed, in no set order. A multiclass
 * character can hold two, one from each class.
 * @param {{ featureChoices?: Character['featureChoices'] }} holder
 * @returns {string[]}
 */
export function fightingStyles(holder) {
  return Object.values(holder.featureChoices ?? {}).flatMap((choice) =>
    choice.style ? [choice.style] : [],
  );
}

/**
 * @param {{ featureChoices?: Character['featureChoices'] }} holder
 * @param {string} id
 * @returns {boolean}
 */
export function hasFightingStyle(holder, id) {
  return fightingStyles(holder).includes(id);
}

/**
 * Defense: +1 AC while the character wears body armor.
 * @param {Character} character
 * @returns {number}
 */
export function styleArmorBonus(character) {
  if (!hasFightingStyle(character, 'defense')) return 0;
  const body = equippedIndex(character).get('chest');
  return body && body.baseAC !== undefined ? 1 : 0;
}

/**
 * Archery: +2 to the attack roll of a ranged weapon. A thrown melee weapon
 * is not a ranged weapon, so it gets nothing.
 * @param {any} attacker
 * @param {Weapon} weapon
 * @returns {number}
 */
export function styleAttackBonus(attacker, weapon) {
  return hasFightingStyle(attacker, 'archery') && weaponKind(weapon) === 'ranged' ? 2 : 0;
}

/**
 * Whether the attacker holds a weapon in the hand that the swung weapon does
 * not occupy. The weapon in the ranged slot is stowed, so it does not count.
 * @param {any} attacker
 * @param {Weapon} weapon
 * @returns {boolean}
 */
function otherHandArmed(attacker, weapon) {
  if (!attacker.equipment) return false;
  const stowed = equippedIndex(attacker).get('ranged');
  const id = 'id' in weapon ? weapon.id : undefined;
  return equippedWeapons(attacker).some((item) => item !== stowed && item.id !== id);
}

/**
 * Dueling: +2 damage with a melee weapon held in one hand, with no weapon in
 * the other hand. A two-handed weapon, or a versatile weapon swung in two
 * hands, gets nothing.
 * @param {any} attacker
 * @param {Weapon} weapon
 * @param {{ melee: boolean, twoHanded: boolean }} swing
 * @returns {number}
 */
export function styleDamageBonus(attacker, weapon, swing) {
  if (!hasFightingStyle(attacker, 'dueling') || !swing.melee || swing.twoHanded) return 0;
  if (weaponKind(weapon) === 'ranged' || hasWeaponProperty(weapon, 'two-handed')) return 0;
  return otherHandArmed(attacker, weapon) ? 0 : 2;
}

/**
 * Great Weapon Fighting: the highest die face that a damage die rerolls, or
 * 0 for none. It applies to a melee weapon held in two hands: a two-handed
 * weapon, or a versatile weapon swung in two hands.
 * @param {any} attacker
 * @param {Weapon} weapon
 * @param {{ melee: boolean, twoHanded: boolean }} swing
 * @returns {number}
 */
export function styleRerollBelow(attacker, weapon, swing) {
  if (!hasFightingStyle(attacker, 'great-weapon') || !swing.melee) return 0;
  return hasWeaponProperty(weapon, 'two-handed') || swing.twoHanded ? 2 : 0;
}

/**
 * Two-Weapon Fighting: whether the off-hand attack adds the ability modifier
 * to its damage.
 * @param {any} attacker
 * @returns {boolean}
 */
export function offhandAddsModifier(attacker) {
  return hasFightingStyle(attacker, 'two-weapon');
}
