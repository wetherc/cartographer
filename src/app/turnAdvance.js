import { advanceTurn, currentParticipant } from '../combat/Initiative.js';
import { skipsTurn } from '../combat/CombatView.js';
import { findCombatant } from './combatants.js';
import { endTurnEffects, startTurnEffects } from './turnEffects.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/combat.js').CombatState} CombatState */
/** @typedef {import('../types/dice.js').RandomFn} RandomFn */

/**
 * Move the turn pointer to the next combatant who can act, and run the turn
 * boundaries on the way (see `turnEffects.js`).
 *
 * The turn now ending runs its end-of-turn work first. That work can deal
 * damage, and damage can end a spell whose summons then leave the order, so
 * the pointer moves from the order as it stands afterward, never from a copy
 * taken before. The new order is stored first. When the round wraps, the
 * skipped combatants that sit below the old pointer take their turns in the
 * round that is ending, then the round ticks, and then the skipped
 * combatants at the top of the order take theirs in the new round.
 *
 * A combatant that the pointer steps past because a chip leaves it unable to
 * act (Paralyzed, Stunned) still has a turn that starts and ends. Its retry
 * rolls then, which is how a Hold Person target gets out: a success ends the
 * chip at the end of that turn, so the combatant still loses the turn it was
 * held for. A stable, dead, defeated, or missing combatant rolls nothing, and
 * only the chips keyed to its turns count the boundary. A dying character is
 * not skipped: the pointer lands on it, so it rolls its death save. The
 * combatant the pointer lands on then starts its turn.
 * @param {AppContext} app
 * @param {{
 *   setCombat: (next: CombatState) => void,
 *   tickRound: () => void,
 *   rng?: RandomFn,
 * }} hooks `setCombat` stores the moved order, and `tickRound` runs the
 *   round-wrap ticks
 * @returns {ReturnType<typeof advanceTurn> | null} null when no fight is running
 */
export function advancePastHeld(app, { setCombat, tickRound, rng = Math.random }) {
  const acting = app.state.combat ? currentParticipant(app.state.combat) : null;
  if (acting) endTurnEffects(app, acting.id, { rng });
  const combat = app.state.combat;
  if (!combat) return null;
  /** @type {string[]} */
  const skipped = [];
  const result = advanceTurn(combat, (p) => {
    if (!skipsTurn(findCombatant(app, p.id))) return false;
    skipped.push(p.id);
    return true;
  });
  setCombat(result.state);
  // A skipped combatant below the old pointer sits before the wrap, so its
  // turn belongs to the round that is ending and runs before the tick.
  const from = combat.index;
  const position = (/** @type {string} */ id) => combat.order.findIndex((p) => p.id === id);
  const early = result.wrapped ? skipped.filter((id) => position(id) > from) : [];
  const skipTurn = (/** @type {string} */ id) => {
    startTurnEffects(app, id);
    endTurnEffects(app, id, { rng });
  };
  early.forEach(skipTurn);
  if (result.wrapped) tickRound();
  skipped.filter((id) => !early.includes(id)).forEach(skipTurn);
  const landing = app.state.combat ? currentParticipant(app.state.combat) : null;
  if (landing && !skipped.includes(landing.id)) startTurnEffects(app, landing.id);
  return result;
}
