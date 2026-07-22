import { revealAround } from '../map/FogOfWar.js';

/** @typedef {import('../types/map.js').PartyPosition} PartyPosition */
/** @typedef {import('../map/TileGrid.js').TileGrid} TileGrid */

/**
 * Tracks the party's current position (which node, which tile within it) and
 * reveals fog around that tile whenever the party moves, writing the
 * revealed node straight back into the given TileGrid.
 */
export class PartyTracker {
  /**
   * @param {TileGrid} grid
   * @param {PartyPosition} position
   * @param {{ revealRadius?: number }} [options]
   */
  constructor(grid, position, options = {}) {
    this.grid = grid;
    this.revealRadius = options.revealRadius ?? 2;
    this.position = position;
    this._revealAroundCurrent();
  }

  /** @returns {PartyPosition} */
  getPosition() {
    return this.position;
  }

  /**
   * Move the party to a tile, revealing fog around it. The tile may be in a
   * different node than the party's current one (e.g. after zooming in/out).
   * @param {string} nodeId
   * @param {string} tileId
   */
  moveTo(nodeId, tileId) {
    this.position = { nodeId, tileId };
    this._revealAroundCurrent();
  }

  _revealAroundCurrent() {
    const node = this.grid.getNode(this.position.nodeId);
    if (!node) throw new Error(`PartyTracker: unknown node "${this.position.nodeId}"`);
    this.grid.updateNode(revealAround(node, this.position.tileId, this.revealRadius));
  }
}
