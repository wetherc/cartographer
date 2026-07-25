import { findRegionGroups } from './RegionGroups.js';
import { MapRenderer } from './MapRenderer.js';
import { MapCanvasPointer } from './MapCanvasPointer.js';
import { MapCanvasKeyboard } from './MapCanvasKeyboard.js';
import { parseCoords, clampZoom, fitToExtent } from './MapGeometry.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/map.js').Tile} Tile */
/** @typedef {import('./TilePalette.js').TilePalette} TilePalette */
/** @typedef {import('./RegionGroups.js').RegionGroup} RegionGroup */

/**
 * Renders a MapNode's tile grid onto a canvas, with mouse-drag pan and
 * wheel zoom. Unrevealed tiles draw as a flat fog rect instead of their
 * imageRef, matching the fog-of-war model on Tile.revealed.
 *
 * This class owns the view state (node, pan/zoom, markers, selection) and the
 * render loop; input is delegated to MapCanvasPointer (pointer/touch/wheel)
 * and MapCanvasKeyboard (cursor keys, focus), which mutate that state back
 * through the host reference.
 */
export class MapCanvas {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {TilePalette} palette
   * @param {{ tileSize?: number, minZoom?: number, maxZoom?: number, markerRange?: number, onCellClick?: (x: number, y: number, tile: Tile | null) => void, onCellContextMenu?: (x: number, y: number, tile: Tile | null, clientX: number, clientY: number) => void, onStrokeCell?: (x: number, y: number, tile: Tile | null, first: boolean) => void, onStrokeEnd?: () => void, getNodeName?: (nodeId: string) => string | undefined, onViewChange?: () => void, onCellHover?: (tile: Tile | null, clientX: number, clientY: number) => void }} [options]
   */
  constructor(canvas, palette, options = {}) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('MapCanvas requires a 2d canvas context');
    this.ctx = ctx;
    this.palette = palette;
    this.tileSize = options.tileSize ?? 48;
    this.minZoom = options.minZoom ?? 0.25;
    this.maxZoom = options.maxZoom ?? 4;
    /** Detection range for encounter/NPC/POI markers, in grid cells from the
     * party or a character token (conventionally twice the fog reveal radius). */
    this.markerRange = options.markerRange ?? 4;
    this.onCellClick = options.onCellClick;
    this.onCellContextMenu = options.onCellContextMenu;
    this.onStrokeCell = options.onStrokeCell;
    this.onStrokeEnd = options.onStrokeEnd;
    this.getNodeName = options.getNodeName;
    this.onViewChange = options.onViewChange;
    this.onCellHover = options.onCellHover;

    /** @type {MapNode | null} */
    this.node = null;
    /** @type {RegionGroup[]} */
    this.regionGroups = [];
    /** @type {string | null} tile id of the party marker within the current node, if any */
    this.partyTileId = null;
    /** @type {string | null} tile id highlighted as the Build-mode selection, if any */
    this.selectedTileId = null;
    /** @type {string[]} tile ids in the current node carrying a live encounter */
    this.encounterTileIds = [];
    /** @type {string[]} tile ids in the current node holding a placed NPC */
    this.npcTileIds = [];
    /** @type {{ tileId: string, name: string }[]} per-character tokens in the current node */
    this.characterTokens = [];
    /** When true (Build mode), draw every tile's image regardless of its
     * revealed flag, so a GM authors against the whole map, not through fog. */
    this.revealAll = false;
    /** When true (Build mode), the left button strokes cells through
     * onStrokeCell/onStrokeEnd and panning moves to the right button, so
     * authoring gestures and navigation don't share one button. */
    this.authoring = false;
    /** @type {import('./TilePaint.js').CellRect | null} marquee highlight for the region tool */
    this.marquee = null;
    /** @type {string | null} keyboard cursor cell id, drawn only while the canvas has focus */
    this.cursorCellId = null;
    /** @type {boolean} whether the canvas is focused, so the cursor outline shows */
    this._focused = false;
    // True once the user pans or zooms away from the fitted view; controls
    // whether resize() re-fits or preserves their framing.
    this._userView = false;
    this.offsetX = 0;
    this.offsetY = 0;
    this.scale = 1;

    // Drawing lives in MapRenderer; MapCanvas stays the owner of interaction
    // state and hands the renderer a view snapshot each frame. A tile image
    // that finishes loading asks for a redraw so it appears once decoded.
    this.renderer = new MapRenderer(this.ctx, {
      tileSize: this.tileSize,
      getNodeName: this.getNodeName,
      onImageLoad: () => this.render(),
    });

    /** @type {number | null} pending requestAnimationFrame id for a coalesced redraw */
    this._rafId = null;

    // The map is the app's primary content and was previously mouse/wheel-only;
    // make it a focusable widget so it's keyboard-operable and screen-reader
    // announced (pan/zoom/cursor handled in MapCanvasKeyboard).
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'application');
    canvas.setAttribute(
      'aria-label',
      'Campaign map. Arrow keys move the cursor, Enter acts, plus and minus zoom.',
    );

    this._pointer = new MapCanvasPointer(this);
    this._keyboard = new MapCanvasKeyboard(this);
    this._pointer.attach();
    this._keyboard.attach();
  }

  /**
   * Load a new MapNode, framing its full extent in the view.
   * @param {MapNode} node
   */
  setNode(node) {
    this.node = node;
    this.regionGroups = findRegionGroups(node);
    this.partyTileId = null;
    this.characterTokens = [];
    this.selectedTileId = null;
    this.cursorCellId = null;
    this.fit();
  }

  /** Re-frame the current node's full extent in the view (zoom-to-extents). */
  fit() {
    const { node, canvas } = this;
    if (!node) return;
    this._userView = false;
    // Pad enough for the coordinate labels, which hang off the grid's top and
    // left edges (up to ~60 buffer px at the label font cap); the default 24px
    // clips them whenever the fit isn't slack from the zoom clamp.
    const fitted = fitToExtent(
      node.width * this.tileSize,
      node.height * this.tileSize,
      canvas.width,
      canvas.height,
      { minScale: this.minZoom, maxScale: this.maxZoom, padding: 64 },
    );
    this.scale = fitted.scale;
    this.offsetX = fitted.offsetX;
    this.offsetY = fitted.offsetY;
    this.render();
  }

  /**
   * Pan the view so a tile sits at the canvas centre, keeping the current
   * zoom — how "show me this encounter" focuses the map without yanking the
   * user's scale around. No-op on an id that isn't a grid coordinate.
   * @param {string} tileId
   */
  centerOnTile(tileId) {
    const coords = parseCoords(tileId);
    if (!coords) return;
    const worldX = (coords.x + 0.5) * this.tileSize;
    const worldY = (coords.y + 0.5) * this.tileSize;
    this._userView = true;
    this.offsetX = this.canvas.width / 2 - worldX * this.scale;
    this.offsetY = this.canvas.height / 2 - worldY * this.scale;
    this.render();
  }

  /**
   * Zoom by a factor anchored on the canvas centre (the wheel handler anchors
   * on the pointer instead), for the on-canvas +/- controls.
   * @param {number} factor
   */
  zoomBy(factor) {
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    const worldX = (cx - this.offsetX) / this.scale;
    const worldY = (cy - this.offsetY) / this.scale;
    this._userView = true;
    this.scale = clampZoom(this.scale * factor, this.minZoom, this.maxZoom);
    this.offsetX = cx - worldX * this.scale;
    this.offsetY = cy - worldY * this.scale;
    this.render();
  }

  /**
   * Resize the canvas buffer (e.g. when the layout column changes width).
   * While the view is still the fitted default this re-frames the node; once
   * the user has panned or zoomed it instead keeps their scale and the world
   * point at the canvas centre anchored, so an unrelated layout reflow (a
   * panel expanding, a scrollbar appearing) doesn't reset their view.
   * @param {number} width
   * @param {number} height
   */
  resize(width, height) {
    if (this.canvas.width === width && this.canvas.height === height) return;
    if (!this._userView) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.fit();
      return;
    }
    const worldX = (this.canvas.width / 2 - this.offsetX) / this.scale;
    const worldY = (this.canvas.height / 2 - this.offsetY) / this.scale;
    this.canvas.width = width;
    this.canvas.height = height;
    this.offsetX = width / 2 - worldX * this.scale;
    this.offsetY = height / 2 - worldY * this.scale;
    this.render();
  }

  /**
   * Swap in an updated copy of the *same* node (e.g. after a tile mutation
   * like a fog reveal) without resetting pan/zoom, unlike setNode.
   * @param {MapNode} node
   */
  refreshNode(node) {
    this.node = node;
    this.regionGroups = findRegionGroups(node);
    this.render();
  }

  /**
   * Show (or clear, with null) the party marker at a tile id within the
   * current node. Does not reset pan/zoom, unlike setNode.
   * @param {string | null} tileId
   */
  setPartyTile(tileId) {
    this.partyTileId = tileId;
    this.render();
  }

  /**
   * Highlight (or clear, with null) the Build-mode selected tile. Independent
   * of the party marker, so a GM can inspect any tile without moving the party.
   * @param {string | null} tileId
   */
  setSelectedTile(tileId) {
    this.selectedTileId = tileId;
    this.render();
  }

  /**
   * Set the tile ids in the current node that carry a live encounter, so the
   * renderer can mark them. Drawn only within markerRange of the party or a
   * character token, so distant dangers stay unknown until approached.
   * @param {string[]} tileIds
   */
  setEncounterTiles(tileIds) {
    this.encounterTileIds = tileIds;
    this.render();
  }

  /**
   * Set the tile ids in the current node that hold a placed NPC, marked by the
   * renderer under the same detection rule as encounters (within markerRange in Play).
   * @param {string[]} tileIds
   */
  setNPCTiles(tileIds) {
    this.npcTileIds = tileIds;
    this.render();
  }

  /**
   * Set the per-character tokens to draw in the current node — one named
   * marker per character standing here (resolved by the wiring from each
   * character's own location or the shared party position).
   * @param {{ tileId: string, name: string }[]} tokens
   */
  setCharacterTokens(tokens) {
    this.characterTokens = tokens;
    this.render();
  }

  /**
   * Toggle whether unrevealed tiles are drawn as fog (false, Play) or fully
   * (true, Build).
   * @param {boolean} value
   */
  setRevealAll(value) {
    this.revealAll = value;
    this.render();
  }

  /**
   * Toggle authoring interaction (Build mode): left-drag strokes cells,
   * right-drag pans, the context menu is suppressed. Off (Play mode), the
   * left button pans and short drags fire onCellClick as before.
   * @param {boolean} value
   */
  setAuthoring(value) {
    this.authoring = value;
    this._pointer.cancel();
    this.setMarquee(null);
  }

  /**
   * Highlight (or clear, with null) a rectangular block of cells — the live
   * preview for the region tool's drag gesture.
   * @param {import('./TilePaint.js').CellRect | null} rect
   */
  setMarquee(rect) {
    this.marquee = rect;
    this.render();
  }

  /**
   * Assemble the current interaction state into a view snapshot and hand it to
   * the renderer. Pan/zoom/resize and every state setter funnel through here,
   * so this is also the one place the zoom readout (and any other view-dependent
   * chrome) needs poking from.
   * @returns {import('./MapRenderer.js').MapView}
   */
  _view() {
    return {
      canvasWidth: this.canvas.width,
      canvasHeight: this.canvas.height,
      node: this.node,
      regionGroups: this.regionGroups,
      offsetX: this.offsetX,
      offsetY: this.offsetY,
      scale: this.scale,
      revealAll: this.revealAll,
      markerRange: this.markerRange,
      partyTileId: this.partyTileId,
      encounterTileIds: this.encounterTileIds,
      npcTileIds: this.npcTileIds,
      characterTokens: this.characterTokens,
      selectedTileId: this.selectedTileId,
      cursorCellId: this.cursorCellId,
      focused: this._focused,
      marquee: this.marquee,
    };
  }

  /**
   * Request a redraw, coalesced through a single requestAnimationFrame: a
   * pointermove/wheel burst or a run of state setters (e.g. the party-marker
   * sync touching four fields) yields one draw per display frame, not one per
   * call. The view snapshot is taken when the frame fires, so it reflects the
   * latest state.
   */
  render() {
    if (this._rafId !== null) return;
    this._rafId = requestAnimationFrame(() => {
      this._rafId = null;
      this.onViewChange?.();
      this.renderer.render(this._view());
    });
  }

  destroy() {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    this._pointer.detach();
    this._keyboard.detach();
  }
}
