/**
 * Pure initiative and turn-order logic for running a combat round. A
 * CombatState is a sorted order of participants, plus a round counter and a
 * pointer to whose turn it is. Every function here returns a new value
 * instead of mutating, so the UI layer owns the single mutable copy, as
 * elsewhere in this codebase.
 */

import { freshBudget, refresh } from './ActionBudget.js';

/** @typedef {import('../types/combat.js').Participant} Participant */
/** @typedef {import('../types/combat.js').CombatState} CombatState */

/**
 * @param {string} id
 * @param {number} [initiative]
 * @param {number} [modifier] DEX-derived bonus added to this combatant's initiative roll
 * @returns {Participant}
 */
export function createParticipant(id, initiative = 10, modifier = 0) {
  return { id, initiative, modifier, used: freshBudget() };
}

/**
 * Sort participants into turn order: highest initiative first, ties broken by
 * name (case-insensitive), then by id, so the order is deterministic. A
 * participant carries no name. `nameOf` resolves a name from whatever holds
 * the id. An unresolvable id sorts as the empty string, which still leaves
 * the id tiebreak. Pure function.
 * @param {Participant[]} participants
 * @param {(participant: Participant) => string} [nameOf]
 * @returns {Participant[]}
 */
export function sortInitiative(participants, nameOf = () => '') {
  return [...participants].sort((a, b) => {
    if (b.initiative !== a.initiative) return b.initiative - a.initiative;
    const an = nameOf(a).toLowerCase();
    const bn = nameOf(b).toLowerCase();
    if (an !== bn) return an < bn ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Begin a combat: sort the participants and start at round 1, first turn.
 * `startedAt` is injected instead of read from the clock, so this function
 * stays pure. The caller passes the moment its setup opened, which is where
 * the fight's slice of the travelogue begins.
 * @param {Participant[]} participants
 * @param {(participant: Participant) => string} [nameOf] for the tiebreak
 * @param {number} [startedAt] epoch ms the fight's log starts at
 * @returns {CombatState}
 */
export function startCombat(participants, nameOf, startedAt = 0) {
  return { round: 1, index: 0, order: sortInitiative(participants, nameOf), startedAt };
}

/**
 * Remove a combatant from a running order. Deleting an encounter or a
 * character mid-fight must do this, because a participant whose entity is
 * gone can neither act nor be targeted. The turn pointer follows the
 * combatant it was on: removing someone earlier in the order shifts the
 * pointer back, and removing the last participant during their own turn
 * wraps the pointer to the top instead of past the end. The function returns
 * the state unchanged (identity preserved) when the id is not in the order.
 * Pure function.
 * @param {CombatState} state
 * @param {string} id
 * @returns {CombatState}
 */
export function dropParticipant(state, id) {
  const removed = state.order.filter((p) => p.id !== id);
  if (removed.length === state.order.length) return state;
  const before = state.order.slice(0, state.index).filter((p) => p.id === id).length;
  const index = removed.length === 0 ? 0 : Math.min(state.index - before, removed.length - 1);
  return { ...state, index, order: removed };
}

/**
 * Add a combatant to a running order. A creature that a spell summons mid-fight
 * joins this way. The newcomer takes its place by initiative, and the turn
 * pointer stays on whoever holds the turn, whether the newcomer sorts above or
 * below them. A newcomer that sorts above the current combatant therefore acts
 * for the first time on the next round, which is what waiting for its place in
 * the order means. The function returns the state unchanged (identity
 * preserved) when the id is already in the order. Pure function.
 * @param {CombatState} state
 * @param {Participant} participant
 * @param {(participant: Participant) => string} [nameOf] for the tiebreak
 * @returns {CombatState}
 */
export function addParticipant(state, participant, nameOf) {
  if (state.order.some((p) => p.id === participant.id)) return state;
  const holder = state.order[state.index]?.id;
  const order = sortInitiative([...state.order, participant], nameOf);
  const index = Math.max(
    0,
    order.findIndex((p) => p.id === holder),
  );
  return { ...state, index, order };
}

/**
 * @param {CombatState} state
 * @returns {Participant | null} whose turn it currently is
 */
export function currentParticipant(state) {
  return state.order[state.index] ?? null;
}

/**
 * Advance to the next turn, wrap to the top of the order, and increment the
 * round. The function returns the new state and whether the round rolled
 * over, so the caller can update per-round effects like conditions. An empty
 * order is a no-op.
 *
 * `isDefeated` skips turns nobody can take. The pointer keeps stepping past
 * defeated participants (their chips stay in the ribbon, struck through) and
 * lands on the next one standing. If every participant is defeated, the
 * pointer advances one full cycle and stops where it started, so the round
 * still turns over and timed effects keep ticking while the GM decides what
 * to do with the wipe.
 *
 * The participant the pointer lands on gets a whole action budget back,
 * because their turn is what begins. A participant the pointer steps past
 * keeps a spent budget: they cannot act, and their own next turn start clears
 * it if something revives them.
 * @param {CombatState} state
 * @param {(participant: Participant) => boolean} [isDefeated]
 * @returns {{ state: CombatState, wrapped: boolean }}
 */
export function advanceTurn(state, isDefeated = () => false) {
  if (state.order.length === 0) return { state, wrapped: false };
  let index = state.index;
  let round = state.round;
  let wrapped = false;
  for (let steps = 0; steps < state.order.length; steps += 1) {
    index += 1;
    if (index >= state.order.length) {
      index = 0;
      round += 1;
      wrapped = true;
    }
    if (!isDefeated(state.order[index])) break;
  }
  return { state: { ...state, index, round, order: refreshTurn(state.order, index) }, wrapped };
}

/**
 * The order with the participant at `index` given a fresh budget. The array
 * identity survives when that participant already had one, which keeps the
 * save diff and the combatant index caches warm on a turn nobody spent.
 * @param {Participant[]} order
 * @param {number} index
 * @returns {Participant[]}
 */
function refreshTurn(order, index) {
  const landed = order[index];
  const reset = refresh(landed);
  if (reset === landed) return order;
  return order.map((participant, at) => (at === index ? reset : participant));
}
