/**
 * Pure grid/screen coordinate math shared by MapCanvas and the map modules that
 * reason about tile positions (fog, region grouping, descriptions, paint). Kept
 * free of any canvas/DOM state so it stays unit-testable in isolation.
 */

/**
 * Grid tiles use "x,y" as their id (e.g. "3,4"), giving a coordinate without
 * adding position fields to the Tile type. Non-grid tiles (hierarchy tests,
 * etc.) are free to use any other id shape.
 * @param {string} id
 * @returns {{ x: number, y: number } | null}
 */
export function parseCoords(id) {
  const match = /^(\d+),(\d+)$/.exec(id);
  if (!match) return null;
  return { x: Number(match[1]), y: Number(match[2]) };
}

/**
 * Screen-space rect for a tile at grid position (x, y) given the current
 * pan offset and zoom scale.
 * @param {number} x
 * @param {number} y
 * @param {number} tileSize base tile size in CSS px at scale 1
 * @param {number} offsetX pan offset in screen px
 * @param {number} offsetY pan offset in screen px
 * @param {number} scale zoom factor
 * @returns {{ sx: number, sy: number, size: number }}
 */
export function tileRect(x, y, tileSize, offsetX, offsetY, scale) {
  const size = tileSize * scale;
  return { sx: x * size + offsetX, sy: y * size + offsetY, size };
}

/**
 * Inverse of tileRect: which grid cell contains a given screen point.
 * @param {number} screenX
 * @param {number} screenY
 * @param {number} tileSize
 * @param {number} offsetX
 * @param {number} offsetY
 * @param {number} scale
 * @returns {{ x: number, y: number }}
 */
export function screenToTile(screenX, screenY, tileSize, offsetX, offsetY, scale) {
  const size = tileSize * scale;
  return {
    x: Math.floor((screenX - offsetX) / size),
    y: Math.floor((screenY - offsetY) / size),
  };
}

/**
 * Clamp a zoom scale to a min/max range.
 * @param {number} scale
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clampZoom(scale, min, max) {
  return Math.min(max, Math.max(min, scale));
}

/**
 * Convert a client (viewport) point to the canvas's internal buffer-pixel
 * space. A canvas can be rendered at a different CSS size than its internal
 * pixel buffer (e.g. `max-width: 100%` shrinks the element while `width`/
 * `height` attributes fix the buffer); `getBoundingClientRect()` alone gives
 * CSS-space coordinates, so all buffer-space tile math must first scale by the
 * buffer/CSS ratio or every click, drag, and zoom anchor is silently offset.
 * @param {number} clientX
 * @param {number} clientY
 * @param {DOMRect} rect result of canvas.getBoundingClientRect()
 * @param {number} bufferWidth canvas.width
 * @param {number} bufferHeight canvas.height
 * @returns {{ x: number, y: number, scaleX: number, scaleY: number }}
 */
export function clientToBuffer(clientX, clientY, rect, bufferWidth, bufferHeight) {
  const scaleX = rect.width === 0 ? 1 : bufferWidth / rect.width;
  const scaleY = rect.height === 0 ? 1 : bufferHeight / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
    scaleX,
    scaleY,
  };
}

/**
 * Compute the zoom scale and pan offsets that frame an extent of
 * `extentW x extentH` (in world px at scale 1) centered inside a
 * `bufferW x bufferH` canvas with some breathing room, so a node loads
 * filling the view instead of adrift in backdrop at an arbitrary zoom.
 * @param {number} extentW
 * @param {number} extentH
 * @param {number} bufferW
 * @param {number} bufferH
 * @param {{ padding?: number, minScale?: number, maxScale?: number }} [options]
 * @returns {{ scale: number, offsetX: number, offsetY: number }}
 */
export function fitToExtent(extentW, extentH, bufferW, bufferH, options = {}) {
  const padding = options.padding ?? 24;
  if (extentW <= 0 || extentH <= 0 || bufferW <= 0 || bufferH <= 0) {
    return { scale: 1, offsetX: 0, offsetY: 0 };
  }
  const availW = Math.max(1, bufferW - padding * 2);
  const availH = Math.max(1, bufferH - padding * 2);
  const scale = clampZoom(
    Math.min(availW / extentW, availH / extentH),
    options.minScale ?? 0.25,
    options.maxScale ?? 4,
  );
  return {
    scale,
    offsetX: (bufferW - extentW * scale) / 2,
    offsetY: (bufferH - extentH * scale) / 2,
  };
}
