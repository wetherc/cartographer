/**
 * The attack traits of a creature's stat block. Multiattack is how many times
 * the creature swings its weapon for one Attack action. A creature has one
 * weapon, so the trait is a plain count. The combat screen banks the extra
 * swings behind the Attack action the same way Extra Attack does for a
 * character.
 *
 * Pack Tactics is a flag. The fight has no positions, so the attack dialog
 * offers the advantage as a box for the GM to tick.
 * Surprise Attack adds damage dice to a hit on a surprised target in round 1,
 * and the attack code applies it without a box.
 *
 * Every function is pure. A creature with no trait stores no key, so an older
 * save loads as a creature with one attack.
 */

import { attacksPerAction } from './Features.js';

/** The most swings one Multiattack may list. A sanity ceiling on typed
 * input: the largest SRD Multiattack by weapon count stays under it. */
export const MAX_MULTIATTACK = 6;

/**
 * Read a typed or stored Multiattack count. A count below 2 means the
 * creature has no Multiattack, and a count above the ceiling stops at it.
 * @param {unknown} value
 * @returns {number | undefined}
 */
export function coerceMultiattack(value) {
  const count = Math.floor(Number(value));
  if (!Number.isFinite(count) || count < 2) return undefined;
  return Math.min(count, MAX_MULTIATTACK);
}

/** The most legendary actions per round, or legendary resistances per day,
 * that a creature can have. */
export const MAX_LEGENDARY = 5;

/**
 * Read a legendary count: the legendary actions a creature takes each round,
 * or the legendary resistances it has each day. A count below 1 or a value
 * that is not a number reads as none, and a count above `MAX_LEGENDARY`
 * comes down to it.
 * @param {unknown} value
 * @returns {number | undefined}
 */
export function coerceLegendary(value) {
  const count = Math.floor(Number(value));
  if (!Number.isFinite(count) || count < 1) return undefined;
  return Math.min(count, MAX_LEGENDARY);
}

/**
 * Read which swing of a Multiattack rolls with disadvantage. The swing
 * counts from 1 and has to fall inside the Multiattack, so a creature with
 * no Multiattack, or a number past its last swing, reads as none.
 * @param {unknown} value
 * @param {number | undefined} multiattack the coerced Multiattack count
 * @returns {number | undefined}
 */
export function coerceWeakSwing(value, multiattack) {
  const swing = Math.floor(Number(value));
  if (!multiattack || !(swing >= 1) || swing > multiattack) return undefined;
  return swing;
}

/**
 * The attack trait fields to spread into a creature or a template. A creature
 * with no trait stores no key. Redirect Attack is a reaction to an attack rather
 * than an attack, but it sits here so that every path that copies the attack
 * traits copies it too.
 * The legendary counts sit here for the same reason.
 * @param {{ multiattack?: unknown, packTactics?: unknown, surpriseAttack?: unknown, multiattackDisadvantage?: unknown, redirectAttack?: unknown, turnResistance?: unknown, legendaryActions?: unknown, legendaryResistance?: unknown } | undefined} value
 * @returns {{ multiattack?: number, packTactics?: true, surpriseAttack?: import('../types/creature.js').SurpriseAttack, multiattackDisadvantage?: number, redirectAttack?: true, turnResistance?: true, legendaryActions?: number, legendaryResistance?: number }}
 */
export function attackTraitFields(value) {
  const multiattack = coerceMultiattack(value?.multiattack);
  const surprise = coerceSurpriseAttack(value?.surpriseAttack);
  const weak = coerceWeakSwing(value?.multiattackDisadvantage, multiattack);
  const actions = coerceLegendary(value?.legendaryActions);
  const resistance = coerceLegendary(value?.legendaryResistance);
  return {
    ...(multiattack ? { multiattack } : {}),
    ...(weak ? { multiattackDisadvantage: weak } : {}),
    ...(value?.redirectAttack === true ? { redirectAttack: /** @type {const} */ (true) } : {}),
    ...(value?.turnResistance === true ? { turnResistance: /** @type {const} */ (true) } : {}),
    ...(value?.packTactics === true ? { packTactics: /** @type {const} */ (true) } : {}),
    ...(surprise ? { surpriseAttack: surprise } : {}),
    ...(actions ? { legendaryActions: actions } : {}),
    ...(resistance ? { legendaryResistance: resistance } : {}),
  };
}

/**
 * How many swings one Attack action buys this attacker with this weapon. A
 * character reads its Extra Attack features, and a creature reads its
 * Multiattack count. The larger number wins, because the two never add up.
 * @param {any} attacker a character or a creature
 * @param {import('../types/entities.js').InventoryItem | import('../types/entities.js').EnemyWeapon} weapon
 * @returns {number}
 */
export function swingsPerAction(attacker, weapon) {
  return Math.max(attacksPerAction(attacker, weapon), coerceMultiattack(attacker.multiattack) ?? 1);
}

/** The die sizes a Surprise Attack may roll. */
export const SURPRISE_SIDES = [4, 6, 8, 10, 12];

/** The most dice one Surprise Attack may add. A sanity ceiling on input. */
const MAX_SURPRISE_DICE = 10;

/**
 * Read a Surprise Attack: the extra damage dice that a hit adds against a
 * surprised target in the first round, such as the 2d6 of a bugbear. A count
 * below 1 or an unknown die size means none.
 * @param {unknown} value
 * @returns {import('../types/creature.js').SurpriseAttack | undefined}
 */
export function coerceSurpriseAttack(value) {
  if (!value || typeof value !== 'object') return undefined;
  const raw = /** @type {Record<string, unknown>} */ (value);
  const count = Math.floor(Number(raw.count));
  const sides = Number(raw.sides);
  if (!(count >= 1) || !SURPRISE_SIDES.includes(sides)) return undefined;
  return { count: Math.min(count, MAX_SURPRISE_DICE), sides };
}

/**
 * The Surprise Attack dice a hit adds, or null when none apply. They apply in
 * round 1 of a fight to a defender whose participant is still surprised. A
 * surprised participant loses the flag once its first turn ends.
 * @param {any} attacker
 * @param {import('../types/combat.js').CombatState | null | undefined} combat
 * @param {string} defenderId
 * @returns {import('../types/creature.js').SurpriseAttack | null}
 */
export function surpriseDiceFor(attacker, combat, defenderId) {
  const dice = coerceSurpriseAttack(attacker?.surpriseAttack);
  if (!dice || !combat || combat.round !== 1) return null;
  const target = combat.order.find((p) => p.id === defenderId);
  return target?.surprised === true ? dice : null;
}
