/**
 * Defaults and repairs for the tiles and nodes that a save or an import
 * supplies. `withTileDefaults` and `withNodeDefaults` fill and type-check
 * every field, and `withRepairedParents` and `withRepairedLinks` break
 * parent loops and clear links to missing nodes. `SaveManager.deserialize`
 * runs them on every load.
 */

import { readLock } from './NodeLock.js';
import { withNodeTiles } from './TileIndex.js';
import { DEFAULT_TILE_METADATA } from './TileGrid.js';

/** @typedef {import('../types/map.js').Tile} Tile */
/** @typedef {import('../types/map.js').TileMetadata} TileMetadata */
/** @typedef {import('../types/map.js').MapNode} MapNode */

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
 * This is also the unpack half of the save's tile packing. `NodePack`'s
 * `packTile` omits exactly the fields defaulted here, so the two functions
 * are inverses without either one restating the other's idea of a default.
 *
 * The result always lists its fields in the order of `createTile`, then any
 * field this function does not know, then `span`. A loaded record can list
 * its fields in any order, and V8 gives each order its own hidden class. A
 * scan over tiles of several hidden classes runs about three times as slow as a
 * scan over tiles of one, and every render and fog pass is such a scan.
 * @param {Tile} tile
 * @returns {Tile}
 */
export function withTileDefaults(tile) {
  const source = /** @type {Record<string, any>} */ (tile);
  const span = source.span;
  const cells = typeof span === 'number' && Number.isFinite(span) ? Math.floor(span) : 0;
  /** @type {Record<string, any>} */
  let next = {
    id: source.id,
    imageRef: typeof source.imageRef === 'string' ? source.imageRef : '',
    overlayRef: overlayRefOf(source.overlayRef),
    metadata: metadataOf(source.metadata),
    revealed: source.revealed === true,
    childNodeId: typeof source.childNodeId === 'string' ? source.childNodeId : null,
  };
  if (hasUnknownField(source)) next = { ...next, ...unknownFields(source) };
  if (cells > 1) next.span = cells;
  return /** @type {Tile} */ (next);
}

/**
 * A loaded tile's metadata with every field checked for type:
 * `DEFAULT_TILE_METADATA` when each field has its default value, and a new
 * record otherwise.
 * @param {unknown} raw
 * @returns {TileMetadata}
 */
function metadataOf(raw) {
  const metadata = /** @type {Record<string, any>} */ (
    raw !== null && typeof raw === 'object' ? raw : {}
  );
  const poiType = /** @type {TileMetadata['poiType']} */ (
    typeof metadata.poiType === 'string' ? metadata.poiType : null
  );
  const discoverable = metadata.discoverable === true;
  const discovered = metadata.discovered === true;
  const notes = typeof metadata.notes === 'string' ? metadata.notes : '';
  if (poiType === null && !discoverable && !discovered && notes === '') {
    return DEFAULT_TILE_METADATA;
  }
  return { poiType, discoverable, discovered, notes };
}

/** The fields of a tile that `withTileDefaults` states itself. */
const TILE_FIELDS = new Set([
  'id',
  'imageRef',
  'overlayRef',
  'metadata',
  'revealed',
  'childNodeId',
  'span',
]);

/**
 * Whether a tile record has a field outside `TILE_FIELDS`. Almost no tile
 * does, so this check lets the common case skip the copy below.
 * @param {Record<string, any>} tile
 * @returns {boolean}
 */
function hasUnknownField(tile) {
  for (const key in tile) if (!TILE_FIELDS.has(key)) return true;
  return false;
}

/**
 * The fields of a tile record outside `TILE_FIELDS`, in their own order. The
 * copy uses object spread, so a key such as `__proto__` from a parsed file
 * stays a plain field and never sets the prototype of the result.
 * @param {Record<string, any>} tile
 * @returns {Record<string, any>}
 */
function unknownFields(tile) {
  const rest = { ...tile };
  for (const key of TILE_FIELDS) delete rest[key];
  return rest;
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
  const { lock: rawLock, ...rest } = node;
  const lock = readLock(rawLock);
  return withNodeTiles(
    {
      ...rest,
      ...(lock ? { lock } : {}),
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
 * Repair the parent links of a loaded node list, so every node reaches a
 * root in a finite walk. A `parentId` that is not a string, names the node
 * itself, or names a node not in the list becomes null. In a loop such as
 * `a -> b -> a`, the node whose parent closes the loop becomes a root. The
 * breadcrumb, the world tree, and every walk up the hierarchy loop forever
 * on a cycle, and an imported file alone can hold one. A node that needs
 * no repair stays the same object.
 * @param {MapNode[]} nodes
 * @returns {MapNode[]}
 */
export function withRepairedParents(nodes) {
  /** @type {Map<string, string | null>} */
  const parents = new Map();
  for (const node of nodes) parents.set(node.id, node.parentId);
  for (const [id, parentId] of parents) {
    if (typeof parentId !== 'string' || parentId === id || !parents.has(parentId)) {
      parents.set(id, null);
    }
  }
  /** @type {Set<string>} */
  const settled = new Set();
  for (const start of parents.keys()) {
    /** @type {Set<string>} */
    const path = new Set();
    /** @type {string | null} */
    let id = start;
    while (id !== null && !settled.has(id)) {
      path.add(id);
      const parentId = /** @type {string | null} */ (parents.get(id));
      if (parentId !== null && path.has(parentId)) {
        parents.set(id, null);
        break;
      }
      id = parentId;
    }
    for (const walked of path) settled.add(walked);
  }
  return nodes.map((node) =>
    node.parentId === parents.get(node.id)
      ? node
      : { ...node, parentId: parents.get(node.id) ?? null },
  );
}

/**
 * A node with every `childNodeId` that names a missing node set to null. A
 * dead link draws as a sub-map entrance, and a click on it in Play zooms
 * nowhere. A node with no dead link stays the same object.
 * @param {MapNode} node
 * @param {(id: string) => boolean} exists
 * @returns {MapNode}
 */
export function withoutDeadLinks(node, exists) {
  if (!node.tiles.some((t) => t.childNodeId !== null && !exists(t.childNodeId))) return node;
  return withNodeTiles(
    node,
    node.tiles.map((t) =>
      t.childNodeId !== null && !exists(t.childNodeId) ? { ...t, childNodeId: null } : t,
    ),
  );
}

/**
 * Clear the dead tile links of a loaded node list (see `withoutDeadLinks`).
 * `linksOf` can name every `childNodeId` of a node without a walk of its
 * tiles, and a node whose named links all resolve then stays as it is.
 * @param {MapNode[]} nodes
 * @param {(node: MapNode) => readonly string[] | undefined} [linksOf]
 * @returns {MapNode[]}
 */
export function withRepairedLinks(nodes, linksOf) {
  const ids = new Set(nodes.map((n) => n.id));
  const exists = (/** @type {string} */ id) => ids.has(id);
  return nodes.map((node) =>
    linksOf?.(node)?.every(exists) ? node : withoutDeadLinks(node, exists),
  );
}
