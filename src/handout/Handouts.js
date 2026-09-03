/**
 * Pure helpers for lore and read-aloud handouts. List-level operations
 * (unique id derivation, replace or remove by id) come from the rosters
 * through entities/Roster.js. This module owns only the per-handout shape,
 * the node-scoped filter, the reveal toggle, and what a node edit does to a
 * binding. This keeps the module free of app state, so tests can run
 * against it directly.
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

/**
 * Make the handouts bound to any of the given nodes campaign-wide. A node
 * edit that removes nodes calls this, so no handout stays bound to a node
 * that is gone, which would hide it from every panel. Handouts bound
 * elsewhere keep their node, and the array keeps its identity when nothing
 * changes.
 * @param {Handout[]} handouts
 * @param {Set<string>} nodeIds
 * @returns {Handout[]}
 */
export function unbindFrom(handouts, nodeIds) {
  let changed = false;
  const next = handouts.map((h) => {
    if (h.nodeId === null || !nodeIds.has(h.nodeId)) return h;
    changed = true;
    return { ...h, nodeId: null };
  });
  return changed ? next : handouts;
}

/**
 * Which node each handout bound to any of the given nodes was on, so a
 * caller that is about to unbind them can bind them back later. A
 * campaign-wide handout, and a handout bound elsewhere, are not in the
 * result.
 * @param {Handout[]} handouts
 * @param {Set<string>} nodeIds
 * @returns {import('../types/handout.js').HandoutBinding[]}
 */
export function bindingsIn(handouts, nodeIds) {
  /** @type {import('../types/handout.js').HandoutBinding[]} */
  const bindings = [];
  for (const h of handouts) {
    if (h.nodeId !== null && nodeIds.has(h.nodeId)) {
      bindings.push({ handoutId: h.id, nodeId: h.nodeId });
    }
  }
  return bindings;
}

/**
 * Bind the recorded handouts back to their nodes. This is the undo of
 * `unbindFrom`. Only the `nodeId` field changes, so any other edit made to
 * a handout since stays. A binding for a handout that is gone is skipped.
 * @param {Handout[]} handouts
 * @param {import('../types/handout.js').HandoutBinding[]} bindings
 * @returns {Handout[]}
 */
export function restoreBindings(handouts, bindings) {
  if (bindings.length === 0) return handouts;
  const byId = new Map(bindings.map((b) => [b.handoutId, b.nodeId]));
  return handouts.map((h) => (byId.has(h.id) ? { ...h, nodeId: byId.get(h.id) ?? null } : h));
}
