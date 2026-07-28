/**
 * Builders for the tile grids the map suites lay out. The nested x/y loop is
 * the same everywhere; what differs is the tile a coordinate gets, so that is
 * the callback and everything else is fixed.
 */

import { createTile, setTile } from '../../src/map/TileGrid.js';

/**
 * Tiles covering a width-by-height grid, row-major. `make` receives the tile
 * id along with its coordinates and returns the tile; returning a falsy value
 * leaves that coordinate empty, which is how a sparse node is built. The
 * default is a plain grass tile.
 * @template [T=import('../../src/types/map.js').Tile]
 * @param {number} width
 * @param {number} height
 * @param {(id: string, x: number, y: number) => T | null} [make]
 * @returns {T[]}
 */
export function gridTiles(
  width,
  height,
  make = (id) => /** @type {any} */ (createTile(id, 'grass.svg')),
) {
  /** @type {T[]} */
  const tiles = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const tile = make(`${x},${y}`, x, y);
      if (tile) tiles.push(tile);
    }
  }
  return tiles;
}

/**
 * Set a tile at every coordinate of a node's own grid, one `setTile` call per
 * tile, and hand back the resulting node. Use `gridTiles` with an explicit
 * size to cover only part of a node.
 * @param {import('../../src/types/map.js').MapNode} node
 * @param {(id: string, x: number, y: number) => import('../../src/types/map.js').Tile | null} [make]
 * @returns {import('../../src/types/map.js').MapNode}
 */
export function fillTiles(node, make) {
  return gridTiles(node.width, node.height, make).reduce((acc, tile) => setTile(acc, tile), node);
}
