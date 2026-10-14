import { parseCoords, clampZoom, fitSides, fitToExtent, readableScale } from './MapGeometry.js';
import { exitBandDepth } from './ExitBands.js';
import { COORD_SCALE, coordLabelRoom, fitForLabels } from './CoordLabels.js';
import { labelSize } from './CanvasText.js';
import { revealedExtent } from './FitArea.js';
import { followOffset } from './MapFollow.js';

/** @typedef {import('./MapCanvas.js').MapCanvas} MapCanvas */

/**
 * The view of a MapCanvas: its framing (fit to the map, center on a tile,
 * follow the focus tile, zoom about the centre, resize) and the snapshot
 * that each frame hands to MapRenderer. Each function takes the MapCanvas as
 * `host`, and reads and writes its view fields (offsetX, offsetY, scale,
 * _userView, _fitWhole). MapCanvas keeps the public methods and calls these
 * functions.
 */

/**
 * Frame the current node's full extent in the view (zoom-to-extents).
 * A fit on its own keeps tiles at least `READABLE_TILE_PX` wide, so a large
 * map shows in part. `whole` drops that floor and shows the whole map, for
 * the Fit button the GM presses to see it all. Later refits keep the choice
 * until the node changes.
 * @param {MapCanvas} host
 * @param {{ whole?: boolean }} [options]
 */
export function fitView(host, options) {
  const { node, canvas } = host;
  if (!node) return;
  host._userView = false;
  if (options) host._fitWhole = Boolean(options.whole);
  // In Play mode a fit frames the revealed tiles plus a margin, so the
  // explored part fills the canvas instead of a corner of the fog.
  const area = (!host.revealAll && revealedExtent(node)) || {
    x: 0,
    y: 0,
    width: node.width,
    height: node.height,
  };
  const ts = host.tileSize;
  const focus = focusPoint(host);
  const ratio = globalThis.devicePixelRatio || 1;
  /** @param {number} fontSize */
  const fitAt = (fontSize) =>
    fitToExtent(area.width * ts, area.height * ts, canvas.width, canvas.height, {
      minScale: host.minZoom,
      maxScale: host.maxZoom,
      sides: fitPadding(host, fontSize),
      // Build mode always frames the whole map, because the GM edits all
      // of it. The readable floor would cut off the right and bottom of a
      // large region.
      readableScale: host._fitWhole || host.revealAll ? 0 : readableScale(ts),
      focus: focus && { x: focus.x - area.x * ts, y: focus.y - area.y * ts },
    });
  const fitted = fitForLabels(
    fitAt,
    (scale) => labelSize(ts * scale, COORD_SCALE, ratio),
    COORD_SCALE.max * ratio,
  );
  host.scale = fitted.scale;
  host.offsetX = fitted.offsetX - area.x * ts * fitted.scale;
  host.offsetY = fitted.offsetY - area.y * ts * fitted.scale;
  host.render();
}

/**
 * Pan the view so a tile sits at the canvas centre, and keep the current
 * zoom. This function does nothing on an id that is not a grid coordinate.
 * @param {MapCanvas} host
 * @param {string} tileId
 */
export function centerOn(host, tileId) {
  const coords = parseCoords(tileId);
  if (!coords) return;
  const worldX = (coords.x + 0.5) * host.tileSize;
  const worldY = (coords.y + 0.5) * host.tileSize;
  host._userView = true;
  host.offsetX = host.canvas.width / 2 - worldX * host.scale;
  host.offsetY = host.canvas.height / 2 - worldY * host.scale;
  host.render();
}

/**
 * Pan to keep the focus tile inside the follow deadzone.
 * @param {MapCanvas} host
 */
export function applyFollow(host) {
  const { node, focusTileId } = host;
  if (host._userView || !node || !focusTileId) return;
  const next = followOffset(
    {
      offsetX: host.offsetX,
      offsetY: host.offsetY,
      scale: host.scale,
      tileSize: host.tileSize,
      canvasWidth: host.canvas.width,
      canvasHeight: host.canvas.height,
      width: node.width,
      height: node.height,
    },
    focusTileId,
    host.occluders,
  );
  if (next.offsetX === host.offsetX && next.offsetY === host.offsetY) return;
  host.offsetX = next.offsetX;
  host.offsetY = next.offsetY;
  host.render();
}

/**
 * The on-canvas rect of a tile, in buffer px, or null for an id that is not
 * a grid coordinate.
 * @param {MapCanvas} host
 * @param {string} tileId
 */
function tileRect(host, tileId) {
  const coords = parseCoords(tileId);
  if (!coords) return null;
  const size = host.tileSize * host.scale;
  return { x: host.offsetX + coords.x * size, y: host.offsetY + coords.y * size, size };
}

/**
 * Whether any part of a tile draws on the canvas.
 * @param {MapCanvas} host
 * @param {string} tileId
 */
export function tileOnCanvas(host, tileId) {
  const r = tileRect(host, tileId);
  if (!r) return true;
  const { x, y, size } = r;
  return x + size > 0 && y + size > 0 && x < host.canvas.width && y < host.canvas.height;
}

/**
 * Whether a tile draws inside the canvas with at least one tile of room
 * on every side.
 * @param {MapCanvas} host
 * @param {string} tileId
 */
export function tileWellInView(host, tileId) {
  const r = tileRect(host, tileId);
  if (!r) return true;
  const { x, y, size } = r;
  return (
    x >= size &&
    y >= size &&
    x + size * 2 <= host.canvas.width &&
    y + size * 2 <= host.canvas.height
  );
}

/**
 * The focus tile's centre in world pixels at scale 1, or null.
 * @param {MapCanvas} host
 */
function focusPoint(host) {
  const coords = host.focusTileId ? parseCoords(host.focusTileId) : null;
  if (!coords) return null;
  return { x: (coords.x + 0.5) * host.tileSize, y: (coords.y + 0.5) * host.tileSize };
}

/**
 * Zoom by a factor anchored on the canvas centre. The wheel handler anchors
 * on the pointer instead.
 * @param {MapCanvas} host
 * @param {number} factor
 */
export function zoomAboutCentre(host, factor) {
  const cx = host.canvas.width / 2;
  const cy = host.canvas.height / 2;
  const worldX = (cx - host.offsetX) / host.scale;
  const worldY = (cy - host.offsetY) / host.scale;
  host._userView = true;
  host.scale = clampZoom(host.scale * factor, host.minZoom, host.maxZoom);
  host.offsetX = cx - worldX * host.scale;
  host.offsetY = cy - worldY * host.scale;
  host.render();
}

/**
 * Resize the canvas buffer. While the view is still the fitted default,
 * this re-frames the node. After the user pans or zooms, this instead keeps
 * their scale and anchors the world point at the canvas centre. So an
 * unrelated layout reflow, such as a panel expanding or a scrollbar
 * appearing, does not reset the user's view.
 * @param {MapCanvas} host
 * @param {number} width
 * @param {number} height
 */
export function resizeView(host, width, height) {
  const { canvas } = host;
  if (canvas.width === width && canvas.height === height) return;
  if (!host._userView) {
    canvas.width = width;
    canvas.height = height;
    fitView(host);
    return;
  }
  const worldX = (canvas.width / 2 - host.offsetX) / host.scale;
  const worldY = (canvas.height / 2 - host.offsetY) / host.scale;
  canvas.width = width;
  canvas.height = height;
  host.offsetX = width / 2 - worldX * host.scale;
  host.offsetY = height / 2 - worldY * host.scale;
  host.render();
}

/**
 * The padding a fit keeps on each side of the map. The top and left fit
 * the coordinate labels at `fontSize`, which hang off those two edges. The
 * default is the label font cap. The bottom and right have no
 * labels, so a small margin there lets the fit zoom closer. Each side with
 * an exit band, or under the mini-map or the zoom toolbar, keeps room for
 * them too.
 * @param {MapCanvas} host
 * @param {number} [fontSize] the label font size, in buffer px
 */
export function fitPadding(host, fontSize = COORD_SCALE.max * (globalThis.devicePixelRatio || 1)) {
  const ratio = globalThis.devicePixelRatio || 1;
  const room = coordLabelRoom(fontSize, ratio);
  return fitSides({
    lead: room.lead,
    trail: 16 * ratio,
    exitSides: host.exitSides,
    bandDepth: exitBandDepth(ratio),
    occluders: host.occluders,
    canvasWidth: host.canvas.width,
    inset: 8 * ratio,
    labelDepth: room.labelDepth,
  });
}

/**
 * The fit padding as a string, to tell whether a change of exits or
 * occluders moves it. A key on the padding, and not on the raw rects,
 * stops a loop: a refit changes the zoom readout, the readout resizes the
 * toolbar, and the toolbar's new width would refit again.
 * @param {MapCanvas} host
 */
export function fitKey(host) {
  const s = fitPadding(host);
  return [s.top, s.right, s.bottom, s.left].map(Math.round).join();
}

/**
 * Refit a fitted view when its padding inputs changed, and redraw
 * otherwise. The exits and the mini-map arrive after setNode fits, so a
 * fitted view keeps room for them. A view the user panned or zoomed stays.
 * @param {MapCanvas} host
 * @param {string} before the fit key before the change
 */
export function refitIfChanged(host, before) {
  if (!host._userView && fitKey(host) !== before) fitView(host);
  else host.render();
}

/**
 * Assemble the current interaction state into a view snapshot, and hand it
 * to the renderer. Pan, zoom, resize, and every state setter route through
 * here. So this is also the one place from which the zoom readout, and any
 * other view-dependent chrome, must read state.
 * @param {MapCanvas} host
 * @returns {import('./MapRenderer.js').MapView}
 */
export function viewSnapshot(host) {
  return {
    canvasWidth: host.canvas.width,
    canvasHeight: host.canvas.height,
    node: host.node,
    regionGroups: host.regionGroups,
    offsetX: host.offsetX,
    offsetY: host.offsetY,
    scale: host.scale,
    revealAll: host.revealAll,
    fogDim: host.fogDim,
    markerRange: host.markerRange,
    partyTileId: host.partyTileId,
    partyInNode: host.partyInNode,
    encounterTileIds: host.encounterTileIds,
    npcTileIds: host.npcTileIds,
    handoutTileIds: host.handoutTileIds,
    characterTokens: host.characterTokens,
    exits: host.exits,
    occluders: host.occluders,
    armedExitSide: host.armedExitSide,
    selectedTileId: host.selectedTileId,
    highlightRegionId: host.highlightRegionId,
    cursorCellId: host.cursorCellId,
    focused: host._focused,
    pixelRatio: globalThis.devicePixelRatio || 1,
  };
}
