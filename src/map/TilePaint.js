import { createTile, getTile, setTile, overlayList } from './TileGrid.js';
import { inBounds, parseCoords, tileIdAt } from './MapGeometry.js';
import { findRegionGroups } from './RegionGroups.js';
import { artStamp, withNodeTiles } from './TileIndex.js';
import { isBlocked, tileKind } from './TileKinds.js';
import { clamp } from '../util/num.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */

/**
 * Overlay families in draw order: shoreline under channel under road under
 * dock under lighthouse. A quay draws its own street, so it goes on top of
 * any road piece. A lighthouse stands on the shoreline, so it draws last.
 */
const OVERLAY_ORDER = ['coast', 'river', 'road', 'dock', 'lighthouse'];

/**
 * The overlay family of a built-in piece, taken from its asset path. Returns
 * null for anything else, for example a custom data: URL image.
 * @param {string} ref
 * @returns {string | null}
 */
function overlayFamily(ref) {
  const match = /\/tiles\/(coast|river|road|dock|lighthouse)\//.exec(ref);
  return match ? match[1] : null;
}

/**
 * Merge a newly painted overlay into a tile's existing overlay or overlays.
 * A piece replaces any existing piece of its own family. For example,
 * repainting a road corrects the road. A piece stacks with other families in
 * the fixed draw order (coast under river under road under dock under lighthouse), so a channel painted
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
  const n = clamp(Math.min(Math.floor(span), node.width, node.height), 1);
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
 * A scaled-art block. It keeps the anchor tile's image plus the
 * inclusive rect that the image stretches across.
 * @typedef {{ imageRef: string, minX: number, minY: number, maxX: number, maxY: number, tileIds: string[] }} SpanBlock
 */

/**
 * The span blocks of each `TileIndex.artStamp`. The stamp stands for the
 * tile ids, `imageRef` values, and `span` values at each position, which are
 * all that a block reads. A fog reveal or a notes edit keeps the stamp, so a
 * party step finds the blocks of the node before it.
 * @type {WeakMap<object, SpanBlock[]>}
 */
const spanCache = new WeakMap();

/**
 * Every scaled-art block on a node. Each tile with span greater than 1 yields
 * its anchor plus the rect, clamped to the grid, that its image covers. The
 * result also lists the covered tile ids, and the renderer uses these ids to
 * skip the base images of those cells. This is pure geometry: covered cells
 * need not hold tiles. The renderer calls this function every frame, and a
 * rebuild scans and regex-parses every tile, so the result is cached on the
 * art stamp. Treat the returned array as read-only.
 * @param {MapNode} node
 * @returns {SpanBlock[]}
 */
export function spanBlocks(node) {
  const stamp = artStamp(node);
  let blocks = spanCache.get(stamp);
  if (!blocks) {
    blocks = computeSpanBlocks(node);
    spanCache.set(stamp, blocks);
  }
  return blocks;
}

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
    blocks.push({ imageRef: tile.imageRef, minX: coords.x, minY: coords.y, maxX, maxY, tileIds });
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

/** The tile kinds of a link that the party takes as a way in, not a marker. */
const WAY_KINDS = new Set(['door', 'stairs-up', 'stairs-down']);

/**
 * Whether a tile is the entrance of a site, which the Region brush leaves
 * alone: a point-of-interest marker, a door or a staircase, or a link to an
 * interior. A region stroke drawn across a town marker or a cave mouth
 * otherwise takes the link off it, and the town or the cave has no way in.
 * The inspector's link control still changes such a tile.
 * @param {import('../types/map.js').Tile} tile
 * @param {(childNodeId: string) => boolean} isInterior whether a node id names an interior
 * @returns {boolean}
 */
export function isSiteEntrance(tile, isInterior) {
  if (tile.metadata.poiType || WAY_KINDS.has(tileKind(tile))) return true;
  return !!tile.childNodeId && isInterior(tile.childNodeId);
}

/**
 * Link one cell to a child node, the Region brush's paint, or unlink it with
 * null. A cell belongs to at most one region, so a cell that already links
 * to another child now links to this one instead, and the old region loses
 * the cell. The region link lives on the tile, so an empty cell stays empty
 * and the node comes back unchanged. A site entrance (`isSiteEntrance`) also
 * stays as it is. A cell that already has this link returns the node itself
 * too, so a drag back and forth over painted cells makes no new node.
 * @param {MapNode} node
 * @param {string} tileId
 * @param {string | null} childNodeId
 * @param {(childNodeId: string) => boolean} [isInterior] whether a node id names an interior
 * @returns {MapNode}
 */
export function paintRegion(node, tileId, childNodeId, isInterior = () => false) {
  const tile = getTile(node, tileId);
  if (!tile || (tile.childNodeId ?? null) === childNodeId) return node;
  if (isSiteEntrance(tile, isInterior)) return node;
  return setTile(node, { ...tile, childNodeId });
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
  const bx = clamp(Math.min(anchor.x, node.width - 2), 0);
  const by = clamp(Math.min(anchor.y, node.height - 2), 0);
  /** @type {Set<string>} */
  const block = new Set();
  for (let x = bx; x < Math.min(bx + 2, node.width); x++) {
    for (let y = by; y < Math.min(by + 2, node.height); y++) block.add(tileIdAt(x, y));
  }
  return withNodeTiles(
    node,
    node.tiles.map((t) =>
      t.id === tileId ||
      (block.has(t.id) && (!t.childNodeId || t.childNodeId === childNodeId) && !isBlocked(t))
        ? { ...t, childNodeId }
        : t,
    ),
  );
}

/**
 * @typedef {{
 *   markerRef?: string | null,
 *   createRef: string,
 *   poiType?: import('../types/map.js').POIType | null,
 *   genericRefs?: Set<string>,
 * }} EntranceArt
 * The art for the entrance of a child on its parent. `markerRef` and
 * `poiType` mark the entrance, and both are null for a child that takes no
 * marker, such as a wilderness. `createRef` is the plain art for a new tile
 * or for a marker that goes away. `genericRefs` lists the marker art that
 * the generator stamps for any archetype (`NodeEdits.ENTRANCE_ART`), as
 * opposed to the art of a particular place, such as an inn.
 */

/**
 * Bring the marker of an existing link to a child up to date with `art`,
 * after the child is regenerated as another archetype. A marker is a linked
 * tile with a point-of-interest type. A door or a staircase is the way in
 * itself and never changes. A marker changes when its point-of-interest
 * type differs from `art.poiType`, or when it shows generic marker art
 * other than `art.markerRef`, for example a dungeon marker over a child
 * that is now a cave. The art of a particular place stays when the type
 * matches, so an inn regenerated as a building keeps its inn. A child with
 * no marker turns the old marker into `createRef` art with no span and no
 * type. The function returns `node` itself when no marker changes.
 * @param {MapNode} node parent node
 * @param {string} childId
 * @param {EntranceArt} art
 * @returns {MapNode}
 */
export function refreshChildMarker(node, childId, art) {
  const poiType = art.poiType ?? null;
  const markerRef = art.markerRef ?? null;
  const generic = art.genericRefs ?? new Set();
  let changed = false;
  const tiles = node.tiles.map((t) => {
    const old = t.metadata.poiType;
    if (t.childNodeId !== childId || !old || WAY_KINDS.has(tileKind(t))) return t;
    const stale = old !== poiType || (generic.has(t.imageRef) && t.imageRef !== markerRef);
    if (!stale) return t;
    changed = true;
    if (markerRef) return { ...t, imageRef: markerRef, metadata: { ...t.metadata, poiType } };
    const plain = { ...t, imageRef: art.createRef, metadata: { ...t.metadata, poiType: null } };
    delete plain.span;
    return plain;
  });
  return changed ? withNodeTiles(node, tiles) : node;
}

/**
 * Make sure that a node carries a tile linking to a child. This makes sure
 * that a generated child map is always reachable from its parent, instead of
 * floating in the world tree with no way in. The function does nothing if a
 * link already exists. Otherwise it stamps the link onto the plain tile
 * nearest the grid centre, that is, a tile with no existing link that is
 * not a wall or an obstacle. When given, it also applies `markerRef` art and
 * a `poiType`, so the way in reads as a place on the parent map. If the
 * parent has no eligible tile, the function creates a new tile at the empty
 * cell nearest the centre, using `createRef` art. It returns the updated
 * node plus which tile now links. The tileId is null if a link already
 * existed, or if the grid is full with no eligible tile. When a link already
 * exists, `refreshChildMarker` brings its marker up to date with `art`.
 * @param {MapNode} node parent node to link from
 * @param {string} childId node the link zooms into
 * @param {EntranceArt} art
 * @returns {{ node: MapNode, tileId: string | null }}
 */
export function ensureChildLink(node, childId, art) {
  if (node.tiles.some((t) => t.childNodeId === childId)) {
    return { node: refreshChildMarker(node, childId, art), tileId: null };
  }
  const cx = (node.width - 1) / 2;
  const cy = (node.height - 1) / 2;
  /** @param {string} id */
  const distToCentre = (id) => {
    const c = parseCoords(id);
    return c ? (c.x - cx) ** 2 + (c.y - cy) ** 2 : Infinity;
  };

  const candidates = node.tiles.filter(
    (t) => !t.childNodeId && !isBlocked(t) && !t.metadata.poiType,
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
