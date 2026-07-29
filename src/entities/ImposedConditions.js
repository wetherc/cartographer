/**
 * Conditions a spell put on a target: which cast owns one, and when the cast
 * ending takes it back off. Pure — every function takes a condition list and
 * hands back a new one.
 *
 * The counterpart to `entities/Concentration.js`, which models the caster's side
 * of the same effect. A chip written by a cast carries a `source` naming the
 * spell and the caster; a chip the GM added by hand carries none and nothing
 * here touches it.
 */

/** @typedef {import('../types/entities.js').Condition} Condition */
/** @typedef {import('../types/entities.js').ConditionSource} ConditionSource */

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
