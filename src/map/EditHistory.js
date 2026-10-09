/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/map.js').PartyPosition} PartyPosition */
/** @typedef {import('../types/entities.js').CharacterPlacement} CharacterPlacement */
/** @typedef {import('../types/entities.js').CreaturePlacement} CreaturePlacement */
/** @typedef {import('../types/handout.js').HandoutBinding} HandoutBinding */
/** @typedef {import('../types/quest.js').QuestLinkRef} QuestLinkRef */
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
 * `party` (see `partyAfter`), puts the characters in `recalled` and the creatures in
 * `creatures` back where they stood, binds the handouts in `handouts` back
 * to their nodes and tiles, puts the quest links in `questLinks` back, and
 * restores `entryTiles`.
 * @typedef {Object} EditSnapshot
 * @property {string} label what the edit was, as a noun phrase such as
 *   "paint stroke" or "world generation". The Undo and Redo buttons and
 *   their toasts name it.
 * @property {MapNode[]} nodes nodes the edit rewrote, as they were
 * @property {MapNode[] | null} after the same nodes as the edit left them,
 *   in the same order, or null while the edit has not finished
 * @property {string[]} created ids of nodes the edit added
 * @property {MapNode[]} removed nodes the edit deleted, subtrees included
 * @property {PartyPosition | null} party where the party stood, or null when
 *   the edit left the party alone
 * @property {PartyPosition | null} [partyAfter] where the edit left the
 *   party. Undo moves the party back only while it still stands there or
 *   stands in a node the undo removes, so a walk after the edit stays.
 * @property {CharacterPlacement[]} recalled characters the edit moved or
 *   pulled back to the party marker, with the location each one had
 * @property {CreaturePlacement[]} creatures creatures the edit moved or
 *   unplaced, with the location each one had
 * @property {HandoutBinding[]} handouts handouts the edit made
 *   campaign-wide or took off a tile, with the node and tile each one was
 *   bound to
 * @property {QuestLinkRef[]} [questLinks] quest links to the nodes the edit
 *   removed, with their positions. Only a generate action removes nodes and
 *   fills this.
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
 * @param {string} [label] what the edit was, for the Undo button
 * @returns {EditSnapshot}
 */
export function nodeSnapshot(nodes, label = 'map edit') {
  return {
    label,
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
 * Add handout bindings to the most recent edit, for an edit that learns
 * what it unbound only once it ends. An erase stroke is one: it knows which
 * tiles it removed only after the last cell. This is a pure function: it
 * returns a new array, or the same array when there is nothing to add.
 * @param {EditSnapshot[]} history
 * @param {HandoutBinding[]} bindings
 * @returns {EditSnapshot[]}
 */
export function addHandoutBindings(history, bindings) {
  const top = history[history.length - 1];
  if (!top || bindings.length === 0) return history;
  return [...history.slice(0, -1), { ...top, handouts: [...top.handouts, ...bindings] }];
}

/**
 * Whether two party positions name the same tile.
 * @param {PartyPosition | null | undefined} a
 * @param {PartyPosition | null | undefined} b
 */
export function samePosition(a, b) {
  return Boolean(a && b && a.nodeId === b.nodeId && a.tileId === b.tileId);
}

/**
 * Record the nodes as the most recent edit left them. `lookup` returns a
 * node's current state by id. A node that no longer exists keeps its
 * before state, which undo skips anyway. With `party`, an edit that
 * recorded the party also records where it left the party. When the party
 * did not move, the record drops the party, so undo does not move it. An entry that already has its
 * after state stays as it is, so a stroke end that follows no new snapshot
 * (a fog stroke, an inspect click) cannot overwrite it. This is a pure
 * function: it returns a new array, or the same array when nothing changes.
 * @param {EditSnapshot[]} history
 * @param {(id: string) => MapNode | undefined} lookup
 * @param {PartyPosition} [party] where the party stands now
 * @returns {EditSnapshot[]}
 */
export function commitEdit(history, lookup, party) {
  const top = history[history.length - 1];
  if (!top || top.after) return history;
  const after = top.nodes.map((node) => lookup(node.id) ?? node);
  /** @type {EditSnapshot} */
  const done = { ...top, after };
  if (top.party && party) {
    const moved = !samePosition(top.party, party);
    done.party = moved ? top.party : null;
    done.partyAfter = moved ? party : null;
  }
  return [...history.slice(0, -1), done];
}

/**
 * The entries that still apply to the map. An entry goes when a node it
 * rewrote no longer exists, or when a node it would add back has a parent
 * that no longer exists and that the entry does not add back itself. A
 * deleted node, or a save adopted from another tab, can leave either case.
 * Undo of such an entry would write to nothing or add an orphan map, which
 * the world tree lists as an extra root. This is a pure function: it
 * returns the same array when every entry applies.
 * @param {EditSnapshot[]} history
 * @param {(id: string) => boolean} exists whether the grid has a node
 * @returns {EditSnapshot[]}
 */
export function liveEdits(history, exists) {
  const kept = history.filter((entry) => {
    if (!entry.nodes.every((node) => exists(node.id))) return false;
    const added = new Set(entry.removed.map((node) => node.id));
    return entry.removed.every(
      (node) => !node.parentId || added.has(node.parentId) || exists(node.parentId),
    );
  });
  return kept.length === history.length ? history : kept;
}
