/**
 * Reading a GM-picked image into a bounded `data:` URL.
 *
 * A picked file goes straight into the campaign save, and the save is copied
 * whole into every undo-history slot, so an uncapped pick is not merely large:
 * one 2 MB photo is roughly 2.7 MB of base64 in the save and ten times that
 * across the ring, which puts the origin past its localStorage quota and makes
 * the whole campaign — map structure included — unsaveable. So a pick is
 * decoded, downscaled, and re-encoded under a character ceiling before anything
 * stores it.
 *
 * The dimension and attempt arithmetic is pure and unit-tested; the decode and
 * re-encode need `createImageBitmap`/`Image` and a canvas and are verified
 * visually, per the project's split.
 */

/**
 * Largest file accepted at all, checked before anything is decoded so a
 * mistaken pick of a huge file costs nothing.
 */
export const MAX_SOURCE_BYTES = 12_000_000;

/**
 * Longest edge of a stored image. The only place a handout image renders is
 * `HandoutPanel`'s `max-width: 100%` sidebar figure, a few hundred CSS pixels
 * wide with no full-size view, so this is already generous retina headroom. A
 * lightbox, if one ever lands, is what would justify raising it.
 */
export const MAX_EDGE = 1280;

/**
 * Ceiling on the stored `data:` URL's length. localStorage charges two bytes per
 * character, so this is about half a megabyte of quota per image.
 */
export const MAX_ENCODED_CHARS = 250_000;

/** Re-encode qualities tried in order, before the edge is reduced. */
export const QUALITY_STEPS = [0.82, 0.7, 0.55];

/**
 * Fit `width` x `height` inside a square of `maxEdge`, preserving the aspect
 * ratio and never upscaling. Neither returned dimension is below 1, so a
 * sliver-shaped source cannot round its short side to zero and produce a canvas
 * that will not encode. Pure.
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
 * The (edge, quality) pairs to try, in order, for a source of the given size:
 * every quality step at the full permitted edge, then the same steps at half
 * that edge. Finite and monotonically smaller, so the encode loop below is
 * data rather than control flow and cannot spin. Pure.
 * @param {number} width
 * @param {number} height
 * @param {number} [maxEdge]
 * @returns {{ width: number, height: number, quality: number }[]}
 */
export function encodeAttempts(width, height, maxEdge = MAX_EDGE) {
  /** @type {{ width: number, height: number, quality: number }[]} */
  const attempts = [];
  for (const edge of [maxEdge, Math.max(1, Math.floor(maxEdge / 2))]) {
    const size = fitDimensions(width, height, edge);
    for (const quality of QUALITY_STEPS) attempts.push({ ...size, quality });
  }
  return attempts;
}

/**
 * Decode a picked file to a bitmap, falling back to an `Image` and an object URL
 * where `createImageBitmap` is unavailable. Rejects for anything that will not
 * decode as an image, which is also how a mislabelled non-image file is caught —
 * the input's `accept` filter is a hint the OS picker can be talked out of.
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
 * The shortest encoding of `source` at the given size, as a `data:` URL. JPEG is
 * always a candidate; PNG only for a PNG source, where flat art routinely
 * encodes smaller losslessly than any JPEG of it, and where a photo's PNG never
 * wins so the extra candidate costs one encode. The canvas is filled white
 * first because the JPEG candidate flattens alpha, and unfilled alpha flattens
 * to black.
 * @param {CanvasImageSource} source
 * @param {{ width: number, height: number, quality: number }} attempt
 * @param {boolean} keepLossless
 * @returns {string}
 */
function encodeAt(source, attempt, keepLossless) {
  const canvas = document.createElement('canvas');
  canvas.width = attempt.width;
  canvas.height = attempt.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no 2d context');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, attempt.width, attempt.height);
  context.drawImage(source, 0, 0, attempt.width, attempt.height);
  const jpeg = canvas.toDataURL('image/jpeg', attempt.quality);
  if (!keepLossless) return jpeg;
  const png = canvas.toDataURL('image/png');
  return png.length <= jpeg.length ? png : jpeg;
}

/**
 * Read a picked image file into a `data:` URL bounded by the caps above.
 * Rejects with a GM-facing message rather than a code, since the caller's only
 * job is to show it.
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
    const keepLossless = file.type === 'image/png';
    let shortest = '';
    for (const attempt of encodeAttempts(decoded.width, decoded.height)) {
      const encoded = encodeAt(decoded.source, attempt, keepLossless);
      if (encoded.length <= MAX_ENCODED_CHARS) return encoded;
      if (!shortest || encoded.length < shortest.length) shortest = encoded;
    }
    // Every attempt was over the ceiling. Reporting that is better than storing
    // an image that will fail the save later, where the GM cannot tell which
    // edit caused it.
    throw new Error('That image is too detailed to store. Try a smaller one.');
  } finally {
    decoded.release();
  }
}
