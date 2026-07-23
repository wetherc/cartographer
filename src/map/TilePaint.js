import { createTile, getTile, setTile } from './TileGrid.js';
import { parseCoords } from './MapGeometry.js';
import { findRegionGroups } from './RegionGroups.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */

/**
 * Whether an "x,y" tile id falls inside a node's width x height grid. Painting
 * and erasing are no-ops outside these bounds, so a stray click past the map
 * edge can't create a tile floating outside the authored area.
 * @param {MapNode} node
 * @param {string} tileId
 * @returns {boolean}
 */
export function isInBounds(node, tileId) {
  const coords = parseCoords(tileId);
  if (!coords) return false;
  return coords.x >= 0 && coords.y >= 0 && coords.x < node.width && coords.y < node.height;
}

/**
 * Paint a tile's image at tileId, returning a new node. Painting over an
 * existing tile changes only its imageRef and keeps its metadata, childNodeId,
 * and revealed state, so re-terraining a tile never wipes the notes or region
 * link a GM already set on it. A brand-new tile starts unrevealed (fog), so
 * authored maps still reveal through play rather than starting fully explored.
 * Out-of-bounds ids are ignored.
 *
 * With overlay=true (a path/road brush) the image is layered as the tile's
 * overlayRef over the terrain, so a road can sit on sand, snow, etc. without
 * erasing what's beneath — and re-terraining beneath keeps the overlay, since
 * it's preserved by the spread above. A road is never the base layer, so an
 * overlay brush on an empty cell creates a tile with an empty base (the map
 * backdrop shows through) carrying the overlay; the GM can paint terrain under
 * it afterward without disturbing the path. An overlay brush is a no-op over a
 * tile that carries a POI marker, so a path can't be laid across a settlement,
 * dungeon, etc.
 *
 * `span` > 1 paints the image as a scaled block: the anchor tile records the
 * span and the renderer stretches its image across span x span cells (shifted
 * up/left near the far edges so the block stays in bounds). Covered neighbors
 * are untouched — the block is purely visual, so the terrain beneath survives
 * a later repaint at 1x, which also clears a tile's span. Overlays (roads)
 * always stay one cell and ignore span.
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
    return setTile(node, { ...base, overlayRef: imageRef });
  }
  const n = Math.max(1, Math.min(Math.floor(span), node.width, node.height));
  if (n > 1) {
    const coords = /** @type {{ x: number, y: number }} */ (parseCoords(tileId));
    const ax = Math.min(coords.x, node.width - n);
    const ay = Math.min(coords.y, node.height - n);
    const anchorId = `${ax},${ay}`;
    const anchor = getTile(node, anchorId) ?? createTile(anchorId, imageRef);
    return setTile(node, { ...anchor, imageRef, span: n });
  }
  const tile = existing ? { ...existing, imageRef, span: undefined } : createTile(tileId, imageRef);
  return setTile(node, tile);
}

/**
 * A scaled-art block: the anchor tile plus the inclusive rect its image is
 * stretched across.
 * @typedef {{ tile: import('../types/map.js').Tile, minX: number, minY: number, maxX: number, maxY: number, tileIds: string[] }} SpanBlock
 */

/**
 * Every scaled-art block on a node: each tile with span > 1 yields its anchor
 * plus the rect (clamped to the grid) its image covers, with the covered tile
 * ids the renderer uses to skip those cells' own base images. Pure geometry —
 * covered cells need not hold tiles.
 * @param {MapNode} node
 * @returns {SpanBlock[]}
 */
export function spanBlocks(node) {
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
      for (let x = coords.x; x <= maxX; x++) tileIds.push(`${x},${y}`);
    }
    blocks.push({ tile, minX: coords.x, minY: coords.y, maxX, maxY, tileIds });
  }
  return blocks;
}

/**
 * Remove only a tile's path/road overlay, leaving its terrain, metadata, and
 * region link intact — the dedicated "erase path" gesture, distinct from
 * eraseTile which removes the whole tile. No-op if the tile is absent or has
 * no overlay.
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
 * direction, so a marquee anchored bottom-right and released top-left still
 * yields a well-ordered rect.
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
 * The node's existing tiles whose coordinates fall inside a rect. Empty cells
 * contribute nothing — a region link lives on tiles, so linking a block only
 * ever stamps what's already painted there.
 * @param {MapNode} node
 * @param {CellRect} rect
 * @returns {import('../types/map.js').Tile[]}
 */
export function tilesInRect(node, rect) {
  return node.tiles.filter((tile) => {
    const coords = parseCoords(tile.id);
    if (!coords) return false;
    return (
      coords.x >= rect.minX && coords.x <= rect.maxX && coords.y >= rect.minY && coords.y <= rect.maxY
    );
  });
}

/**
 * Stamp a childNodeId onto every existing tile inside a rect, returning a new
 * node — the area-authoring counterpart to linking tiles one at a time in the
 * inspector. Pass null to unlink the block instead. Empty cells are skipped
 * (no tile is created), so the caller should check tilesInRect first if it
 * wants to warn about a block with nothing to link.
 * @param {MapNode} node
 * @param {CellRect} rect
 * @param {string | null} childNodeId
 * @returns {MapNode}
 */
export function linkTilesInRect(node, rect, childNodeId) {
  const targets = new Set(tilesInRect(node, rect).map((t) => t.id));
  if (!targets.size) return node;
  return {
    ...node,
    tiles: node.tiles.map((t) => (targets.has(t.id) ? { ...t, childNodeId } : t)),
  };
}

/**
 * Point a tile at a child node, or unlink it. On an outdoor ('region') node a
 * link occupies a 2x2 block — the anchor tile plus its right/below neighbors,
 * shifted up/left at the grid's far edges so the block stays in bounds — which
 * gives a sub-region a visible footprint instead of a single cell. Only
 * existing non-wall tiles that are unlinked (or already linked to the same
 * child) are stamped, so a neighboring region's block is never silently
 * overwritten; the anchor itself is always stamped. Interiors keep single-tile
 * links (a door or stair is one cell). Unlinking (null) clears the anchor's
 * whole contiguous block, so no orphaned corner keeps zooming into the child.
 * @param {MapNode} node
 * @param {string} tileId anchor tile (must exist)
 * @param {string | null} childNodeId
 * @returns {MapNode}
 */
export function stampRegionLink(node, tileId, childNodeId) {
  const anchor = parseCoords(tileId);
  if (childNodeId === null) {
    const group = findRegionGroups(node).find((g) => g.tileIds.includes(tileId));
    const clear = new Set(group ? group.tileIds : [tileId]);
    return {
      ...node,
      tiles: node.tiles.map((t) => (clear.has(t.id) ? { ...t, childNodeId: null } : t)),
    };
  }
  if (!anchor || node.kind !== 'region') {
    return {
      ...node,
      tiles: node.tiles.map((t) => (t.id === tileId ? { ...t, childNodeId } : t)),
    };
  }
  const bx = Math.max(0, Math.min(anchor.x, node.width - 2));
  const by = Math.max(0, Math.min(anchor.y, node.height - 2));
  /** @type {Set<string>} */
  const block = new Set();
  for (let x = bx; x < Math.min(bx + 2, node.width); x++) {
    for (let y = by; y < Math.min(by + 2, node.height); y++) block.add(`${x},${y}`);
  }
  return {
    ...node,
    tiles: node.tiles.map((t) =>
      t.id === tileId ||
      (block.has(t.id) &&
        (!t.childNodeId || t.childNodeId === childNodeId) &&
        !t.imageRef.includes('wall-'))
        ? { ...t, childNodeId }
        : t,
    ),
  };
}

/**
 * Guarantee that a node carries a tile linking to a child, so a generated
 * child map is always reachable from its parent instead of floating in the
 * world tree with no way in. No-op when a link already exists. Otherwise the
 * plain tile (no existing link, not a wall piece) nearest the grid centre is
 * stamped with the link — and with `markerRef` art plus a `poiType` when
 * given, so the way in reads as a place on the parent map. On a parent with no
 * eligible tile, a new tile is created at the empty cell nearest the centre
 * using `createRef` art. Returns the updated node plus which tile now links
 * (null when a link already existed, or when the grid is somehow full with
 * nothing eligible).
 * @param {MapNode} node parent node to link from
 * @param {string} childId node the link should zoom into
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
    (t) => !t.childNodeId && !t.imageRef.includes('wall-') && !t.metadata.poiType,
  );
  if (candidates.length) {
    const target = candidates.reduce((a, b) => (distToCentre(b.id) < distToCentre(a.id) ? b : a));
    const linked = {
      ...target,
      imageRef: art.markerRef ?? target.imageRef,
      childNodeId: childId,
      metadata: { ...target.metadata, poiType: art.poiType ?? target.metadata.poiType },
    };
    // Widen to the outdoor 2x2 footprint (a no-op on interiors), so generated
    // links match hand-declared ones.
    return { node: stampRegionLink(setTile(node, linked), target.id, childId), tileId: target.id };
  }

  // No paintable tile: put the link on the empty cell nearest the centre.
  const occupied = new Set(node.tiles.map((t) => t.id));
  /** @type {string | null} */
  let best = null;
  for (let y = 0; y < node.height; y++) {
    for (let x = 0; x < node.width; x++) {
      const id = `${x},${y}`;
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
 * Remove the tile at tileId, returning a new node. No-op if no tile is there.
 * @param {MapNode} node
 * @param {string} tileId
 * @returns {MapNode}
 */
export function eraseTile(node, tileId) {
  if (!getTile(node, tileId)) return node;
  return { ...node, tiles: node.tiles.filter((t) => t.id !== tileId) };
}
