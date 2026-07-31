import { mustGetElement } from '../ui/dom.js';
import { mountCombatScreen } from '../ui/CombatScreen.js';
import { buildCombatView } from '../combat/CombatView.js';
import { drop as dropConcentration } from '../entities/Concentration.js';
import { isGM } from '../view/ViewRole.js';
import { applyToTarget, endSpellEffects, findCombatant } from './combatants.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * The combat screen: the full-width board shown in combat mode. Owns no
 * combat state (encounterWiring holds the running fight and writes
 * `state.combat`); this module projects it through `buildCombatView`, routes
 * the screen's turn controls to the actions encounterWiring registers, and
 * keeps only the transient choice of which combatant the screen is
 * inspecting. Mounted before wireEncounters so `app.views.combatScreen`
 * exists by the time the fight's refresh paths run.
 * @param {AppContext} app
 */
export function wireCombatScreen(app) {
  const { state } = app;

  /** The ribbon-picked combatant the left column details, or null for
   * whoever's turn it is. Per tab and never persisted. */
  let inspectedId = /** @type {string | null} */ (null);

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
    onNext: () => app.actions.advanceCombatTurn(),
    onEnd: () => app.actions.endCombat(),
    getInspectedId: () => inspectedId,
    onInspect: (id) => {
      inspectedId = id;
    },
    // The one write path every hit uses; it stores, logs the transitions, and
    // refreshes this screen along with the other panels.
    onApplyHP: (id, amount, isHeal) => applyToTarget(app, id, amount, isHeal),
    getConcentration: (id) => {
      const found = findCombatant(app, id);
      return found?.kind === 'character' ? (found.entity.concentration ?? null) : null;
    },
    // The character sheet's Drop path: store the released caster, then sweep
    // the spell's chips off everyone it was affecting.
    onDropConcentration: (id) => {
      const found = findCombatant(app, id);
      if (found?.kind !== 'character') return;
      const held = found.entity.concentration;
      if (!held) return;
      found.store(dropConcentration(found.entity));
      app.actions.markDirty();
      endSpellEffects(app, id, held.spellId);
    },
  });

  app.views.combatScreen = screen;
}
