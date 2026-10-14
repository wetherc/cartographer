import { collectSubtreeIds } from './WorldTreeModel.js';
import { parseCoords } from './MapGeometry.js';
import {
  tileAt,
  tilePosition,
  withNodeTiles,
  withTileAppended,
  withTileReplaced,
} from './TileIndex.js';

/** @typedef {import('../types/map.js').Tile} Tile */
/** @typedef {import('../types/map.js').TileMetadata} TileMetadata */
/** @typedef {import('../types/map.js').MapNode} MapNode */

/**
 * The metadata of a tile with no point of interest, no discovery flags, and
 * no notes: almost every tile of a campaign. Every such tile shares this one
 * object, which saves one object per tile, about 6 MB at 400 extra regions.
 *
 * The object is frozen in every build, not only while development freezing
 * is on (`TileFreeze.js`). A write to it in place would change the metadata
 * of every default tile at once. Module code runs in strict mode, so such a
 * write throws a TypeError at the write instead. Every writer replaces a
 * tile's `metadata` with a new object (`{ ...tile.metadata, poiType }`).
 * @type {Readonly<TileMetadata>}
 */
export const DEFAULT_TILE_METADATA = Object.freeze({
  poiType: null,
  discoverable: false,
  discovered: false,
  notes: '',
});

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
    metadata: DEFAULT_TILE_METADATA,
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
 * A tile's overlay images as a draw-ordered list, bottom first, whether the
 * tile holds none, one, or a stack.
 * @param {Tile} tile
 * @returns {string[]}
 */
export function overlayList(tile) {
  if (!tile.overlayRef) return [];
  return Array.isArray(tile.overlayRef) ? tile.overlayRef : [tile.overlayRef];
}

/**
 * A tile array indexed by id, for a caller holding a bare `Tile[]` that
 * needs more than one lookup over it. The generators build a whole grid as
 * an array, then stamp a handful of ids onto it, where a `find` per stamp
 * rescans the level. A caller holding a node must use `getTile`,
 * which is already indexed.
 * @param {Tile[]} tiles
 * @returns {Map<string, Tile>}
 */
export function tilesById(tiles) {
  return new Map(tiles.map((tile) => [tile.id, tile]));
}

/**
 * Return a new node with the tile added. An existing tile with the same id
 * is replaced in place and keeps its array position.
 * @param {MapNode} node
 * @param {Tile} tile
 * @returns {MapNode}
 */
export function setTile(node, tile) {
  const pos = tilePosition(node, tile.id);
  return pos === undefined ? withTileAppended(node, tile) : withTileReplaced(node, pos, tile);
}

/**
 * Find a tile by id within a node.
 * @param {MapNode} node
 * @param {string} tileId
 * @returns {Tile | undefined}
 */
export function getTile(node, tileId) {
  return tileAt(node, tileId);
}

/**
 * Update an existing tile's metadata within a node, returning a new node.
 * Returns the same node unchanged when no tile has the id.
 * @param {MapNode} node
 * @param {string} tileId
 * @param {Partial<TileMetadata>} metadata
 * @returns {MapNode}
 */
export function updateTileMetadata(node, tileId, metadata) {
  const existing = getTile(node, tileId);
  if (!existing) return node;
  return setTile(node, { ...existing, metadata: { ...existing.metadata, ...metadata } });
}

/**
 * Tiles whose grid coordinate falls outside a width by height bound. This
 * warns before a shrink prunes authored tiles. Tiles with non-coordinate
 * ids have no position and are never considered out of bounds.
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
 * Growing keeps every existing tile. Shrinking prunes tiles outside the new
 * bounds. The caller must confirm the prune first through
 * tilesOutsideBounds. Dimensions clamp to at least 1x1.
 * @param {MapNode} node
 * @param {number} width
 * @param {number} height
 * @returns {MapNode}
 */
export function resizeNode(node, width, height) {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const pruned = new Set(tilesOutsideBounds(node, w, h).map((t) => t.id));
  return withNodeTiles(
    { ...node, width: w, height: h },
    pruned.size ? node.tiles.filter((t) => !pruned.has(t.id)) : node.tiles,
  );
}

/**
 * Registry of MapNodes keyed by id. Each node's parentId links it into the
 * world-to-region-to-subregion-to-POI hierarchy.
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
   * Every node in the registry, as a new array in insertion order.
   * @returns {MapNode[]}
   */
  allNodes() {
    return [...this.nodes.values()];
  }

  /** @returns {string[]} the id of every node, in insertion order */
  nodeIds() {
    return [...this.nodes.keys()];
  }

  /** @returns {number} how many nodes the registry has */
  nodeCount() {
    return this.nodes.size;
  }

  /**
   * Replace a node in the registry, for example after setTile or updateTileMetadata.
   * @param {MapNode} node
   */
  updateNode(node) {
    this.nodes.set(node.id, node);
  }

  /**
   * Swap the whole registry's contents for another world's nodes, keeping
   * this grid object's identity. The navigator, the party tracker, and the
   * map canvas each hold a reference to the grid they were constructed
   * with. Adopting a freshly loaded campaign in a running tab must write
   * through the existing object instead of replacing it.
   * @param {MapNode[]} nodes
   */
  replaceNodes(nodes) {
    this.nodes = new Map(nodes.map((node) => [node.id, node]));
  }

  /**
   * Remove a node and its entire subtree from the registry. Clear any tile
   * childNodeId in the remaining nodes that pointed at a removed node, so
   * no tile is left linking to a node that no longer exists. Returns the
   * set of removed node ids.
   * @param {string} nodeId
   * @returns {Set<string>}
   */
  removeNode(nodeId) {
    const removed = collectSubtreeIds([...this.nodes.values()], nodeId);
    for (const id of removed) this.nodes.delete(id);
    for (const node of this.nodes.values()) {
      if (node.tiles.some((t) => t.childNodeId && removed.has(t.childNodeId))) {
        const tiles = node.tiles.map((t) =>
          t.childNodeId && removed.has(t.childNodeId) ? { ...t, childNodeId: null } : t,
        );
        this.nodes.set(node.id, withNodeTiles(node, tiles));
      }
    }
    return removed;
  }

  /**
   * The node one level up, or null. A root node has no parent, and a parentId
   * that names a node the grid no longer holds also gives null. Callers that
   * ask for a parent almost always pass it to code that takes
   * `MapNode | null`, so this never returns undefined.
   * @param {MapNode} node
   * @returns {MapNode | null}
   */
  getParent(node) {
    return node.parentId ? (this.nodes.get(node.parentId) ?? null) : null;
  }

  /**
   * Direct children of a node: nodes whose parentId matches this node's id.
   * @param {string} nodeId
   * @returns {MapNode[]}
   */
  getChildren(nodeId) {
    return [...this.nodes.values()].filter((n) => n.parentId === nodeId);
  }

  /**
   * The breadcrumb from the root node down to and including the given node.
   * The walk stops at a node it has already visited, so a parent loop that
   * a live edit creates gives a short breadcrumb instead of a frozen tab.
   * @param {string} nodeId
   * @returns {MapNode[]}
   */
  getBreadcrumb(nodeId) {
    /** @type {MapNode[]} */
    const path = [];
    /** @type {Set<string>} */
    const visited = new Set();
    /** @type {string | null} */
    let currentId = nodeId;
    while (currentId && !visited.has(currentId)) {
      const node = this.nodes.get(currentId);
      if (!node) break;
      visited.add(currentId);
      path.unshift(node);
      currentId = node.parentId;
    }
    return path;
  }

  /**
   * The node a tile zooms into, if it has one.
   * @param {Tile} tile
   * @returns {MapNode | undefined}
   */
  getZoomTarget(tile) {
    return tile.childNodeId ? this.nodes.get(tile.childNodeId) : undefined;
  }
}
