import { mustGetElement } from '../ui/dom.js';
import { mountCombatScreen } from '../ui/CombatScreen.js';
import { buildCombatView } from '../combat/CombatView.js';
import { isGM } from '../view/ViewRole.js';
import { findCombatant } from './combatants.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * The combat screen: the full-width board shown in combat mode. Owns no
 * combat state (encounterWiring holds the running fight and writes
 * `state.combat`); this module only projects it through `buildCombatView`
 * and renders. Mounted before wireEncounters so `app.views.combatScreen` exists
 * by the time the fight's refresh paths run.
 * @param {AppContext} app
 */
export function wireCombatScreen(app) {
  const { state } = app;

  const screen = mountCombatScreen(mustGetElement('combat-screen'), {
    getView: () => {
      if (!state.combat) return null;
      return buildCombatView(state.combat, (id) => findCombatant(app, id), {
        gm: isGM(state.role),
        // Registered by partyWiring, which mounts later, so a reload with a
        // fight running draws its first frame before the binding reader
        // exists; that frame treats the tab as unbound, and the next refresh
        // corrects it. Same allowance InitiativePanel's canAttack makes.
        boundCharacterId: app.actions.getBoundCharacterId?.() ?? null,
      });
    },
    isGM: () => isGM(state.role),
  });

  app.views.combatScreen = screen;
}
