/**
 * The 5e bonus action spell rule. A caster who casts a spell with a bonus
 * action on their own turn can cast only a cantrip with a casting time of one
 * action for the rest of that turn. The rule reads two turn flags that
 * `ActionBudget` keeps: `bonusSpell` (a bonus action spell was cast) and
 * `actionSpell` (a spell of 1st level or higher was cast with the action).
 * The caller runs the check only on the caster's own turn, so a reaction
 * spell on another combatant's turn (Shield, Counterspell) is never blocked.
 */

/** @typedef {import('../types/combat.js').ActionBudget} ActionBudget */
/** @typedef {import('../types/combat.js').ActionCost} ActionCost */
/** @typedef {import('../types/combat.js').TurnFlag} TurnFlag */

/**
 * The reason the rule blocks a cast this turn, or null when it allows it.
 * @param {ActionBudget} used the caster's budget this turn
 * @param {number} level the spell's level, 0 for a cantrip
 * @param {ActionCost | null} cost what the cast takes off the turn
 * @returns {string | null}
 */
export function spellRuleBlock(used, level, cost) {
  if (cost === 'bonus' && used.actionSpell) {
    return 'a spell of 1st level or higher already took the action this turn';
  }
  if (used.bonusSpell && (cost === 'reaction' || (cost === 'action' && level > 0))) {
    return 'after a bonus action spell, only a cantrip with a casting time of one action';
  }
  return null;
}

/**
 * The turn flag a cast sets, or null when it sets none. An action cantrip
 * sets no flag, so a bonus action spell can still follow it.
 * @param {number} level
 * @param {ActionCost | null} cost
 * @returns {TurnFlag | null}
 */
export function spellRuleFlag(level, cost) {
  if (cost === 'bonus') return 'bonusSpell';
  if (cost === 'action' && level > 0) return 'actionSpell';
  return null;
}
