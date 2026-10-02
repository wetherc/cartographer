import { findRegionGroups } from './RegionGroups.js';
import { MapRenderer } from './MapRenderer.js';
import { MapCanvasPointer } from './MapCanvasPointer.js';
import { MapCanvasKeyboard } from './MapCanvasKeyboard.js';
import { parseCoords, clampZoom, fitSides, fitToExtent, readableScale } from './MapGeometry.js';
import { exitBandDepth } from './ExitBands.js';
import { COORD_SCALE } from './CoordLabels.js';
import { revealedExtent } from './FitArea.js';
import { FollowScheduler, followOffset } from './MapFollow.js';
import { markerAnchors, withinMarkerRange } from './MapMarkers.js';

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
   * @param {{ tileSize?: number, minZoom?: number, maxZoom?: number, markerRange?: number, onCellClick?: (x: number, y: number, tile: Tile | null) => void, onCellContextMenu?: (x: number, y: number, tile: Tile | null, clientX: number, clientY: number) => void, onStrokeCell?: (x: number, y: number, tile: Tile | null, first: boolean) => void, onStrokeEnd?: () => void, getNodeName?: (nodeId: string) => string | undefined, onViewChange?: () => void, onCellHover?: (tile: Tile | null, clientX: number, clientY: number) => void, onExitClick?: (exit: import('../types/map.js').MapExit) => void, onExitArmed?: (exit: import('../types/map.js').MapExit | null) => void, onCursorMove?: (tileId: string) => void }} [options]
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
    /** Fires after a cursor key lands the keyboard cursor on a cell, with the
     * cell's tile id, so the wiring can narrate what the cursor stands on. */
    this.onCursorMove = options.onCursorMove;

    /** @type {MapNode | null} */
    this.node = null;
    /** @type {RegionGroup[]} */
    this.regionGroups = [];
    /** @type {string | null} tile id of the party marker within the current node, if any */
    this.partyTileId = null;
    /** False when partyTileId only points toward the party from a map above it */
    this.partyInNode = true;
    /** @type {string | null} tile id that a fit centers on when the node
     * overflows the view: the party, or the own character of a bound
     * player tab. Null when that tile is in another node. */
    this.focusTileId = null;
    /** @type {string | null} tile id highlighted as the Build-mode selection, if any */
    this.selectedTileId = null;
    /** @type {string | null} the region whose blocks draw with emphasis */
    this.highlightRegionId = null;
    /** @type {string[]} tile ids in the current node carrying a live encounter */
    this.encounterTileIds = [];
    /** @type {string[]} tile ids in the current node holding a placed NPC */
    this.npcTileIds = [];
    /** @type {string[]} tile ids in the current node with a hidden handout, set only for the GM */
    this.handoutTileIds = [];
    /** @type {{ tileId: string, name: string }[]} per-character tokens in the current node */
    this.characterTokens = [];
    /** @type {import('../types/map.js').MapExit[]} ways out of the current node, drawn as
     * border arrows and tile badges. This applies only in Play mode. The wiring supplies none while authoring. */
    this.exits = [];
    /** @type {import('../types/map.js').ExitSide[]} sides that a fit keeps room for an arrow on */
    this.exitSides = [];
    /** @type {import('./ExitBands.js').Rect[]} rects in buffer px that HTML over the
     * canvas covers, such as the mini-map. Edge exit bands move off them. */
    this.occluders = [];
    /** @type {import('../types/map.js').ExitSide | null} edge exit that a cursor key
     * arms. The next press of the same arrow key takes it. The renderer highlights it. */
    this.armedExitSide = null;
    /** When true (Build mode), draw every tile's image regardless of its
     * revealed flag. This lets a GM author against the whole map, not through fog. */
    this.revealAll = false;
    /** When true (a GM in Play mode), unrevealed tiles draw their art under a
     * see-through fog, so the GM can read the map ahead of the party. */
    this.fogDim = false;
    /** When true (Build mode), the left button strokes cells through
     * onStrokeCell and onStrokeEnd, and panning moves to the right button.
     * This way authoring gestures and navigation do not share one button. */
    this.authoring = false;
    /** @type {string | null} keyboard cursor cell id, drawn only while the canvas has focus */
    this.cursorCellId = null;
    /** @type {boolean} whether the canvas is focused, so the cursor outline shows */
    this._focused = false;
    // True once the user pans or zooms away from the fitted view. This
    // controls whether resize() re-fits the view or keeps the user's framing.
    this._userView = false;
    // True after the Fit button, so a refit keeps the whole map in view.
    this._fitWhole = false;
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
      // Cache the terrain across a pan (see TerrainLayer).
      layer: true,
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
    this._follow = new FollowScheduler(canvas, () => this._applyFollow());
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
    this.partyInNode = true;
    this.characterTokens = [];
    this.focusTileId = null;
    // This clears along with the party marker. The previous node's ways out
    // point at the wrong parent. Drawing them before the wiring recomputes
    // them offers a click that travels to a place where the party is not.
    this.exits = [];
    this.exitSides = [];
    this.disarmExit();
    this.selectedTileId = null;
    this.cursorCellId = null;
    this._pointer.resetHover();
    this.fit({ whole: false });
  }

  /**
   * Re-frame the current node's full extent in the view (zoom-to-extents).
   * A fit on its own keeps tiles at least `READABLE_TILE_PX` wide, so a large
   * map shows in part. `whole` drops that floor and shows the whole map, for
   * the Fit button the GM presses to see it all. Later refits keep the choice
   * until the node changes.
   * @param {{ whole?: boolean }} [options]
   */
  fit(options) {
    const { node, canvas } = this;
    if (!node) return;
    this._userView = false;
    if (options) this._fitWhole = Boolean(options.whole);
    const sides = this._fitSides();
    // In Play mode a fit frames the revealed tiles plus a margin, so the
    // explored part fills the canvas instead of a corner of the fog.
    const area = (!this.revealAll && revealedExtent(node)) || {
      x: 0,
      y: 0,
      width: node.width,
      height: node.height,
    };
    const ts = this.tileSize;
    const focus = this._focusPoint();
    const fitted = fitToExtent(area.width * ts, area.height * ts, canvas.width, canvas.height, {
      minScale: this.minZoom,
      maxScale: this.maxZoom,
      sides,
      // Build mode always frames the whole map, because the GM edits all
      // of it. The readable floor would cut off the right and bottom of a
      // large region.
      readableScale: this._fitWhole || this.revealAll ? 0 : readableScale(ts),
      focus: focus && { x: focus.x - area.x * ts, y: focus.y - area.y * ts },
    });
    this.scale = fitted.scale;
    this.offsetX = fitted.offsetX - area.x * ts * fitted.scale;
    this.offsetY = fitted.offsetY - area.y * ts * fitted.scale;
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
   * Set the tile that a fit centers on and that the view follows. While the
   * view is still the fitted default, a focus tile off the canvas re-fits
   * the view around it. A focus tile on the canvas gets the smallest pan
   * that keeps it inside the follow deadzone, at the same zoom, and the pan
   * waits while the pointer is over the canvas (see `FollowScheduler`). A
   * party that walks toward the edge of a large map then stays in view until
   * the user pans or zooms. Clearing the focus on a fitted view re-fits it.
   * @param {string | null} tileId
   */
  setFocusTile(tileId) {
    if (tileId === this.focusTileId) return;
    this.focusTileId = tileId;
    if (this._userView) return;
    // With no focus, a fit starts a large map at its top-left corner, past
    // the coordinate labels and the mini-map.
    if (!tileId || !this._tileOnCanvas(tileId)) {
      this._follow.cancel();
      this.fit();
    } else this._follow.request();
  }

  /** Pan to keep the focus tile inside the follow deadzone. */
  _applyFollow() {
    const { node, focusTileId } = this;
    if (this._userView || !node || !focusTileId) return;
    const next = followOffset(
      {
        offsetX: this.offsetX,
        offsetY: this.offsetY,
        scale: this.scale,
        tileSize: this.tileSize,
        canvasWidth: this.canvas.width,
        canvasHeight: this.canvas.height,
        width: node.width,
        height: node.height,
      },
      focusTileId,
      this.occluders,
    );
    if (next.offsetX === this.offsetX && next.offsetY === this.offsetY) return;
    this.offsetX = next.offsetX;
    this.offsetY = next.offsetY;
    this.render();
  }

  /**
   * Whether any part of a tile draws on the canvas.
   * @param {string} tileId
   */
  _tileOnCanvas(tileId) {
    const coords = parseCoords(tileId);
    if (!coords) return true;
    const size = this.tileSize * this.scale;
    const x = this.offsetX + coords.x * size;
    const y = this.offsetY + coords.y * size;
    return x + size > 0 && y + size > 0 && x < this.canvas.width && y < this.canvas.height;
  }

  /**
   * Center the view on a tile, at the current zoom, only when the tile lies
   * outside the view or within one tile of its edge.
   * @param {string} tileId
   */
  bringTileIntoView(tileId) {
    if (!this._tileWellInView(tileId)) this.centerOnTile(tileId);
  }

  /** The focus tile's centre in world pixels at scale 1, or null. */
  _focusPoint() {
    const coords = this.focusTileId ? parseCoords(this.focusTileId) : null;
    if (!coords) return null;
    return { x: (coords.x + 0.5) * this.tileSize, y: (coords.y + 0.5) * this.tileSize };
  }

  /**
   * Whether a tile draws inside the canvas with at least one tile of room
   * on every side.
   * @param {string} tileId
   */
  _tileWellInView(tileId) {
    const coords = parseCoords(tileId);
    if (!coords) return true;
    const size = this.tileSize * this.scale;
    const x = this.offsetX + coords.x * size;
    const y = this.offsetY + coords.y * size;
    return (
      x >= size &&
      y >= size &&
      x + size * 2 <= this.canvas.width &&
      y + size * 2 <= this.canvas.height
    );
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
   * A fog or terrain stroke keeps the tile links, so `findRegionGroups`
   * returns these same groups for the new node anyway. A region paint
   * stroke changes the links on every cell, and there the kept groups save
   * one flood fill per cell. The group image chunks and the region color
   * slots key on the group objects, so they stay cached across the frames
   * within one cell.
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
   * @param {boolean} [inNode] false when the tile is the link toward the party
   *   on a map above it. Markers then do not count the tile as an anchor.
   */
  setPartyTile(tileId, inNode = true) {
    this.partyTileId = tileId;
    this.partyInNode = inNode;
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
   * Draw the blocks linked to one child node with a stronger tint and a
   * wider border, or none with null. Build mode passes the region that the
   * Region brush paints, so the GM sees which cells already belong to it.
   * @param {string | null} nodeId
   */
  setHighlightRegion(nodeId) {
    if (this.highlightRegionId === nodeId) return;
    this.highlightRegionId = nodeId;
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
   * Set the tile ids in the current node that have a hidden handout. The
   * wiring passes an empty list to a Player tab, so only the GM sees the
   * badge.
   * @param {string[]} tileIds
   */
  setHandoutTiles(tileIds) {
    this.handoutTileIds = tileIds;
    this.render();
  }

  /**
   * Whether a tile is close enough to the party or a character token for its
   * markers to draw. Anything that tells the player what sits on a tile reads
   * this, so the hover tooltip says no more than the map already shows.
   * @param {string} tileId
   * @returns {boolean}
   */
  markerVisible(tileId) {
    if (this.revealAll) return true;
    return withinMarkerRange(markerAnchors(this), this.markerRange, tileId);
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
   *
   * `all` is the full list, from which `exits` keeps the ways out near the
   * traveler. A fit keeps room for the arrow of every side in `all`, so an
   * arrow that appears as the party walks toward an edge does not rezoom
   * the map.
   * @param {import('../types/map.js').MapExit[]} exits
   * @param {import('../types/map.js').MapExit[]} [all]
   */
  setExits(exits, all = exits) {
    const before = this._fitKey();
    this.exits = exits;
    this.exitSides = all.flatMap((e) => (e.kind === 'edge' ? [e.side] : []));
    // The armed side can no longer be a way out; requiring a fresh first press
    // is cheaper than checking, and rearming costs the user one keystroke.
    this.disarmExit();
    this._refitIfChanged(before);
  }

  /**
   * Set the rects, in buffer px, that HTML over the canvas covers. A click
   * there never reaches the canvas, so the edge exit bands move off them.
   * @param {import('./ExitBands.js').Rect[]} rects
   */
  setOccluders(rects) {
    const before = this._fitKey();
    this.occluders = rects;
    this._refitIfChanged(before);
  }

  /**
   * The padding a fit keeps on each side of the map. The top and left fit
   * the coordinate labels, which hang off those two edges, up to about 60
   * buffer pixels at the label font cap. The bottom and right have no
   * labels, so a small margin there lets the fit zoom closer. Each side with
   * an exit band, or under the mini-map or the zoom toolbar, keeps room for
   * them too.
   */
  _fitSides() {
    const ratio = globalThis.devicePixelRatio || 1;
    return fitSides({
      lead: 64 * ratio,
      trail: 16 * ratio,
      exitSides: this.exitSides,
      bandDepth: exitBandDepth(ratio),
      occluders: this.occluders,
      canvasWidth: this.canvas.width,
      inset: 8 * ratio,
      // The column label plate reaches 1.5 font sizes above the map, at
      // most the label cap.
      labelDepth: 1.5 * COORD_SCALE.max * ratio,
    });
  }

  /**
   * The fit padding as a string, to tell whether a change of exits or
   * occluders moves it. A key on the padding, and not on the raw rects,
   * stops a loop: a refit changes the zoom readout, the readout resizes the
   * toolbar, and the toolbar's new width would refit again.
   */
  _fitKey() {
    const s = this._fitSides();
    return [s.top, s.right, s.bottom, s.left].map(Math.round).join();
  }

  /**
   * Refit a fitted view when its padding inputs changed, and redraw
   * otherwise. The exits and the mini-map arrive after setNode fits, so a
   * fitted view keeps room for them. A view the user panned or zoomed stays.
   * @param {string} before the fit key before the change
   */
  _refitIfChanged(before) {
    if (!this._userView && this._fitKey() !== before) this.fit();
    else this.render();
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
   * Toggle the see-through fog of the GM view (see `fogDim`).
   * @param {boolean} value
   */
  setFogDim(value) {
    if (this.fogDim === value) return;
    this.fogDim = value;
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
      fogDim: this.fogDim,
      markerRange: this.markerRange,
      partyTileId: this.partyTileId,
      partyInNode: this.partyInNode,
      encounterTileIds: this.encounterTileIds,
      npcTileIds: this.npcTileIds,
      handoutTileIds: this.handoutTileIds,
      characterTokens: this.characterTokens,
      exits: this.exits,
      occluders: this.occluders,
      armedExitSide: this.armedExitSide,
      selectedTileId: this.selectedTileId,
      highlightRegionId: this.highlightRegionId,
      cursorCellId: this.cursorCellId,
      focused: this._focused,
      pixelRatio: globalThis.devicePixelRatio || 1,
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
