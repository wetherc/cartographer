import { collectSubtreeIds } from './WorldTree.js';
import { parseCoords } from './MapCanvas.js';

/** @typedef {import('../types/map.js').Tile} Tile */
/** @typedef {import('../types/map.js').TileMetadata} TileMetadata */
/** @typedef {import('../types/map.js').MapNode} MapNode */

/**
 * Create a tile with default metadata, not yet revealed.
 * @param {string} id
 * @param {string} imageRef
 * @param {Partial<Tile>} [overrides]
 * @returns {Tile}
 */
export function createTile(id, imageRef, overrides = {}) {
  return {
    id,
    imageRef,
    overlayRef: null,
    metadata: { poiType: null, discoverable: false, notes: '' },
    revealed: false,
    childNodeId: null,
    ...overrides,
  };
}

/**
 * Create a map node (world/region/subregion/POI level) with an empty tile grid.
 * Defaults to an outdoor region with no environment tag.
 * @param {string} id
 * @param {string} name
 * @param {string | null} parentId
 * @param {number} width
 * @param {number} height
 * @param {{ kind?: import('../types/map.js').NodeKind, environ?: string | null }} [options]
 * @returns {MapNode}
 */
export function createMapNode(id, name, parentId, width, height, options = {}) {
  return {
    id,
    name,
    parentId,
    width,
    height,
    tiles: [],
    kind: options.kind ?? 'region',
    environ: options.environ ?? null,
  };
}

/**
 * Backfill a loaded node with the kind/environ fields older saves predate, so
 * a node written before interiors existed loads as a plain region.
 * @param {MapNode} node
 * @returns {MapNode}
 */
export function withNodeDefaults(node) {
  return { ...node, kind: node.kind ?? 'region', environ: node.environ ?? null };
}

/**
 * Return a new node with the tile added, replacing any existing tile with the same id.
 * @param {MapNode} node
 * @param {Tile} tile
 * @returns {MapNode}
 */
export function setTile(node, tile) {
  const tiles = node.tiles.filter((t) => t.id !== tile.id);
  tiles.push(tile);
  return { ...node, tiles };
}

/**
 * Find a tile by id within a node.
 * @param {MapNode} node
 * @param {string} tileId
 * @returns {Tile | undefined}
 */
export function getTile(node, tileId) {
  return node.tiles.find((t) => t.id === tileId);
}

/**
 * Update an existing tile's metadata within a node, returning a new node.
 * @param {MapNode} node
 * @param {string} tileId
 * @param {Partial<TileMetadata>} metadata
 * @returns {MapNode}
 */
export function updateTileMetadata(node, tileId, metadata) {
  const tiles = node.tiles.map((t) =>
    t.id === tileId ? { ...t, metadata: { ...t.metadata, ...metadata } } : t
  );
  return { ...node, tiles };
}

/**
 * Tiles whose grid coordinate falls outside a width x height bound. Used to
 * warn before a shrink prunes authored tiles; tiles with non-coordinate ids
 * have no position and are never considered out of bounds.
 * @param {MapNode} node
 * @param {number} width
 * @param {number} height
 * @returns {Tile[]}
 */
export function tilesOutsideBounds(node, width, height) {
  return node.tiles.filter((tile) => {
    const coords = parseCoords(tile.id);
    return coords !== null && (coords.x >= width || coords.y >= height);
  });
}

/**
 * Change a node's grid dimensions after creation, returning a new node.
 * Growing keeps every existing tile; shrinking prunes tiles outside the new
 * bounds (the caller is expected to confirm first via tilesOutsideBounds).
 * Dimensions clamp to at least 1x1.
 * @param {MapNode} node
 * @param {number} width
 * @param {number} height
 * @returns {MapNode}
 */
export function resizeNode(node, width, height) {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const pruned = new Set(tilesOutsideBounds(node, w, h).map((t) => t.id));
  return {
    ...node,
    width: w,
    height: h,
    tiles: pruned.size ? node.tiles.filter((t) => !pruned.has(t.id)) : node.tiles,
  };
}

/**
 * Registry of MapNodes keyed by id, forming the world→region→subregion→POI hierarchy
 * via each node's parentId.
 */
export class TileGrid {
  constructor() {
    /** @type {Map<string, MapNode>} */
    this.nodes = new Map();
  }

  /** @param {MapNode} node */
  addNode(node) {
    this.nodes.set(node.id, node);
    return node;
  }

  /**
   * @param {string} nodeId
   * @returns {MapNode | undefined}
   */
  getNode(nodeId) {
    return this.nodes.get(nodeId);
  }

  /**
   * Replace a node in the registry (e.g. after setTile/updateTileMetadata).
   * @param {MapNode} node
   */
  updateNode(node) {
    this.nodes.set(node.id, node);
  }

  /**
   * Remove a node and its entire subtree from the registry, and clear any tile
   * childNodeId in the remaining nodes that pointed at a removed node, so no
   * tile is left linking to a node that no longer exists. Returns the set of
   * removed node ids.
   * @param {string} nodeId
   * @returns {Set<string>}
   */
  removeNode(nodeId) {
    const removed = collectSubtreeIds([...this.nodes.values()], nodeId);
    for (const id of removed) this.nodes.delete(id);
    for (const node of this.nodes.values()) {
      if (node.tiles.some((t) => t.childNodeId && removed.has(t.childNodeId))) {
        const tiles = node.tiles.map((t) =>
          t.childNodeId && removed.has(t.childNodeId) ? { ...t, childNodeId: null } : t
        );
        this.nodes.set(node.id, { ...node, tiles });
      }
    }
    return removed;
  }

  /**
   * Direct children of a node, i.e. nodes whose parentId matches.
   * @param {string} nodeId
   * @returns {MapNode[]}
   */
  getChildren(nodeId) {
    return [...this.nodes.values()].filter((n) => n.parentId === nodeId);
  }

  /**
   * Breadcrumb from the root node down to (and including) the given node.
   * @param {string} nodeId
   * @returns {MapNode[]}
   */
  getBreadcrumb(nodeId) {
    /** @type {MapNode[]} */
    const path = [];
    /** @type {string | null} */
    let currentId = nodeId;
    while (currentId) {
      const node = this.nodes.get(currentId);
      if (!node) break;
      path.unshift(node);
      currentId = node.parentId;
    }
    return path;
  }

  /**
   * Resolve the node a tile zooms into, if any.
   * @param {Tile} tile
   * @returns {MapNode | undefined}
   */
  getZoomTarget(tile) {
    return tile.childNodeId ? this.nodes.get(tile.childNodeId) : undefined;
  }
}
