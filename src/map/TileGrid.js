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
 * A grid dimension as a non-negative integer. Without this guard, a missing
 * or non-numeric width reaches the renderer's visible-range math as NaN.
 * @param {unknown} value
 * @returns {number}
 */
function dimension(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * A tile's overlay field as the renderer can draw it: one ref string, a
 * stack of ref strings, or null. An imported file can carry any value here.
 * The renderer hands every overlay to `imageSrcForRef`, which reads it as a
 * string, so a number or a record in the stack throws on every draw once the
 * save persists. A stack keeps only its string members, and an empty stack
 * reads as no overlay.
 * @param {unknown} value
 * @returns {string | string[] | null}
 */
function overlayRefOf(value) {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return null;
  const refs = value.filter((ref) => typeof ref === 'string');
  return refs.length ? refs : null;
}

/**
 * Backfill one loaded tile: the `discovered` flag that saves made before
 * discoverable POIs existed lack, and every other field of the closed
 * `Tile` shape, because a hand-edited or truncated save can omit any of
 * them. A tile with no metadata at all reads as a plain undiscoverable tile.
 *
 * Every field is also checked for type, not only for presence. The map code
 * reads these fields without a guard: `childNodeId` as a node id,
 * `poiType` as a string it capitalizes, and `span` as a cell count it loops
 * over. A value of the wrong type is replaced by the default, and a `span`
 * that is not a whole number above 1 is dropped, because a span of 1 and no
 * span mean the same one-cell image.
 *
 * This is also the unpack half of the save's tile packing. `SaveManager`'s
 * `packTile` omits exactly the fields defaulted here, so the two functions
 * are inverses without either one restating the other's idea of a default.
 * @param {Tile} tile
 * @returns {Tile}
 */
export function withTileDefaults(tile) {
  const { span, ...rest } = /** @type {Record<string, any>} */ (tile);
  const raw = rest.metadata;
  const metadata = raw !== null && typeof raw === 'object' ? raw : {};
  const cells = typeof span === 'number' && Number.isFinite(span) ? Math.floor(span) : 0;
  return /** @type {Tile} */ ({
    ...rest,
    imageRef: typeof tile.imageRef === 'string' ? tile.imageRef : '',
    overlayRef: overlayRefOf(tile.overlayRef),
    revealed: tile.revealed === true,
    childNodeId: typeof tile.childNodeId === 'string' ? tile.childNodeId : null,
    ...(cells > 1 ? { span: cells } : {}),
    metadata: {
      poiType: typeof metadata.poiType === 'string' ? metadata.poiType : null,
      discoverable: metadata.discoverable === true,
      discovered: metadata.discovered === true,
      notes: typeof metadata.notes === 'string' ? metadata.notes : '',
    },
  });
}

/**
 * Backfill a loaded node with the kind and environ fields that older saves
 * lack, so a node written before interiors existed loads as a plain region.
 * This also guards the fields the rest of the map subsystem reads without a
 * check. A node whose `tiles` is not an array, or that holds tiles that are
 * not records, throws here without this guard and takes the whole app down
 * at boot. An imported campaign file alone can cause that. Unreadable tiles
 * are dropped instead of repaired, because a tile with no id has no place
 * in the grid.
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
   * The node a tile zooms into, if it has one.
   * @param {Tile} tile
   * @returns {MapNode | undefined}
   */
  getZoomTarget(tile) {
    return tile.childNodeId ? this.nodes.get(tile.childNodeId) : undefined;
  }
}
