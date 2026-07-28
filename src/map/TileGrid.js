import { collectSubtreeIds } from './WorldTree.js';
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
    metadata: { poiType: null, discoverable: false, discovered: false, notes: '' },
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
 * A grid dimension as a non-negative integer. A missing or non-numeric width
 * would otherwise reach the renderer's visible-range arithmetic as NaN.
 * @param {unknown} value
 * @returns {number}
 */
function dimension(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * Backfill one loaded tile: the `discovered` flag that saves predating
 * discoverable POIs lack, and every other field of the closed `Tile` shape,
 * since a hand-edited or truncated save can omit any of them. A tile whose
 * metadata is missing entirely reads as a plain undiscoverable tile.
 *
 * This is also the unpack half of the save's tile packing: `SaveManager`'s
 * `packTile` omits exactly the fields defaulted here, so the two are inverses
 * without either restating the other's idea of a default.
 * @param {Tile} tile
 * @returns {Tile}
 */
export function withTileDefaults(tile) {
  const raw = /** @type {any} */ (tile).metadata;
  const metadata = raw !== null && typeof raw === 'object' ? raw : {};
  return {
    ...tile,
    imageRef: typeof tile.imageRef === 'string' ? tile.imageRef : '',
    overlayRef: tile.overlayRef ?? null,
    revealed: tile.revealed === true,
    childNodeId: tile.childNodeId ?? null,
    metadata: {
      poiType: metadata.poiType ?? null,
      discoverable: metadata.discoverable ?? false,
      discovered: metadata.discovered ?? false,
      notes: metadata.notes ?? '',
    },
  };
}

/**
 * Backfill a loaded node with the kind/environ fields older saves predate, so
 * a node written before interiors existed loads as a plain region, and defend
 * the fields the rest of the map subsystem reads without checking: a node
 * whose `tiles` is not an array, or which holds tiles that are not records,
 * would otherwise throw here and take the whole app down at boot (an imported
 * campaign file is enough to cause it). Unreadable tiles are dropped rather
 * than repaired — a tile with no id has no place in the grid.
 * @param {MapNode} node
 * @returns {MapNode}
 */
export function withNodeDefaults(node) {
  const tiles = Array.isArray(node.tiles) ? node.tiles : [];
  return withNodeTiles(
    {
      ...node,
      name: typeof node.name === 'string' ? node.name : node.id,
      parentId: node.parentId ?? null,
      width: dimension(node.width),
      height: dimension(node.height),
      kind: node.kind ?? 'region',
      environ: node.environ ?? null,
    },
    tiles
      .filter((t) => t !== null && typeof t === 'object' && typeof t.id === 'string')
      .map(withTileDefaults),
  );
}

/**
 * A tile's overlay images as a draw-ordered list (bottom first), whether the
 * tile holds none, one, or a stack.
 * @param {Tile} tile
 * @returns {string[]}
 */
export function overlayList(tile) {
  if (!tile.overlayRef) return [];
  return Array.isArray(tile.overlayRef) ? tile.overlayRef : [tile.overlayRef];
}

/**
 * A tile array indexed by id. For callers holding a bare `Tile[]` that need
 * more than one lookup over it: the generators build a whole grid as an array
 * and then stamp a handful of ids onto it, where a `find` per stamp rescans the
 * level. Callers holding a node want `getTile`, which is already indexed.
 * @param {Tile[]} tiles
 * @returns {Map<string, Tile>}
 */
export function tilesById(tiles) {
  return new Map(tiles.map((tile) => [tile.id, tile]));
}

/**
 * Return a new node with the tile added, replacing any existing tile with the
 * same id in place (an existing tile keeps its array position).
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
 * No-op (same node) when no tile has the id.
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
  return withNodeTiles(
    { ...node, width: w, height: h },
    pruned.size ? node.tiles.filter((t) => !pruned.has(t.id)) : node.tiles,
  );
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
   * Swap the whole registry's contents for another world's nodes, keeping this
   * grid object's identity. The navigator, the party tracker, and the map canvas
   * each hold a reference to the grid they were constructed with, so adopting a
   * freshly loaded campaign in a running tab has to write through the existing
   * object rather than replace it.
   * @param {MapNode[]} nodes
   */
  replaceNodes(nodes) {
    this.nodes = new Map(nodes.map((node) => [node.id, node]));
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
          t.childNodeId && removed.has(t.childNodeId) ? { ...t, childNodeId: null } : t,
        );
        this.nodes.set(node.id, withNodeTiles(node, tiles));
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
