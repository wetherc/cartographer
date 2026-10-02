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
    deathSave: false,
    bonusSpell: false,
    actionSpell: false,
    extra: false,
    surged: false,
    spare: false,
    legendary: 0,
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
  return {
    action: used.action === true,
    bonus: used.bonus === true,
    reaction: used.reaction === true,
    attacksLeft: countOf(used.attacksLeft),
    attacked: used.attacked === true,
    sneak: used.sneak === true,
    deathSave: used.deathSave === true,
    bonusSpell: used.bonusSpell === true,
    actionSpell: used.actionSpell === true,
    extra: used.extra === true,
    surged: used.surged === true,
    spare: used.surged === true && used.spare === true,
    legendary: countOf(used.legendary),
  };
}

/**
 * A whole count of 0 or more. Anything else reads as 0.
 * @param {unknown} value
 * @returns {number}
 */
function countOf(value) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
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
  return { ...participant, used: settle({ ...used, [cost]: true }) };
}

/**
 * Give one cost back, for the GM who marked it spent by mistake or who
 * rules that the turn still has it. Giving back the action also drops the
 * swings it banked and the mark that it went to an attack, because the
 * next Attack action banks its swings again. A cost that is not spent
 * returns the participant unchanged.
 * @param {Participant} participant
 * @param {ActionCost} cost
 * @returns {Participant}
 */
export function unspend(participant, cost) {
  const used = budgetOf(participant.used);
  if (!used[cost]) return participant;
  const next = { ...used, [cost]: false };
  if (cost === 'action') Object.assign(next, { attacksLeft: 0, attacked: false });
  // A bonus action given back takes its spell with it, so the rule no longer
  // limits the rest of the turn.
  if (cost === 'bonus') next.bonusSpell = false;
  return { ...participant, used: next };
}

/**
 * Spend one weapon swing. The first swing of a turn costs the action and banks
 * the rest of the attacks the combatant's Extra Attack grants. Each later
 * swing draws on that bank and costs nothing. Only a weapon that buys two or
 * more swings per action draws on the bank. Thirsting Blade grants its second
 * swing to the pact weapon alone, so a warlock who banks a swing with the
 * pact weapon cannot spend it on a dagger. With the action and the bank
 * both spent, a combatant with an extra action (Haste) spends that for one
 * more swing, and nothing banks behind it. A swing past all of these spends
 * another Attack action; the app's write path refuses before that, so only a
 * direct caller of this function reaches it.
 *
 * Every swing marks `attacked`, which is what tells the Attack action apart
 * from an action spent on a cast. Two-weapon fighting reads that mark.
 * @param {Participant} participant
 * @param {number} [attacksPerAction] how many swings one Attack action buys
 * @param {boolean} [extraAction] whether the combatant has an extra action
 * @returns {Participant}
 */
export function spendAttack(participant, attacksPerAction = 1, extraAction = false) {
  const used = budgetOf(participant.used);
  if (used.attacksLeft > 0 && attacksPerAction >= 2) {
    return { ...participant, used: { ...used, attacksLeft: used.attacksLeft - 1, attacked: true } };
  }
  if (used.action && extraAction && !used.extra) {
    return { ...participant, used: { ...used, extra: true, attacked: true } };
  }
  const banked = Math.max(0, Math.floor(attacksPerAction) - 1);
  return {
    ...participant,
    used: settle({ ...used, action: true, attacksLeft: banked, attacked: true }),
  };
}

/**
 * How many swings the combatant can still take without a fresh Attack action,
 * counting the ones the action itself buys and the one of an unspent extra
 * action. The bank counts only for a weapon that buys two or more swings.
 * @param {Participant} participant
 * @param {number} [attacksPerAction]
 * @param {boolean} [extraAction] whether the combatant has an extra action
 * @returns {number}
 */
export function attacksAvailable(participant, attacksPerAction = 1, extraAction = false) {
  const used = budgetOf(participant.used);
  const extra = extraAction && !used.extra ? 1 : 0;
  if (used.attacksLeft > 0) return (attacksPerAction >= 2 ? used.attacksLeft : 0) + extra;
  return (used.action ? 0 : Math.max(1, Math.floor(attacksPerAction))) + extra;
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
    !used.sneak &&
    !used.extra &&
    !used.surged &&
    !used.spare &&
    used.legendary === 0
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

/**
 * Spend the spare action of Action Surge in place of the turn's action. A
 * budget that marks the action spent while a spare waits gets the action
 * back free and loses the spare, and the swings that the Attack action
 * banked stay banked. Any other budget returns unchanged.
 * @param {ActionBudget} used
 * @returns {ActionBudget}
 */
function settle(used) {
  return used.action && used.spare ? { ...used, action: false, spare: false } : used;
}

/**
 * Whether Action Surge can give the turn another action. 5e allows one
 * surge per turn, before or after the first action.
 * @param {Participant} participant
 * @returns {boolean}
 */
export function canSurge(participant) {
  return !budgetOf(participant.used).surged;
}

/**
 * Take Action Surge, which gives the turn one more full action. With the
 * action spent, the action comes back free. With the action free, a spare
 * action waits behind it, and the first spend of the action uses the spare
 * instead (see `settle`). Either way the turn has two actions in all.
 * Swings still banked from the first Attack action stay banked, and an
 * Attack action taken with the new action banks its own Extra Attack
 * swings. A turn that already surged returns the participant unchanged.
 * @param {Participant} participant
 * @returns {Participant}
 */
export function surge(participant) {
  if (!canSurge(participant)) return participant;
  const used = budgetOf(participant.used);
  const next = used.action ? { action: false } : { spare: true };
  return { ...participant, used: { ...used, ...next, surged: true } };
}

/**
 * The budget of a surprised combatant. Before its first turn it has only
 * the reaction spent, and on that turn the action and the bonus action are
 * spent too.
 * @param {boolean} onTurn whether the surprised turn is the one running
 * @returns {ActionBudget}
 */
export function surprisedBudget(onTurn) {
  return { ...freshBudget(), reaction: true, action: onTurn, bonus: onTurn };
}

/**
 * End the surprise of a combatant whose first turn is over, and give it
 * its reaction back. A combatant that is not surprised returns unchanged.
 * @param {Participant} participant
 * @returns {Participant}
 */
export function endSurprise(participant) {
  if (!participant.surprised) return participant;
  const { surprised: _, ...rest } = participant;
  return { ...rest, used: { ...budgetOf(participant.used), reaction: false } };
}

/**
 * How many legendary actions a creature has left before its next turn.
 * `max` is the creature's legendary actions per round. A creature with none
 * has none left.
 * @param {Participant} participant
 * @param {number | undefined} max
 * @returns {number}
 */
export function legendaryLeft(participant, max) {
  return Math.max(0, countOf(max) - budgetOf(participant.used).legendary);
}

/**
 * Spend one legendary action. 5e lets a legendary creature take these at the
 * end of the turns of other combatants, and gives them all back at the start
 * of its own turn, which `refresh` does. A creature with none left returns
 * unchanged.
 * @param {Participant} participant
 * @param {number | undefined} max the creature's legendary actions per round
 * @returns {Participant}
 */
export function spendLegendary(participant, max) {
  if (legendaryLeft(participant, max) <= 0) return participant;
  const used = budgetOf(participant.used);
  return { ...participant, used: { ...used, legendary: used.legendary + 1 } };
}
