import { groupImageChunks } from './RegionGroups.js';
import { blockRect, cellEdge, newBlockRect, parseCoords } from './MapGeometry.js';
import { spanBlocks } from './TilePaint.js';
import { overlayList } from './TileGrid.js';
import { revealedIds as revealedIdsOf, tileAtXY } from './TileIndex.js';
import { MapMarkers } from './MapMarkers.js';
import { MapDecorations } from './MapDecorations.js';
import { TileRaster, imageSrcForRef, rasterSize } from './TileRaster.js';
import { INK } from './CanvasInk.js';
import { frontierIds } from './FogOfWar.js';
import { renderRegionNames, renderRegionOverlays } from './RegionOverlay.js';
import { isBlankMap } from './BlankMap.js';
import { TerrainLayer } from './TerrainLayer.js';

// Re-exported because callers outside the map, such as the handout panel and
// the PNG export, resolve a ref through this module.
export { imageSrcForRef };

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('./RegionGroups.js').RegionGroup} RegionGroup */

/** @typedef {import('./TileIndex.js').RevealedIds} RevealedIds */

/**
 * Whether any of a block's tiles is revealed, and so whether the block
 * draws at all. A null set means fog of war is off, as in Build mode, and
 * everything draws. All three block passes gate on this. See _revealedIds
 * for why a fully-fogged block must draw nothing instead of being painted over.
 * @param {string[]} tileIds
 * @param {RevealedIds | null} revealedIds
 * @returns {boolean}
 */
export function anyRevealed(tileIds, revealedIds) {
  if (!revealedIds) return true;
  for (const id of tileIds) if (revealedIds.has(id)) return true;
  return false;
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
 * @property {boolean} [fogDim] draw unrevealed tiles as art under a see-through fog (a GM outside Build mode). POI outlines and exit badges on those tiles stay hidden, and creature markers follow the detection range as under solid fog.
 * @property {number} markerRange detection range in grid cells: encounter, NPC, and POI markers draw only within this Euclidean distance of the party or a character token
 * @property {string | null} partyTileId
 * @property {boolean} [partyInNode] false when partyTileId is the link toward the party on a map above it. That tile is not a marker anchor.
 * @property {string[]} [encounterTileIds] tiles carrying a live encounter, marked within detection range
 * @property {string[]} [npcTileIds] tiles holding a placed NPC, marked within detection range
 * @property {string[]} [handoutTileIds] tiles with a hidden handout, badged for the GM at any range
 * @property {{ tileId: string, name: string }[]} [characterTokens] per-character markers, named above their tile
 * @property {import('../types/map.js').MapExit[]} [exits] ways out of this node (see MapExits.findExits), drawn as border arrows and badges on the door or stairway they lead through. This array is empty in Build mode, where authoring the map is not the same as traveling it.
 * @property {import('./ExitBands.js').Rect[]} [occluders] rects in buffer px that HTML over the canvas covers. Edge exit bands move off them.
 * @property {import('../types/map.js').ExitSide | null} [armedExitSide] edge exit a cursor key has armed, drawn with emphasis: the next press of the same arrow key takes it.
 * @property {string | null} selectedTileId
 * @property {string | null} [highlightRegionId] the child node whose region blocks draw with a stronger tint and border (the target of the Region brush)
 * @property {string | null} cursorCellId
 * @property {boolean} focused whether the keyboard cursor outline shows
 * @property {number} [pixelRatio] buffer pixels per CSS pixel, from devicePixelRatio. A label sized in CSS pixels multiplies by it, so it reads at one size on every screen. It defaults to 1.
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
   * @param {{ tileSize: number, getNodeName?: (nodeId: string) => string | undefined, onImageLoad?: () => void, rasterize?: boolean, raster?: TileRaster, createCanvas?: (width: number, height: number) => HTMLCanvasElement | null, layer?: boolean }} options
   */
  constructor(ctx, options) {
    this.ctx = ctx;
    this.tileSize = options.tileSize;
    this.getNodeName = options.getNodeName;
    this.onImageLoad = options.onImageLoad;
    // Offscreen canvases for cached sprites. Tests inject a fake, and
    // without a DOM the default returns null, which draws straight onto ctx.
    this.createCanvas = options.createCanvas;
    // A caller that rebuilds this class per draw, such as the generator
    // preview, passes its own cache in. Otherwise every rebuild re-rasterizes
    // art it already has.
    // The live map caches its terrain across a pan. A one-shot render, such
    // as the PNG export or the generator preview, draws each pass direct.
    /** @type {TerrainLayer | null} */
    this._terrain = options.layer ? new TerrainLayer({ createCanvas: this.createCanvas }) : null;
    this._raster =
      options.raster ??
      new TileRaster({
        onLoad: () => {
          // Art that finishes loading replaces a placeholder fill in the layer.
          this._terrain?.invalidate();
          this.onImageLoad?.();
        },
        enabled: options.rasterize ?? true,
      });
    this._markers = new MapMarkers(this);
    this._decorations = new MapDecorations(this);
  }

  /**
   * The decoded source images, keyed by ref. The PNG export seeds this map
   * from the live canvas, and the generator preview shares one map across its
   * rerenders, so it stays part of this class's surface.
   * @returns {Map<string, HTMLImageElement>}
   */
  get imageCache() {
    return this._raster.images;
  }

  /**
   * The per-frame data shared by the render passes. `vectorBlocks` is
   * filled by the block passes and read by the grid pass, so the frame
   * object is also how those passes talk to each other within one draw.
   * @typedef {{
   *   revealedIds: RevealedIds | null,
   *   spanBlocks: import('./TilePaint.js').SpanBlock[],
   *   vectorBlocks: { x: number, y: number, w: number, h: number }[],
   * }} Frame
   */

  /**
   * Draw one frame of the map from a view snapshot.
   * @param {MapView} snapshot
   */
  render(snapshot) {
    const { ctx } = this;
    // The terrain layer copies pixels at whole-pixel offsets. Every pass
    // draws from the same rounded offsets, so markers and labels stay on the
    // pixels of the tiles they mark. Hit testing uses the unrounded offsets,
    // at most half a pixel away.
    const view = this._terrain
      ? {
          ...snapshot,
          offsetX: Math.round(snapshot.offsetX),
          offsetY: Math.round(snapshot.offsetY),
        }
      : snapshot;
    ctx.clearRect(0, 0, view.canvasWidth, view.canvasHeight);
    if (view.node) {
      // Derived data shared by the passes below, computed once per frame
      // instead of once per pass. Without this, the fog set was rebuilt
      // three times and span blocks were rescanned.
      const frame = this._frame(view);
      const size = this.tileSize * view.scale;
      const layered = this._terrain?.draw(ctx, view, size, (layerCtx, layerView) => {
        this.ctx = layerCtx;
        try {
          this._renderTerrain(layerView, this._frame(layerView));
        } finally {
          this.ctx = ctx;
        }
      });
      if (!layered) this._renderTerrain(view, frame);
      // An empty map in Play mode draws no grid (see _renderTerrain) and no
      // coordinate labels, so the empty-state card sits on a plain canvas.
      // Build mode draws them, because the GM paints the first tiles against
      // the grid.
      const bare = !view.revealAll && isBlankMap(view.node);
      this._renderRegionGroups(view, frame);
      this._decorations.renderSelection(view);
      // Names draw after the selection outline, so the outline never cuts
      // through a name plate.
      this._renderRegionNames(view, frame);
      this._markers.renderEncounterMarkers(view);
      this._markers.renderNPCMarkers(view);
      this._markers.renderHandoutMarkers(view);
      this._markers.renderExitMarkers(view);
      this._markers.renderPartyMarker(view);
      this._markers.renderCharacterTokens(view);
      this._decorations.renderCursor(view);
      if (!bare) {
        this._renderMapBoundsBorder(view);
        this._decorations.renderCoordinates(view);
      }
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
   * The derived data that the passes of one draw share.
   * @param {MapView} view
   * @returns {Frame}
   */
  _frame(view) {
    return {
      revealedIds: this._revealedIds(view),
      spanBlocks: view.node ? spanBlocks(view.node) : [],
      vectorBlocks: [],
    };
  }

  /**
   * The terrain passes: the map backdrop, the region-block and span images,
   * the tiles, and the cell grid. They read only what `terrainKey` lists and
   * the scale, so `TerrainLayer` can cache their pixels across a pan. They
   * draw onto this.ctx, which is the layer context while the layer paints.
   * @param {MapView} view
   * @param {Frame} frame
   */
  _renderTerrain(view, frame) {
    if (!view.node) return;
    this._renderMapBounds(view);
    const groupCover = this._renderGroupImages(view, frame);
    this._renderSpanImages(view, frame, groupCover);
    this._renderTiles(view, groupCover);
    if (view.revealAll || !isBlankMap(view.node)) this._renderCellGrid(view, frame);
  }

  /**
   * The revealed tile ids to fog-gate multi-tile art against, or null when
   * everything shows, as in Build mode. A block with no revealed tiles must
   * not draw at all. The per-tile fog rectangles painted over it leave
   * antialiased seams at fractional zoom, tracing the block's outline
   * through the fog in a color different from the map backdrop's grid.
   * @param {MapView} view
   * @returns {RevealedIds | null}
   */
  _revealedIds(view) {
    if (view.revealAll || view.fogDim || !view.node) return null;
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
   * @param {Frame} frame
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
        if (rect.visible) this._drawBlockImage(rect, chunk.imageRef, frame);
      }
    }
    return covered;
  }

  /**
   * Draw one block's image across its whole rectangle, or a flat gray
   * placeholder while the bytes are still loading, or if the ref failed to
   * decode, so a block never leaves a hole in the map.
   *
   * A block wider or taller than the raster ceiling draws from the vector
   * art, which keeps the partly transparent outer pixel row that single
   * rastered tiles lose. Its rectangle is recorded on the frame so the cell
   * grid pass leaves it alone instead of ruling a second line over that
   * natural boundary. The placeholder fill is opaque and carries no such
   * boundary, so it is not recorded.
   * @param {import('./MapGeometry.js').BlockRect} rect
   * @param {string} imageRef
   * @param {{ vectorBlocks: { x: number, y: number, w: number, h: number }[] }} frame
   */
  _drawBlockImage(rect, imageRef, frame) {
    const { ctx } = this;
    const img = this._raster.source(imageRef, rect.w, rect.h);
    if (img) {
      ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h);
      if (!rasterSize(rect.w) || !rasterSize(rect.h)) {
        frame.vectorBlocks.push({ x: rect.x, y: rect.y, w: rect.w, h: rect.h });
      }
    } else {
      ctx.fillStyle = INK.missingArt;
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
   * @param {Frame} frame
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
      if (!block.imageRef) continue;
      // A fully-fogged block draws nothing. See _revealedIds.
      if (!anyRevealed(block.tileIds, revealedIds)) continue;
      for (const id of block.tileIds) cover.add(id);
      blockRect(rect, block, view, size);
      if (rect.visible) this._drawBlockImage(rect, block.imageRef, frame);
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
    const frontier = frontierIds(node);
    // Cell rectangles come from the rounded edges of cellEdge, not from a
    // fractional position and width. Neighboring cells then share each edge
    // pixel exactly, with the grid line of _renderCellGrid on top of it.
    for (let y = minY; y <= maxY; y++) {
      const sy = cellEdge(y, size, view.offsetY);
      const h = cellEdge(y + 1, size, view.offsetY) - sy;
      for (let x = minX; x <= maxX; x++) {
        const tile = tileAtXY(node, x, y);
        if (!tile) continue;
        const sx = cellEdge(x, size, view.offsetX);
        const w = cellEdge(x + 1, size, view.offsetX) - sx;
        this._renderTile(view, tile, sx, sy, w, h, groupCover, frontier);
      }
    }
  }

  /**
   * Rule a one-pixel line along every cell boundary in view, so a GM can count
   * cells and match a tile to its coordinate labels.
   *
   * This grid used to be an accident. Each tile was drawn straight from its
   * SVG, and the rasterizer left the outermost pixel row of each tile
   * partly transparent, so the dark map backdrop showed through at every
   * boundary. Drawing tiles from a cached raster fills those pixels, which
   * took the grid away. It is drawn on purpose here instead, in the backdrop
   * color it used to come from.
   *
   * The grid stops at the fog, because a flat fog rectangle never showed the
   * backdrop through and so never carried a grid. Cells are clipped rather
   * than stroked one at a time, which would draw every shared boundary twice
   * and leave it darker than the outer edges.
   * A block past the raster ceiling drew from the vector art and so kept
   * its natural boundary. Its rectangle is clipped out here, which also
   * keeps its interior clear, the look every block had before the raster
   * cache when covered cells drew no per-tile image.
   * @param {MapView} view
   * @param {Frame} frame
   */
  _renderCellGrid(view, frame) {
    const node = view.node;
    if (!node) return;
    const { ctx } = this;
    const size = this.tileSize * view.scale;
    // A grid finer than about three pixels per cell reads as a flat wash over
    // the terrain rather than as lines.
    if (size < 3) return;
    // A tile drawn straight from the vector art still carries the natural
    // boundary: its outermost pixel row is partly transparent. That is the
    // case when rasterizing is off, as in the PNG export, and past the
    // raster size ceiling, as in a deep zoom. Ruling the explicit grid over
    // the natural one would darken every boundary.
    if (!this._raster.enabled || !rasterSize(size)) return;
    const minX = Math.max(0, Math.floor(-view.offsetX / size));
    const minY = Math.max(0, Math.floor(-view.offsetY / size));
    const maxX = Math.min(node.width, Math.ceil((view.canvasWidth - view.offsetX) / size));
    const maxY = Math.min(node.height, Math.ceil((view.canvasHeight - view.offsetY) / size));
    const left = cellEdge(minX, size, view.offsetX);
    const right = cellEdge(maxX, size, view.offsetX);
    const top = cellEdge(minY, size, view.offsetY);
    const bottom = cellEdge(maxY, size, view.offsetY);

    ctx.save();
    if (frame.revealedIds) {
      // The clip rectangles come from the same rounded edges as the tiles,
      // so the clip never shaves an antialiased sliver off a grid line.
      const clip = new Path2D();
      for (let y = minY; y < maxY; y++) {
        const cy = cellEdge(y, size, view.offsetY);
        const ch = cellEdge(y + 1, size, view.offsetY) - cy;
        for (let x = minX; x < maxX; x++) {
          if (!tileAtXY(node, x, y)?.revealed) continue;
          const cx = cellEdge(x, size, view.offsetX);
          clip.rect(cx, cy, cellEdge(x + 1, size, view.offsetX) - cx, ch);
        }
      }
      ctx.clip(clip);
    }
    if (frame.vectorBlocks.length > 0) {
      // The view rectangle with each vector-drawn block cut out of it. The
      // even-odd rule is what turns the inner rectangles into holes.
      const keep = new Path2D();
      keep.rect(left, top, right - left, bottom - top);
      for (const block of frame.vectorBlocks) keep.rect(block.x, block.y, block.w, block.h);
      ctx.clip(keep, 'evenodd');
    }
    ctx.strokeStyle = 'rgba(36, 31, 22, 0.55)';
    ctx.lineWidth = 1;
    // One path for every line, so the whole grid costs one stroke call.
    ctx.beginPath();
    for (let x = minX; x <= maxX; x++) {
      const sx = cellEdge(x, size, view.offsetX) + 0.5;
      ctx.moveTo(sx, top);
      ctx.lineTo(sx, bottom);
    }
    for (let y = minY; y <= maxY; y++) {
      const sy = cellEdge(y, size, view.offsetY) + 0.5;
      ctx.moveTo(left, sy);
      ctx.lineTo(right, sy);
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Draw one visible tile: the per-cell body of _renderTiles. The cell
   * rectangle arrives pre-rounded to whole pixels, so `w` and `h` can differ
   * by a pixel from cell to cell at a fractional zoom.
   * @param {MapView} view
   * @param {import('../types/map.js').Tile} tile
   * @param {number} sx
   * @param {number} sy
   * @param {number} w
   * @param {number} h
   * @param {Set<string>} groupCover
   * @param {ReadonlySet<string>} frontier unrevealed tiles beside explored interior floor
   */
  _renderTile(view, tile, sx, sy, w, h, groupCover, frontier) {
    const { ctx } = this;
    const fogged = !tile.revealed && !view.revealAll;
    if (fogged && !view.fogDim) {
      // This fill is distinctly lighter than the map backdrop and the
      // empty-canvas background, so an unexplored but real tile reads as
      // fog, not void.
      ctx.fillStyle = frontier.has(tile.id) ? INK.fogFrontier : INK.fog;
      ctx.fillRect(sx, sy, w, h);
      return;
    }

    // A tile carrying only an overlay, for example a path on an
    // as-yet-unpainted cell, has an empty base. Let the map backdrop show
    // through instead of drawing a placeholder under the path.
    if (tile.imageRef && !groupCover.has(tile.id)) {
      const img = this._raster.source(tile.imageRef, w, h);
      if (img) {
        ctx.drawImage(img, sx, sy, w, h);
      } else {
        ctx.fillStyle = INK.missingArt;
        ctx.fillRect(sx, sy, w, h);
      }
    }

    // Path and road overlays draw on top of the base terrain, so a road can
    // sit on sand or snow instead of replacing the tile beneath it. A stack
    // draws bottom-up, for example a river channel over its shoreline.
    for (const ref of overlayList(tile)) {
      const overlay = this._raster.source(ref, w, h);
      if (overlay) ctx.drawImage(overlay, sx, sy, w, h);
    }

    if (fogged) {
      ctx.fillStyle = frontier.has(tile.id) ? INK.fogDimFrontier : INK.fogDim;
      ctx.fillRect(sx, sy, w, h);
      return;
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
      let extent = w;
      if (tile.span && tile.span > 1 && view.node) {
        const coords = parseCoords(tile.id);
        if (coords) {
          const span = Math.min(tile.span, view.node.width - coords.x, view.node.height - coords.y);
          const size = this.tileSize * view.scale;
          extent = cellEdge(coords.x + span, size, view.offsetX) - sx;
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
    const x = cellEdge(0, size, view.offsetX);
    const y = cellEdge(0, size, view.offsetY);
    ctx.fillStyle = INK.mapBackdrop;
    ctx.fillRect(
      x,
      y,
      cellEdge(view.node.width, size, view.offsetX) - x,
      cellEdge(view.node.height, size, view.offsetY) - y,
    );
  }

  /** Stroke the node extent after tiles so the world edge is always visible.
   * @param {MapView} view */
  _renderMapBoundsBorder(view) {
    const { ctx } = this;
    if (!view.node) return;
    const size = this.tileSize * view.scale;
    const x = cellEdge(0, size, view.offsetX);
    const y = cellEdge(0, size, view.offsetY);
    ctx.save();
    ctx.strokeStyle = INK.mapBorder;
    ctx.lineWidth = 2;
    ctx.strokeRect(
      x,
      y,
      cellEdge(view.node.width, size, view.offsetX) - x,
      cellEdge(view.node.height, size, view.offsetY) - y,
    );
    ctx.restore();
  }

  /** @param {MapView} view
   * @param {{ revealedIds: RevealedIds | null }} frame */
  _renderRegionGroups(view, frame) {
    renderRegionOverlays(this.ctx, view, frame.revealedIds, this.tileSize);
  }

  /** @param {MapView} view
   * @param {{ revealedIds: RevealedIds | null }} frame */
  _renderRegionNames(view, frame) {
    renderRegionNames(
      this.ctx,
      view,
      frame.revealedIds,
      this.tileSize,
      this.getNodeName,
      this._labelBlockers(view),
    );
  }

  /**
   * The tiles that a region name keeps clear of: the party tile, each
   * character token, and each creature marker that draws this frame. A
   * marker out of detection range does not count, so a name never moves
   * away from a creature that the map does not show.
   * @param {MapView} view
   * @returns {string[]}
   */
  _labelBlockers(view) {
    const ids = view.partyTileId ? [view.partyTileId] : [];
    for (const t of view.characterTokens ?? []) ids.push(t.tileId);
    for (const list of [view.encounterTileIds, view.npcTileIds]) {
      for (const id of list ?? []) if (this._markers.markerVisible(view, id)) ids.push(id);
    }
    return ids;
  }
}
