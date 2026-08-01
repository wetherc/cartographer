import { createTile, getTile, setTile, overlayList } from './TileGrid.js';
import { inBounds, parseCoords, tileIdAt } from './MapGeometry.js';
import { findRegionGroups } from './RegionGroups.js';
import { withNodeTiles } from './TileIndex.js';
import { kindOf } from './TilePalette.js';
import { memoizeByIdentity } from '../util/memoize.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */

/** Overlay families in draw order: shoreline under channel under road. */
const OVERLAY_ORDER = ['coast', 'river', 'road'];

/**
 * The overlay family of a built-in piece, taken from its asset path. Returns
 * null for anything else, for example a custom data: URL image.
 * @param {string} ref
 * @returns {string | null}
 */
function overlayFamily(ref) {
  const match = /\/tiles\/(coast|river|road)\//.exec(ref);
  return match ? match[1] : null;
}

/**
 * Merge a newly painted overlay into a tile's existing overlay or overlays.
 * A piece replaces any existing piece of its own family. For example,
 * repainting a road corrects the road. A piece stacks with other families in
 * the fixed draw order (coast under river under road), so a channel painted
 * across a shoreline drains through it instead of erasing it. A piece from no
 * known family, such as custom overlay art, replaces the whole stack. This
 * matches the previous behavior.
 * @param {string | string[] | null} existing
 * @param {string} imageRef
 * @returns {string | string[]}
 */
export function stackOverlay(existing, imageRef) {
  const family = overlayFamily(imageRef);
  if (!family) return imageRef;
  const kept = overlayList(
    /** @type {import('../types/map.js').Tile} */ ({ overlayRef: existing }),
  ).filter((ref) => {
    const f = overlayFamily(ref);
    return f !== null && f !== family;
  });
  const stack = [...kept, imageRef].sort(
    (a, b) =>
      OVERLAY_ORDER.indexOf(/** @type {string} */ (overlayFamily(a))) -
      OVERLAY_ORDER.indexOf(/** @type {string} */ (overlayFamily(b))),
  );
  return stack.length === 1 ? stack[0] : stack;
}

/**
 * Whether an "x,y" tile id falls inside a node's width x height grid. Paint
 * and erase actions do nothing outside these bounds. This makes sure that a
 * stray click past the map edge cannot create a tile outside the authored
 * area.
 * @param {MapNode} node
 * @param {string} tileId
 * @returns {boolean}
 */
export function isInBounds(node, tileId) {
  const coords = parseCoords(tileId);
  if (!coords) return false;
  return inBounds(node, coords.x, coords.y);
}

/**
 * Paint a tile's image at tileId, returning a new node. Painting over an
 * existing tile changes only its imageRef and keeps its metadata, childNodeId,
 * and revealed state. This makes sure that re-terraining a tile never removes
 * the notes or region link a GM has already set on it. A new tile starts
 * unrevealed by fog. This lets authored maps reveal through play instead of
 * starting fully explored. The function ignores out-of-bounds ids.
 *
 * With overlay=true (a path or road brush) the image layers as the tile's
 * overlayRef over the terrain. This lets a road sit on sand, snow, or other
 * terrain without erasing it. Re-terraining beneath keeps the overlay,
 * because the spread above preserves it. A road is never the base layer. An
 * overlay brush on an empty cell creates a tile with an empty base, so the
 * map backdrop shows through, and the tile carries the overlay. The GM can
 * paint terrain under it later without disturbing the path. An overlay brush
 * does nothing on a tile that carries a POI marker. This stops a path from
 * crossing a settlement, dungeon, or similar marker. Overlays of different
 * families stack. See stackOverlay. A river painted across a coast tile
 * layers over the shoreline instead of replacing it. Repainting within one
 * family swaps that piece.
 *
 * A span value above 1 paints the image as a scaled block. The anchor tile
 * records the span. The renderer stretches its image across span x span
 * cells, shifted up or left near the far edges so the block stays in bounds.
 * Covered neighbor tiles stay untouched, because the block is only visual.
 * The terrain beneath survives a later repaint at span 1, which also clears a
 * tile's span. Overlays such as roads always stay one cell and ignore span.
 * @param {MapNode} node
 * @param {string} tileId
 * @param {string} imageRef
 * @param {boolean} [overlay]
 * @param {number} [span]
 * @returns {MapNode}
 */
export function paintTile(node, tileId, imageRef, overlay = false, span = 1) {
  if (!isInBounds(node, tileId)) return node;
  const existing = getTile(node, tileId);
  if (overlay) {
    if (existing?.metadata.poiType) return node;
    const base = existing ?? createTile(tileId, '');
    return setTile(node, { ...base, overlayRef: stackOverlay(base.overlayRef, imageRef) });
  }
  const n = Math.max(1, Math.min(Math.floor(span), node.width, node.height));
  if (n > 1) {
    const coords = /** @type {{ x: number, y: number }} */ (parseCoords(tileId));
    const ax = Math.min(coords.x, node.width - n);
    const ay = Math.min(coords.y, node.height - n);
    const anchorId = tileIdAt(ax, ay);
    const anchor = getTile(node, anchorId) ?? createTile(anchorId, imageRef);
    return setTile(node, { ...anchor, imageRef, span: n });
  }
  const tile = existing ? { ...existing, imageRef, span: undefined } : createTile(tileId, imageRef);
  return setTile(node, tile);
}

/**
 * A scaled-art block. It holds the anchor tile plus the inclusive rect that
 * its image stretches across.
 * @typedef {{ tile: import('../types/map.js').Tile, minX: number, minY: number, maxX: number, maxY: number, tileIds: string[] }} SpanBlock
 */

/**
 * Every scaled-art block on a node. Each tile with span greater than 1 yields
 * its anchor plus the rect, clamped to the grid, that its image covers. The
 * result also lists the covered tile ids, and the renderer uses these ids to
 * skip the base images of those cells. This is pure geometry: covered cells
 * need not hold tiles. The function is memoized on the node object, which
 * every tile mutation replaces (the TileIndex contract). The renderer calls
 * this function every frame. Without the cache, a pan re-scans and
 * regex-parses every tile each frame. Treat the returned array as read-only.
 * @param {MapNode} node
 * @returns {SpanBlock[]}
 */
export const spanBlocks = memoizeByIdentity(computeSpanBlocks);

/**
 * @param {MapNode} node
 * @returns {SpanBlock[]}
 */
function computeSpanBlocks(node) {
  /** @type {SpanBlock[]} */
  const blocks = [];
  for (const tile of node.tiles) {
    if (!tile.span || tile.span <= 1) continue;
    const coords = parseCoords(tile.id);
    if (!coords) continue;
    const maxX = Math.min(coords.x + tile.span - 1, node.width - 1);
    const maxY = Math.min(coords.y + tile.span - 1, node.height - 1);
    /** @type {string[]} */
    const tileIds = [];
    for (let y = coords.y; y <= maxY; y++) {
      for (let x = coords.x; x <= maxX; x++) tileIds.push(tileIdAt(x, y));
    }
    blocks.push({ tile, minX: coords.x, minY: coords.y, maxX, maxY, tileIds });
  }
  return blocks;
}

/**
 * Remove only a tile's path or road overlay. This leaves its terrain,
 * metadata, and region link intact. This is the dedicated "erase path"
 * action, distinct from eraseTile, which removes the whole tile. The function
 * does nothing if the tile is absent or has no overlay.
 * @param {MapNode} node
 * @param {string} tileId
 * @returns {MapNode}
 */
export function erasePath(node, tileId) {
  const existing = getTile(node, tileId);
  if (!existing || !existing.overlayRef) return node;
  return setTile(node, { ...existing, overlayRef: null });
}

/**
 * A tile-coordinate rectangle, inclusive on all edges.
 * @typedef {{ minX: number, minY: number, maxX: number, maxY: number }} CellRect
 */

/**
 * The inclusive rectangle spanned by two corner cells, in either drag
 * direction. This makes sure that a marquee anchored bottom-right and
 * released top-left still yields a well-ordered rect.
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @returns {CellRect}
 */
export function normalizeRect(a, b) {
  return {
    minX: Math.min(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x),
    maxY: Math.max(a.y, b.y),
  };
}

/**
 * The node's existing tiles whose coordinates fall inside a rect. Empty
 * cells contribute nothing. A region link lives on tiles, so linking a block
 * only stamps tiles already painted there.
 * @param {MapNode} node
 * @param {CellRect} rect
 * @returns {import('../types/map.js').Tile[]}
 */
export function tilesInRect(node, rect) {
  return node.tiles.filter((tile) => {
    const coords = parseCoords(tile.id);
    if (!coords) return false;
    return (
      coords.x >= rect.minX &&
      coords.x <= rect.maxX &&
      coords.y >= rect.minY &&
      coords.y <= rect.maxY
    );
  });
}

/**
 * Stamp a childNodeId onto every existing tile inside a rect, returning a new
 * node. This is the area-authoring counterpart to linking tiles one at a
 * time in the inspector. Pass null to unlink the block instead. The function
 * skips empty cells and creates no tile there. If the caller wants to warn
 * about a block with nothing to link, call tilesInRect first.
 * @param {MapNode} node
 * @param {CellRect} rect
 * @param {string | null} childNodeId
 * @returns {MapNode}
 */
export function linkTilesInRect(node, rect, childNodeId) {
  const targets = new Set(tilesInRect(node, rect).map((t) => t.id));
  if (!targets.size) return node;
  return withNodeTiles(
    node,
    node.tiles.map((t) => (targets.has(t.id) ? { ...t, childNodeId } : t)),
  );
}

/**
 * Point a tile at a child node, or unlink it. On an outdoor ('region') node,
 * a link occupies a 2x2 block: the anchor tile plus its right and below
 * neighbors, shifted up or left at the grid's far edges so the block stays
 * in bounds. This gives a sub-region a visible footprint instead of a single
 * cell. The function stamps only existing non-wall tiles that are unlinked,
 * or already linked to the same child. This makes sure that a neighboring
 * region's block is never overwritten without warning. The function always
 * stamps the anchor itself. Interior nodes keep single-tile links, because a
 * door or stair is one cell. If the anchor already sits inside a block linked
 * to a different child, the function re-points the whole contiguous block as
 * one unit. Unlinking with null clears the block the same way. This makes
 * sure that a multi-tile entrance zooms into exactly one child, never two
 * overlapping children, and that no orphaned corner keeps the old link.
 * Re-stamping the same child falls through to the block-widening path, so
 * ensureChildLink can grow a fresh anchor.
 * @param {MapNode} node
 * @param {string} tileId anchor tile (must exist)
 * @param {string | null} childNodeId
 * @returns {MapNode}
 */
export function stampRegionLink(node, tileId, childNodeId) {
  const anchor = parseCoords(tileId);
  const group = findRegionGroups(node).find((g) => g.tileIds.includes(tileId));
  if (childNodeId === null) {
    const clear = new Set(group ? group.tileIds : [tileId]);
    return withNodeTiles(
      node,
      node.tiles.map((t) => (clear.has(t.id) ? { ...t, childNodeId: null } : t)),
    );
  }
  if (group && group.childNodeId !== childNodeId) {
    const ids = new Set(group.tileIds);
    return withNodeTiles(
      node,
      node.tiles.map((t) => (ids.has(t.id) ? { ...t, childNodeId } : t)),
    );
  }
  if (!anchor || node.kind !== 'region') {
    return withNodeTiles(
      node,
      node.tiles.map((t) => (t.id === tileId ? { ...t, childNodeId } : t)),
    );
  }
  const bx = Math.max(0, Math.min(anchor.x, node.width - 2));
  const by = Math.max(0, Math.min(anchor.y, node.height - 2));
  /** @type {Set<string>} */
  const block = new Set();
  for (let x = bx; x < Math.min(bx + 2, node.width); x++) {
    for (let y = by; y < Math.min(by + 2, node.height); y++) block.add(tileIdAt(x, y));
  }
  return withNodeTiles(
    node,
    node.tiles.map((t) =>
      t.id === tileId ||
      (block.has(t.id) &&
        (!t.childNodeId || t.childNodeId === childNodeId) &&
        kindOf(t.imageRef) !== 'wall')
        ? { ...t, childNodeId }
        : t,
    ),
  );
}

/**
 * Make sure that a node carries a tile linking to a child. This makes sure
 * that a generated child map is always reachable from its parent, instead of
 * floating in the world tree with no way in. The function does nothing if a
 * link already exists. Otherwise it stamps the link onto the plain tile
 * nearest the grid centre, that is, a tile with no existing link and not a
 * wall piece. When given, it also applies `markerRef` art and a `poiType`, so
 * the way in reads as a place on the parent map. If the parent has no
 * eligible tile, the function creates a new tile at the empty cell nearest
 * the centre, using `createRef` art. It returns the updated node plus which
 * tile now links. The tileId is null if a link already existed, or if the
 * grid is full with no eligible tile.
 * @param {MapNode} node parent node to link from
 * @param {string} childId node the link zooms into
 * @param {{ markerRef?: string | null, createRef: string, poiType?: import('../types/map.js').POIType | null }} art
 * @returns {{ node: MapNode, tileId: string | null }}
 */
export function ensureChildLink(node, childId, art) {
  if (node.tiles.some((t) => t.childNodeId === childId)) return { node, tileId: null };
  const cx = (node.width - 1) / 2;
  const cy = (node.height - 1) / 2;
  /** @param {string} id */
  const distToCentre = (id) => {
    const c = parseCoords(id);
    return c ? (c.x - cx) ** 2 + (c.y - cy) ** 2 : Infinity;
  };

  const candidates = node.tiles.filter(
    (t) => !t.childNodeId && kindOf(t.imageRef) !== 'wall' && !t.metadata.poiType,
  );
  if (candidates.length) {
    const target = candidates.reduce((a, b) => (distToCentre(b.id) < distToCentre(a.id) ? b : a));
    const linked = {
      ...target,
      imageRef: art.markerRef ?? target.imageRef,
      childNodeId: childId,
      metadata: { ...target.metadata, poiType: art.poiType ?? target.metadata.poiType },
    };
    // Widen to the outdoor 2x2 footprint. This does nothing on interiors.
    // This makes generated links match hand-declared links.
    return { node: stampRegionLink(setTile(node, linked), target.id, childId), tileId: target.id };
  }

  // No paintable tile exists. Put the link on the empty cell nearest the centre.
  const occupied = new Set(node.tiles.map((t) => t.id));
  /** @type {string | null} */
  let best = null;
  for (let y = 0; y < node.height; y++) {
    for (let x = 0; x < node.width; x++) {
      const id = tileIdAt(x, y);
      if (occupied.has(id)) continue;
      if (best === null || distToCentre(id) < distToCentre(best)) best = id;
    }
  }
  if (best === null) return { node, tileId: null };
  const created = createTile(best, art.markerRef ?? art.createRef, {
    childNodeId: childId,
    metadata: { poiType: art.poiType ?? null, discoverable: false, discovered: false, notes: '' },
  });
  return { node: setTile(node, created), tileId: best };
}

/**
 * Remove the tile at tileId, returning a new node. The function does
 * nothing if no tile exists there.
 * @param {MapNode} node
 * @param {string} tileId
 * @returns {MapNode}
 */
export function eraseTile(node, tileId) {
  if (!getTile(node, tileId)) return node;
  return withNodeTiles(
    node,
    node.tiles.filter((t) => t.id !== tileId),
  );
}
