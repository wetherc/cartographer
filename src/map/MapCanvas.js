import { findRegionGroups } from './RegionGroups.js';
import { MapRenderer } from './MapRenderer.js';
import { MapCanvasPointer } from './MapCanvasPointer.js';
import { MapCanvasKeyboard } from './MapCanvasKeyboard.js';
import {
  applyFollow,
  centerOn,
  fitKey,
  fitView,
  refitIfChanged,
  resizeView,
  tileOnCanvas,
  tileWellInView,
  viewSnapshot,
  zoomAboutCentre,
} from './MapCanvasView.js';
import { FollowScheduler } from './MapFollow.js';
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
 * and the draw loop. MapCanvasView frames the view and builds the snapshot
 * that the renderer draws. Input goes through MapCanvasPointer for pointer,
 * touch, and wheel events, and through MapCanvasKeyboard for cursor keys
 * and focus. Both controllers change that state back through the host
 * reference.
 */
export class MapCanvas {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {TilePalette} palette
   * @param {import('../types/map.js').MapCanvasOptions} [options]
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
    // See MapCanvasOptions for what each option and callback does.
    this.markerRange = options.markerRange ?? 4;
    this.onCellClick = options.onCellClick;
    this.onCellContextMenu = options.onCellContextMenu;
    this.onStrokeCell = options.onStrokeCell;
    this.onStrokeEnd = options.onStrokeEnd;
    this.getNodeName = options.getNodeName;
    this.onViewChange = options.onViewChange;
    this.onCellHover = options.onCellHover;
    this.onExitClick = options.onExitClick;
    this.onExitArmed = options.onExitArmed;
    this.onCursorMove = options.onCursorMove;
    this.onCursorStroke = options.onCursorStroke;

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

    // The map is the app's primary content. A focusable widget makes it
    // keyboard-operable and announced by screen readers. MapCanvasKeyboard handles pan, zoom, and cursor.
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'application');
    canvas.setAttribute(
      'aria-label',
      'Campaign map. Arrow keys move the cursor, Enter acts, plus and minus zoom. At a map edge that leads out, press the same arrow twice to leave.',
    );

    this._pointer = new MapCanvasPointer(this);
    this._follow = new FollowScheduler(canvas, () => applyFollow(this));
    this._keyboard = new MapCanvasKeyboard(this);
    this._pointer.attach();
    this._keyboard.attach();
  }

  /**
   * The decoded tile images of the renderer. The PNG export and the
   * generator preview share it, so they do not decode the art again.
   * @returns {Map<string, HTMLImageElement>}
   */
  get imageCache() {
    return this.renderer.imageCache;
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
   * Re-frame the current node's full extent in the view. `whole` shows the
   * whole map and drops the readable-tile floor (see `fitView`).
   * @param {{ whole?: boolean }} [options]
   */
  fit(options) {
    fitView(this, options);
  }

  /**
   * Pan the view so a tile sits at the canvas centre, and keep the current
   * zoom. This is how "show me this encounter" focuses the map without
   * changing the user's scale.
   * @param {string} tileId
   */
  centerOnTile(tileId) {
    centerOn(this, tileId);
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
    if (!tileId || !tileOnCanvas(this, tileId)) {
      this._follow.cancel();
      this.fit();
    } else this._follow.request();
  }

  /**
   * Center the view on a tile, at the current zoom, only when the tile lies
   * outside the view or within one tile of its edge.
   * @param {string} tileId
   */
  bringTileIntoView(tileId) {
    if (!tileWellInView(this, tileId)) this.centerOnTile(tileId);
  }

  /**
   * Zoom by a factor anchored on the canvas centre, for the on-canvas plus
   * and minus controls. The wheel handler anchors on the pointer instead.
   * @param {number} factor
   */
  zoomBy(factor) {
    zoomAboutCentre(this, factor);
  }

  /**
   * Resize the canvas buffer when the layout column changes size. A view
   * the user panned or zoomed keeps its scale (see `resizeView`).
   * @param {number} width
   * @param {number} height
   */
  resize(width, height) {
    resizeView(this, width, height);
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
   * Link tool paints, so the GM sees which cells already belong to it.
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
   * Whether the last draw left out the name of a region for lack of room.
   * @param {string} nodeId the child node that the region links to
   * @returns {boolean}
   */
  nameHidden(nodeId) {
    return this.renderer.hiddenNames.has(nodeId);
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
    const before = fitKey(this);
    this.exits = exits;
    this.exitSides = all.flatMap((e) => (e.kind === 'edge' ? [e.side] : []));
    // The armed side can no longer be a way out; requiring a fresh first press
    // is cheaper than checking, and rearming costs the user one keystroke.
    this.disarmExit();
    refitIfChanged(this, before);
  }

  /**
   * Set the rects, in buffer px, that HTML over the canvas covers. A click
   * there never reaches the canvas, so the edge exit bands move off them.
   * @param {import('./ExitBands.js').Rect[]} rects
   */
  setOccluders(rects) {
    const before = fitKey(this);
    this.occluders = rects;
    refitIfChanged(this, before);
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
      this.renderer.render(viewSnapshot(this));
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
