import { classLevelOf } from '../entities/Multiclass.js';
import { COST_LABELS } from './ActionBudget.js';
import { ACTION_SURGE_ID, SECOND_WIND_ID } from '../entities/PoolIds.js';

/**
 * Pure list of the turn actions that the combat screen offers as buttons,
 * besides weapon swings and spells. 5e gives every combatant the standard
 * actions (Dash, Disengage, Dodge, Help, Hide, Ready). The app does not
 * move tokens or track hidden creatures, so most of them only spend the
 * action and write a log line. Dodge also leaves a Dodging chip on the
 * combatant until the start of its next turn.
 *
 * Each entry names its cost and a group, and the action bar draws one row
 * of buttons per group. A class feature that grants another use of a turn
 * adds entries with its own group, such as the Cunning Action of a rogue,
 * which offers Dash, Disengage, and Hide as a bonus action. A fighter
 * gets Second Wind and Action Surge, which spend a use of their class pool.
 * Action Surge costs no part of the turn, so its entry has no cost.
 */

/** @typedef {import('../types/combat.js').ActionCost} ActionCost */
/** @typedef {import('../types/entities.js').Character} Character */

/**
 * One button of the action bar.
 * @typedef {{
 *   id: string,
 *   name: string,
 *   cost: ActionCost | null,
 *   group: string,
 *   title: string,
 *   source?: string,
 *   ariaLabel?: string,
 *   poolId?: string,
 * }} TurnAction
 */

/** The standard actions of 5e, in the order the bar shows them. */
export const STANDARD_ACTIONS = Object.freeze([
  { id: 'dash', name: 'Dash', effect: 'gains extra movement equal to its speed this turn' },
  {
    id: 'disengage',
    name: 'Disengage',
    effect: 'moves without provoking opportunity attacks this turn',
  },
  {
    id: 'dodge',
    name: 'Dodge',
    effect:
      'makes attacks against it roll at disadvantage and its DEX saves at advantage until its next turn',
  },
  { id: 'help', name: 'Help', effect: 'gives an ally advantage on its next check or attack' },
  { id: 'hide', name: 'Hide', effect: 'rolls Dexterity (Stealth) to hide' },
  { id: 'ready', name: 'Ready', effect: 'readies an action for a trigger it names' },
]);

/** The standard actions that Cunning Action lets a rogue take as a bonus action. */
const CUNNING = new Set(['dash', 'disengage', 'hide']);

/** The group label of the standard actions. */
export const STANDARD_GROUP = 'Standard actions';

/**
 * Whether a character has Cunning Action: a rogue of level 2 or higher.
 * @param {Character} character
 * @returns {boolean}
 */
export function hasCunningAction(character) {
  return classLevelOf(character, 'rogue') >= 2;
}

/** The group label of the fighter's class actions. */
export const FIGHTER_GROUP = 'Fighter';

/**
 * How many uses are left, for a button title.
 * @param {number} left
 * @returns {string}
 */
const usesLeft = (left) => `${left} ${left === 1 ? 'use' : 'uses'} left`;

/**
 * The turn actions a combatant can take, as bar entries. Every combatant has
 * the standard actions. `cunningAction` adds the bonus-action copies of
 * Dash, Disengage, and Hide. `secondWind` and `actionSurge` are the uses
 * left in those pools, and a character without the pool passes nothing. A
 * pool at 0 still gets its button, and the press says that no use is left.
 * @param {{ cunningAction?: boolean, secondWind?: number, actionSurge?: number }} [features]
 * @returns {TurnAction[]}
 */
export function turnActions({ cunningAction = false, secondWind, actionSurge } = {}) {
  /** @type {TurnAction[]} */
  const list = STANDARD_ACTIONS.map((a) => ({
    id: a.id,
    name: a.name,
    cost: /** @type {ActionCost} */ ('action'),
    group: STANDARD_GROUP,
    title: `Take the ${a.name} action: ${a.effect}`,
  }));
  if (cunningAction) {
    for (const a of STANDARD_ACTIONS.filter((s) => CUNNING.has(s.id))) {
      list.push({
        id: a.id,
        name: a.name,
        cost: 'bonus',
        group: 'Cunning Action (bonus action)',
        title: `Take the ${a.name} action as a bonus action: ${a.effect}`,
        source: 'Cunning Action',
      });
    }
  }
  if (secondWind !== undefined) {
    list.push({
      id: SECOND_WIND_ID,
      name: 'Second Wind',
      cost: 'bonus',
      group: FIGHTER_GROUP,
      title: `Use Second Wind as a bonus action: regain 1d10 + fighter level HP (${usesLeft(secondWind)})`,
      ariaLabel: 'Use Second Wind as a bonus action',
      poolId: SECOND_WIND_ID,
    });
  }
  if (actionSurge !== undefined) {
    list.push({
      id: ACTION_SURGE_ID,
      name: 'Action Surge',
      cost: null,
      group: FIGHTER_GROUP,
      title: `Use Action Surge: take one more action this turn (${usesLeft(actionSurge)})`,
      ariaLabel: 'Use Action Surge',
      poolId: ACTION_SURGE_ID,
    });
  }
  return list;
}

/**
 * The log line of Second Wind.
 * @param {string} actorName
 * @param {number} die the d10 roll
 * @param {number} fighterLevel
 * @returns {string} for example "Aldric uses Second Wind and regains 9 HP
 *   (d10 5 + 4)."
 */
export function secondWindLine(actorName, die, fighterLevel) {
  return `${actorName} uses Second Wind and regains ${die + fighterLevel} HP (d10 ${die} + ${fighterLevel}).`;
}

/**
 * The log line of Action Surge.
 * @param {string} actorName
 * @returns {string}
 */
export function actionSurgeLine(actorName) {
  return `${actorName} uses Action Surge and takes one more action this turn.`;
}

/**
 * The log line for a turn action.
 * @param {string} actorName
 * @param {TurnAction} action
 * @returns {string} for example "Wren takes the Hide action as a bonus
 *   action (Cunning Action)."
 */
export function turnActionLine(actorName, action) {
  const base = `${actorName} takes the ${action.name} action`;
  if (action.cost === 'action' || action.cost === null) return `${base}.`;
  const via = action.source ? ` (${action.source})` : '';
  return `${base} as a ${COST_LABELS[action.cost].toLowerCase()}${via}.`;
}
