/** @typedef {import('../types/map.js').MapNode} MapNode */

/**
 * The child nodes whose link tiles came out of the fog between two versions
 * of one node, in tile order and each named once. A link whose other tiles
 * were already revealed is not new. A discoverable site that the party has
 * not found yet stays out, because the map still hides it. The move that
 * reveals the tiles passes the two versions, and the travelogue logs each
 * site as sighted.
 * @param {MapNode} before
 * @param {MapNode} after
 * @returns {string[]}
 */
export function sightedLinks(before, after) {
  if (before === after) return [];
  /** @type {Set<string>} */
  const seen = new Set();
  for (const tile of before.tiles) {
    if (tile.childNodeId && tile.revealed) seen.add(tile.childNodeId);
  }
  /** @type {string[]} */
  const sighted = [];
  for (const tile of after.tiles) {
    const id = tile.childNodeId;
    if (!id || !tile.revealed || seen.has(id)) continue;
    if (tile.metadata.discoverable && !tile.metadata.discovered) continue;
    seen.add(id);
    sighted.push(id);
  }
  return sighted;
}
