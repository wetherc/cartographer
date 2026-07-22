/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('./TileGrid.js').TileGrid} TileGrid */

/**
 * Tracks which MapNode is currently in view and drives zoom-in/zoom-out
 * through the node hierarchy. Pure logic, no DOM — MapCanvas/breadcrumb UI
 * call into this on tile click / breadcrumb click and re-render themselves.
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

  /** @returns {MapNode[]} root-to-current, inclusive */
  getBreadcrumb() {
    return this.grid.getBreadcrumb(this.currentNodeId);
  }

  /**
   * Zoom into the node a tile points at, if it has one. No-op if the tile
   * has no childNodeId.
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
   * Jump directly to a node in the hierarchy (e.g. clicking a breadcrumb entry).
   * @param {string} nodeId
   */
  goTo(nodeId) {
    if (!this.grid.getNode(nodeId)) throw new Error(`MapNavigator: unknown node "${nodeId}"`);
    this.currentNodeId = nodeId;
  }
}
