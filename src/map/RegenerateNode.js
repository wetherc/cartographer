import { collectSubtreeIds } from './WorldTree.js';
import { relandedTile } from './NodeEdits.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/map.js').PartyPosition} PartyPosition */
/** @typedef {import('./EditHistory.js').EditSnapshot} EditSnapshot */

/**
 * What a regeneration does beyond the node's own tiles. A generated layout
 * replaces every tile of the node. Every child the old tiles linked to loses
 * its way in, and a multi-level dungeon leaves its old deeper levels behind
 * under a new level 1 with new stairs. These functions decide which nodes
 * go with the old tiles, where the party lands, and what undo must record.
 * They are pure, so `app/generateAction.js` stays glue.
 */

/**
 * The nodes the old tiles of `node` link to, with their whole subtrees. A
 * regeneration removes these. A child that no tile links to is already
 * unreachable, and the regeneration leaves it alone. The node itself is
 * never in the result, even when a tile links back to it.
 * @param {MapNode[]} nodes every node in the grid
 * @param {MapNode} node the node being regenerated
 * @returns {MapNode[]}
 */
export function linkedDescendants(nodes, node) {
  /** @type {Set<string>} */
  const doomed = new Set();
  for (const tile of node.tiles) {
    if (!tile.childNodeId || tile.childNodeId === node.id) continue;
    for (const id of collectSubtreeIds(nodes, tile.childNodeId)) doomed.add(id);
  }
  doomed.delete(node.id);
  return nodes.filter((n) => doomed.has(n.id));
}

/**
 * Where the party goes after a regeneration, or null to stay put. A party
 * standing in a removed node lands on the new layout's entry tile. A party
 * in the node itself follows `NodeEdits.relandedTile`: it stays when its
 * tile is still walkable, and moves to the nearest walkable tile or the
 * entry otherwise. A party elsewhere does not move.
 * @param {{
 *   position: PartyPosition,
 *   nodeId: string,
 *   removedIds: Set<string>,
 *   width: number,
 *   height: number,
 *   entry: string,
 *   landing: string,
 * }} opts `landing` is `EntryPoint.resolveEntryTile`'s answer for the
 *   party's current tile on the new layout
 * @returns {PartyPosition | null}
 */
export function regenerateLanding({ position, nodeId, removedIds, width, height, entry, landing }) {
  if (removedIds.has(position.nodeId)) return { nodeId, tileId: entry };
  if (position.nodeId !== nodeId) return null;
  const tileId = relandedTile({ tileId: position.tileId, width, height, entry, landing });
  return tileId ? { nodeId, tileId } : null;
}

/**
 * The undo record for a regeneration. It holds the node and its parent as
 * they were, the ids of the deeper levels the generator created, the nodes
 * the regeneration removed, and where the party stood.
 * @param {{
 *   node: MapNode,
 *   parent: MapNode | null,
 *   created: string[],
 *   removed: MapNode[],
 *   party: PartyPosition,
 * }} opts
 * @returns {EditSnapshot}
 */
export function regenerateSnapshot({ node, parent, created, removed, party }) {
  return { nodes: parent ? [node, parent] : [node], created, removed, party };
}
