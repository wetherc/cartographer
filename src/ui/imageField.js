/**
 * This file reads a GM-picked image into a bounded `data:` URL.
 *
 * A picked file goes straight into the campaign save, and the save is
 * copied whole into every undo-history slot. An uncapped pick is more
 * than merely large. One 2 MB photo becomes roughly 2.7 MB of base64 in
 * the save, and ten times that across the ring. This puts the origin
 * past its localStorage quota and makes the whole campaign, map
 * structure included, unsaveable. To prevent this, a pick is decoded,
 * downscaled, and re-encoded under a character ceiling before anything
 * stores it.
 *
 * The dimension and attempt arithmetic is pure and has unit tests. The
 * decode and re-encode steps need `createImageBitmap`, `Image`, and a
 * canvas, and are verified visually, per the project's split.
 */

/**
 * The largest file accepted at all. This is checked before anything
 * decodes, so a mistaken pick of a huge file costs nothing.
 */
export const MAX_SOURCE_BYTES = 12_000_000;

/**
 * The longest edge of a stored image. The only place a handout image
 * draws is `HandoutPanel`'s `max-width: 100%` sidebar figure, a few
 * hundred CSS pixels wide with no full-size view, so this already gives
 * generous retina headroom. A lightbox, if one ever lands, justifies
 * raising this value.
 */
export const MAX_EDGE = 1280;

/**
 * The ceiling on the stored `data:` URL's length. localStorage charges
 * two bytes per character, so this is about half a megabyte of quota per image.
 */
export const MAX_ENCODED_CHARS = 250_000;

/** These are the re-encode qualities tried in order, before the edge is reduced. */
export const QUALITY_STEPS = [0.82, 0.7, 0.55];

/**
 * Fit `width` x `height` inside a square of `maxEdge`, preserving the
 * aspect ratio and never upscaling. Neither returned dimension goes
 * below 1, so a sliver-shaped source cannot round its short side to zero
 * and produce a canvas that will not encode. This function is pure.
 * @param {number} width
 * @param {number} height
 * @param {number} maxEdge
 * @returns {{ width: number, height: number }}
 */
export function fitDimensions(width, height, maxEdge) {
  const w = Number.isFinite(width) ? Math.floor(width) : 0;
  const h = Number.isFinite(height) ? Math.floor(height) : 0;
  if (w < 1 || h < 1) return { width: 1, height: 1 };
  const longest = Math.max(w, h);
  if (longest <= maxEdge) return { width: w, height: h };
  const scale = maxEdge / longest;
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/**
 * The sizes to draw a source at, in order: the full permitted edge, then
 * half of it. Each size is drawn to a canvas once, and every quality step
 * encodes from that one drawing. This function is pure.
 * @param {number} width
 * @param {number} height
 * @param {number} [maxEdge]
 * @returns {{ width: number, height: number }[]}
 */
export function encodeSizes(width, height, maxEdge = MAX_EDGE) {
  return [maxEdge, Math.max(1, Math.floor(maxEdge / 2))].map((edge) =>
    fitDimensions(width, height, edge),
  );
}

/**
 * The (edge, quality) pairs to try, in order, for a source of the given
 * size: every quality step at the full permitted edge, then the same
 * steps at half that edge. The list is finite and monotonically smaller,
 * so the encode loop below reads as data, not control flow, and cannot
 * spin. This function is pure.
 * @param {number} width
 * @param {number} height
 * @param {number} [maxEdge]
 * @returns {{ width: number, height: number, quality: number }[]}
 */
export function encodeAttempts(width, height, maxEdge = MAX_EDGE) {
  /** @type {{ width: number, height: number, quality: number }[]} */
  const attempts = [];
  for (const size of encodeSizes(width, height, maxEdge)) {
    for (const quality of QUALITY_STEPS) attempts.push({ ...size, quality });
  }
  return attempts;
}

/**
 * The encoding to store out of one attempt's candidates: the shortest
 * candidate, when it fits under `limit`, or null when none does. A null
 * candidate stands for a format that was not tried, such as PNG for a
 * photo. This function is pure.
 * @param {(string | null)[]} candidates
 * @param {number} limit
 * @returns {string | null}
 */
export function pickFit(candidates, limit) {
  /** @type {string | null} */
  let shortest = null;
  for (const candidate of candidates) {
    if (candidate === null) continue;
    if (shortest === null || candidate.length < shortest.length) shortest = candidate;
  }
  return shortest !== null && shortest.length <= limit ? shortest : null;
}

/**
 * Decode a picked file to a bitmap, with a fallback to an `Image` and an
 * object URL where `createImageBitmap` is unavailable. This rejects
 * anything that will not decode as an image, which also catches a
 * mislabeled non-image file. The input's `accept` filter is only a hint,
 * and the OS picker can be talked out of it.
 * @param {File} file
 * @returns {Promise<{ source: CanvasImageSource, width: number, height: number, release: () => void }>}
 */
async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      release: () => bitmap.close?.(),
    };
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('decode failed'));
      el.src = url;
    });
    const el = /** @type {HTMLImageElement} */ (image);
    return {
      source: el,
      width: el.naturalWidth,
      height: el.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

/**
 * Draw `source` onto a fresh canvas at the given size. The canvas fills
 * white first, because the JPEG encode flattens alpha, and unfilled alpha
 * flattens to black.
 * @param {CanvasImageSource} source
 * @param {{ width: number, height: number }} size
 * @returns {HTMLCanvasElement}
 */
function drawAt(source, size) {
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no 2d context');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size.width, size.height);
  context.drawImage(source, 0, 0, size.width, size.height);
  return canvas;
}

/**
 * The shortest encoding of `source` that fits under the character cap, or
 * null when no size and quality does. JPEG is always a candidate. PNG is a
 * candidate only for a PNG source, where flat art routinely encodes
 * smaller losslessly than any JPEG of it. A photo's PNG never wins, so the
 * extra candidate costs only one encode.
 *
 * Each size is drawn once and its PNG is encoded once. The quality steps
 * change only the JPEG, so re-encoding the PNG per step would repeat the
 * slowest encode for the same bytes.
 * @param {CanvasImageSource} source
 * @param {{ width: number, height: number }} decoded
 * @param {boolean} keepLossless
 * @returns {string | null}
 */
function encodeUnderCap(source, decoded, keepLossless) {
  for (const size of encodeSizes(decoded.width, decoded.height)) {
    const canvas = drawAt(source, size);
    const png = keepLossless ? canvas.toDataURL('image/png') : null;
    for (const quality of QUALITY_STEPS) {
      const jpeg = canvas.toDataURL('image/jpeg', quality);
      const fit = pickFit([png, jpeg], MAX_ENCODED_CHARS);
      if (fit) return fit;
    }
  }
  return null;
}

/**
 * Read a picked image file into a `data:` URL bounded by the caps above.
 * This rejects with a GM-facing message rather than a code, since the
 * caller's only job is to show it.
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function readImageFile(file) {
  if (file.size > MAX_SOURCE_BYTES) {
    const limit = Math.round(MAX_SOURCE_BYTES / 1_000_000);
    throw new Error(`That image is too large. Pick one under ${limit} MB.`);
  }
  /** @type {{ source: CanvasImageSource, width: number, height: number, release: () => void }} */
  let decoded;
  try {
    decoded = await decodeImage(file);
  } catch {
    throw new Error('That file could not be read as an image.');
  }
  try {
    const encoded = encodeUnderCap(decoded.source, decoded, file.type === 'image/png');
    if (encoded) return encoded;
    // Every attempt exceeded the ceiling. Reporting this now is better
    // than storing an image that fails the save later, where the GM
    // cannot tell which edit caused it.
    throw new Error('That image is too detailed to store. Try a smaller one.');
  } finally {
    decoded.release();
  }
}
