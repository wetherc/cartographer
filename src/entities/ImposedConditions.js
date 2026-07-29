/**
 * Conditions a spell put on a target: which cast owns one, when the cast ending
 * takes it back off, and the repeated save a target gets against the ones that
 * allow it. Pure — every function takes a condition list and hands back a new
 * one, and the d20 for a repeated save comes from the injected RNG.
 *
 * The counterpart to `entities/Concentration.js`, which models the caster's side
 * of the same effect. A chip written by a cast carries a `source` naming the
 * spell and the caster; a chip the GM added by hand carries none and nothing
 * here touches it.
 */

import { resolveSave } from './Checks.js';

/** @typedef {import('../types/entities.js').Condition} Condition */
/** @typedef {import('../types/entities.js').ConditionSource} ConditionSource */
/** @typedef {import('../types/dice.js').RandomFn} RandomFn */

/**
 * Whether this condition was imposed by that caster's cast of that spell. Both
 * halves have to match: a caster holding two spells drops one at a time, and two
 * casters may have landed the same spell on the same target.
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
 * Take off every condition one cast imposed — what a caster dropping the spell,
 * losing it to damage, or running its duration out does to the creatures it was
 * holding. Reports the chips removed so the caller can say what each target is
 * free of, and returns the original list unchanged (identity preserved) when none
 * matched, so a caller can skip the write.
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
 * The bonus a repeated save rolls with by default: the one the cast recorded,
 * which for a foe is the number the GM typed at cast time.
 * @param {ConditionSource} source
 * @returns {number}
 */
function recordedBonus(source) {
  return source.saveBonus ?? 0;
}

/**
 * Roll the repeated saves a creature is owed at the end of its turn: one per
 * condition whose source says the save ends it, against the DC that cast rolled
 * against. A success takes the chip off; a failure leaves it for the next turn.
 * Conditions without a source, or whose source does not allow a retry, are left
 * alone.
 *
 * `bonusOf` decides what the creature adds. It defaults to the bonus the cast
 * recorded, which is all there is for a foe whose saves the app cannot read; a
 * caller holding a party character should pass one that derives the character's
 * live bonus instead, so a save granted or a stat raised since the cast counts.
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
    const save = resolveSave(bonusOf(source), source.saveDC ?? 10, { rng });
    results.push({ condition, save, ended: save.success });
    return !save.success;
  });
  // Identity preserved unless a save actually ended something, so a caller can
  // skip the write when every retry failed.
  const ended = results.some((r) => r.ended);
  return { conditions: ended ? conditions : list, results };
}
