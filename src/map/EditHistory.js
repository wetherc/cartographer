/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/map.js').PartyPosition} PartyPosition */
/** @typedef {import('../types/entities.js').CharacterPlacement} CharacterPlacement */
/** @typedef {import('../types/entities.js').CreaturePlacement} CreaturePlacement */
/** @typedef {import('../types/handout.js').HandoutBinding} HandoutBinding */
/** @typedef {import('./EntryMemory.js').EntryMemory} EntryMemory */

/**
 * In-memory Build-mode edit history: a bounded ring of snapshots taken
 * before each stroke, erase, link, or generate action. A GM can undo one bad
 * paint stroke without a reload to an earlier save. Each entry holds every
 * node the edit touched (a generate action touches the node and its parent),
 * plus what the edit created, removed, and did to the party. Entries are
 * captured by reference. The paint and erase transforms return fresh node
 * objects, so a captured snapshot never changes afterward. When the edit
 * finishes, `commitEdit` records the nodes as the edit left them, so undo
 * can write back only the cells the edit changed (see `EditRevert.js`).
 * This history is session only by design. It is the counterpart to the
 * persisted save-level Undo, not a replacement for it.
 */

/**
 * What one edit changed, as it stood before the edit. Undo reverts the
 * changes between `nodes` and `after` on the current nodes, removes the
 * nodes in `created`, adds the nodes in `removed` back, moves the party to
 * `party`, puts the characters in `recalled` and the creatures in
 * `creatures` back where they stood, binds the handouts in `handouts` back
 * to their nodes, and restores `entryTiles`.
 * @typedef {Object} EditSnapshot
 * @property {MapNode[]} nodes nodes the edit rewrote, as they were
 * @property {MapNode[] | null} after the same nodes as the edit left them,
 *   in the same order, or null while the edit has not finished
 * @property {string[]} created ids of nodes the edit added
 * @property {MapNode[]} removed nodes the edit deleted, subtrees included
 * @property {PartyPosition | null} party where the party stood, or null when
 *   the edit left the party alone
 * @property {CharacterPlacement[]} recalled characters the edit moved or
 *   pulled back to the party marker, with the location each one had
 * @property {CreaturePlacement[]} creatures creatures the edit moved or
 *   unplaced, with the location each one had
 * @property {HandoutBinding[]} handouts handouts the edit made
 *   campaign-wide, with the node each one was bound to
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
    after: null,
    created: [],
    removed: [],
    party: null,
    recalled: [],
    creatures: [],
    handouts: [],
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

/**
 * Record the nodes as the most recent edit left them. `lookup` returns a
 * node's current state by id. A node that no longer exists keeps its
 * before state, which undo skips anyway. An entry that already has its
 * after state stays as it is, so a stroke end that follows no new snapshot
 * (a fog stroke, an inspect click) cannot overwrite it. This is a pure
 * function: it returns a new array, or the same array when nothing changes.
 * @param {EditSnapshot[]} history
 * @param {(id: string) => MapNode | undefined} lookup
 * @returns {EditSnapshot[]}
 */
export function commitEdit(history, lookup) {
  const top = history[history.length - 1];
  if (!top || top.after) return history;
  const after = top.nodes.map((node) => lookup(node.id) ?? node);
  return [...history.slice(0, -1), { ...top, after }];
}
