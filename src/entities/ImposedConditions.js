/**
 * Conditions that a spell put on a target: which cast owns one, when the end
 * of the cast takes it back off, and the repeated save a target gets against
 * the ones that allow it. Every function is pure. Each function takes a
 * condition list and returns a new one, and the d20 for a repeated save
 * comes from the injected random number generator.
 *
 * This module is the counterpart to `entities/Concentration.js`, which
 * models the caster's side of the same effect. A chip that a cast writes
 * carries a `source` naming the spell and the caster. A chip that the GM
 * adds by hand carries no source, and nothing here touches it.
 */

import { resolveSave } from './Checks.js';

/** @typedef {import('../types/entities.js').Condition} Condition */
/** @typedef {import('../types/entities.js').ConditionSource} ConditionSource */
/** @typedef {import('../types/dice.js').RandomFn} RandomFn */

/**
 * Whether this condition was imposed by that caster's cast of that spell.
 * Both halves must match. A caster holding two spells drops one at a time,
 * and two casters can land the same spell on the same target.
 * @param {Condition} condition
 * @param {string} casterId
 * @param {string} spellId
 * @returns {boolean}
 */
export function isImposedBy(condition, casterId, spellId) {
  const source = condition.source;
  return Boolean(source && source.casterId === casterId && source.spellId === spellId);
}

/**
 * Remove every condition that one cast imposed. This is what happens to the
 * creatures that a spell was holding when a caster drops the spell, loses it
 * to damage, or lets its duration run out. The function reports the chips
 * removed, so the caller can state what each target is free of. It returns
 * the original list unchanged (identity preserved) when no chip matched, so
 * a caller can skip the write.
 * @param {Condition[]} list
 * @param {string} casterId
 * @param {string} spellId
 * @returns {{ conditions: Condition[], removed: Condition[] }}
 */
export function removeImposed(list, casterId, spellId) {
  const removed = list.filter((c) => isImposedBy(c, casterId, spellId));
  if (removed.length === 0) return { conditions: list, removed };
  return { conditions: list.filter((c) => !isImposedBy(c, casterId, spellId)), removed };
}

/**
 * The bonus a repeated save rolls with by default: the one the cast recorded.
 * A caller that still holds the combatant passes a live bonus instead.
 * @param {ConditionSource} source
 * @returns {number}
 */
function recordedBonus(source) {
  return source.saveBonus ?? 0;
}

/**
 * Roll the repeated saves that a creature is owed at the end of its turn.
 * The function rolls one save per condition whose source says the save ends
 * it, against the DC that the cast rolled against. A success removes the
 * chip. A failure leaves it for the next turn. Conditions with no source, or
 * whose source does not allow a retry, stay unaffected.
 *
 * `bonusOf` decides what the roller adds. It defaults to the bonus the cast
 * recorded, which is all a caller holding nothing but the chips has. A caller
 * holding the combatant passes a function that derives the live bonus instead,
 * so a save granted or a stat raised since the cast counts.
 * @param {Condition[]} list
 * @param {{ bonusOf?: (source: ConditionSource) => number, rng?: RandomFn }} [opts]
 * @returns {{
 *   conditions: Condition[],
 *   results: { condition: Condition, save: import('./Checks.js').SaveResult, ended: boolean }[],
 * }}
 */
export function repeatSaves(list, { bonusOf = recordedBonus, rng = Math.random } = {}) {
  /** @type {{ condition: Condition, save: import('./Checks.js').SaveResult, ended: boolean }[]} */
  const results = [];
  const conditions = list.filter((condition) => {
    const source = condition.source;
    if (!source?.saveEnds) return true;
    // The whole list rides the retry, including the chip being retried. A
    // penalty that a spell imposes applies to the save that shakes it off.
    //
    // The list is the one this sweep started with, so a chip that an earlier
    // retry in the same sweep already removed still rides a later one. The
    // printed rules do not order the retries against each other, and reading
    // the shrinking list instead would make the outcome depend on the order
    // the chips happen to sit in. One list for the whole sweep is the choice.
    const save = resolveSave(bonusOf(source), source.saveDC ?? 10, { rng, conditions: list });
    results.push({ condition, save, ended: save.success });
    return !save.success;
  });
  // Identity preserved unless a save actually ended something, so a caller can
  // skip the write when every retry failed.
  const ended = results.some((r) => r.ended);
  return { conditions: ended ? conditions : list, results };
}
