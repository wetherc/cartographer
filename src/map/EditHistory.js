/** @typedef {import('../types/map.js').MapNode} MapNode */

/**
 * In-memory Build-mode edit history: a bounded ring of node snapshots taken
 * before each stroke/erase/link/generate, so one bad paint stroke is undoable
 * without reloading a whole earlier save. Each entry holds every node the edit
 * touched (a generate touches the node and its parent), captured by reference —
 * the paint/erase transforms return fresh node objects, so a captured snapshot
 * is never mutated afterwards. Session-only by design: this is the counterpart
 * to the persisted save-level Undo, not a replacement for it.
 */

export const DEFAULT_EDIT_LIMIT = 30;

/**
 * Append one edit's pre-state (the touched nodes as they were) to the ring,
 * dropping the oldest entry once past `limit`. Pure: returns a new array.
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
 * Pop the most recent edit's pre-state. Pure: returns the shortened history
 * and the snapshot to restore, or `nodes: null` when there is nothing to undo.
 * @param {MapNode[][]} history
 * @returns {{ history: MapNode[][], nodes: MapNode[] | null }}
 */
export function popEdit(history) {
  if (history.length === 0) return { history, nodes: null };
  return { history: history.slice(0, -1), nodes: history[history.length - 1] };
}
