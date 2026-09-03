/**
 * The parent tile each traveler entered each child node through.
 *
 * A parent can link one child from two blocks that do not touch, for example
 * a cave with two mouths. The tiles alone do not say which mouth a traveler
 * walked in by, and both the ways out (`MapExits.findExits`) and the return
 * landing (`EntryPoint.computeParentReturnTile`) need that answer.
 *
 * The memory holds one tile for each traveler and node pair. A traveler is
 * the party, or one character who holds their own location while the party
 * is split. Two travelers can stand in one child having come in by different
 * blocks, so one tile per node is not enough: the second one in would
 * overwrite the answer the first one needs.
 *
 * The memory is part of the campaign save. It was session state before, so a
 * reload made a two-mouthed child report the sides of both blocks and land a
 * returning party beside the first one.
 *
 * Every function returns the memory it was given when nothing changes. The
 * save diff and the cross-tab reconcile both compare by identity, so an
 * unchanged memory costs them nothing.
 */

/** @typedef {Record<string, Record<string, string>>} EntryMemory */

/** The traveler key of the party marker itself. */
export const PARTY_TRAVELER = 'party';

/**
 * The traveler key for whoever a move belongs to. A character who holds no
 * location of their own stands at the party marker, so they read and write
 * the party's entries. A character key carries a prefix, which keeps a
 * character whose id is `party` apart from the party itself.
 * @param {{ id: string, location?: { nodeId: string, tileId: string } | null } | null} character
 * @returns {string}
 */
export function travelerFor(character) {
  return character && (character.location ?? null) ? `c:${character.id}` : PARTY_TRAVELER;
}

/**
 * The parent tile this traveler entered the child through, or null when they
 * reached it another way, such as a teleport.
 * @param {EntryMemory} memory
 * @param {string} traveler
 * @param {string} childNodeId
 * @returns {string | null}
 */
export function entryFor(memory, traveler, childNodeId) {
  const held = own(memory, traveler);
  const tileId = held ? held[childNodeId] : undefined;
  return typeof tileId === 'string' ? tileId : null;
}

/**
 * Record that a traveler entered a child through a parent tile.
 * @param {EntryMemory} memory
 * @param {string} traveler
 * @param {string} childNodeId
 * @param {string} tileId parent tile the traveler zoomed through
 * @returns {EntryMemory}
 */
export function rememberEntry(memory, traveler, childNodeId, tileId) {
  const held = own(memory, traveler);
  if (held && held[childNodeId] === tileId) return memory;
  return { ...memory, [traveler]: { ...held, [childNodeId]: tileId } };
}

/**
 * Drop the entries for the given nodes, for every traveler. Deleting or
 * regenerating a node calls this, so no entry names a child that is gone. A
 * traveler left with nothing goes too.
 * @param {EntryMemory} memory
 * @param {Iterable<string>} nodeIds
 * @returns {EntryMemory}
 */
export function forgetEntries(memory, nodeIds) {
  const doomed = new Set(nodeIds);
  if (doomed.size === 0) return memory;
  /** @type {EntryMemory} */
  const next = {};
  let changed = false;
  for (const [traveler, held] of Object.entries(memory)) {
    /** @type {Record<string, string>} */
    const kept = {};
    for (const [nodeId, tileId] of Object.entries(held)) {
      if (doomed.has(nodeId)) changed = true;
      else kept[nodeId] = tileId;
    }
    if (Object.keys(kept).length) next[traveler] = kept;
    else changed = true;
  }
  return changed ? next : memory;
}

/**
 * Keep the party's entries and drop every character's. A whole-party move
 * recalls each character to the party marker, so none of them holds a
 * location of their own, and none of their entries describes anything.
 * @param {EntryMemory} memory
 * @returns {EntryMemory}
 */
export function forgetCharacterEntries(memory) {
  const keys = Object.keys(memory);
  if (keys.every((key) => key === PARTY_TRAVELER)) return memory;
  const held = own(memory, PARTY_TRAVELER);
  return held ? { [PARTY_TRAVELER]: held } : {};
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
  /** @type {Set<string>} */
  const gone = new Set();
  for (const held of Object.values(memory)) {
    for (const nodeId of Object.keys(held)) {
      if (!nodeExists(nodeId)) gone.add(nodeId);
    }
  }
  return forgetEntries(memory, gone);
}

/**
 * One traveler's own entries, or null. The check is for an own property, not
 * `in`: a traveler key that names something on Object's prototype must read
 * as a traveler with no entries.
 * @param {EntryMemory} memory
 * @param {string} traveler
 * @returns {Record<string, string> | null}
 */
function own(memory, traveler) {
  return Object.prototype.hasOwnProperty.call(memory, traveler) ? memory[traveler] : null;
}
