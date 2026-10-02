/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('./TileGrid.js').TileGrid} TileGrid */

/**
 * Tracks which MapNode is currently in view and drives zoom in and zoom out
 * through the node hierarchy. This is pure logic with no DOM access. The
 * MapCanvas and breadcrumb UI call into it on a tile click or a breadcrumb
 * click, then draw themselves again.
 */
export class MapNavigator {
  /**
   * @param {TileGrid} grid
   * @param {string} rootNodeId
   */
  constructor(grid, rootNodeId) {
    this.grid = grid;
    this.currentNodeId = rootNodeId;
  }

  /** @returns {MapNode} */
  getCurrentNode() {
    const node = this.grid.getNode(this.currentNodeId);
    if (!node) throw new Error(`MapNavigator: unknown node "${this.currentNodeId}"`);
    return node;
  }

  /** @returns {MapNode[]} the path from the root node to the current node, inclusive */
  getBreadcrumb() {
    return this.grid.getBreadcrumb(this.currentNodeId);
  }

  /**
   * Zoom into the node a tile points at, if it has one. If the tile has no
   * childNodeId, this method does nothing.
   * @param {string} tileId
   * @returns {boolean} whether the zoom happened
   */
  zoomIn(tileId) {
    const tile = this.getCurrentNode().tiles.find((t) => t.id === tileId);
    if (!tile) return false;
    const target = this.grid.getZoomTarget(tile);
    if (!target) return false;
    this.currentNodeId = target.id;
    return true;
  }

  /**
   * Zoom out to the parent of the current node, if any.
   * @returns {boolean} whether the zoom happened
   */
  zoomOut() {
    const node = this.getCurrentNode();
    if (!node.parentId) return false;
    this.currentNodeId = node.parentId;
    return true;
  }

  /**
   * Jump directly to a node in the hierarchy, for example when the GM clicks a breadcrumb entry.
   * @param {string} nodeId
   */
  goTo(nodeId) {
    if (!this.grid.getNode(nodeId)) throw new Error(`MapNavigator: unknown node "${nodeId}"`);
    this.currentNodeId = nodeId;
  }
}
