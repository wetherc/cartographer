/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/map.js').PartyPosition} PartyPosition */
/** @typedef {import('../types/entities.js').CharacterPlacement} CharacterPlacement */
/** @typedef {import('../types/entities.js').CreaturePlacement} CreaturePlacement */
/** @typedef {import('./EntryMemory.js').EntryMemory} EntryMemory */

/**
 * In-memory Build-mode edit history: a bounded ring of snapshots taken
 * before each stroke, erase, link, or generate action. A GM can undo one bad
 * paint stroke without a reload to an earlier save. Each entry holds every
 * node the edit touched (a generate action touches the node and its parent),
 * plus what the edit created, removed, and did to the party. Entries are
 * captured by reference. The paint and erase transforms return fresh node
 * objects, so a captured snapshot never changes afterward. This history is
 * session only by design. It is the counterpart to the persisted save-level
 * Undo, not a replacement for it.
 */

/**
 * What one edit changed, as it stood before the edit. Undo writes `nodes`
 * back, removes the nodes in `created`, adds the nodes in `removed` back,
 * moves the party to `party`, puts the characters in `recalled` and the
 * creatures in `creatures` back where they stood, and restores
 * `entryTiles`.
 * @typedef {Object} EditSnapshot
 * @property {MapNode[]} nodes nodes the edit rewrote, as they were
 * @property {string[]} created ids of nodes the edit added
 * @property {MapNode[]} removed nodes the edit deleted, subtrees included
 * @property {PartyPosition | null} party where the party stood, or null when
 *   the edit left the party alone
 * @property {CharacterPlacement[]} recalled characters the edit moved or
 *   pulled back to the party marker, with the location each one had
 * @property {CreaturePlacement[]} creatures creatures the edit moved, with
 *   the location each one had
 * @property {EntryMemory | null} entryTiles the entry memory as it stood, or
 *   null when the edit left it alone. An edit that removes nodes drops their
 *   entries, and undo brings those nodes back.
 */

export const DEFAULT_EDIT_LIMIT = 30;

/**
 * A snapshot for an edit that only rewrites nodes. This is every stroke,
 * erase, and link. A generate action builds its own snapshot with the other
 * fields filled in.
 * @param {MapNode[]} nodes
 * @returns {EditSnapshot}
 */
export function nodeSnapshot(nodes) {
  return {
    nodes,
    created: [],
    removed: [],
    party: null,
    recalled: [],
    creatures: [],
    entryTiles: null,
  };
}

/**
 * Append one edit's pre-state to the ring. Drop the oldest entry once past
 * `limit`. This is a pure function: it returns a new array.
 * @param {EditSnapshot[]} history
 * @param {EditSnapshot} snapshot
 * @param {number} [limit]
 * @returns {EditSnapshot[]}
 */
export function pushEdit(history, snapshot, limit = DEFAULT_EDIT_LIMIT) {
  const next = [...history, snapshot];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

/**
 * Pop the most recent edit's pre-state. This is a pure function: it returns
 * the shortened history and the snapshot to restore, or `snapshot: null`
 * when there is nothing to undo.
 * @param {EditSnapshot[]} history
 * @returns {{ history: EditSnapshot[], snapshot: EditSnapshot | null }}
 */
export function popEdit(history) {
  if (history.length === 0) return { history, snapshot: null };
  return { history: history.slice(0, -1), snapshot: history[history.length - 1] };
}
