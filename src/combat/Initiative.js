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
 * @param {number} [initiative]
 * @param {number} [modifier] DEX-derived bonus added to this combatant's initiative roll
 * @returns {Participant}
 */
export function createParticipant(id, initiative = 10, modifier = 0) {
  return { id, initiative, modifier };
}

/**
 * Sort participants into turn order: highest initiative first, ties broken by
 * name (case-insensitive) then id so the order is deterministic. A participant
 * carries no name — `nameOf` resolves one from whatever holds the id — and an
 * unresolvable id sorts as the empty string, which still leaves the id
 * tiebreak. Pure.
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
 * `startedAt` is injected rather than read from the clock so this stays pure;
 * the caller passes the moment its setup opened, which is where the fight's
 * slice of the travelogue begins.
 * @param {Participant[]} participants
 * @param {(participant: Participant) => string} [nameOf] for the tiebreak
 * @param {number} [startedAt] epoch ms the fight's log starts at
 * @returns {CombatState}
 */
export function startCombat(participants, nameOf, startedAt = 0) {
  return { round: 1, index: 0, order: sortInitiative(participants, nameOf), startedAt };
}

/**
 * Remove a combatant from a running order — what deleting an encounter or a
 * character mid-fight has to do, since a participant whose entity is gone can
 * neither act nor be targeted. The turn pointer follows the combatant it was
 * on: dropping someone earlier in the order shifts it back, and dropping the
 * last participant while it is their turn wraps it to the top rather than off
 * the end. Returns the state unchanged (identity preserved) when the id is not
 * in the order. Pure.
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
