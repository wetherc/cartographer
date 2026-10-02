import { budgetOf, COST_LABELS } from '../combat/ActionBudget.js';
import {
  actionSurgeLine,
  hasCunningAction,
  secondWindLine,
  turnActionLine,
  turnActions,
} from '../combat/TurnActions.js';
import { spendResource } from '../entities/Character.js';
import { classLevelOf } from '../entities/Multiclass.js';
import { ACTION_SURGE_ID, CHANNEL_DIVINITY_ID, SECOND_WIND_ID } from '../entities/PoolIds.js';
import { channelActions } from '../combat/ChannelDivinity.js';
import { preserveLife, turnUndead } from './channelDivinity.js';
import { findCombatant } from './combatants.js';
import { applyConditionToTarget, applyToTarget } from './combatantWrites.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/combat.js').ActionCost} ActionCost */
/** @typedef {import('../combat/TurnActions.js').TurnAction} TurnAction */
/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/dice.js').RandomFn} RandomFn */

/**
 * The turn actions of the combat screen's action bar, and the budget pips
 * the GM can press to mark a cost spent or free. The pure list of actions
 * lives in `combat/TurnActions.js`. This module finds out which features a
 * combatant has, spends the cost through `spendBudget`, and writes the log
 * line and the Dodging chip. A class action also spends one use of its
 * pool: Second Wind heals the fighter, and Action Surge gives the turn one
 * more action through the `surgeBudget` action of encounterWiring.
 */

/**
 * The uses left in one pool of a character, or undefined without the pool.
 * @param {Character} character
 * @param {string} poolId
 * @returns {number | undefined}
 */
const usesOf = (character, poolId) => character.resources.find((r) => r.id === poolId)?.current;

/**
 * The turn actions one combatant can take. A character reads its class
 * levels for Cunning Action, and its pools for Second Wind and Action
 * Surge. A creature has the standard actions only.
 * @param {AppContext} app
 * @param {string} id
 * @returns {TurnAction[]}
 */
export function turnActionsOf(app, id) {
  const found = findCombatant(app, id);
  if (!found) return [];
  if (found.kind !== 'character') return turnActions();
  return [
    ...turnActions({
      cunningAction: hasCunningAction(found.entity),
      secondWind: usesOf(found.entity, SECOND_WIND_ID),
      actionSurge: usesOf(found.entity, ACTION_SURGE_ID),
    }),
    ...channelActions(found.entity, usesOf(found.entity, CHANNEL_DIVINITY_ID)),
  ];
}

/**
 * Take one turn action. The cost comes off the budget first, and a turn
 * that already spent it refuses with a toast. The GM can press the budget
 * chip to give the cost back and try again. Dodge also leaves a Dodging
 * chip that ends at the start of the combatant's next turn. A class action
 * with no use left in its pool refuses with a toast before it spends
 * anything.
 * @param {AppContext} app
 * @param {string} id
 * @param {TurnAction} action
 * @param {{ rng?: RandomFn }} [options]
 * @returns {boolean | Promise<boolean>} whether the action went through. A
 *   Channel Divinity option opens a dialog and answers through a promise.
 */
export function takeTurnAction(app, id, action, { rng = Math.random } = {}) {
  const found = findCombatant(app, id);
  if (!found) return false;
  const name = found.label;
  if (action.poolId) {
    if (found.kind !== 'character') return false;
    return useClassAction(app, found, action, rng);
  }
  if (action.cost && app.actions.spendBudget && !app.actions.spendBudget(id, action.cost)) {
    app.toasts.show(`${name} has no ${COST_LABELS[action.cost].toLowerCase()} left this turn.`);
    return false;
  }
  app.actions.logEvent('combat', turnActionLine(name, action));
  if (action.id === 'dodge') {
    applyConditionToTarget(app, id, 'Dodging', null, undefined, null, {
      expires: { who: id, at: 'start', count: 1 },
    });
  }
  return true;
}

/**
 * Mark one cost of a combatant's turn spent, or free it again. This is the
 * GM's manual override for a turn spent on something the app does not
 * model, or a spend made by mistake. The write goes through the
 * `toggleBudget` action of encounterWiring, the only writer of
 * `state.combat`. A combatant not in the running fight changes nothing.
 * @param {AppContext} app
 * @param {string} id
 * @param {ActionCost} cost
 */
export function toggleBudget(app, id, cost) {
  // A press on the free Action pip while an Action Surge spare waits spends
  // the spare, and the Action pip stays free, so the log names the spare.
  const before = app.state.combat?.order.find((p) => p.id === id);
  const spare = cost === 'action' && budgetOf(before?.used).spare;
  const spent = app.actions.toggleBudget?.(id, cost) ?? null;
  if (spent === null) return;
  // The log keeps a record of the override, because nothing else does.
  const name = findCombatant(app, id)?.label ?? 'Unknown combatant';
  const label = spare ? 'Action Surge action' : COST_LABELS[cost].toLowerCase();
  app.actions.logEvent('combat', `${name}'s ${label} is marked ${spent ? 'used' : 'free'}.`);
}

/**
 * Spend one use of a class pool on its action. The use comes off only after
 * the turn pays for the action, so a refused bonus action keeps the use.
 * @param {AppContext} app
 * @param {{ entity: Character, label: string, store: (next: Character) => void }} found
 * @param {TurnAction} action
 * @param {RandomFn} rng
 * @returns {boolean | Promise<boolean>} whether the action went through
 */
function useClassAction(app, found, action, rng) {
  const { entity, store } = found;
  const poolId = /** @type {string} */ (action.poolId);
  if ((usesOf(entity, poolId) ?? 0) <= 0) {
    app.toasts.show(`${found.label} has no use of ${action.name} left. A short rest restores it.`);
    return false;
  }
  if (action.id === 'turn-undead') return turnUndead(app, found, { rng });
  if (action.id === 'preserve-life') return preserveLife(app, found);
  if (poolId === ACTION_SURGE_ID) {
    if (app.actions.surgeBudget && !app.actions.surgeBudget(entity.id)) {
      app.toasts.show(`${found.label} already used Action Surge this turn.`);
      return false;
    }
  } else if (
    action.cost &&
    app.actions.spendBudget &&
    !app.actions.spendBudget(entity.id, action.cost)
  ) {
    app.toasts.show(
      `${found.label} has no ${COST_LABELS[action.cost].toLowerCase()} left this turn.`,
    );
    return false;
  }
  store(spendResource(entity, poolId, 1));
  app.actions.markDirty();
  if (poolId === ACTION_SURGE_ID) {
    app.actions.logEvent('combat', actionSurgeLine(found.label));
    return true;
  }
  const die = Math.floor(rng() * 10) + 1;
  const level = classLevelOf(entity, 'fighter');
  app.actions.logEvent('combat', secondWindLine(found.label, die, level));
  applyToTarget(app, entity.id, die + level, true);
  return true;
}
