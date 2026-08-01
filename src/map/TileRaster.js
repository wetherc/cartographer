/**
 * The image cache the map renderer draws tiles from.
 *
 * The built-in tile art is SVG. A canvas re-rasterizes an SVG image on every
 * `drawImage` call, because the vector art has no pixels until a destination
 * size picks them. A Build-mode frame draws every tile in the node, so a
 * 40x40 map pays about 1,600 rasterizations per frame. Measured headless, that
 * is 36 ms per frame against 4.5 ms for the same draws from pixels.
 *
 * This class rasterizes each ref once per drawn size into an offscreen canvas. Later frames
 * blit those pixels instead of running the vector rasterizer. An
 * `ImageBitmap` would draw about 6 percent faster than the canvas, measured
 * both headless and headful, but `createImageBitmap` cost 67 ms of main-thread
 * work across the rerenders of the generator preview. The canvas is the better
 * trade.
 *
 * Every side effect is injected, so the caching, the size buckets, and the
 * memory ceiling are testable without a DOM.
 */

/**
 * Largest raster edge. A destination bigger than this draws straight from the
 * SVG: a frame holds only a few such blocks, so their rasterization cost does
 * not matter, and the vector art stays crisp when a GM zooms in on one
 * landmark.
 */
const MAX_SIZE = 256;

/** Total raster bytes to hold before the cache is dropped and refilled. */
const BYTE_LIMIT = 32 * 1024 * 1024;

/**
 * The raster size for a destination edge length: the destination itself,
 * rounded up to a whole pixel.
 *
 * An earlier version quantized this to powers of two, to keep a zoom sweep
 * from minting a raster per scale. That cost visible quality. Tile art carries
 * hairline strokes, such as the grid lines on grass and the ripples on water.
 * A vector rasterizer keeps a hairline visible at any size, but a 32-pixel
 * raster scaled down to 17.8 pixels averages it away, and the whole map goes
 * flat at the zoom that fits it on screen. Rastering at the destination size
 * makes the pixels identical to what the SVG produced.
 *
 * A zoom sweep therefore does mint a raster per zoom level. That costs one
 * rasterization pass per level, which is what the SVG path paid on every
 * frame, and the byte ceiling bounds what the cache keeps.
 * @param {number} edge destination length in device pixels
 * @returns {number} raster length, or 0 when the destination is too large to cache
 */
export function rasterSize(edge) {
  const target = Math.max(1, Math.ceil(edge));
  return target > MAX_SIZE ? 0 : target;
}

/**
 * The `src` to load a tile image ref from. A built-in ref is a
 * project-relative path and needs the leading slash. A GM-supplied tile's art
 * is a `data:` URL and is used as-is, because prefixing it produces an
 * unloadable path. Every place that turns a ref into an image goes through
 * here. The PNG export used to keep its own copy of this logic and lacked the
 * `data:` case, so custom art exported as placeholders. This is a pure
 * function.
 * @param {string} imageRef
 * @returns {string}
 */
export function imageSrcForRef(imageRef) {
  return imageRef.startsWith('data:') ? imageRef : `/${imageRef}`;
}

export class TileRaster {
  /**
   * @param {{
   *   onLoad?: () => void,
   *   createImage?: () => HTMLImageElement,
   *   createCanvas?: (width: number, height: number) => HTMLCanvasElement | null,
   *   enabled?: boolean,
   * }} [options]
   */
  constructor(options = {}) {
    this.onLoad = options.onLoad;
    /**
     * Whether to raster-cache at all. A one-shot render gains nothing from a
     * cache it never reads twice, and the PNG export is a handout, so it draws
     * the vector art at the exact size it wants.
     */
    this.enabled = options.enabled ?? true;
    this.createImage = options.createImage ?? (() => new Image());
    this.createCanvas =
      options.createCanvas ??
      ((width, height) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        return canvas;
      });

    /**
     * Decoded source images, keyed by ref. The PNG export and the generator
     * preview seed and share this map, so it stays a plain public field.
     * @type {Map<string, HTMLImageElement>}
     */
    this.images = new Map();
    /** @type {Map<string, CanvasImageSource>} */
    this.rasters = new Map();
    this.bytes = 0;
  }

  /**
   * The decoded image for a tile ref, loaded once and kept for the session.
   * An unbounded cache is fine while refs are the built-in SVG set, which is
   * small and finite. Add eviction before large custom raster tiles arrive.
   * @param {string} imageRef
   * @returns {HTMLImageElement}
   */
  image(imageRef) {
    let img = this.images.get(imageRef);
    if (!img) {
      img = this.createImage();
      img.src = imageSrcForRef(imageRef);
      img.onload = () => this.onLoad?.();
      this.images.set(imageRef, img);
    }
    return img;
  }

  /**
   * Something to draw a ref with at a destination size, or null while the art
   * has not decoded. A caller that must not leave a hole draws its own
   * placeholder on null.
   *
   * The two destination edges size separately, so art stretched across a 2x1
   * block keeps the aspect distortion it had when the SVG stretched to that
   * rectangle directly.
   * @param {string} imageRef
   * @param {number} width destination width in device pixels
   * @param {number} height destination height in device pixels
   * @returns {CanvasImageSource | null}
   */
  source(imageRef, width, height) {
    const bw = this.enabled ? rasterSize(width) : 0;
    const bh = this.enabled ? rasterSize(height) : 0;
    const key = `${imageRef}@${bw}x${bh}`;
    const cached = this.rasters.get(key);
    if (cached) return cached;

    const img = this.image(imageRef);
    if (!img.complete || !img.naturalWidth) return null;
    // Either edge past the ceiling: draw the vector art itself.
    if (!bw || !bh) return img;
    return this._rasterize(key, img, bw, bh) ?? img;
  }

  /** Drop every raster. The decoded source images stay, because reloading them costs a network round trip. */
  clearRasters() {
    this.rasters.clear();
    this.bytes = 0;
  }

  /**
   * Draw one ref into an offscreen canvas at a bucket size and cache it. The
   * frame that missed pays one vector rasterization, which is what it would
   * have paid anyway. Every frame after it blits.
   * @param {string} key
   * @param {HTMLImageElement} img
   * @param {number} width
   * @param {number} height
   * @returns {CanvasImageSource | null}
   */
  _rasterize(key, img, width, height) {
    if (this.bytes + width * height * 4 > BYTE_LIMIT) this.clearRasters();
    const canvas = this.createCanvas(width, height);
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return null;
    // No `{ alpha: false }` here: overlay art such as a road over sand is
    // transparent outside its own marks.
    ctx.drawImage(img, 0, 0, width, height);
    this.rasters.set(key, canvas);
    this.bytes += width * height * 4;
    return canvas;
  }
}
