import { groupImageChunks } from './RegionGroups.js';
import { blockRect, newBlockRect, parseCoords } from './MapGeometry.js';
import { spanBlocks } from './TilePaint.js';
import { overlayList } from './TileGrid.js';
import { tileAtXY } from './TileIndex.js';
import { MapMarkers } from './MapMarkers.js';
import { MapDecorations } from './MapDecorations.js';
import { memoizeByIdentity } from '../util/memoize.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('./RegionGroups.js').RegionGroup} RegionGroup */

/**
 * The revealed tile ids on a node, memoized on the node object. This relies
 * on the same immutable-replacement rule that TileIndex relies on.
 * Rebuilding this Set every frame ran a full tile scan on every pan or zoom frame.
 * @type {(node: MapNode) => Set<string>}
 */
const revealedIdsOf = memoizeByIdentity((node) => {
  /** @type {Set<string>} */
  const ids = new Set();
  for (const t of node.tiles) if (t.revealed) ids.add(t.id);
  return ids;
});

/**
 * Whether any of a block's tiles is revealed, and so whether the block
 * draws at all. A null set means fog of war is off, as in Build mode, and
 * everything draws. All three block passes gate on this. See _revealedIds
 * for why a fully-fogged block must draw nothing instead of being painted over.
 * @param {string[]} tileIds
 * @param {Set<string> | null} revealedIds
 * @returns {boolean}
 */
export function anyRevealed(tileIds, revealedIds) {
  if (!revealedIds) return true;
  for (const id of tileIds) if (revealedIds.has(id)) return true;
  return false;
}

/**
 * The `src` to load a tile image ref from. A built-in ref is a
 * project-relative path and needs the leading slash. A GM-supplied tile's
 * art is a `data:` URL and is used as-is, because prefixing it produces an
 * unloadable path. Every place that turns a ref into an image goes through
 * here. The PNG export used to keep its own copy of this logic and lacked
 * the `data:` case, so custom art exported as placeholders. This is a pure function.
 * @param {string} imageRef
 * @returns {string}
 */
export function imageSrcForRef(imageRef) {
  return imageRef.startsWith('data:') ? imageRef : `/${imageRef}`;
}

/**
 * A snapshot of everything the renderer needs to draw a frame. MapCanvas
 * owns this state (pan and zoom, current node, selection, party and cursor
 * ids, mode flags) and hands a fresh view to the renderer on every draw, so
 * the renderer holds no map state of its own beyond its image cache.
 * @typedef {Object} MapView
 * @property {number} canvasWidth
 * @property {number} canvasHeight
 * @property {MapNode | null} node
 * @property {RegionGroup[]} regionGroups
 * @property {number} offsetX
 * @property {number} offsetY
 * @property {number} scale
 * @property {boolean} revealAll draw every tile's image regardless of fog of war (Build mode)
 * @property {number} markerRange detection range in grid cells: encounter, NPC, and POI markers draw only within this Euclidean distance of the party or a character token
 * @property {string | null} partyTileId
 * @property {string[]} [encounterTileIds] tiles carrying a live encounter, marked when revealed
 * @property {string[]} [npcTileIds] tiles holding a placed NPC, marked when revealed
 * @property {{ tileId: string, name: string }[]} [characterTokens] per-character markers, named above their tile
 * @property {import('../types/map.js').MapExit[]} [exits] ways out of this node (see MapExits.findExits), drawn as border arrows and badges on the door or stairway they lead through. This array is empty in Build mode, where authoring the map is not the same as traveling it.
 * @property {import('../types/map.js').ExitSide | null} [armedExitSide] edge exit a cursor key has armed, drawn with emphasis: the next press of the same arrow key takes it.
 * @property {string | null} selectedTileId
 * @property {string | null} cursorCellId
 * @property {boolean} focused whether the keyboard cursor outline shows
 * @property {import('./TilePaint.js').CellRect | null} marquee
 */

/**
 * Draws a MapNode's tile grid, fog of war, region overlays, and the party,
 * selection, and cursor decorations onto a 2d context. This class draws
 * from a view snapshot: it reads a MapView and draws, keeping no pan, zoom,
 * or selection state of its own, so MapCanvas stays the single owner of
 * interaction state. The one piece of mutable state it keeps is an image
 * cache. A freshly loaded image calls back, so the canvas can draw again
 * once the bytes arrive. This class owns the terrain passes: bounds,
 * group and span images, tiles plus fog, and region overlays. The marker
 * and decoration passes live in MapMarkers and MapDecorations, which read
 * this instance's ctx and tileSize through a host reference.
 */
export class MapRenderer {
  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {{ tileSize: number, getNodeName?: (nodeId: string) => string | undefined, onImageLoad?: () => void }} options
   */
  constructor(ctx, options) {
    this.ctx = ctx;
    this.tileSize = options.tileSize;
    this.getNodeName = options.getNodeName;
    this.onImageLoad = options.onImageLoad;
    /** @type {Map<string, HTMLImageElement>} */
    this.imageCache = new Map();
    this._markers = new MapMarkers(this);
    this._decorations = new MapDecorations(this);
  }

  /**
   * The decoded image for a tile ref, loaded once and kept for the session.
   * An unbounded cache is fine while refs are the built-in SVG set, which is
   * small and finite. Add eviction before large custom raster tiles arrive.
   * @param {string} imageRef
   * @returns {HTMLImageElement}
   */
  _getImage(imageRef) {
    let img = this.imageCache.get(imageRef);
    if (!img) {
      img = new Image();
      img.src = imageSrcForRef(imageRef);
      img.onload = () => this.onImageLoad?.();
      this.imageCache.set(imageRef, img);
    }
    return img;
  }

  /**
   * Draw one frame of the map from a view snapshot.
   * @param {MapView} view
   */
  render(view) {
    const { ctx } = this;
    ctx.clearRect(0, 0, view.canvasWidth, view.canvasHeight);
    if (view.node) {
      this._renderMapBounds(view);
      // Derived data shared by the passes below, computed once per frame
      // instead of once per pass. Without this, the fog set was rebuilt
      // three times and span blocks were rescanned.
      const frame = {
        revealedIds: this._revealedIds(view),
        spanBlocks: spanBlocks(view.node),
      };
      const groupCover = this._renderGroupImages(view, frame);
      this._renderSpanImages(view, frame, groupCover);
      this._renderTiles(view, groupCover);
      this._renderRegionGroups(view, frame);
      this._decorations.renderMarquee(view);
      this._decorations.renderSelection(view);
      this._markers.renderEncounterMarkers(view);
      this._markers.renderNPCMarkers(view);
      this._markers.renderExitMarkers(view);
      this._markers.renderPartyMarker(view);
      this._markers.renderCharacterTokens(view);
      this._decorations.renderCursor(view);
      this._renderMapBoundsBorder(view);
      this._decorations.renderCoordinates(view);
      // This draws last, over the coordinate labels. The return arrows are
      // the one piece of chrome that is also a control, so nothing can draw
      // on top of them.
      this._decorations.renderEdgeExits(view);
    }
    // The marker layer memoizes its detection anchors against the view
    // object for the length of a frame. Dropping that reference here stops
    // the renderer from holding the finished view, and through it a whole
    // node's tiles, for as long as the map sits idle between draws.
    this._markers.releaseFrame();
  }

  /**
   * The revealed tile ids to fog-gate multi-tile art against, or null when
   * everything shows, as in Build mode. A block with no revealed tiles must
   * not draw at all. The per-tile fog rectangles painted over it leave
   * antialiased seams at fractional zoom, tracing the block's outline
   * through the fog in a color different from the map backdrop's grid.
   * @param {MapView} view
   * @returns {Set<string> | null}
   */
  _revealedIds(view) {
    if (view.revealAll || !view.node) return null;
    return revealedIdsOf(view.node);
  }

  /**
   * Draw each multi-tile region block on an outdoor map as scaled images in
   * chunks of at most 2x2 tiles, so a sub-region entrance reads as a
   * landmark instead of repeated tiles. A 4x4 block gets four distinct 2x2
   * images, not one image stretched 4 times. Interiors keep per-tile
   * drawing, as do ragged groups, because their bounding box paints
   * over neighboring tiles. The per-tile pass then skips the base images of
   * every covered tile, while its fog rectangles and path overlays still
   * draw per tile on top. A partially explored block then reveals the
   * scaled image piecewise, and a road through a region stays 1x1. Returns
   * the covered tile ids for that skip.
   * @param {MapView} view
   * @param {{ revealedIds: Set<string> | null }} frame
   * @returns {Set<string>}
   */
  _renderGroupImages(view, frame) {
    /** @type {Set<string>} */
    const covered = new Set();
    if (!view.node || view.node.kind !== 'region') return covered;
    const revealedIds = frame.revealedIds;
    const size = this.tileSize * view.scale;
    const rect = newBlockRect();
    for (const group of view.regionGroups) {
      if (group.tileIds.length < 2) continue;
      for (const chunk of groupImageChunks(view.node, group)) {
        // A fully-fogged chunk draws nothing. See _revealedIds.
        if (!anyRevealed(chunk.tileIds, revealedIds)) continue;
        for (const id of chunk.tileIds) covered.add(id);
        blockRect(rect, chunk, view, size);
        if (rect.visible) this._drawBlockImage(rect, chunk.imageRef);
      }
    }
    return covered;
  }

  /**
   * Draw one block's image across its whole rectangle, or a flat gray
   * placeholder while the bytes are still loading, or if the ref failed to
   * decode, so a block never leaves a hole in the map.
   * @param {import('./MapGeometry.js').BlockRect} rect
   * @param {string} imageRef
   */
  _drawBlockImage(rect, imageRef) {
    const { ctx } = this;
    const img = this._getImage(imageRef);
    if (img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h);
    } else {
      ctx.fillStyle = '#333';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }
  }

  /**
   * Draw each scaled-art tile, with span greater than 1, as one image
   * stretched across its block. This sizing is purely visual and
   * independent of region links, so a landmark such as a 3x3 academy can
   * dominate a town at any zoom level. Covered cell ids are added to
   * `cover`, so the tile pass skips their base images, while fog
   * rectangles and path overlays still draw per tile on top. A block then
   * reveals piecewise, and roads across it stay 1x1, matching region-block
   * chunks. Unlike those chunks, span art draws on interiors too.
   * @param {MapView} view
   * @param {{ revealedIds: Set<string> | null, spanBlocks: import('./TilePaint.js').SpanBlock[] }} frame
   * @param {Set<string>} cover accumulates covered tile ids
   */
  _renderSpanImages(view, frame, cover) {
    if (!view.node) return;
    const revealedIds = frame.revealedIds;
    const size = this.tileSize * view.scale;
    const rect = newBlockRect();
    for (const block of frame.spanBlocks) {
      // An imageless span block covers nothing. Its cells have no scaled
      // art drawn beneath them, so telling the tile pass to skip their base
      // images leaves them blank.
      if (!block.tile.imageRef) continue;
      // A fully-fogged block draws nothing. See _revealedIds.
      if (!anyRevealed(block.tileIds, revealedIds)) continue;
      for (const id of block.tileIds) cover.add(id);
      blockRect(rect, block, view, size);
      if (rect.visible) this._drawBlockImage(rect, block.tile.imageRef);
    }
  }

  /**
   * Draw every in-view tile: a fog rectangle when unrevealed outside Build
   * mode, the base terrain image, any path or road overlay on top, and a
   * POI outline. Tiles in `groupCover` skip their base image, because a
   * scaled region-block image was already drawn beneath them, but they keep
   * fog, overlays, and POI outlines.
   * @param {MapView} view
   * @param {Set<string>} groupCover
   */
  _renderTiles(view, groupCover) {
    const node = view.node;
    if (!node) return;
    // Invert the view transform once and walk only the visible cell range,
    // looking tiles up by coordinate. This costs O(visible cells). Iterating
    // node.tiles cost O(total tiles) with a regex parse per tile per frame,
    // and an id lookup built and hashed a string per visible cell per frame.
    const size = this.tileSize * view.scale;
    const minX = Math.max(0, Math.floor(-view.offsetX / size));
    const minY = Math.max(0, Math.floor(-view.offsetY / size));
    const maxX = Math.min(node.width - 1, Math.floor((view.canvasWidth - view.offsetX) / size));
    const maxY = Math.min(node.height - 1, Math.floor((view.canvasHeight - view.offsetY) / size));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const tile = tileAtXY(node, x, y);
        if (!tile) continue;
        const sx = x * size + view.offsetX;
        const sy = y * size + view.offsetY;
        this._renderTile(view, tile, sx, sy, size, groupCover);
      }
    }
  }

  /**
   * Draw one visible tile: the per-cell body of _renderTiles.
   * @param {MapView} view
   * @param {import('../types/map.js').Tile} tile
   * @param {number} sx
   * @param {number} sy
   * @param {number} size
   * @param {Set<string>} groupCover
   */
  _renderTile(view, tile, sx, sy, size, groupCover) {
    const { ctx } = this;
    if (!tile.revealed && !view.revealAll) {
      // This fill is distinctly lighter than the map backdrop and the
      // empty-canvas background, so an unexplored but real tile reads as
      // fog, not void.
      ctx.fillStyle = '#48412f';
      ctx.fillRect(sx, sy, size, size);
      return;
    }

    // A tile carrying only an overlay, for example a path on an
    // as-yet-unpainted cell, has an empty base. Let the map backdrop show
    // through instead of drawing a placeholder under the path.
    if (tile.imageRef && !groupCover.has(tile.id)) {
      const img = this._getImage(tile.imageRef);
      if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, sx, sy, size, size);
      } else {
        ctx.fillStyle = '#333';
        ctx.fillRect(sx, sy, size, size);
      }
    }

    // Path and road overlays draw on top of the base terrain, so a road can
    // sit on sand or snow instead of replacing the tile beneath it. A stack
    // draws bottom-up, for example a river channel over its shoreline.
    for (const ref of overlayList(tile)) {
      const overlay = this._getImage(ref);
      if (overlay.complete && overlay.naturalWidth > 0) {
        ctx.drawImage(overlay, sx, sy, size, size);
      }
    }

    // A drawn tile carrying a POI type gets a prominent outline. A POI
    // marked discoverable stays hidden until the party reaches it, unless
    // the GM is authoring the map and sees everything. A fog reveal alone
    // then does not give away a secret site. As with the encounter and NPC
    // markers, an outline shows only within detection range of the party
    // or a character token.
    const poiVisible =
      tile.metadata.poiType &&
      (view.revealAll ||
        ((!tile.metadata.discoverable || tile.metadata.discovered) &&
          this._markers.markerVisible(view, tile.id)));
    if (poiVisible) {
      // A span anchor's outline covers the whole block its art is
      // stretched across, clamped to the grid to match spanBlocks, so the
      // highlight wraps the scaled art instead of only its top-left cell.
      let extent = size;
      if (tile.span && tile.span > 1 && view.node) {
        const coords = parseCoords(tile.id);
        if (coords) {
          extent =
            size * Math.min(tile.span, view.node.width - coords.x, view.node.height - coords.y);
        }
      }
      this._decorations.renderPoiOutline(sx, sy, extent);
    }
  }

  /**
   * Fill the node's full width by height extent with a map-area backdrop,
   * drawn before the tiles. This gives the map a definite shape even where
   * no tile is revealed, so panning past the edge is visually obvious.
   * @param {MapView} view
   */
  _renderMapBounds(view) {
    const { ctx } = this;
    if (!view.node) return;
    const size = this.tileSize * view.scale;
    ctx.fillStyle = '#241f16';
    ctx.fillRect(view.offsetX, view.offsetY, view.node.width * size, view.node.height * size);
  }

  /** Stroke the node extent after tiles so the world edge is always visible.
   * @param {MapView} view */
  _renderMapBoundsBorder(view) {
    const { ctx } = this;
    if (!view.node) return;
    const size = this.tileSize * view.scale;
    ctx.save();
    ctx.strokeStyle = 'rgba(230, 215, 180, 0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(view.offsetX, view.offsetY, view.node.width * size, view.node.height * size);
    ctx.restore();
  }

  /** @param {MapView} view
   * @param {{ revealedIds: Set<string> | null }} frame */
  _renderRegionGroups(view, frame) {
    const { ctx } = this;
    // Outside Build mode, a region stays hidden until the party has
    // discovered at least one of its tiles through the fog of war, so the
    // overworld does not reveal where every unexplored region sits.
    const revealedIds = frame.revealedIds;
    const size = this.tileSize * view.scale;
    const rect = newBlockRect();
    for (const group of view.regionGroups) {
      if (!anyRevealed(group.tileIds, revealedIds)) continue;
      blockRect(rect, group, view, size);
      if (!rect.visible) continue;
      const { x, y, w, h } = rect;

      ctx.save();
      // The overlay (tint, border, name label) is clipped to the group's
      // revealed tiles, so a partly-explored region does not trace its
      // full extent, a differently colored rectangle, through the fog.
      if (revealedIds) {
        const clip = new Path2D();
        // The group carries its members' coordinates alongside their ids,
        // so this per-frame walk neither re-parses an id nor allocates a
        // rectangle per tile.
        for (let i = 0; i < group.tileIds.length; i++) {
          if (!revealedIds.has(group.tileIds[i])) continue;
          const cell = group.cells[i];
          clip.rect(cell.x * size + view.offsetX, cell.y * size + view.offsetY, size, size);
        }
        ctx.clip(clip);
      }
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      ctx.restore();

      // The name label draws outside the clip. Once any of the region's
      // tiles is discovered, its name must read in full, not cut to the
      // revealed tiles, and not cut to the region's own bounds, which
      // truncates a long name on a small region.
      const name = this.getNodeName?.(group.childNodeId);
      if (name) {
        ctx.save();
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const label = ` ${name} `;
        const metrics = ctx.measureText(label);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(x, y, metrics.width, 16);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, x, y + 2);
        ctx.restore();
      }
    }
  }
}
