/**
 * The attack slants that chip mods give, beside the named conditions of
 * `ConditionEffects.js`. A buff or a curse spell writes `attacks` or
 * `attacksAgainst` onto its chip (see `ChipMods.normalizeChipMods`), and an
 * attack roll reads them from both sides. A chip with `once` ends after the
 * first attack roll it applies to, which is how Guiding Bolt and Vicious
 * Mockery end. Every function here is pure.
 */

import { creatureTypeOf } from './CreatureType.js';

/** @typedef {import('../types/creature.js').CreatureType} CreatureType */

/** @typedef {import('./Riders.js').RiderSource} RiderSource */
/** @typedef {'advantage' | 'disadvantage'} Slant */

/**
 * Whether a chip's `attacksAgainst` applies to an attacker of this type. A
 * chip with no type list applies to every attacker. An attacker with no type
 * matches no list, so Protection from Evil and Good gives nothing against it.
 * @param {RiderSource} chip
 * @param {string | undefined | null} rollerType
 * @returns {boolean}
 */
function appliesTo(chip, rollerType) {
  const types = chip.mods?.attackerTypes;
  if (!types) return true;
  return typeof rollerType === 'string' && types.includes(rollerType.trim().toLowerCase());
}

/**
 * The slants the chip mods on both sides give one attack roll: `attacks` on
 * the roller's chips, and `attacksAgainst` on the target's chips.
 * @param {{
 *   roller?: RiderSource[] | null,
 *   target?: RiderSource[] | null,
 *   rollerType?: string | null,
 * }} query
 * @returns {{ condition: RiderSource, slant: Slant, from: 'roller' | 'target' }[]}
 */
export function chipSlants({ roller, target, rollerType }) {
  /** @type {{ condition: RiderSource, slant: Slant, from: 'roller' | 'target' }[]} */
  const found = [];
  for (const condition of roller ?? []) {
    const slant = condition?.mods?.attacks;
    if (slant) found.push({ condition, slant, from: 'roller' });
  }
  for (const condition of target ?? []) {
    const slant = condition?.mods?.attacksAgainst;
    if (slant && appliesTo(condition, rollerType)) found.push({ condition, slant, from: 'target' });
  }
  return found;
}

/**
 * The names of the one-shot chips that an attack roll uses up on each side.
 * A chip counts even when the GM picked the mode by hand, because the spell
 * ends on the roll and not on the slant.
 * @param {Parameters<typeof chipSlants>[0]} query
 * @returns {{ roller: string[], target: string[] }}
 */
export function spentOnce(query) {
  const spent = { roller: /** @type {string[]} */ ([]), target: /** @type {string[]} */ ([]) };
  for (const { condition, from } of chipSlants(query)) {
    if (condition.mods?.once) spent[from].push(condition.name);
  }
  return spent;
}

/**
 * The chip list with the named one-shot chips removed. A chip of the same
 * name without `once` stays. The same list comes back when nothing is spent.
 * @template {RiderSource} T
 * @param {T[]} conditions
 * @param {string[]} names
 * @returns {T[]}
 */
export function dropOnce(conditions, names) {
  if (names.length === 0) return conditions;
  const kept = conditions.filter((c) => !(names.includes(c.name) && c.mods?.once));
  return kept.length === conditions.length ? conditions : kept;
}

/**
 * The creature type of an attacker, for `attackerTypes`, or undefined for an
 * untyped creature. A party character counts as humanoid. The test for a
 * creature is the same `disposition` key that `Creature.isCreature` reads,
 * because importing `Creature.js` here would make an import cycle through
 * `ChipMods.js`.
 * @param {unknown} entity
 * @returns {CreatureType | undefined}
 */
export function attackerType(entity) {
  if (!entity || typeof entity !== 'object') return undefined;
  return creatureTypeOf('disposition' in entity ? 'creature' : 'character', entity);
}
