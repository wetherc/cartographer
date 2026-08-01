/** @typedef {import('../types/map.js').Tile} Tile */

/**
 * Whether a tile entering a node is frozen. This is on in development and off
 * otherwise. Freezing turns a write to a tile the map subsystem already holds
 * into a TypeError at the write, which makes the mistake easy to find. A
 * throw reaching a GM mid-session is worse than the stale draw it replaces.
 * Detection covers the two places the code runs before release: Node (the
 * test suite and any tooling) and the documented HTTP dev server.
 * `setTileFreezing` overrides it for a benchmark or a test that needs the
 * other behavior.
 */
let enabled = detectDevelopment();

/**
 * @returns {boolean}
 */
function detectDevelopment() {
  // Read through globalThis, not the bare name. `process` exists only under
  // Node, so it carries no type here.
  const process = /** @type {any} */ (globalThis).process;
  if (typeof process?.versions?.node === 'string') {
    return process.env?.NODE_ENV !== 'production';
  }
  const location = globalThis.location;
  if (!location || location.protocol !== 'http:') return false;
  return location.hostname === 'localhost' || location.hostname === '127.0.0.1';
}

/**
 * Turn tile freezing on or off, returning the previous setting so a caller can
 * restore it.
 * @param {boolean} value
 * @returns {boolean}
 */
export function setTileFreezing(value) {
  const previous = enabled;
  enabled = value;
  return previous;
}

/**
 * @returns {boolean}
 */
export function isTileFreezingEnabled() {
  return enabled;
}

/**
 * Freeze one tile against in-place changes and return the same tile. This
 * covers the two nested values a tile owns: its `metadata` record and an
 * `overlayRef` stack. Both are handed out by reference (`overlayList` returns
 * the array itself), so freezing only the tile leaves
 * `tile.metadata.notes = x` and an overlay `push` silently working. A tile
 * that is already frozen is returned untouched. This keeps re-freezing a
 * whole node's tiles cheap.
 * @param {Tile} tile
 * @returns {Tile}
 */
export function freezeTile(tile) {
  if (!enabled || Object.isFrozen(tile)) return tile;
  if (tile.metadata) Object.freeze(tile.metadata);
  if (Array.isArray(tile.overlayRef)) Object.freeze(tile.overlayRef);
  return Object.freeze(tile);
}

/**
 * Freeze a node's whole tile list: every tile plus the array itself. Neither
 * a tile's fields nor the list membership can then be written in place. This
 * returns the same array.
 *
 * The cost is O(tiles) twice over, because freezing an array walks its
 * elements to make each position non-writable. This function belongs on a
 * node-entry path, never on a per-cell path. Freezing the list inside the
 * paint and fog mutation helpers measured 0.81 ms per 40-cell drag at 30x30
 * and 7.78 ms at 100x100, the whole cost those helpers exist to remove.
 * Those helpers freeze the tiles they were handed instead and leave the list
 * itself writable.
 * @param {Tile[]} tiles
 * @returns {Tile[]}
 */
export function freezeTiles(tiles) {
  if (!enabled || Object.isFrozen(tiles)) return tiles;
  for (const tile of tiles) freezeTile(tile);
  return /** @type {Tile[]} */ (Object.freeze(tiles));
}
