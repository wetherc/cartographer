import { parseCoords, tileRect } from './MapGeometry.js';
import { groupImageChunks } from './RegionGroups.js';
import { spanBlocks } from './TilePaint.js';
import { overlayList } from './TileGrid.js';
import { MapMarkers } from './MapMarkers.js';
import { MapDecorations } from './MapDecorations.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('./RegionGroups.js').RegionGroup} RegionGroup */

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
   * @param {string} imageRef
   * @returns {HTMLImageElement}
   */
  _getImage(imageRef) {
    let img = this.imageCache.get(imageRef);
    if (!img) {
      img = new Image();
      img.src = `/${imageRef}`;
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
    if (!view.node) return;

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
    if (view.revealAll) return null;
    return new Set((view.node?.tiles ?? []).filter((t) => t.revealed).map((t) => t.id));
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
    for (const group of view.regionGroups) {
      if (group.tileIds.length < 2) continue;
      for (const chunk of groupImageChunks(view.node, group)) {
        // A fully-fogged chunk draws nothing — see _revealedIds.
        if (revealedIds && !chunk.tileIds.some((id) => revealedIds.has(id))) continue;
        for (const id of chunk.tileIds) covered.add(id);

        const topLeft = tileRect(
          chunk.minX,
          chunk.minY,
          this.tileSize,
          view.offsetX,
          view.offsetY,
          view.scale,
        );
        const bottomRight = tileRect(
          chunk.maxX,
          chunk.maxY,
          this.tileSize,
          view.offsetX,
          view.offsetY,
          view.scale,
        );
        const w = bottomRight.sx + bottomRight.size - topLeft.sx;
        const h = bottomRight.sy + bottomRight.size - topLeft.sy;
        if (
          topLeft.sx + w < 0 ||
          topLeft.sy + h < 0 ||
          topLeft.sx > view.canvasWidth ||
          topLeft.sy > view.canvasHeight
        )
          continue;

        const img = this._getImage(chunk.imageRef);
        if (img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, topLeft.sx, topLeft.sy, w, h);
        } else {
          ctx.fillStyle = '#333';
          ctx.fillRect(topLeft.sx, topLeft.sy, w, h);
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
    for (const block of frame.spanBlocks) {
      // A fully-fogged block draws nothing — see _revealedIds.
      if (revealedIds && !block.tileIds.some((id) => revealedIds.has(id))) continue;
      for (const id of block.tileIds) cover.add(id);

      const topLeft = tileRect(
        block.minX,
        block.minY,
        this.tileSize,
        view.offsetX,
        view.offsetY,
        view.scale,
      );
      const bottomRight = tileRect(
        block.maxX,
        block.maxY,
        this.tileSize,
        view.offsetX,
        view.offsetY,
        view.scale,
      );
      const w = bottomRight.sx + bottomRight.size - topLeft.sx;
      const h = bottomRight.sy + bottomRight.size - topLeft.sy;
      if (
        topLeft.sx + w < 0 ||
        topLeft.sy + h < 0 ||
        topLeft.sx > view.canvasWidth ||
        topLeft.sy > view.canvasHeight
      )
        continue;
      if (!block.tile.imageRef) continue;

      const img = this._getImage(block.tile.imageRef);
      if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, topLeft.sx, topLeft.sy, w, h);
      } else {
        ctx.fillStyle = '#333';
        ctx.fillRect(topLeft.sx, topLeft.sy, w, h);
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
    const { ctx } = this;
    const node = view.node;
    if (!node) return;
    for (const tile of node.tiles) {
      const coords = parseCoords(tile.id);
      if (!coords) continue;
      const { sx, sy, size } = tileRect(
        coords.x,
        coords.y,
        this.tileSize,
        view.offsetX,
        view.offsetY,
        view.scale,
      );
      if (sx + size < 0 || sy + size < 0 || sx > view.canvasWidth || sy > view.canvasHeight)
        continue;

      if (!tile.revealed && !view.revealAll) {
        // A distinctly lighter fill than the map backdrop and the empty-canvas
        // background, so an unexplored-but-real tile reads as fog, not void.
        ctx.fillStyle = '#48412f';
        ctx.fillRect(sx, sy, size, size);
        continue;
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
    for (const group of view.regionGroups) {
      if (revealedIds && !group.tileIds.some((id) => revealedIds.has(id))) continue;
      const topLeft = tileRect(
        group.minX,
        group.minY,
        this.tileSize,
        view.offsetX,
        view.offsetY,
        view.scale,
      );
      const bottomRight = tileRect(
        group.maxX,
        group.maxY,
        this.tileSize,
        view.offsetX,
        view.offsetY,
        view.scale,
      );
      const x = topLeft.sx;
      const y = topLeft.sy;
      const w = bottomRight.sx + bottomRight.size - topLeft.sx;
      const h = bottomRight.sy + bottomRight.size - topLeft.sy;
      if (x + w < 0 || y + h < 0 || x > view.canvasWidth || y > view.canvasHeight) continue;

      ctx.save();
      // The overlay (tint, border, name label) is clipped to the group's
      // revealed tiles, so a partly-explored region doesn't trace its full
      // extent — a differently-colored rectangle — through the fog.
      if (revealedIds) {
        const clip = new Path2D();
        for (const id of group.tileIds) {
          if (!revealedIds.has(id)) continue;
          const coords = parseCoords(id);
          if (!coords) continue;
          const r = tileRect(
            coords.x,
            coords.y,
            this.tileSize,
            view.offsetX,
            view.offsetY,
            view.scale,
          );
          clip.rect(r.sx, r.sy, r.size, r.size);
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
