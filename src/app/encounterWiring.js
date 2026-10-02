import { mustGetElement } from '../ui/dom.js';
import { mountInitiativePanel } from '../ui/InitiativePanel.js';
import { combatSetupModal } from '../ui/CombatSetup.js';
import { addParticipant, startCombat, dropParticipant } from '../combat/Initiative.js';
import {
  attacksAvailable,
  canSpend,
  legendaryLeft,
  spend,
  spendAttack,
  spendLegendary,
  surge,
  unspend,
} from '../combat/ActionBudget.js';
import { rollInitiative } from '../combat/InitiativeRoll.js';
import { parleyLine, passivePerceptionOf, rollStealth } from '../combat/Stealth.js';
import {
  combatRoster,
  fightInReach,
  initiativeLine,
  nearbyFoes,
  nearbyRadius,
} from '../combat/CombatRoster.js';
import { passRound } from '../entities/TimedEffects.js';
import { addLethargy } from './lethargy.js';
import { combatLabels, describeCombatant, findCombatant, logName } from './combatants.js';
import { applyConditionToTarget, endSpellEffects } from './combatantWrites.js';
import { advancePastHeld } from './turnAdvance.js';
import { dropTurnChips, endFightEffects, startTurnEffects } from './turnEffects.js';
import { focusMapCanvas } from './combatWiring.js';
import {
  applyFightXP,
  askFightXP,
  confirmFightEnd,
  fightSummary,
  standDownFoes,
} from './combatEnd.js';
import { wireEncounterPanels } from './encounterPanels.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * This module wires the running fight and the Initiative panel. It is the
 * only writer of `state.combat`. The panels that list creatures by place, and
 * the walked-into-an-encounter alert, are in encounterPanels.js, which this
 * function mounts. The authoring dialog is in creatureForm.js. The attack
 * resolution is in weaponAttack.js.
 * @param {AppContext} app
 */
export function wireEncounters(app) {
  const { state } = app;

  // The running fight lives only in `state.combat`, and this module keeps
  // no copy of it. When another tab's save is adopted, the re-hydrate writes
  // `state.combat` directly. A module-level copy then stays behind, and a
  // follower tab shows and opens an ended fight from its old sidebar card.
  const current = () => state.combat;

  // The end of a fight also ends every chip that waits on a turn boundary,
  // because no turn comes again. Left in place, a Shield cast on the last turn
  // of a fight keeps its +5 AC for good. The later-turn damage such a chip
  // still owes lands first (see `endFightEffects`).
  /** @param {import('../types/combat.js').CombatState | null} next */
  function setCombat(next) {
    const ended = next === null && state.combat !== null;
    state.combat = next;
    app.actions.markDirty();
    if (ended) endFightEffects(app);
  }

  /**
   * Remove a deleted combatant from the running order. Every delete path
   * calls this function instead of writing `state.combat` directly. This
   * keeps the write, the dirty mark, and the panel refresh together in one
   * place. A combatant left in the order resolves to nothing, so its row
   * shows buttons that do nothing.
   * @param {string} id
   */
  app.actions.removeCombatant = (id) => {
    const combat = current();
    if (!combat) return;
    const next = dropParticipant(combat, id);
    if (next === combat) return;
    const heldTurn = combat.order[combat.index]?.id === id;
    setCombat(next);
    if (next.round !== combat.round) tickRound();
    // The removed combatant has no more turns, so the chips keyed to them end
    // now. When it held the turn, the combatant the pointer lands on starts
    // its turn.
    dropTurnChips(app, id);
    const holder = state.combat?.order[state.combat.index];
    if (heldTurn && holder) startTurnEffects(app, holder.id);
    app.views.initiativePanel.update();
  };

  /**
   * Put a new combatant into the running order. A creature that a spell
   * summons mid-fight joins this way. With no fight running there is no order
   * to join, and the creature simply stands on the tile until a fight starts,
   * which stages it like any other creature there.
   * @param {import('../types/combat.js').Participant} participant
   */
  app.actions.addCombatant = (participant) => {
    const combat = current();
    if (!combat) return;
    const nameOf = (/** @type {import('../types/combat.js').Participant} */ p) =>
      describeCombatant(app, p.id)?.name ?? '';
    const next = addParticipant(combat, participant, nameOf);
    if (next === combat) return;
    setCombat(next);
    app.views.initiativePanel.update();
  };

  /**
   * Spend part of one combatant's turn. This is the only write path for the
   * action budget, so the attack and cast paths do not touch `state.combat`
   * themselves. The 'attack' cost is the weapon swing: the first swing of a
   * turn spends the Attack action and banks the extra swings that Extra
   * Attack grants, and each later swing draws on that bank. The 'sneak' cost
   * is the once-per-turn Sneak Attack flag, which costs no part of the turn but
   * is spent and refreshed like one.
   *
   * The return value says whether the spend went through. False means the
   * budget no longer holds the cost, and the caller offers the GM the way
   * past it. With no fight running there is nothing to track, so the spend
   * counts as done: a cast from the character sheet is not part of a turn.
   * @param {string} id
   * @param {import('../types/combat.js').ActionCost
   *   | import('../types/combat.js').TurnFlag | 'attack' | 'legendary'} cost
   * @param {{ attacksPerAction?: number, extraAction?: boolean, legendaryActions?: number }} [options] how
   *   many swings one Attack action buys for this combatant, and whether a
   *   chip such as Haste gives it one more, for the 'attack' cost. The
   *   'legendary' cost reads `legendaryActions`, the creature's legendary
   *   actions per round.
   * @returns {boolean}
   */
  app.actions.spendBudget = (
    id,
    cost,
    { attacksPerAction = 1, extraAction = false, legendaryActions } = {},
  ) => {
    const combat = current();
    if (!combat) return true;
    const index = combat.order.findIndex((p) => p.id === id);
    if (index < 0) return true;
    const participant = combat.order[index];
    if (cost === 'attack') {
      if (attacksAvailable(participant, attacksPerAction, extraAction) <= 0) return false;
    } else if (cost === 'legendary') {
      if (legendaryLeft(participant, legendaryActions) <= 0) return false;
    } else if (!canSpend(participant, cost)) {
      return false;
    }
    const order = [...combat.order];
    order[index] =
      cost === 'attack'
        ? spendAttack(participant, attacksPerAction, extraAction)
        : cost === 'legendary'
          ? spendLegendary(participant, legendaryActions)
          : spend(participant, cost);
    setCombat({ ...combat, order });
    // The pips on the action bar are part of the combat screen, and the
    // sidebar card shows none of this, so only the screen redraws.
    app.views.combatScreen.update();
    return true;
  };

  /**
   * The GM's override on one cost of a turn, for the pips of the action bar.
   * @param {string} id
   * @param {import('../types/combat.js').ActionCost} cost
   * @returns {boolean | null} whether the cost is spent afterward, or null
   *   when the id is not in a running fight
   */
  app.actions.toggleBudget = (id, cost) => {
    const combat = current();
    const index = combat ? combat.order.findIndex((p) => p.id === id) : -1;
    if (!combat || index < 0) return null;
    const participant = combat.order[index];
    const free = canSpend(participant, cost);
    const order = [...combat.order];
    order[index] = free ? spend(participant, cost) : unspend(participant, cost);
    setCombat({ ...combat, order });
    app.views.combatScreen.update();
    return free;
  };

  /**
   * Give one combatant one more action this turn for Action Surge.
   * @param {string} id
   * @returns {boolean} false when the turn cannot surge; true with no fight
   *   running, where there is no budget to track
   */
  app.actions.surgeBudget = (id) => {
    const combat = current();
    const index = combat ? combat.order.findIndex((p) => p.id === id) : -1;
    if (!combat || index < 0) return true;
    const next = surge(combat.order[index]);
    if (next === combat.order[index]) return false;
    const order = [...combat.order];
    order[index] = next;
    setCombat({ ...combat, order });
    app.views.combatScreen.update();
    return true;
  };

  wireEncounterPanels(app, { onStartCombat: startCombatSetup });

  /**
   * Resolve the name and side to show for a participant, from whatever
   * currently holds its id. Both panels use this function instead of
   * reading the order directly. This way a combatant renamed, or a creature
   * whose disposition changes mid-fight, shows the change on the next
   * render.
   * @param {import('../types/combat.js').Participant} participant
   */
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
    const position = app.partyTracker.getPosition();
    const roster = combatRoster(state.characters, state.creatures, position);
    const radius = nearbyRadius(app.partyTracker.revealRadius);
    const participants = await combatSetupModal(roster, {
      describe,
      // Hostiles farther out than the encounter group, within the radius of
      // the Nearby tab. The GM ticks the ones that join.
      nearby: nearbyFoes(state.creatures, position, radius),
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
      // rolls a bare d20 and has a passive Perception of 10.
      stealth: {
        rollStealth: (p) => {
          const found = findCombatant(app, p.id);
          return found ? rollStealth(found.entity, found.kind) : Math.floor(Math.random() * 20) + 1;
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
    const first = started.order[started.index];
    if (first) startTurnEffects(app, first.id);
    app.views.initiativePanel.update(); // shows the panel again
    app.views.encounterPanel.update(); // hides the Start combat button
    app.actions.setMode('combat'); // the fight runs on the full-width screen
  }

  // Leaving combat mode is tied to the fight ending, regardless of how it
  // ends: the End button, the last encounter dying, or the party walking
  // off the tile. Any other mode change is the operator's own choice, and
  // this function leaves it alone.
  function exitCombatMode() {
    if (state.mode === 'combat') app.actions.setMode('play');
  }

  // A new round elapsed. Tick down every combatant's timed conditions, the
  // enemies' timed stat modifiers, and every concentration duration.
  // A turn advance past the bottom of the order and the removal of the last
  // combatant on its own turn both start a round. Every creature ticks, so a
  // bystander's timed stat modifier counts down too. An entity with nothing
  // timed keeps its identity, and so does a collection with no change.
  function tickRound() {
    /** @type {{ casterId: string, spellId: string }[]} */
    const expired = [];
    /** @type {string[]} */
    const notes = [];
    /**
     * @template {import('../types/entities.js').Character | import('../types/creature.js').Creature} T
     * @param {T[]} list
     * @returns {T[]}
     */
    const tickAll = (list) => {
      const next = list.map((entity) => {
        const { entity: passed, ended } = passRound(entity);
        // A Haste chip that runs out on the tick leaves before its caster's
        // concentration sweep can see it, so the tick adds the lethargy.
        const ticked = passed === entity ? entity : addLethargy(app, entity, passed, notes);
        if (ended) {
          app.actions.logEvent(
            'combat',
            `${logName(app, entity)}'s concentration on ${ended.spellName} ends.`,
          );
          expired.push({ casterId: entity.id, spellId: ended.spellId });
        }
        return ticked;
      });
      return next.some((entity, i) => entity !== list[i]) ? next : list;
    };
    state.characters = tickAll(state.characters);
    state.creatures = tickAll(state.creatures);
    app.actions.refreshSelectedCharacter();
    app.views.encounterPanel.update();
    app.views.npcPanel.update();
    // The sweep runs only after both collections are reassigned. The
    // sweep writes to the same two collections. Run earlier, the tick's
    // own write restores its result.
    for (const { casterId, spellId } of expired) endSpellEffects(app, casterId, spellId);
    for (const line of notes) app.actions.logEvent('combat', line);
  }

  // Turn advance and combat end are registered as actions. This lets the
  // combat screen drive the same fight through the same code as the
  // sidebar panel. This module stays the only writer of `combat`.
  app.actions.advanceCombatTurn = () => {
    const combat = current();
    if (!combat) return;
    // A defeated combatant keeps its place in the order but not its turn.
    // The pointer steps past it to the next combatant standing. A
    // participant that resolves to nothing, because it was deleted
    // mid-fight, also has no turn to take. A chip such as Stunned takes the
    // turn the same way, without taking the combatant out of the fight.
    // Every turn boundary on the way runs its effects, such as a repeated
    // save or the damage a chip deals.
    advancePastHeld(app, { setCombat, tickRound });
    // The sidebar panel redraws itself after its own button. The combat
    // screen must be told that the turn moved, in either case.
    app.views.combatScreen.update();
  };

  app.actions.endCombat = async () => {
    const end = await confirmFightEnd(app);
    if (!end) return;
    // The XP dialog opens while the fight still runs, so its "Back to the
    // fight" button leaves the fight, the XP, and each foe as they are.
    const award = await askFightXP(end);
    // The fight can end in another tab while the dialog is open.
    if (!award || !current()) return;
    // The fight kept running while the dialog was open, and a Player tab can
    // have taken a turn. Read the summary again, so a fate lands only on a
    // foe that still stands and the XP goes only to a character still alive.
    const now = fightSummary(app) ?? end;
    const onScreen = state.mode === 'combat';
    setCombat(null);
    app.views.initiativePanel.update(); // hides the panel again
    app.views.encounterPanel.update(); // shows the Start combat button again
    exitCombatMode();
    // The End combat button leaves with the screen. Focus moves to the map,
    // which is what the GM looks at next, instead of falling to the body.
    if (onScreen) focusMapCanvas();
    if (award !== 'none') applyFightXP(app, now, award);
  };

  const initiativeContainer = mustGetElement('initiative-container');
  // The fight runs on the combat screen. The sidebar card is only the
  // status line and the link to it. Turn controls and the action strip
  // live on the screen.
  const initiativePanel = mountInitiativePanel(initiativeContainer, {
    getState: current,
    // The status line names the active combatant as the fight screen does,
    // with a number when two combatants share a name.
    describe: (participant) => {
      const view = describe(participant);
      const ids = (state.combat?.order ?? []).map((p) => p.id);
      return view && { ...view, name: combatLabels(app, ids).get(participant.id) ?? view.name };
    },
    onOpen: () => app.actions.setMode('combat'),
  });

  // Walking away from the fight, or deleting the last creature in it,
  // drops the running combat, because its participants are no longer
  // here. Killing every foe does not drop it: the screen shows the foes as
  // down and waits for the GM to press End combat. This way a last hit does
  // not take the fight away from whoever landed it, and the party can still
  // heal up or read the log before leaving. The paths that move the party
  // or delete a creature call this action directly, not the panel
  // refresh. The refresh also runs from the rehydrate loop, where a state
  // write conflicts with the save just adopted from another tab and
  // echoes a dirty write back at it.
  app.actions.syncCombatLocation = () => {
    const combat = current();
    if (!combat) return;
    // The fight goes on while a creature in its order stands in the
    // encounter group of the party, or a hostile in its order stands within
    // the radius of "Add nearby foes" (see `fightInReach`). Only walking
    // away, or deleting everyone in the fight, ends a fight this way.
    const position = app.partyTracker.getPosition();
    const radius = nearbyRadius(app.partyTracker.revealRadius);
    if (fightInReach(combat.order, state.creatures, position, radius)) return;
    app.actions.logEvent('combat', 'The fight ends. No creature in it is left near the party.');
    setCombat(null);
    exitCombatMode();
    app.views.initiativePanel.update();
  };

  // The Initiative card shows only while a fight is running. No setup or
  // idle state stays parked in the sidebar. This wrapper gives every
  // existing `initiativePanel.update()` call site, including party moves,
  // role switches, and the rehydrate loop, the visibility sync for free.
  // The combat screen shows the same fight, so it refreshes here too,
  // instead of duplicating every call site. The body class `fight-running`
  // follows the same check, so the stylesheet can hide the Encounters card
  // from a player while no fight runs.
  app.views.initiativePanel = {
    update: () => {
      initiativeContainer.hidden = current() === null;
      document.body.classList.toggle('fight-running', current() !== null);
      initiativePanel.update();
      app.views.combatScreen.update();
    },
  };
  // `main.js` reconciles a loaded fight with the party's tile once every
  // module is wired, because the reconcile logs through the travelogue.
  app.views.initiativePanel.update();
}
