import {
  currentParticipant,
  delayTurn,
  retreatTurn,
  setParticipantInitiative,
} from '../combat/Initiative.js';
import { skipsTurn } from '../combat/CombatView.js';
import { describeCombatant, findCombatant } from './combatants.js';
import { startTurnEffects } from './turnEffects.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/combat.js').CombatState} CombatState */

/**
 * Register the GM's corrections to a running order: Previous turn, a new
 * initiative value for one combatant, and Delay. encounterWiring calls this
 * and passes its `setCombat`, so it stays the only writer of `state.combat`.
 *
 * Previous turn moves only the pointer. The turn effects that ran on the way
 * forward, such as a repeated save or a round tick, stay as they are, and
 * the header Undo is the way to take those back. Delay starts the turn of
 * the combatant it passes to, the same way Next turn does.
 * @param {AppContext} app
 * @param {{ setCombat: (next: CombatState) => void }} hooks
 */
export function wireTurnOrder(app, { setCombat }) {
  const { state } = app;
  const nameOf = (/** @type {import('../types/combat.js').Participant} */ p) =>
    describeCombatant(app, p.id)?.name ?? '';
  /** @param {string} id */
  const labelOf = (id) =>
    findCombatant(app, id)?.label ?? describeCombatant(app, id)?.name ?? 'Unknown combatant';
  // The Initiative card refresh also refreshes the combat screen.
  const refresh = () => app.views.initiativePanel.update();

  app.actions.retreatCombatTurn = () => {
    const combat = state.combat;
    if (!combat) return;
    const next = retreatTurn(combat, (p) => skipsTurn(findCombatant(app, p.id)));
    if (next === combat) return;
    setCombat(next);
    const holder = currentParticipant(next);
    if (holder) {
      app.actions.logEvent('combat', `The GM goes back to ${labelOf(holder.id)}'s turn.`);
    }
    refresh();
  };

  app.actions.setCombatInitiative = (id, initiative) => {
    const combat = state.combat;
    if (!combat || !Number.isFinite(initiative)) return;
    const next = setParticipantInitiative(combat, id, Math.round(initiative), nameOf);
    if (next === combat) return;
    setCombat(next);
    app.actions.logEvent('combat', `${labelOf(id)}'s initiative is now ${Math.round(initiative)}.`);
    refresh();
  };

  app.actions.delayCombatTurn = () => {
    const combat = state.combat;
    if (!combat) return;
    const delayed = currentParticipant(combat);
    const next = delayTurn(combat);
    if (next === combat || !delayed) return;
    setCombat(next);
    const holder = currentParticipant(next);
    app.actions.logEvent('combat', `${labelOf(delayed.id)} delays the turn.`);
    if (holder) startTurnEffects(app, holder.id);
    refresh();
  };
}
