import { cellEdge } from './MapGeometry.js';
import { spanBlocks } from './TilePaint.js';
import { revealedIds as revealedIdsOf } from './TileIndex.js';
import { MapMarkers } from './MapMarkers.js';
import { MapDecorations } from './MapDecorations.js';
import { TileRaster, imageSrcForRef } from './TileRaster.js';
import { INK } from './CanvasInk.js';
import { renderRegionNames, renderRegionOverlays } from './RegionOverlay.js';
import { isBlankMap } from './BlankMap.js';
import { TerrainLayer } from './TerrainLayer.js';
import { TerrainPasses } from './TerrainPasses.js';

// Re-exported because callers outside the map, such as the handout panel and
// the PNG export, resolve a ref through this module.
export { imageSrcForRef };

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('./RegionGroups.js').RegionGroup} RegionGroup */

/** @typedef {import('./TileIndex.js').RevealedIds} RevealedIds */

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
 * once the bytes arrive. This class runs the frame and owns the region
 * overlay and name passes and the map border. The terrain passes (bounds,
 * group and span images, tiles plus fog, and the cell grid) live in
 * TerrainPasses, and the marker and decoration passes live in MapMarkers and
 * MapDecorations. All three read this instance's ctx and tileSize through a
 * host reference.
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
    // The child node ids of the region names that the last draw left out
    // for lack of room. The map hover names those places instead.
    /** @type {Set<string>} */
    this.hiddenNames = new Set();
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
    this._terrainPasses = new TerrainPasses(this);
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
    this._terrainPasses.render(view, frame);
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
    const hidden = renderRegionNames(
      this.ctx,
      view,
      frame.revealedIds,
      this.tileSize,
      this.getNodeName,
      this._labelBlockers(view),
    );
    this.hiddenNames = new Set(hidden);
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
