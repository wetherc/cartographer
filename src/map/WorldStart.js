import { parseCoords, tileIdAt } from './MapGeometry.js';
import { isBlocked, isDeepWater } from './TileKinds.js';

/** @typedef {import('./GeneratorTree.js').TreeNode} TreeNode */
/** @typedef {import('../types/map.js').Tile} Tile */

/** The neighbours of a cell, the four sides first and then the corners. */
const STEPS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
];

/**
 * Whether the party can start on a tile: dry land with no link and no
 * marker, so the first click in Play mode walks instead of entering a map.
 * A site past the generation budget keeps its marker art but gets no link,
 * so the marker check keeps the party off a "ruins" tile with no map.
 * @param {Tile | undefined} tile
 * @returns {tile is Tile}
 */
function isOpenLand(tile) {
  return (
    tile !== undefined &&
    !tile.childNodeId &&
    !tile.metadata.poiType &&
    !isBlocked(tile) &&
    !isDeepWater(tile) &&
    !tile.imageRef.startsWith('assets/tiles/water/')
  );
}

/**
 * The party start for a generated world: an open land tile next to the
 * first settlement, inside the region that contains it. A settlement is a
 * sub-map of a region that is itself a region, such as a village or a
 * city. A blank campaign starts the party at column 1, row 1 of the world
 * map, which a generated world often turns into open sea. With this start,
 * a GM who opens Play mode next sees the party beside a town. Returns null
 * when no region has a settlement with open land beside it.
 * @param {TreeNode[]} nodes the generated tree, top map first
 * @returns {{ nodeId: string, tileId: string } | null}
 */
export function worldStart(nodes) {
  const [top] = nodes;
  if (!top) return null;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const region of nodes) {
    if (region.parentId !== top.id || region.kind !== 'region') continue;
    const tiles = new Map(region.tiles.map((t) => [t.id, t]));
    for (const tile of region.tiles) {
      const child = tile.childNodeId ? byId.get(tile.childNodeId) : undefined;
      if (child?.kind !== 'region') continue;
      const at = /** @type {{ x: number, y: number }} */ (parseCoords(tile.id));
      for (const [dx, dy] of STEPS) {
        const id = tileIdAt(at.x + dx, at.y + dy);
        if (isOpenLand(tiles.get(id))) return { nodeId: region.id, tileId: id };
      }
    }
  }
  return null;
}
