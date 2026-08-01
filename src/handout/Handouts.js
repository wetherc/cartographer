/**
 * Pure helpers for lore and read-aloud handouts. List-level operations
 * (unique id derivation, replace or remove by id) come from the rosters
 * through entities/Roster.js. This module owns only the per-handout shape,
 * the node-scoped filter, and the reveal toggle. This keeps the module free
 * of app state, so tests can run against it directly.
 */

/** @typedef {import('../types/handout.js').Handout} Handout */

/**
 * @param {string} id
 * @param {string} title
 * @param {string} [body]
 * @param {string | null} [nodeId] Node the handout attaches to. Null means campaign-wide.
 * @param {boolean} [revealed]
 * @param {string | null} [image] Data URL of an attached image. Null means no image.
 * @returns {Handout}
 */
export function createHandout(id, title, body = '', nodeId = null, revealed = false, image = null) {
  return { id, title, body, nodeId, revealed, image };
}

/**
 * Backfill fields a loaded handout can predate.
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
 * Handouts to show while the party stands in a node: those bound to the
 * node, plus campaign-wide handouts (nodeId null). Keeps the input order.
 * @param {Handout[]} handouts
 * @param {string} nodeId
 * @returns {Handout[]}
 */
export function handoutsAt(handouts, nodeId) {
  return handouts.filter((h) => h.nodeId === null || h.nodeId === nodeId);
}
