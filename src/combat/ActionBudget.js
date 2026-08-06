/**
 * Pure per-turn action budget for one combatant. 5e gives a turn one action,
 * one bonus action, and a movement allowance, plus one reaction between turns.
 * This module tracks the three that this app can enforce today. Movement stays
 * out, because nothing moves a token by feet yet.
 *
 * The budget records what is already spent, not what is left, so an absent
 * field reads as a fresh turn. `attacksLeft` is the exception: it counts the
 * attacks still owed by an Attack action that the combatant already spent, so
 * Extra Attack costs one action for two swings.
 *
 * Every function returns a new value instead of mutating, and returns the
 * value it received when nothing changes, so the identity caches elsewhere in
 * the app stay warm.
 */

/** @typedef {import('../types/combat.js').ActionBudget} ActionBudget */
/** @typedef {import('../types/combat.js').ActionCost} ActionCost */
/** @typedef {import('../types/combat.js').TurnFlag} TurnFlag */
/** @typedef {import('../types/combat.js').Participant} Participant */

/** The costs a combatant can spend, in the order the action bar shows them. */
export const ACTION_COSTS = /** @type {ActionCost[]} */ (['action', 'bonus', 'reaction']);

/** Labels for the action bar and the log. */
export const COST_LABELS = { action: 'Action', bonus: 'Bonus action', reaction: 'Reaction' };

/**
 * An unspent turn.
 * @returns {ActionBudget}
 */
export function freshBudget() {
  return {
    action: false,
    bonus: false,
    reaction: false,
    attacksLeft: 0,
    attacked: false,
    sneak: false,
  };
}

/**
 * The budget of a participant, defaulted field by field. A save written before
 * the budget existed carries none, and a resumed fight then starts its next
 * turn with everything available.
 * @param {unknown} value
 * @returns {ActionBudget}
 */
export function budgetOf(value) {
  const used =
    value && typeof value === 'object' ? /** @type {Record<string, unknown>} */ (value) : {};
  const count =
    typeof used.attacksLeft === 'number' && Number.isFinite(used.attacksLeft)
      ? used.attacksLeft
      : 0;
  return {
    action: used.action === true,
    bonus: used.bonus === true,
    reaction: used.reaction === true,
    attacksLeft: Math.max(0, Math.floor(count)),
    attacked: used.attacked === true,
    sneak: used.sneak === true,
  };
}

/**
 * Whether the budget of a participant still holds the given cost. The action
 * bar disables a control this reports false for. It is a gate on the UI, not a
 * refusal: every spending path also offers the GM a way past it, because the
 * rules have more exceptions than this model carries.
 *
 * A banked Extra Attack swing is not an action and does not answer here. Ask
 * `attacksAvailable` for a weapon swing. The once-per-turn Sneak Attack flag
 * does answer here, because it is spent and refreshed the same way an action
 * is.
 * @param {Participant} participant
 * @param {ActionCost | TurnFlag} cost
 * @returns {boolean}
 */
export function canSpend(participant, cost) {
  return !budgetOf(participant.used)[cost];
}

/**
 * Mark one cost as spent. Spending a cost that is already spent returns the
 * participant unchanged, so a GM override cannot go into debt.
 * @param {Participant} participant
 * @param {ActionCost | TurnFlag} cost
 * @returns {Participant}
 */
export function spend(participant, cost) {
  const used = budgetOf(participant.used);
  if (used[cost]) return participant;
  return { ...participant, used: { ...used, [cost]: true } };
}

/**
 * Spend one weapon swing. The first swing of a turn costs the action and banks
 * the rest of the attacks the combatant's Extra Attack grants. Each later
 * swing draws on that bank and costs nothing. A swing past an empty bank
 * spends another Attack action; the app's write path refuses before that, so
 * only a direct caller of this function reaches it.
 *
 * Every swing marks `attacked`, which is what tells the Attack action apart
 * from an action spent on a cast. Two-weapon fighting reads that mark.
 * @param {Participant} participant
 * @param {number} [attacksPerAction] how many swings one Attack action buys
 * @returns {Participant}
 */
export function spendAttack(participant, attacksPerAction = 1) {
  const used = budgetOf(participant.used);
  if (used.attacksLeft > 0) {
    return { ...participant, used: { ...used, attacksLeft: used.attacksLeft - 1, attacked: true } };
  }
  const banked = Math.max(0, Math.floor(attacksPerAction) - 1);
  return {
    ...participant,
    used: { ...used, action: true, attacksLeft: banked, attacked: true },
  };
}

/**
 * How many swings the combatant can still take without a fresh Attack action,
 * counting the one the action itself buys.
 * @param {Participant} participant
 * @param {number} [attacksPerAction]
 * @returns {number}
 */
export function attacksAvailable(participant, attacksPerAction = 1) {
  const used = budgetOf(participant.used);
  if (used.attacksLeft > 0) return used.attacksLeft;
  return used.action ? 0 : Math.max(1, Math.floor(attacksPerAction));
}

/**
 * Whether the budget holds nothing spent. Used to keep `refresh` identity-safe.
 * @param {Participant} participant
 * @returns {boolean}
 */
export function isFresh(participant) {
  const used = budgetOf(participant.used);
  return (
    !used.action &&
    !used.bonus &&
    !used.reaction &&
    used.attacksLeft === 0 &&
    !used.attacked &&
    !used.sneak
  );
}

/**
 * Give a participant a whole turn back. The reaction resets here too: 5e
 * refreshes a reaction at the start of its owner's turn, not at the top of the
 * round, so a combatant late in the order cannot spend the same reaction
 * twice before acting.
 * @param {Participant} participant
 * @returns {Participant}
 */
export function refresh(participant) {
  if (isFresh(participant)) return participant;
  return { ...participant, used: freshBudget() };
}

/**
 * Give a participant its Sneak Attack back. The 5e limit is once per turn, and
 * a turn is anyone's turn: a rogue that spent the dice on its own swing can
 * spend them again on an opportunity attack during somebody else's turn. Every
 * turn boundary therefore resets the flag for the whole order, not just for
 * the combatant whose turn begins. Identity survives an unspent flag, so the
 * reset costs nothing on the rows it does not touch.
 * @param {Participant} participant
 * @returns {Participant}
 */
export function resetSneak(participant) {
  const used = budgetOf(participant.used);
  if (!used.sneak) return participant;
  return { ...participant, used: { ...used, sneak: false } };
}
