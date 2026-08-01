/** @typedef {import('../types/map.js').MapNode} MapNode */

/**
 * In-memory Build-mode edit history: a bounded ring of node snapshots taken
 * before each stroke, erase, link, or generate action. A GM can undo one bad
 * paint stroke without a reload to an earlier save. Each entry holds every
 * node the edit touched (a generate action touches the node and its parent).
 * Entries are captured by reference. The paint and erase transforms return
 * fresh node objects, so a captured snapshot never changes afterward. This
 * history is session only by design. It is the counterpart to the persisted
 * save-level Undo, not a replacement for it.
 */

export const DEFAULT_EDIT_LIMIT = 30;

/**
 * Append one edit's pre-state (the touched nodes as they were) to the ring.
 * Drop the oldest entry once past `limit`. This is a pure function: it returns a new array.
 * @param {MapNode[][]} history
 * @param {MapNode[]} nodes
 * @param {number} [limit]
 * @returns {MapNode[][]}
 */
export function pushEdit(history, nodes, limit = DEFAULT_EDIT_LIMIT) {
  const next = [...history, nodes];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

/**
 * Pop the most recent edit's pre-state. This is a pure function: it returns the
 * shortened history and the snapshot to restore, or `nodes: null` when there is nothing to undo.
 * @param {MapNode[][]} history
 * @returns {{ history: MapNode[][], nodes: MapNode[] | null }}
 */
export function popEdit(history) {
  if (history.length === 0) return { history, nodes: null };
  return { history: history.slice(0, -1), nodes: history[history.length - 1] };
}
