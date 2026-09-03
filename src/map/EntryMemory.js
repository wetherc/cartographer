/**
 * The parent tile each child node was entered through.
 *
 * A parent can link one child from two blocks that do not touch, for example
 * a cave with two mouths. The tiles alone do not say which mouth the party
 * walked in by, and both the ways out (`MapExits.findExits`) and the return
 * landing (`EntryPoint.computeParentReturnTile`) need that answer. This
 * memory holds it, keyed by child node id.
 *
 * The memory is part of the campaign save. It was session state before, so a
 * reload made a two-mouthed child report the sides of both blocks and land a
 * returning party beside the first one.
 *
 * Every function returns the memory it was given when nothing changes. The
 * save diff and the cross-tab reconcile both compare by identity, so an
 * unchanged memory costs them nothing.
 */

/** @typedef {Record<string, string>} EntryMemory */

/**
 * The parent tile the child was entered through, or null when the child was
 * reached another way, such as a teleport.
 * @param {EntryMemory} memory
 * @param {string} childNodeId
 * @returns {string | null}
 */
export function entryFor(memory, childNodeId) {
  const tileId = memory[childNodeId];
  return typeof tileId === 'string' ? tileId : null;
}

/**
 * Record that a child was entered through a parent tile.
 * @param {EntryMemory} memory
 * @param {string} childNodeId
 * @param {string} tileId parent tile the traveler zoomed through
 * @returns {EntryMemory}
 */
export function rememberEntry(memory, childNodeId, tileId) {
  if (memory[childNodeId] === tileId) return memory;
  return { ...memory, [childNodeId]: tileId };
}

/**
 * Drop the entries for the given nodes. Deleting or regenerating a node
 * calls this, so no entry names a child that is gone.
 * @param {EntryMemory} memory
 * @param {Iterable<string>} nodeIds
 * @returns {EntryMemory}
 */
export function forgetEntries(memory, nodeIds) {
  /** @type {string[]} */
  const held = [];
  for (const id of nodeIds) {
    if (Object.prototype.hasOwnProperty.call(memory, id)) held.push(id);
  }
  if (held.length === 0) return memory;
  const next = { ...memory };
  for (const id of held) delete next[id];
  return next;
}

/**
 * Drop the entries for nodes that no longer exist. The load path runs this
 * once against the grid it built, so an entry left by a node deleted in
 * another tab does not stay in the save forever.
 * @param {EntryMemory} memory
 * @param {(nodeId: string) => boolean} nodeExists
 * @returns {EntryMemory}
 */
export function pruneEntries(memory, nodeExists) {
  return forgetEntries(
    memory,
    Object.keys(memory).filter((id) => !nodeExists(id)),
  );
}
