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
 * This class draws a MapNode's tile grid onto a canvas. It supports
 * mouse-drag pan and wheel zoom. An unrevealed tile draws as a flat fog
 * rectangle instead of its imageRef. This matches the fog-of-war model on
 * Tile.revealed.
 *
 * This class owns the view state (node, pan and zoom, markers, selection)
 * and the draw loop. Input goes through MapCanvasPointer for pointer,
 * touch, and wheel events, and through MapCanvasKeyboard for cursor keys
 * and focus. Both controllers change that state back through the host
 * reference.
 */
export class MapCanvas {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {TilePalette} palette
   * @param {{ tileSize?: number, minZoom?: number, maxZoom?: number, markerRange?: number, onCellClick?: (x: number, y: number, tile: Tile | null) => void, onCellContextMenu?: (x: number, y: number, tile: Tile | null, clientX: number, clientY: number) => void, onStrokeCell?: (x: number, y: number, tile: Tile | null, first: boolean) => void, onStrokeEnd?: () => void, getNodeName?: (nodeId: string) => string | undefined, onViewChange?: () => void, onCellHover?: (tile: Tile | null, clientX: number, clientY: number) => void, onExitClick?: (exit: import('../types/map.js').MapExit) => void, onExitArmed?: (exit: import('../types/map.js').MapExit | null) => void }} [options]
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
    /** Detection range for encounter, NPC, and POI markers, in grid cells from
     * the party or a character token. This is conventionally twice the fog
     * reveal radius. */
    this.markerRange = options.markerRange ?? 4;
    this.onCellClick = options.onCellClick;
    this.onCellContextMenu = options.onCellContextMenu;
    this.onStrokeCell = options.onStrokeCell;
    this.onStrokeEnd = options.onStrokeEnd;
    this.getNodeName = options.getNodeName;
    this.onViewChange = options.onViewChange;
    this.onCellHover = options.onCellHover;
    /** Fires when a way out of the current node is used. This happens on a
     * click on a border arrow, or on a cursor key pressed twice into the
     * border it leads off. */
    this.onExitClick = options.onExitClick;
    /** Fires when a cursor key arms an edge exit (with the exit), and fires
     * again with null when the arming lapses. This lets the wiring narrate
     * the second press. */
    this.onExitArmed = options.onExitArmed;

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
    /** @type {import('../types/map.js').MapExit[]} ways out of the current node, drawn as
     * border arrows and tile badges. This applies only in Play mode. The wiring supplies none while authoring. */
    this.exits = [];
    /** @type {import('../types/map.js').ExitSide | null} edge exit that a cursor key
     * arms. The next press of the same arrow key takes it. The renderer highlights it. */
    this.armedExitSide = null;
    /** When true (Build mode), draw every tile's image regardless of its
     * revealed flag. This lets a GM author against the whole map, not through fog. */
    this.revealAll = false;
    /** When true (Build mode), the left button strokes cells through
     * onStrokeCell and onStrokeEnd, and panning moves to the right button.
     * This way authoring gestures and navigation do not share one button. */
    this.authoring = false;
    /** @type {import('./TilePaint.js').CellRect | null} marquee highlight for the region tool */
    this.marquee = null;
    /** @type {string | null} keyboard cursor cell id, drawn only while the canvas has focus */
    this.cursorCellId = null;
    /** @type {boolean} whether the canvas is focused, so the cursor outline shows */
    this._focused = false;
    // True once the user pans or zooms away from the fitted view. This
    // controls whether resize() re-fits the view or keeps the user's framing.
    this._userView = false;
    this.offsetX = 0;
    this.offsetY = 0;
    this.scale = 1;

    // Drawing lives in MapRenderer. MapCanvas stays the owner of interaction
    // state and hands the renderer a view snapshot each frame. When a tile
    // image finishes loading, it asks for a redraw so it appears once decoded.
    this.renderer = new MapRenderer(this.ctx, {
      tileSize: this.tileSize,
      getNodeName: this.getNodeName,
      onImageLoad: () => this.render(),
    });

    /** @type {number | null} pending requestAnimationFrame id for a coalesced redraw */
    this._rafId = null;

    // The map is the app's primary content. It was previously mouse and wheel
    // only. This makes it a focusable widget, so it is keyboard-operable and
    // announced by screen readers. MapCanvasKeyboard handles pan, zoom, and cursor.
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'application');
    canvas.setAttribute(
      'aria-label',
      'Campaign map. Arrow keys move the cursor, Enter acts, plus and minus zoom. At a map edge that leads out, press the same arrow twice to leave.',
    );

    this._pointer = new MapCanvasPointer(this);
    this._keyboard = new MapCanvasKeyboard(this);
    this._pointer.attach();
    this._keyboard.attach();
  }

  /**
   * Load a new MapNode. Frame its full extent in the view.
   * @param {MapNode} node
   */
  setNode(node) {
    this.node = node;
    this.regionGroups = findRegionGroups(node);
    this.partyTileId = null;
    this.characterTokens = [];
    // This clears along with the party marker. The previous node's ways out
    // point at the wrong parent. Drawing them before the wiring recomputes
    // them offers a click that travels to a place where the party is not.
    this.exits = [];
    this.disarmExit();
    this.selectedTileId = null;
    this.cursorCellId = null;
    this.fit();
  }

  /** Re-frame the current node's full extent in the view (zoom-to-extents). */
  fit() {
    const { node, canvas } = this;
    if (!node) return;
    this._userView = false;
    // Pad enough for the coordinate labels. These labels hang off the grid's
    // top and left edges, up to about 60 buffer pixels at the label font cap.
    // The default 24px clips them whenever the fit is not slack from the zoom clamp.
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
   * Pan the view so a tile sits at the canvas centre, and keep the current
   * zoom. This is how "show me this encounter" focuses the map without
   * changing the user's scale. This function does nothing on an id that is
   * not a grid coordinate.
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
   * Zoom by a factor anchored on the canvas centre, for the on-canvas plus
   * and minus controls. The wheel handler anchors on the pointer instead.
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
   * Resize the canvas buffer. For example, call this when the layout column
   * changes width. While the view is still the fitted default, this
   * re-frames the node. After the user pans or zooms, this instead keeps
   * their scale and anchors the world point at the canvas centre. So an
   * unrelated layout reflow, such as a panel expanding or a scrollbar
   * appearing, does not reset the user's view.
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
   * Swap in an updated copy of the same node, for example after a tile
   * change like a fog reveal. This does not reset pan or zoom, unlike setNode.
   * @param {MapNode} node
   */
  refreshNode(node) {
    this.node = node;
    this.regionGroups = findRegionGroups(node);
    this.render();
  }

  /**
   * Mid-stroke variant of refreshNode. This swaps the node and redraws
   * without recomputing region groups. So a paint, erase, or fog drag does
   * O(cells) work instead of a full group flood-fill for each cell crossed.
   * Callers must call a full refreshNode when the stroke ends. An erase can
   * remove a region-linked tile, and this variant leaves that tile visually
   * stale until the full refreshNode runs.
   *
   * Keeping the previous node's group objects also keeps the group image
   * chunks cached across the frames within one cell. The chunks are
   * memoized per group against the tile list they were built from. So this
   * swap costs a rebuild only when the tile list actually carries changed tiles.
   * @param {MapNode} node
   */
  refreshNodeTiles(node) {
    this.node = node;
    this.render();
  }

  /**
   * Show (or clear, with null) the party marker at a tile id within the
   * current node. This does not reset pan or zoom, unlike setNode.
   * @param {string | null} tileId
   */
  setPartyTile(tileId) {
    this.partyTileId = tileId;
    this.render();
  }

  /**
   * Highlight (or clear, with null) the Build-mode selected tile. This is
   * independent of the party marker, so a GM can inspect any tile without
   * moving the party.
   * @param {string | null} tileId
   */
  setSelectedTile(tileId) {
    this.selectedTileId = tileId;
    this.render();
  }

  /**
   * Set the tile ids in the current node that carry a live encounter, so the
   * renderer can mark them. The renderer draws them only within markerRange
   * of the party or a character token, so distant dangers stay unknown until
   * the party approaches.
   * @param {string[]} tileIds
   */
  setEncounterTiles(tileIds) {
    this.encounterTileIds = tileIds;
    this.render();
  }

  /**
   * Set the tile ids in the current node that hold a placed NPC. The
   * renderer marks them under the same detection rule as encounters, within
   * markerRange in Play mode.
   * @param {string[]} tileIds
   */
  setNPCTiles(tileIds) {
    this.npcTileIds = tileIds;
    this.render();
  }

  /**
   * Set the per-character tokens to draw in the current node: one named
   * marker for each character standing here. The wiring resolves each token
   * from the character's own location or the shared party position.
   * @param {{ tileId: string, name: string }[]} tokens
   */
  setCharacterTokens(tokens) {
    this.characterTokens = tokens;
    this.render();
  }

  /**
   * Set the ways out of the current node, from MapExits.findExits. The
   * renderer draws each way out as an arrow in the gutter beside the side
   * that leads back, and as a badge on each door or stairway that leads
   * back. An empty list draws none. This is how Build mode shows nothing,
   * because authoring a map is not travelling it.
   * @param {import('../types/map.js').MapExit[]} exits
   */
  setExits(exits) {
    this.exits = exits;
    // The armed side can no longer be a way out; requiring a fresh first press
    // is cheaper than checking, and rearming costs the user one keystroke.
    this.disarmExit();
    this.render();
  }

  /**
   * Drop a cursor-armed edge exit, and tell the wiring so its narration
   * clears too. Any interaction other than the confirming second press calls
   * this function: a cursor move, another key, a pointer touch, a loss of
   * focus, or a change to the exits or the node while the exit is armed.
   */
  disarmExit() {
    if (this.armedExitSide === null) return;
    this.armedExitSide = null;
    this.onExitArmed?.(null);
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
   * Toggle authoring interaction (Build mode). In this mode, left-drag
   * strokes cells, right-drag pans, and the context menu is suppressed. When
   * off (Play mode), the left button pans, and short drags fire onCellClick
   * as before.
   * @param {boolean} value
   */
  setAuthoring(value) {
    this.authoring = value;
    this._pointer.cancel();
    this.setMarquee(null);
  }

  /**
   * Highlight (or clear, with null) a rectangular block of cells. This is
   * the live preview for the region tool's drag gesture.
   * @param {import('./TilePaint.js').CellRect | null} rect
   */
  setMarquee(rect) {
    this.marquee = rect;
    this.render();
  }

  /**
   * Assemble the current interaction state into a view snapshot, and hand it
   * to the renderer. Pan, zoom, resize, and every state setter route through
   * here. So this is also the one place from which the zoom readout, and any
   * other view-dependent chrome, must read state.
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
      exits: this.exits,
      armedExitSide: this.armedExitSide,
      selectedTileId: this.selectedTileId,
      cursorCellId: this.cursorCellId,
      focused: this._focused,
      marquee: this.marquee,
    };
  }

  /**
   * Request a redraw, coalesced through a single requestAnimationFrame. A
   * burst of pointermove or wheel events, or a run of state setters such as
   * the party-marker sync touching four fields, yields one draw for each
   * display frame, not one draw for each call. The renderer takes the view
   * snapshot when the frame fires, so the snapshot reflects the latest state.
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
