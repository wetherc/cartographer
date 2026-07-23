/**
 * Pure initiative/turn-order logic for running a combat round. A CombatState is
 * a sorted order of participants plus a round counter and a pointer at whose
 * turn it is; every function returns a new value rather than mutating, so the UI
 * layer owns the single mutable copy (as elsewhere in this codebase).
 */

/** @typedef {import('../types/combat.js').Participant} Participant */
/** @typedef {import('../types/combat.js').CombatState} CombatState */

/**
 * @param {string} id
 * @param {string} name
 * @param {'party' | 'foe'} side
 * @param {number} [initiative]
 * @param {number} [modifier] DEX-derived bonus added to this combatant's initiative roll
 * @returns {Participant}
 */
export function createParticipant(id, name, side, initiative = 10, modifier = 0) {
  return { id, name, side, initiative, modifier };
}

/**
 * Sort participants into turn order: highest initiative first, ties broken by
 * name (case-insensitive) then id so the order is deterministic. Pure.
 * @param {Participant[]} participants
 * @returns {Participant[]}
 */
export function sortInitiative(participants) {
  return [...participants].sort((a, b) => {
    if (b.initiative !== a.initiative) return b.initiative - a.initiative;
    const an = a.name.toLowerCase();
    const bn = b.name.toLowerCase();
    if (an !== bn) return an < bn ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Begin a combat: sort the participants and start at round 1, first turn.
 * @param {Participant[]} participants
 * @returns {CombatState}
 */
export function startCombat(participants) {
  return { round: 1, index: 0, order: sortInitiative(participants) };
}

/**
 * @param {CombatState} state
 * @returns {Participant | null} whose turn it currently is
 */
export function currentParticipant(state) {
  return state.order[state.index] ?? null;
}

/**
 * Advance to the next turn, wrapping to the top of the order and incrementing
 * the round. Returns the new state and whether the round rolled over (so the
 * caller can tick per-round effects like conditions). An empty order is a no-op.
 * @param {CombatState} state
 * @returns {{ state: CombatState, wrapped: boolean }}
 */
export function advanceTurn(state) {
  if (state.order.length === 0) return { state, wrapped: false };
  const nextIndex = state.index + 1;
  const wrapped = nextIndex >= state.order.length;
  return {
    state: {
      ...state,
      index: wrapped ? 0 : nextIndex,
      round: wrapped ? state.round + 1 : state.round,
    },
    wrapped,
  };
}
