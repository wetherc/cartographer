import { getInvocations, getPactBoon } from './Invocations.js';
import { abilityModifier } from './Modifiers.js';

/**
 * The pact weapon of a Pact of the Blade warlock, and the two invocations
 * that read it. The character keeps the inventory id of the weapon in
 * `pactWeapon`. Thirsting Blade gives a second swing for each Attack action,
 * and Lifedrinker adds necrotic damage equal to the CHA modifier (minimum 1)
 * to each hit with the pact weapon. Every function here is pure.
 */

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').DamagePart} DamagePart */

/**
 * Whether an inventory item is a weapon: a melee weapon or a bow.
 * @param {import('../types/entities.js').InventoryItem} item
 * @returns {boolean}
 */
function isWeaponItem(item) {
  return item.type === 'weapon' || item.type === 'bow';
}

/**
 * The inventory item that is the character's pact weapon, or null. A mark on
 * an item that left the inventory, or on an item that is no weapon, reads as
 * none, and so does a mark on a character without Pact of the Blade.
 * @param {Partial<Character>} character
 * @returns {import('../types/entities.js').InventoryItem | null}
 */
export function pactWeapon(character) {
  const id = character.pactWeapon;
  if (!id || getPactBoon(/** @type {Character} */ (character)) !== 'blade') return null;
  const item = (character.inventory ?? []).find((i) => i.id === id);
  return item && isWeaponItem(item) ? item : null;
}

/**
 * Whether a weapon is the character's pact weapon.
 * @param {Partial<Character>} character
 * @param {object} weapon an inventory item, or a creature's weapon, which has no id
 * @returns {boolean}
 */
export function isPactWeapon(character, weapon) {
  const item = pactWeapon(character);
  return !!item && 'id' in weapon && item.id === weapon.id;
}

/**
 * The character with the pact weapon set to one inventory item, or cleared
 * when `itemId` is null or names no carried weapon.
 * @template {Partial<Character>} T
 * @param {T} character
 * @param {string | null} itemId
 * @returns {T}
 */
export function setPactWeapon(character, itemId) {
  const { pactWeapon: _old, ...rest } = character;
  const item = (character.inventory ?? []).find((i) => i.id === itemId);
  return /** @type {T} */ (item && isWeaponItem(item) ? { ...rest, pactWeapon: item.id } : rest);
}

/**
 * Whether the character has an invocation with the given effect kind.
 * @param {Partial<Character>} character
 * @param {'pactAttack' | 'pactDamage'} kind
 */
function invoked(character, kind) {
  if (!('invocations' in character)) return null;
  return (
    getInvocations(/** @type {Character} */ (character)).find((i) => i.effect?.kind === kind) ??
    null
  );
}

/**
 * How many swings one Attack action buys through Thirsting Blade: 2 for a
 * warlock with the invocation and a pact weapon, else 1. The invocation
 * covers only swings with the pact weapon, so with a `weapon` given the
 * count is 2 only when that weapon is the pact weapon. Without a weapon the
 * count is the best case, which the combat screen shows as the swings left.
 * Extra Attack features do not stack in 5e, so `Features.attacksPerAction`
 * takes the higher of this and the class count.
 * @param {Partial<Character>} character
 * @param {object} [weapon] the weapon of the swing
 * @returns {number}
 */
export function pactAttacks(character, weapon) {
  if (!invoked(character, 'pactAttack') || !pactWeapon(character)) return 1;
  return !weapon || isPactWeapon(character, weapon) ? 2 : 1;
}

/**
 * The flat damage term that Lifedrinker adds to a hit with the pact weapon,
 * with the invocation's name for the log, or null for any other hit.
 * @param {Partial<Character>} character
 * @param {object} weapon
 * @param {Record<string, number>} stats the attacker's effective scores
 * @returns {{ name: string, part: DamagePart } | null}
 */
export function pactDamage(character, weapon, stats) {
  const inv = invoked(character, 'pactDamage');
  if (!inv || inv.effect?.kind !== 'pactDamage' || !isPactWeapon(character, weapon)) return null;
  const bonus = Math.max(1, abilityModifier(stats.CHA ?? 10));
  return {
    name: inv.name,
    part: { count: 0, sides: 1, damageType: inv.effect.damageType, bonus },
  };
}
