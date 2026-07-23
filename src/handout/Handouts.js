/**
 * Pure helpers for lore/read-aloud handouts. List-level operations (unique id
 * derivation, replace/remove by id) are shared with the rosters via
 * entities/Roster.js; this module owns only the per-handout shape, the
 * node-scoped filter, and the reveal toggle, so it stays app-state-free and
 * unit-testable.
 */

/** @typedef {import('../types/handout.js').Handout} Handout */

/**
 * @param {string} id
 * @param {string} title
 * @param {string} [body]
 * @param {string | null} [nodeId] node the handout attaches to; null = campaign-wide
 * @param {boolean} [revealed]
 * @param {string | null} [image] data: URL of an attached image; null = none
 * @returns {Handout}
 */
export function createHandout(id, title, body = '', nodeId = null, revealed = false, image = null) {
  return { id, title, body, nodeId, revealed, image };
}

/**
 * Backfill fields a loaded handout may predate.
 * @param {Handout} handout
 * @returns {Handout}
 */
export function withDefaults(handout) {
  return {
    ...handout,
    body: handout.body ?? '',
    nodeId: handout.nodeId ?? null,
    revealed: handout.revealed ?? false,
    image: handout.image ?? null,
  };
}

/**
 * @param {Handout} handout
 * @returns {Handout}
 */
export function toggleRevealed(handout) {
  return { ...handout, revealed: !handout.revealed };
}

/**
 * Handouts shown while standing in a node: those bound to it plus campaign-wide
 * ones (nodeId null). Preserves input order.
 * @param {Handout[]} handouts
 * @param {string} nodeId
 * @returns {Handout[]}
 */
export function handoutsAt(handouts, nodeId) {
  return handouts.filter((h) => h.nodeId === null || h.nodeId === nodeId);
}
