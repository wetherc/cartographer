import { collectSubtreeIds } from './WorldTree.js';
import { relandedTile } from './NodeEdits.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/map.js').PartyPosition} PartyPosition */
/** @typedef {import('./EditHistory.js').EditSnapshot} EditSnapshot */
/** @typedef {import('../types/entities.js').CharacterPlacement} CharacterPlacement */
/** @typedef {import('../types/entities.js').CreaturePlacement} CreaturePlacement */
/** @typedef {import('./EntryMemory.js').EntryMemory} EntryMemory */

/**
 * What a regeneration does beyond the node's own tiles. A generated layout
 * replaces every tile of the node. Every child the old tiles linked to loses
 * its way in, and a multi-level dungeon leaves its old deeper levels behind
 * under a new level 1 with new stairs. These functions decide which nodes
 * go with the old tiles, where the party and each placed token land, and
 * what undo must record.
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
 * Where each token standing in a regenerated node goes. A token is a split
 * character or a placed creature: both hold a location of their own, and the
 * new layout can turn the tile they hold into wall or void, or shrink past
 * it. Each token follows the rule the party follows
 * (`NodeEdits.relandedTile`): a tile outside the new extent goes to the
 * layout's entry tile, and a tile inside it goes wherever the node's entry
 * rules resolve for it. A token with no location of its own, or one standing
 * in another node, is not in the result, and neither is one whose tile is
 * still good.
 *
 * `landingFor` is a callback so this function never reads a node. The caller
 * passes `EntryPoint.resolveEntryTile` bound to the regenerated node.
 * @param {{
 *   tokens: { id: string, location?: { nodeId: string, tileId: string } | null }[],
 *   nodeId: string,
 *   width: number,
 *   height: number,
 *   entry: string,
 *   landingFor: (tileId: string) => string,
 * }} opts
 * @returns {{ id: string, tileId: string }[]}
 */
export function regenerateTokenMoves({ tokens, nodeId, width, height, entry, landingFor }) {
  /** @type {{ id: string, tileId: string }[]} */
  const moves = [];
  for (const token of tokens) {
    const location = token.location ?? null;
    if (!location || location.nodeId !== nodeId) continue;
    const tileId = relandedTile({
      tileId: location.tileId,
      width,
      height,
      entry,
      landing: landingFor(location.tileId),
    });
    if (tileId) moves.push({ id: token.id, tileId });
  }
  return moves;
}

/**
 * The undo record for a regeneration. It holds the node and its parent as
 * they were, the ids of the deeper levels the generator created, the nodes
 * the regeneration removed, where the party stood, the entry memory, and the
 * locations of the characters and creatures the regeneration moved. Those
 * characters are the ones in the removed nodes, which the regeneration
 * recalls to the party marker, and the ones in the node itself, which it
 * re-lands on the new layout. The creatures are the ones in the node itself.
 * Undo needs their locations to put them back.
 * @param {{
 *   node: MapNode,
 *   parent: MapNode | null,
 *   created: string[],
 *   removed: MapNode[],
 *   party: PartyPosition,
 *   recalled: CharacterPlacement[],
 *   creatures: CreaturePlacement[],
 *   entryTiles: EntryMemory,
 * }} opts
 * @returns {EditSnapshot}
 */
export function regenerateSnapshot({
  node,
  parent,
  created,
  removed,
  party,
  recalled,
  creatures,
  entryTiles,
}) {
  return {
    nodes: parent ? [node, parent] : [node],
    created,
    removed,
    party,
    recalled,
    creatures,
    entryTiles,
  };
}
