/**
 * The vocabulary of a damage roll: the die sizes, the 5e damage types, the
 * healing type, and the validator and text form of one damage term. Weapons,
 * spells, and creature attacks share these lists.
 */

import { clampInt } from '../util/num.js';
import { formatModifier } from './Modifiers.js';

/** @typedef {import('../types/entities.js').DamagePart} DamagePart */

/** Die sizes a damage term may roll, smallest to largest. */
export const DIE_SIZES = [4, 6, 8, 10, 12];

/** The 5e damage types, physical first. */
export const DAMAGE_TYPES = [
  'slashing',
  'piercing',
  'bludgeoning',
  'acid',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'poison',
  'psychic',
  'radiant',
  'thunder',
];

/** Restorative dice are not damage. Healing is its own one-entry vocabulary
 * instead of a fourteenth damage type. A weapon must not deal healing damage. */
export const HEALING_TYPE = 'healing';
export const HEALING_TYPES = [HEALING_TYPE];

/**
 * Coerce an unknown value into one well-formed damage term, with at least one
 * die, a die size, and a type drawn from `allowed`. This function lives here
 * because the type lists live here, so a change to either needs only one
 * validator update. A caller that normalizes restorative dice passes
 * `HEALING_TYPES`. This keeps a heal effect from being repaired into a
 * slashing effect. This function is pure.
 * @param {unknown} part
 * @param {string[]} [allowed] the damage types this term can carry
 * @returns {DamagePart}
 */
export function normalizeDamagePart(part, allowed = DAMAGE_TYPES) {
  const raw = /** @type {Record<string, unknown>} */ (part ?? {});
  const bonus = Math.trunc(Number(raw.bonus)) || 0;
  // A term with a flat bonus can roll no dice. This is how a fixed amount is
  // written. A term without a bonus always rolls at least one die, so a
  // garbled count still reads as 1 instead of as nothing.
  const floor = bonus === 0 ? 1 : 0;
  return {
    count: clampInt(raw.count, floor, Infinity, floor),
    sides: DIE_SIZES.includes(Number(raw.sides)) ? Number(raw.sides) : DIE_SIZES[0],
    damageType: /** @type {string} */ (
      allowed.includes(/** @type {string} */ (raw.damageType)) ? raw.damageType : allowed[0]
    ),
    ...(bonus === 0 ? {} : { bonus }),
  };
}

/**
 * Whether a damage term contributes anything: it either rolls dice or carries
 * a flat bonus. `rollDamage` makes the same check on its own instead of
 * importing this function, because the dice layer imports nothing.
 * @param {import('../types/entities.js').DamagePart} part
 * @returns {boolean}
 */
function damagePartRolls(part) {
  return part.count > 0 || (part.bonus ?? 0) !== 0;
}

/**
 * A damage roll's dice terms as text, for example "2d6 slashing + 1d4 fire".
 * A term's flat bonus rides its dice, for example "1d4+1 force". A term with
 * no dice prints the bonus alone, for example "+1 healing".
 * @param {import('../types/entities.js').DamagePart[]} parts
 * @returns {string}
 */
export function formatDamage(parts) {
  return parts
    .filter(damagePartRolls)
    .map((p) => {
      const bonus = p.bonus ?? 0;
      const sign = bonus === 0 ? '' : formatModifier(bonus);
      const dice = p.count > 0 ? `${p.count}d${p.sides}` : '';
      return `${dice}${sign} ${p.damageType}`.trim();
    })
    .join(' + ');
}
