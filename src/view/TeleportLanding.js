import { tileIdAt } from '../map/MapGeometry.js';
import { resolveEntryTile } from '../map/EntryPoint.js';

/**
 * Where a GM teleport puts the party in a node. The party lands on the
 * node's first revealed tile, and a node with no revealed tile falls back to
 * the grid center. `resolveEntryTile` then moves that spot off a wall, deep
 * water, or an empty cell, so a teleport into a sparse or walled node (for
 * example a generated dungeon) does not strand the party.
 *
 * `firstVisit` is true when no tile of the node is revealed yet, so the
 * teleport is the node's discovery. The caller reads it before the move
 * reveals fog.
 * @param {import('../types/map.js').MapNode} node
 * @returns {{ tileId: string, firstVisit: boolean }}
 */
export function teleportLanding(node) {
  const revealed = node.tiles.find((t) => t.revealed);
  const preferred =
    revealed?.id ?? tileIdAt(Math.floor(node.width / 2), Math.floor(node.height / 2));
  return { tileId: resolveEntryTile(node, preferred), firstVisit: !revealed };
}
