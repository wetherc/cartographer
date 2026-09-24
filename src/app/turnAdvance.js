import { advanceTurn, currentParticipant } from '../combat/Initiative.js';
import { isDowned, skipsTurn } from '../combat/CombatView.js';
import { findCombatant, retryImposedSaves } from './combatants.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/combat.js').CombatState} CombatState */

/**
 * Move the turn pointer to the next combatant who can act, and roll the
 * repeated saves of every turn that ends on the way. A spell such as Hold
 * Person lets its target retry the save at the end of each of its turns.
 * The turn now ending rolls first. A combatant that the pointer steps past
 * because a chip leaves it unable to act (Paralyzed, Stunned) still has a
 * turn that ends, so its retry rolls as the pointer passes it. Without that,
 * a paralyzed target never ends a turn, and it stays held for the whole
 * duration. A success ends the chip at the end of that turn, so the
 * combatant still loses the turn it was held for. A downed or missing
 * combatant has no turn, and it rolls nothing.
 * @param {AppContext} app
 * @param {CombatState} combat
 * @returns {ReturnType<typeof advanceTurn>}
 */
export function advancePastHeld(app, combat) {
  const acting = currentParticipant(combat);
  if (acting) retryImposedSaves(app, acting.id);
  return advanceTurn(combat, (p) => {
    const found = findCombatant(app, p.id);
    if (!skipsTurn(found)) return false;
    if (found && !isDowned(found)) retryImposedSaves(app, p.id);
    return true;
  });
}
