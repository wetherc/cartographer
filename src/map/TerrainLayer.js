/**
 * A cache of the terrain passes of the map render, kept in an offscreen
 * canvas, so a pan copies pixels instead of drawing every tile again.
 *
 * The terrain passes (the map backdrop, the region-block and span images,
 * the tiles with their fog, overlays, and POI outlines, and the cell grid)
 * read the node, the zoom, the fog mode, and the marker anchors, and a pan
 * changes none of these. Firefox draws each tile, fog rectangle, and overlay
 * at several times the cost of Chromium, so a frame that draws a full screen
 * of tiles drops frames on a phone.
 *
 * The layer covers a rectangle of map pixels, the valid rect. Map pixel
 * (x, y) lives at layer pixel (x mod width, y mod height), so the layer is a
 * torus. A pan that moves the view past the valid rect draws only the strip
 * that comes into view, plus a margin ahead of it, and leaves every pixel
 * already drawn where it is. The frame then copies the view out of the layer
 * in up to four pieces, one per side of the wrap.
 *
 * A change to anything the terrain passes read empties the valid rect, and
 * the next frame draws just the view. A zoom frame draws straight onto the
 * map canvas: a pinch changes the scale on every frame, so a cached copy
 * would never be read.
 *
 * All positions are whole device pixels. `cellEdge` rounds `k * size +
 * offset`, and rounding commutes with an integer shift, so a pass drawn at a
 * layer offset and copied back lands on the same pixels as a direct draw.
 */

/** @typedef {{ x: number, y: number, w: number, h: number }} Rect */
/** @typedef {import('./MapRenderer.js').MapView} MapView */

/**
 * @param {Rect} a
 * @param {Rect} b
 * @returns {Rect | null} the overlap, or null when it is empty
 */
export function intersect(a, b) {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x;
  const h = Math.min(a.y + a.h, b.y + b.h) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}

/**
 * @param {Rect} outer
 * @param {Rect} inner
 * @returns {boolean}
 */
export function contains(outer, inner) {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

/**
 * The parts of `a` outside `b`, as up to four rects: full-width bands above
 * and below the overlap, then the pieces left and right of it.
 * @param {Rect} a
 * @param {Rect} b
 * @returns {Rect[]}
 */
export function subtract(a, b) {
  const o = intersect(a, b);
  if (!o) return [a];
  /** @type {Rect[]} */
  const out = [];
  if (o.y > a.y) out.push({ x: a.x, y: a.y, w: a.w, h: o.y - a.y });
  if (o.y + o.h < a.y + a.h) {
    out.push({ x: a.x, y: o.y + o.h, w: a.w, h: a.y + a.h - o.y - o.h });
  }
  if (o.x > a.x) out.push({ x: a.x, y: o.y, w: o.x - a.x, h: o.h });
  if (o.x + o.w < a.x + a.w) {
    out.push({ x: o.x + o.w, y: o.y, w: a.x + a.w - o.x - o.w, h: o.h });
  }
  return out;
}

/**
 * One axis of `nextValid`: the new valid range [lo, hi) that covers the
 * target range, retains as much of the old range as the layer length allows,
 * and reaches `margin` past the target on the side the view moved toward.
 * @param {number} v0 old valid start
 * @param {number} v1 old valid end
 * @param {number} t0 target start
 * @param {number} t1 target end
 * @param {number} margin
 * @param {number} length layer length on this axis
 * @returns {[number, number]}
 */
function nextRange(v0, v1, t0, t1, margin, length) {
  if (t0 < v0) {
    const lo = t0 - margin;
    return [lo, Math.max(t1, Math.min(v1, lo + length))];
  }
  if (t1 > v1) {
    const hi = t1 + margin;
    return [Math.min(t0, Math.max(v0, hi - length)), hi];
  }
  return [v0, v1];
}

/**
 * The valid rect after a pan to `target`. When the target is inside the old
 * rect, nothing changes. Otherwise the rect moves with the view and runs
 * `margin` pixels ahead of it, so the next frames of the same pan copy
 * pixels without drawing. A target that does not touch the old rect starts
 * over from the target alone. The target is never larger than the layer.
 * @param {Rect} valid
 * @param {Rect} target
 * @param {number} margin
 * @param {number} width layer width
 * @param {number} height layer height
 * @returns {Rect}
 */
export function nextValid(valid, target, margin, width, height) {
  if (contains(valid, target)) return valid;
  if (!intersect(valid, target)) return target;
  const [x0, x1] = nextRange(
    valid.x,
    valid.x + valid.w,
    target.x,
    target.x + target.w,
    margin,
    width,
  );
  const [y0, y1] = nextRange(
    valid.y,
    valid.y + valid.h,
    target.y,
    target.y + target.h,
    margin,
    height,
  );
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** @param {number} n @param {number} m */
const mod = (n, m) => ((n % m) + m) % m;

/**
 * Split a rect of map pixels at the wrap lines of a torus, so each piece is
 * one contiguous block of layer pixels at (lx, ly). The rect is never larger
 * than the layer, so it splits into at most four pieces.
 * @param {Rect} rect
 * @param {number} width
 * @param {number} height
 * @returns {(Rect & { lx: number, ly: number })[]}
 */
export function torusPieces(rect, width, height) {
  const out = [];
  const lx0 = mod(rect.x, width);
  const ly0 = mod(rect.y, height);
  const w0 = Math.min(rect.w, width - lx0);
  const h0 = Math.min(rect.h, height - ly0);
  for (const [x, lx, w] of [
    [rect.x, lx0, w0],
    [rect.x + w0, 0, rect.w - w0],
  ]) {
    if (w <= 0) continue;
    for (const [y, ly, h] of [
      [rect.y, ly0, h0],
      [rect.y + h0, 0, rect.h - h0],
    ]) {
      if (h > 0) out.push({ x, y, w, h, lx, ly });
    }
  }
  return out;
}

/**
 * The view fields the terrain passes read, apart from the scale, which
 * `TerrainLayer.draw` handles on its own. The node, its region groups, and
 * the token list compare by identity or by tile id, so an unchanged map
 * has the same key from frame to frame.
 * @param {MapView} view
 */
export function terrainKey(view) {
  return {
    node: view.node,
    regionGroups: view.regionGroups,
    revealAll: view.revealAll,
    fogDim: Boolean(view.fogDim),
    markerRange: view.markerRange,
    partyTileId: view.partyTileId,
    partyInNode: view.partyInNode !== false,
    tokens: (view.characterTokens ?? []).map((t) => t.tileId).join(' '),
  };
}

/**
 * @param {ReturnType<typeof terrainKey> | null} a
 * @param {ReturnType<typeof terrainKey>} b
 * @returns {boolean}
 */
export function sameKey(a, b) {
  if (!a) return false;
  for (const k of /** @type {(keyof typeof b)[]} */ (Object.keys(b))) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

export class TerrainLayer {
  /**
   * @param {{ createCanvas?: (width: number, height: number) => HTMLCanvasElement | null }} [options]
   */
  constructor(options = {}) {
    this.createCanvas =
      options.createCanvas ??
      ((width, height) => {
        if (typeof document === 'undefined') return null;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        return canvas;
      });
    /** @type {HTMLCanvasElement | null} */
    this.canvas = null;
    /** @type {CanvasRenderingContext2D | null} */
    this.ctx = null;
    /** False once no offscreen canvas could be made. The renderer then draws direct. */
    this.available = true;
    /** @type {Rect | null} the map pixels the layer contains, or null when it contains none */
    this.valid = null;
    /** @type {ReturnType<typeof terrainKey> | null} */
    this.key = null;
    /** @type {number | null} */
    this.scale = null;
  }

  /** Drop every cached pixel. The renderer calls this when tile art finishes loading. */
  invalidate() {
    this.valid = null;
  }

  /**
   * Draw the terrain of a view onto ctx through the layer. Return false on a
   * zoom frame, or when no offscreen canvas exists, and the caller then draws
   * the terrain passes straight onto ctx.
   * @param {CanvasRenderingContext2D} ctx the map canvas context
   * @param {MapView} view with whole-pixel offsets
   * @param {number} size tile size on screen, in device pixels
   * @param {(ctx: CanvasRenderingContext2D, view: MapView) => void} paint draws the terrain passes of a view onto a context
   * @returns {boolean}
   */
  draw(ctx, view, size, paint) {
    const node = view.node;
    if (!node || !this.available) return false;
    if (view.scale !== this.scale) {
      this.scale = view.scale;
      this.valid = null;
      return false;
    }
    const key = terrainKey(view);
    if (!sameKey(this.key, key)) {
      this.key = key;
      this.valid = null;
    }
    // The margin is how far a pan reaches past the view before it draws
    // again. A quarter of the shorter side gives a pan about that many
    // frames of copying between strips, and adds about 2.2 times the view
    // area of memory.
    const margin = Math.round(Math.min(view.canvasWidth, view.canvasHeight) / 4);
    if (!this._fit(view.canvasWidth + margin * 2, view.canvasHeight + margin * 2)) return false;
    const layer = /** @type {HTMLCanvasElement} */ (this.canvas);
    const lctx = /** @type {CanvasRenderingContext2D} */ (this.ctx);

    // One cell of slack around the map and around each drawn strip. A POI
    // glow spills past its cell by less than that, and a strip drawn without
    // the cells beside it would cut their glow at the strip edge.
    const border = Math.ceil(size) + 2;
    const extent = {
      x: -border,
      y: -border,
      w: Math.round(node.width * size) + border * 2,
      h: Math.round(node.height * size) + border * 2,
    };
    const view0 = { x: -view.offsetX, y: -view.offsetY, w: view.canvasWidth, h: view.canvasHeight };
    const target = intersect(view0, extent);
    if (!target) return true;

    const grown = this.valid
      ? nextValid(this.valid, target, margin, layer.width, layer.height)
      : target;
    const next = intersect(grown, extent) ?? target;
    const todo = this.valid ? subtract(next, this.valid) : [next];
    for (const rect of todo) {
      for (const piece of torusPieces(rect, layer.width, layer.height)) {
        lctx.save();
        lctx.beginPath();
        lctx.rect(piece.lx, piece.ly, piece.w, piece.h);
        lctx.clip();
        lctx.clearRect(piece.lx, piece.ly, piece.w, piece.h);
        lctx.translate(piece.lx - border, piece.ly - border);
        paint(lctx, {
          ...view,
          offsetX: border - piece.x,
          offsetY: border - piece.y,
          canvasWidth: piece.w + border * 2,
          canvasHeight: piece.h + border * 2,
        });
        lctx.restore();
      }
    }
    this.valid = next;

    for (const piece of torusPieces(target, layer.width, layer.height)) {
      ctx.drawImage(
        layer,
        piece.lx,
        piece.ly,
        piece.w,
        piece.h,
        piece.x + view.offsetX,
        piece.y + view.offsetY,
        piece.w,
        piece.h,
      );
    }
    return true;
  }

  /**
   * Make sure the layer canvas exists at this size. A new size drops the
   * cached pixels, because the torus wraps at the old width and height.
   * @param {number} width
   * @param {number} height
   * @returns {boolean} false when no canvas could be made
   */
  _fit(width, height) {
    if (this.canvas && this.canvas.width === width && this.canvas.height === height) return true;
    this.valid = null;
    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
      return true;
    }
    const canvas = this.createCanvas(width, height);
    // `willReadFrequently` asks for a CPU-backed canvas. Firefox on Android
    // draws a default canvas on the GPU, and there one strip of about 250 tile
    // draws costs 48 ms on a Pixel, where the CPU canvas takes 2 ms. The GPU
    // work runs after the script, so it shows as a stalled frame of 100 ms or
    // more, not as script time. Copying the CPU layer onto the map canvas
    // costs about 2 ms a frame.
    const ctx = canvas?.getContext('2d', { willReadFrequently: true }) ?? null;
    if (!canvas || !ctx) {
      this.available = false;
      return false;
    }
    this.canvas = canvas;
    this.ctx = ctx;
    return true;
  }
}
