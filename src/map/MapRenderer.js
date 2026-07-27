import { groupImageChunks } from './RegionGroups.js';
import { spanBlocks } from './TilePaint.js';
import { overlayList } from './TileGrid.js';
import { tileAtXY } from './TileIndex.js';
import { MapMarkers } from './MapMarkers.js';
import { MapDecorations } from './MapDecorations.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('./RegionGroups.js').RegionGroup} RegionGroup */

/**
 * Cached revealed-id sets per node, keyed by the node object — the same
 * immutable-replacement invariant TileIndex relies on. Rebuilding this Set per
 * frame was a full tile scan on every pan/zoom frame.
 * @type {WeakMap<MapNode, Set<string>>}
 */
const revealedCache = new WeakMap();

/**
 * The `src` to load a tile image ref from. Built-in refs are project-relative
 * paths and need the leading slash; a GM-supplied tile's art is a `data:` URL
 * and is used as-is, since prefixing it mangles it into an unloadable path.
 * Every place that turns a ref into an image goes through here — the PNG export
 * had its own copy of this and lacked the `data:` case, so custom art exported
 * as placeholders. Pure.
 * @param {string} imageRef
 * @returns {string}
 */
export function imageSrcForRef(imageRef) {
  return imageRef.startsWith('data:') ? imageRef : `/${imageRef}`;
}

/**
 * A snapshot of everything the renderer needs to draw a frame. MapCanvas owns
 * this state (pan/zoom, current node, selection/party/cursor ids, mode flags)
 * and hands a fresh view to the renderer on every draw, so the renderer holds
 * no map state of its own beyond its image cache.
 * @typedef {Object} MapView
 * @property {number} canvasWidth
 * @property {number} canvasHeight
 * @property {MapNode | null} node
 * @property {RegionGroup[]} regionGroups
 * @property {number} offsetX
 * @property {number} offsetY
 * @property {number} scale
 * @property {boolean} revealAll draw every tile's image regardless of fog (Build mode)
 * @property {number} markerRange detection range in grid cells: encounter/NPC/POI markers only draw within this Euclidean distance of the party or a character token
 * @property {string | null} partyTileId
 * @property {string[]} [encounterTileIds] tiles carrying a live encounter, marked when revealed
 * @property {string[]} [npcTileIds] tiles holding a placed NPC, marked when revealed
 * @property {{ tileId: string, name: string }[]} [characterTokens] per-character markers, named above their tile
 * @property {string | null} selectedTileId
 * @property {string | null} cursorCellId
 * @property {boolean} focused whether the keyboard cursor outline shows
 * @property {import('./TilePaint.js').CellRect | null} marquee
 */

/**
 * Draws a MapNode's tile grid, fog, region overlays, and the party/selection/
 * cursor decorations onto a 2d context. Pure "draw from a view snapshot": it
 * reads a MapView and paints, keeping no pan/zoom or selection state itself, so
 * MapCanvas stays the single owner of interaction state. The one piece of
 * mutable state it keeps is an image cache; a freshly-loaded image calls back
 * so the canvas can re-render once the bytes arrive. This class owns the
 * terrain passes (bounds, group/span images, tiles + fog, region overlays);
 * the marker and decoration passes live in MapMarkers and MapDecorations,
 * which read this instance's ctx and tileSize through a host reference.
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
   * Unbounded is fine while refs are the built-in SVG set (small, finite);
   * add eviction before large custom raster tiles land.
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
      // Derived data shared by the passes below, computed once per frame instead
      // of once per pass (fog set three times, span blocks re-scanned, etc.).
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
      this._markers.renderPartyMarker(view);
      this._markers.renderCharacterTokens(view);
      this._decorations.renderCursor(view);
      this._renderMapBoundsBorder(view);
      this._decorations.renderCoordinates(view);
    }
    // The marker layer memoizes its detection anchors against the view object for
    // the length of a frame. Dropping that reference here keeps the renderer from
    // holding the finished view — and through it a whole node's tiles — for as
    // long as the map sits idle between draws.
    this._markers.releaseFrame();
  }

  /**
   * The revealed tile ids to fog-gate multi-tile art against, or null when
   * everything shows (Build mode). A block none of whose tiles are revealed
   * must not draw at all: the per-tile fog rects painted over it leave
   * antialiased seams at fractional zoom, tracing the block's outline through
   * the fog in a different color than the map backdrop's grid.
   * @param {MapView} view
   * @returns {Set<string> | null}
   */
  _revealedIds(view) {
    if (view.revealAll || !view.node) return null;
    let ids = revealedCache.get(view.node);
    if (!ids) {
      ids = new Set();
      for (const t of view.node.tiles) if (t.revealed) ids.add(t.id);
      revealedCache.set(view.node, ids);
    }
    return ids;
  }

  /**
   * Draw each multi-tile region block on an outdoor map as scaled images in
   * chunks of at most 2x2 tiles, so a sub-region entrance reads as a landmark
   * instead of repeated tiles — a 4x4 block gets four distinct 2x2 images, not
   * one image stretched 4x. Interiors keep per-tile rendering, as do ragged
   * groups (their bounding box would paint over neighboring tiles). The
   * per-tile pass then skips the base images of every covered tile, while its
   * fog rects and path overlays still draw per tile on top, so a partially
   * explored block reveals the scaled image piecewise and a road through a
   * region stays 1x1. Returns the covered tile ids for that skip.
   * @param {MapView} view
   * @param {{ revealedIds: Set<string> | null }} frame
   * @returns {Set<string>}
   */
  _renderGroupImages(view, frame) {
    /** @type {Set<string>} */
    const covered = new Set();
    if (!view.node || view.node.kind !== 'region') return covered;
    const { ctx } = this;
    const revealedIds = frame.revealedIds;
    // The block rect is arithmetic on the cell extent, inlined rather than taken
    // from two tileRect calls per block: this runs per chunk per frame.
    const size = this.tileSize * view.scale;
    for (const group of view.regionGroups) {
      if (group.tileIds.length < 2) continue;
      for (const chunk of groupImageChunks(view.node, group)) {
        // A fully-fogged chunk draws nothing — see _revealedIds.
        if (revealedIds && !chunk.tileIds.some((id) => revealedIds.has(id))) continue;
        for (const id of chunk.tileIds) covered.add(id);

        const x = chunk.minX * size + view.offsetX;
        const y = chunk.minY * size + view.offsetY;
        const w = (chunk.maxX - chunk.minX + 1) * size;
        const h = (chunk.maxY - chunk.minY + 1) * size;
        if (x + w < 0 || y + h < 0 || x > view.canvasWidth || y > view.canvasHeight) continue;

        const img = this._getImage(chunk.imageRef);
        if (img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, x, y, w, h);
        } else {
          ctx.fillStyle = '#333';
          ctx.fillRect(x, y, w, h);
        }
      }
    }
    return covered;
  }

  /**
   * Draw each scaled-art tile (span > 1) as one image stretched across its
   * block — purely visual sizing, independent of region links, so a landmark
   * like a 3x3 academy can dominate a town without zooming anywhere. Covered
   * cell ids are added to `cover` so the tile pass skips their base images,
   * while fog rects and path overlays still draw per tile on top (a block
   * reveals piecewise; roads across it stay 1x1), matching region-block
   * chunks. Unlike those, span art draws on interiors too.
   * @param {MapView} view
   * @param {{ revealedIds: Set<string> | null, spanBlocks: import('./TilePaint.js').SpanBlock[] }} frame
   * @param {Set<string>} cover accumulates covered tile ids
   */
  _renderSpanImages(view, frame, cover) {
    if (!view.node) return;
    const { ctx } = this;
    const revealedIds = frame.revealedIds;
    const size = this.tileSize * view.scale;
    for (const block of frame.spanBlocks) {
      // A fully-fogged block draws nothing — see _revealedIds.
      if (revealedIds && !block.tileIds.some((id) => revealedIds.has(id))) continue;
      for (const id of block.tileIds) cover.add(id);

      const x = block.minX * size + view.offsetX;
      const y = block.minY * size + view.offsetY;
      const w = (block.maxX - block.minX + 1) * size;
      const h = (block.maxY - block.minY + 1) * size;
      if (x + w < 0 || y + h < 0 || x > view.canvasWidth || y > view.canvasHeight) continue;
      if (!block.tile.imageRef) continue;

      const img = this._getImage(block.tile.imageRef);
      if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, x, y, w, h);
      } else {
        ctx.fillStyle = '#333';
        ctx.fillRect(x, y, w, h);
      }
    }
  }

  /**
   * Draw every in-view tile: fog rect when unrevealed (outside Build mode), the
   * base terrain image, any path/road overlay on top, and a POI outline. Tiles
   * in `groupCover` skip their base image — a scaled region-block image was
   * already drawn beneath them — but keep fog, overlays, and POI outlines.
   * @param {MapView} view
   * @param {Set<string>} groupCover
   */
  _renderTiles(view, groupCover) {
    const node = view.node;
    if (!node) return;
    // Invert the view transform once and walk only the visible cell range,
    // looking tiles up by coordinate — O(visible cells), where iterating
    // node.tiles was O(total tiles) with a regex parse per tile per frame, and
    // where an id lookup built and hashed a string per visible cell per frame.
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
   * Draw one visible tile — the per-cell body of _renderTiles.
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
      // A distinctly lighter fill than the map backdrop and the empty-canvas
      // background, so an unexplored-but-real tile reads as fog, not void.
      ctx.fillStyle = '#48412f';
      ctx.fillRect(sx, sy, size, size);
      return;
    }

    // A tile carrying only an overlay (a path on an as-yet-unpainted cell)
    // has an empty base, so let the map backdrop show through rather than
    // drawing a placeholder under the path.
    if (tile.imageRef && !groupCover.has(tile.id)) {
      const img = this._getImage(tile.imageRef);
      if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, sx, sy, size, size);
      } else {
        ctx.fillStyle = '#333';
        ctx.fillRect(sx, sy, size, size);
      }
    }

    // Path/road overlays draw on top of the base terrain, so a road can sit
    // on sand, snow, etc. rather than replacing the tile beneath it. A stack
    // draws bottom-up (e.g. a river channel over its shoreline).
    for (const ref of overlayList(tile)) {
      const overlay = this._getImage(ref);
      if (overlay.complete && overlay.naturalWidth > 0) {
        ctx.drawImage(overlay, sx, sy, size, size);
      }
    }

    // A drawn tile carrying a POI type gets a prominent outline. A POI marked
    // discoverable stays hidden until the party reaches it (unless authoring,
    // where the GM sees everything), so secret sites aren't given away by fog
    // reveal alone — and like the encounter/NPC markers, an outline only
    // shows within detection range of the party or a character token.
    const poiVisible =
      tile.metadata.poiType &&
      (view.revealAll ||
        ((!tile.metadata.discoverable || tile.metadata.discovered) &&
          this._markers.markerVisible(view, tile.id)));
    if (poiVisible) this._decorations.renderPoiOutline(sx, sy, size);
  }

  /**
   * Fill the node's full width x height extent with a map-area backdrop, drawn
   * before the tiles. This gives the map a definite shape even where no tile is
   * revealed, so panning past the edge is visually obvious.
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
    // Outside Build mode, a region stays hidden until the party has discovered
    // at least one of its tiles through the fog, so the overworld doesn't
    // reveal where every unexplored region sits.
    const revealedIds = frame.revealedIds;
    const size = this.tileSize * view.scale;
    for (const group of view.regionGroups) {
      if (revealedIds && !group.tileIds.some((id) => revealedIds.has(id))) continue;
      const x = group.minX * size + view.offsetX;
      const y = group.minY * size + view.offsetY;
      const w = (group.maxX - group.minX + 1) * size;
      const h = (group.maxY - group.minY + 1) * size;
      if (x + w < 0 || y + h < 0 || x > view.canvasWidth || y > view.canvasHeight) continue;

      ctx.save();
      // The overlay (tint, border, name label) is clipped to the group's
      // revealed tiles, so a partly-explored region doesn't trace its full
      // extent — a differently-colored rectangle — through the fog.
      if (revealedIds) {
        const clip = new Path2D();
        // The group carries its members' coordinates alongside their ids, so this
        // per-frame walk neither re-parses an id nor allocates a rect per tile.
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

      // The name label draws outside the clip: once any of the region's tiles
      // is discovered its name should read in full, not be cut to the revealed
      // tiles — or to the region's own bounds, which would truncate a long
      // name on a small region.
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
