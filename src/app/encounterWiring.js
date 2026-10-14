import { combatSetupModal } from '../ui/CombatSetup.js';
import { startCombat } from '../combat/Initiative.js';
import { rollInitiative } from '../combat/InitiativeRoll.js';
import { parleyLine, passivePerceptionOf, rollStealth } from '../combat/Stealth.js';
import {
  awayCharacters,
  combatRoster,
  initiativeLine,
  nearbyFoes,
  nearbyRadius,
} from '../combat/CombatRoster.js';
import { combatLabels, describeCombatant, findCombatant } from './combatants.js';
import { applyConditionToTarget } from './combatantWrites.js';
import { startLandingTurn } from './turnAdvance.js';
import { spendRollRiders } from './riderSpend.js';
import { standDownFoes } from './combatEnd.js';
import { wireEncounterPanels } from './encounterPanels.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * This module wires the start of a fight. It mounts the panels that list
 * creatures by place, the walked-into-an-encounter alert, and the Build-mode
 * right-click menu (all in encounterPanels.js), and it owns the combat setup
 * dialog that the Start combat button and the alert open. The running fight
 * is in fightState.js, and the setup writes the new fight through the hooks
 * that `wireFightState` returns. The authoring dialog is in creatureForm.js.
 * @param {AppContext} app
 * @param {import('./fightState.js').FightHooks} fight
 */
export function wireEncounters(app, { setCombat, tickRound }) {
  const { state } = app;

  /** @param {import('../types/combat.js').Participant} participant */
  const describe = (participant) => describeCombatant(app, participant.id);

  // This is the GM's entry into combat. It opens a setup dialog over the
  // map with the roster, a Roll initiative fill (a DEX check, editable by
  // hand after), and a Start control. Start changes the
  // initiative panel from hidden to the running order.
  async function startCombatSetup() {
    // This timestamp is taken when the setup opens, not when Start runs.
    // The dialog logs the "Initiative rolled" line, and it belongs to this
    // fight's log.
    const startedAt = Date.now();
    /** @type {Map<string, { spent: string[] } | null>} */
    const stealthRiders = new Map();
    const position = app.partyTracker.getPosition();
    const roster = combatRoster(state.characters, state.creatures, position);
    const away = awayCharacters(state.characters, position);
    const radius = nearbyRadius(app.partyTracker.revealRadius);
    const participants = await combatSetupModal(roster, {
      describe,
      // Hostiles farther out than the encounter group, within the radius of
      // the Nearby tab. The GM ticks the ones that join.
      nearby: nearbyFoes(state.creatures, position, radius),
      // Characters split off outside the encounter. The GM ticks the ones
      // that join.
      away,
      // Initiative is a DEX check, and it rolls as one: the chips of the
      // roller and armor the roller is not trained for slant the d20, and
      // exhaustion takes its penalty off the total. The value stays editable,
      // so the GM still overrides anything the rules got wrong.
      rollInitiative: (participant) =>
        rollInitiative(participant, findCombatant(app, participant.id)?.entity),
      // The travelogue gets one line for each press of Roll initiative, and
      // records every result. A hand-edited override before Start does not
      // log again.
      onRolled: (results) => app.actions.logEvent('roll', initiativeLine(results)),
      // The Stealth contest is optional. A row that nothing holds any more
      // rolls a bare d20 and has a passive Perception of 10. Each press records
      // the riders of the latest roll, and Start spends them, so a Guidance
      // chip adds to every press but leaves once.
      stealth: {
        rollStealth: (p) => {
          const found = findCombatant(app, p.id);
          if (!found) return Math.floor(Math.random() * 20) + 1;
          const { total, rider } = rollStealth(found.entity, found.kind);
          stealthRiders.set(p.id, rider);
          return total;
        },
        passivePerception: (p) => {
          const found = findCombatant(app, p.id);
          return found ? passivePerceptionOf(found.entity, found.kind) : 10;
        },
      },
      onStealth: (line) => app.actions.logEvent('roll', line),
      // A parley settles the encounter with no fight. The foes stay in place
      // but turn neutral, so the Encounter alert does not open again on the
      // party's next move next to them.
      onParley: () => {
        const foes = roster.filter((p) => describe(p)?.side === 'foe').map((p) => p.id);
        const names = combatLabels(app, foes);
        app.actions.logEvent('note', parleyLine(foes.map((id) => names.get(id) ?? id)));
        standDownFoes(app, new Set(foes));
      },
    });
    if (!participants) return;
    for (const [id, rider] of stealthRiders) spendRollRiders(app, id, rider);
    const started = startCombat(participants, (p) => describe(p)?.name ?? '', startedAt);
    setCombat(started);
    // A surprised combatant wears a Surprised chip that ends with its first
    // turn, the same turn its budget flag ends in Initiative.advanceTurn.
    for (const p of started.order.filter((q) => q.surprised)) {
      applyConditionToTarget(app, p.id, 'Surprised', null, undefined, null, {
        expires: { who: p.id, at: 'end', count: 1 },
      });
      app.actions.logEvent('combat', `${describe(p)?.name ?? 'Unknown combatant'} is surprised.`);
    }
    startLandingTurn(app, { setCombat, tickRound });
    app.views.initiativePanel.update(); // shows the panel again
    app.views.encounterPanel.update(); // hides the Start combat button
    app.actions.setMode('combat'); // the fight runs on the full-width screen
  }

  wireEncounterPanels(app, { onStartCombat: startCombatSetup });
}
