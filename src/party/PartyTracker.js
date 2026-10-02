import { revealLinksTo } from '../map/FogOfWar.js';
import { revealSight } from './Sight.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/map.js').PartyPosition} PartyPosition */
/** @typedef {import('../map/TileGrid.js').TileGrid} TileGrid */

/**
 * Tracks the party's current position: which node, and which tile within
 * it. This class reveals fog around that tile whenever the party moves, and
 * writes the revealed node straight back into the given TileGrid. Each move
 * also reveals the block that links to the party's node on every map above
 * it, so the world map shows the region the party is in.
 */
export class PartyTracker {
  /**
   * @param {TileGrid} grid
   * @param {PartyPosition} position
   * The first fog reveal runs here, so a caller that knows the sight rule
   * passes it as `sight`. A tracker built without it clears the fog to
   * `revealRadius` around the party at night as well as by day.
   * @param {{ revealRadius?: number, sight?: (node: MapNode) => number }} [options]
   */
  constructor(grid, position, options = {}) {
    this.grid = grid;
    /** The fixed range of markers and of the Nearby list, in tiles. */
    this.revealRadius = options.revealRadius ?? 2;
    /** @type {((node: MapNode) => number) | null} */
    this.sight = options.sight ?? null;
    this.position = position;
    this._revealAroundCurrent();
  }

  /**
   * Set how far the party sees on a node, for fog reveal only. Without it,
   * the fog clears to `revealRadius`.
   * @param {(node: MapNode) => number} sight
   */
  setSight(sight) {
    this.sight = sight;
  }

  /**
   * The radius of fog that the party clears on `node`.
   * @param {MapNode} node
   * @returns {number}
   */
  sightFor(node) {
    return this.sight ? this.sight(node) : this.revealRadius;
  }

  /**
   * Reveal what the party sees on `node` from each of `tileIds`: the sight
   * disc, and the whole room on a map with lit rooms. The caller writes the
   * result back to the grid.
   * @param {MapNode} node
   * @param {readonly string[]} tileIds
   * @returns {MapNode}
   */
  reveal(node, tileIds) {
    return revealSight(node, tileIds, this.sightFor(node));
  }

  /** @returns {PartyPosition} */
  getPosition() {
    return this.position;
  }

  /**
   * Move the party to a tile, and reveal fog around it. The tile can be in a
   * different node than the party's current one, for example after zooming
   * in or out. A walk across the node passes the tiles it went through as
   * `path`, and the fog clears around each of them too.
   * @param {string} nodeId
   * @param {string} tileId
   * @param {readonly string[]} [path] tiles of `nodeId` that the walk passed
   */
  moveTo(nodeId, tileId, path = []) {
    this.position = { nodeId, tileId };
    this._revealAroundCurrent(path);
  }

  /** @param {readonly string[]} [path] */
  _revealAroundCurrent(path = []) {
    const node = this.grid.getNode(this.position.nodeId);
    if (!node) throw new Error(`PartyTracker: unknown node "${this.position.nodeId}"`);
    this.grid.updateNode(this.reveal(node, [...path, this.position.tileId]));
    this.revealAncestors(node);
  }

  /**
   * Reveal the link tiles of `node` on its parent, and of the parent on its
   * parent, up to the root. A map above that is already revealed there stays
   * the same object, so the caches keyed on it stay warm.
   * @param {MapNode} node
   */
  revealAncestors(node) {
    let child = node;
    let parent = this.grid.getParent(child);
    while (parent) {
      const revealed = revealLinksTo(parent, child.id);
      if (revealed !== parent) this.grid.updateNode(revealed);
      child = revealed;
      parent = this.grid.getParent(revealed);
    }
  }
}
