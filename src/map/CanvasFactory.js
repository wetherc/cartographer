/**
 * A detached canvas of the given size, for a cache that draws once and blits
 * the result on later frames. Under `node --test` there is no `document`, so
 * the function returns null and each cache falls back to drawing direct.
 * @param {number} width
 * @param {number} height
 * @returns {HTMLCanvasElement | null}
 */
export function createOffscreenCanvas(width, height) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
