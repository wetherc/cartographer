import { groupImageChunks } from './RegionGroups.js';
import { blockRect, cellEdge, newBlockRect, parseCoords } from './MapGeometry.js';
import { overlayList } from './TileGrid.js';
import { tileAtXY } from './TileIndex.js';
import { rasterSize } from './TileRaster.js';
import { INK } from './CanvasInk.js';
import { frontierIds } from './FogOfWar.js';
import { isBlankMap } from './BlankMap.js';

/** @typedef {import('./MapRenderer.js').MapRenderer} MapRenderer */
/** @typedef {import('./MapRenderer.js').MapView} MapView */
/** @typedef {import('./MapRenderer.js').Frame} Frame */
/** @typedef {import('./TileIndex.js').RevealedIds} RevealedIds */

/**
 * Whether any of a block's tiles is revealed, and so whether the block
 * draws at all. A null set means fog of war is off, as in Build mode, and
 * everything draws. All three block passes gate on this. See MapRenderer._revealedIds
 * for why a fully-fogged block must draw nothing instead of being painted over.
 * @param {string[]} tileIds
 * @param {RevealedIds | null} revealedIds
 * @returns {boolean}
 */
export function anyRevealed(tileIds, revealedIds) {
  if (!revealedIds) return true;
  for (const id of tileIds) if (revealedIds.has(id)) return true;
  return false;
}

/**
 * This class draws the terrain passes of the map render: the map backdrop,
 * the region-block and span images, the tiles with their fog and overlays,
 * and the cell grid. MapRenderer calls `render` direct, or through
 * TerrainLayer, which caches the pixels across a pan. The passes read the
 * host's ctx, tileSize, and tile raster, so they draw onto the layer context
 * while the layer paints.
 */
export class TerrainPasses {
  /** @param {MapRenderer} host */
  constructor(host) {
    this.host = host;
  }

  /**
   * The terrain passes: the map backdrop, the region-block and span images,
   * the tiles, and the cell grid. They read only what `terrainKey` lists and
   * the scale, so `TerrainLayer` can cache their pixels across a pan. They
   * draw onto the host ctx, which is the layer context while the layer paints.
   * @param {MapView} view
   * @param {Frame} frame
   */
  render(view, frame) {
    if (!view.node) return;
    this.renderMapBounds(view);
    const groupCover = this.renderGroupImages(view, frame);
    this.renderSpanImages(view, frame, groupCover);
    this.renderTiles(view, groupCover);
    if (view.revealAll || !isBlankMap(view.node)) this.renderCellGrid(view, frame);
  }

  /**
   * Draw each multi-tile region block on an outdoor map as scaled images in
   * chunks of at most 2x2 tiles, so a sub-region entrance reads as a
   * landmark instead of repeated tiles. A 4x4 block gets four distinct 2x2
   * images, not one image stretched 4 times. Interiors keep per-tile
   * drawing, as do ragged groups, because their bounding box paints
   * over neighboring tiles. The per-tile pass then skips the base images of
   * every covered tile, while its fog rectangles and path overlays still
   * draw per tile on top. A partially explored block then reveals the
   * scaled image piecewise, and a road through a region stays 1x1. Returns
   * the covered tile ids for that skip.
   * @param {MapView} view
   * @param {Frame} frame
   * @returns {Set<string>}
   */
  renderGroupImages(view, frame) {
    /** @type {Set<string>} */
    const covered = new Set();
    if (!view.node || view.node.kind !== 'region') return covered;
    const revealedIds = frame.revealedIds;
    const size = this.host.tileSize * view.scale;
    const rect = newBlockRect();
    for (const group of view.regionGroups) {
      if (group.tileIds.length < 2) continue;
      for (const chunk of groupImageChunks(view.node, group)) {
        // A fully-fogged chunk draws nothing. See MapRenderer._revealedIds.
        if (!anyRevealed(chunk.tileIds, revealedIds)) continue;
        for (const id of chunk.tileIds) covered.add(id);
        blockRect(rect, chunk, view, size);
        if (rect.visible) this.drawBlockImage(rect, chunk.imageRef, frame);
      }
    }
    return covered;
  }

  /**
   * Draw one block's image across its whole rectangle, or a flat gray
   * placeholder while the bytes are still loading, or if the ref failed to
   * decode, so a block never leaves a hole in the map.
   *
   * A block wider or taller than the raster ceiling draws from the vector
   * art, which keeps the partly transparent outer pixel row that single
   * rastered tiles lose. Its rectangle is recorded on the frame so the cell
   * grid pass leaves it alone instead of ruling a second line over that
   * natural boundary. The placeholder fill is opaque and carries no such
   * boundary, so it is not recorded.
   * @param {import('./MapGeometry.js').BlockRect} rect
   * @param {string} imageRef
   * @param {{ vectorBlocks: { x: number, y: number, w: number, h: number }[] }} frame
   */
  drawBlockImage(rect, imageRef, frame) {
    const { ctx } = this.host;
    const img = this.host._raster.source(imageRef, rect.w, rect.h);
    if (img) {
      ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h);
      if (!rasterSize(rect.w) || !rasterSize(rect.h)) {
        frame.vectorBlocks.push({ x: rect.x, y: rect.y, w: rect.w, h: rect.h });
      }
    } else {
      ctx.fillStyle = INK.missingArt;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }
  }

  /**
   * Draw each scaled-art tile, with span greater than 1, as one image
   * stretched across its block. This sizing is purely visual and
   * independent of region links, so a landmark such as a 3x3 academy can
   * dominate a town at any zoom level. Covered cell ids are added to
   * `cover`, so the tile pass skips their base images, while fog
   * rectangles and path overlays still draw per tile on top. A block then
   * reveals piecewise, and roads across it stay 1x1, matching region-block
   * chunks. Unlike those chunks, span art draws on interiors too.
   * @param {MapView} view
   * @param {Frame} frame
   * @param {Set<string>} cover accumulates covered tile ids
   */
  renderSpanImages(view, frame, cover) {
    if (!view.node) return;
    const revealedIds = frame.revealedIds;
    const size = this.host.tileSize * view.scale;
    const rect = newBlockRect();
    for (const block of frame.spanBlocks) {
      // An imageless span block covers nothing. Its cells have no scaled
      // art drawn beneath them, so telling the tile pass to skip their base
      // images leaves them blank.
      if (!block.imageRef) continue;
      // A fully-fogged block draws nothing. See MapRenderer._revealedIds.
      if (!anyRevealed(block.tileIds, revealedIds)) continue;
      for (const id of block.tileIds) cover.add(id);
      blockRect(rect, block, view, size);
      if (rect.visible) this.drawBlockImage(rect, block.imageRef, frame);
    }
  }

  /**
   * Draw every in-view tile: a fog rectangle when unrevealed outside Build
   * mode, the base terrain image, any path or road overlay on top, and a
   * POI outline. Tiles in `groupCover` skip their base image, because a
   * scaled region-block image was already drawn beneath them, but they keep
   * fog, overlays, and POI outlines.
   * @param {MapView} view
   * @param {Set<string>} groupCover
   */
  renderTiles(view, groupCover) {
    const node = view.node;
    if (!node) return;
    // Invert the view transform once and walk only the visible cell range,
    // looking tiles up by coordinate. This costs O(visible cells). Iterating
    // node.tiles cost O(total tiles) with a regex parse per tile per frame,
    // and an id lookup built and hashed a string per visible cell per frame.
    const size = this.host.tileSize * view.scale;
    const minX = Math.max(0, Math.floor(-view.offsetX / size));
    const minY = Math.max(0, Math.floor(-view.offsetY / size));
    const maxX = Math.min(node.width - 1, Math.floor((view.canvasWidth - view.offsetX) / size));
    const maxY = Math.min(node.height - 1, Math.floor((view.canvasHeight - view.offsetY) / size));
    const frontier = frontierIds(node);
    // Cell rectangles come from the rounded edges of cellEdge, not from a
    // fractional position and width. Neighboring cells then share each edge
    // pixel exactly, with the grid line of renderCellGrid on top of it.
    for (let y = minY; y <= maxY; y++) {
      const sy = cellEdge(y, size, view.offsetY);
      const h = cellEdge(y + 1, size, view.offsetY) - sy;
      for (let x = minX; x <= maxX; x++) {
        const tile = tileAtXY(node, x, y);
        if (!tile) continue;
        const sx = cellEdge(x, size, view.offsetX);
        const w = cellEdge(x + 1, size, view.offsetX) - sx;
        this.renderTile(view, tile, sx, sy, w, h, groupCover, frontier);
      }
    }
  }

  /**
   * Rule a one-pixel line along every cell boundary in view, so a GM can count
   * cells and match a tile to its coordinate labels.
   *
   * Tiles draw from a cached raster, which fills every pixel of a cell, so
   * no gap between tiles shows the backdrop. A tile drawn straight from its
   * SVG leaves its outermost pixel row partly transparent, and the dark
   * backdrop then shows through as a grid. This method draws that grid on
   * purpose, in the backdrop color.
   *
   * The grid stops at the fog. A flat fog rectangle has no transparent edge,
   * so fogged cells show no backdrop grid. Cells are clipped rather
   * than stroked one at a time, which would draw every shared boundary twice
   * and leave it darker than the outer edges.
   * A block past the raster ceiling drew from the vector art and so kept
   * its natural boundary. Its rectangle is clipped out here, which also
   * keeps its interior clear, the look every block had before the raster
   * cache when covered cells drew no per-tile image.
   * @param {MapView} view
   * @param {Frame} frame
   */
  renderCellGrid(view, frame) {
    const node = view.node;
    if (!node) return;
    const { ctx } = this.host;
    const size = this.host.tileSize * view.scale;
    // A grid finer than about three pixels per cell reads as a flat wash over
    // the terrain rather than as lines.
    if (size < 3) return;
    // A tile drawn straight from the vector art still carries the natural
    // boundary: its outermost pixel row is partly transparent. That is the
    // case when rasterizing is off, as in the PNG export, and past the
    // raster size ceiling, as in a deep zoom. Ruling the explicit grid over
    // the natural one would darken every boundary.
    if (!this.host._raster.enabled || !rasterSize(size)) return;
    const minX = Math.max(0, Math.floor(-view.offsetX / size));
    const minY = Math.max(0, Math.floor(-view.offsetY / size));
    const maxX = Math.min(node.width, Math.ceil((view.canvasWidth - view.offsetX) / size));
    const maxY = Math.min(node.height, Math.ceil((view.canvasHeight - view.offsetY) / size));
    const left = cellEdge(minX, size, view.offsetX);
    const right = cellEdge(maxX, size, view.offsetX);
    const top = cellEdge(minY, size, view.offsetY);
    const bottom = cellEdge(maxY, size, view.offsetY);

    ctx.save();
    if (frame.revealedIds) {
      // The clip rectangles come from the same rounded edges as the tiles,
      // so the clip never shaves an antialiased sliver off a grid line.
      const clip = new Path2D();
      for (let y = minY; y < maxY; y++) {
        const cy = cellEdge(y, size, view.offsetY);
        const ch = cellEdge(y + 1, size, view.offsetY) - cy;
        for (let x = minX; x < maxX; x++) {
          if (!tileAtXY(node, x, y)?.revealed) continue;
          const cx = cellEdge(x, size, view.offsetX);
          clip.rect(cx, cy, cellEdge(x + 1, size, view.offsetX) - cx, ch);
        }
      }
      ctx.clip(clip);
    }
    if (frame.vectorBlocks.length > 0) {
      // The view rectangle with each vector-drawn block cut out of it. The
      // even-odd rule is what turns the inner rectangles into holes.
      const keep = new Path2D();
      keep.rect(left, top, right - left, bottom - top);
      for (const block of frame.vectorBlocks) keep.rect(block.x, block.y, block.w, block.h);
      ctx.clip(keep, 'evenodd');
    }
    ctx.strokeStyle = 'rgba(36, 31, 22, 0.55)';
    ctx.lineWidth = 1;
    // One path for every line, so the whole grid costs one stroke call.
    ctx.beginPath();
    for (let x = minX; x <= maxX; x++) {
      const sx = cellEdge(x, size, view.offsetX) + 0.5;
      ctx.moveTo(sx, top);
      ctx.lineTo(sx, bottom);
    }
    for (let y = minY; y <= maxY; y++) {
      const sy = cellEdge(y, size, view.offsetY) + 0.5;
      ctx.moveTo(left, sy);
      ctx.lineTo(right, sy);
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Draw one visible tile: the per-cell body of renderTiles. The cell
   * rectangle arrives pre-rounded to whole pixels, so `w` and `h` can differ
   * by a pixel from cell to cell at a fractional zoom.
   * @param {MapView} view
   * @param {import('../types/map.js').Tile} tile
   * @param {number} sx
   * @param {number} sy
   * @param {number} w
   * @param {number} h
   * @param {Set<string>} groupCover
   * @param {ReadonlySet<string>} frontier unrevealed tiles beside explored interior floor
   */
  renderTile(view, tile, sx, sy, w, h, groupCover, frontier) {
    const { ctx } = this.host;
    const fogged = !tile.revealed && !view.revealAll;
    if (fogged && !view.fogDim) {
      // This fill is distinctly lighter than the map backdrop and the
      // empty-canvas background, so an unexplored but real tile reads as
      // fog, not void.
      ctx.fillStyle = frontier.has(tile.id) ? INK.fogFrontier : INK.fog;
      ctx.fillRect(sx, sy, w, h);
      return;
    }

    // A tile carrying only an overlay, for example a path on an
    // as-yet-unpainted cell, has an empty base. Let the map backdrop show
    // through instead of drawing a placeholder under the path.
    if (tile.imageRef && !groupCover.has(tile.id)) {
      const img = this.host._raster.source(tile.imageRef, w, h);
      if (img) {
        ctx.drawImage(img, sx, sy, w, h);
      } else {
        ctx.fillStyle = INK.missingArt;
        ctx.fillRect(sx, sy, w, h);
      }
    }

    // Path and road overlays draw on top of the base terrain, so a road can
    // sit on sand or snow instead of replacing the tile beneath it. A stack
    // draws bottom-up, for example a river channel over its shoreline.
    for (const ref of overlayList(tile)) {
      const overlay = this.host._raster.source(ref, w, h);
      if (overlay) ctx.drawImage(overlay, sx, sy, w, h);
    }

    if (fogged) {
      ctx.fillStyle = frontier.has(tile.id) ? INK.fogDimFrontier : INK.fogDim;
      ctx.fillRect(sx, sy, w, h);
      return;
    }

    // A drawn tile carrying a POI type gets a prominent outline. A POI
    // marked discoverable stays hidden until the party reaches it, unless
    // the GM is authoring the map and sees everything. A fog reveal alone
    // then does not give away a secret site. As with the encounter and NPC
    // markers, an outline shows only within detection range of the party
    // or a character token.
    const poiVisible =
      tile.metadata.poiType &&
      (view.revealAll ||
        ((!tile.metadata.discoverable || tile.metadata.discovered) &&
          this.host._markers.markerVisible(view, tile.id)));
    if (poiVisible) {
      // A span anchor's outline covers the whole block its art is
      // stretched across, clamped to the grid to match spanBlocks, so the
      // highlight wraps the scaled art instead of only its top-left cell.
      let extent = w;
      if (tile.span && tile.span > 1 && view.node) {
        const coords = parseCoords(tile.id);
        if (coords) {
          const span = Math.min(tile.span, view.node.width - coords.x, view.node.height - coords.y);
          const size = this.host.tileSize * view.scale;
          extent = cellEdge(coords.x + span, size, view.offsetX) - sx;
        }
      }
      this.host._decorations.renderPoiOutline(sx, sy, extent);
    }
  }

  /**
   * Fill the node's full width by height extent with a map-area backdrop,
   * drawn before the tiles. This gives the map a definite shape even where
   * no tile is revealed, so panning past the edge is visually obvious.
   * @param {MapView} view
   */
  renderMapBounds(view) {
    const { ctx } = this.host;
    if (!view.node) return;
    const size = this.host.tileSize * view.scale;
    const x = cellEdge(0, size, view.offsetX);
    const y = cellEdge(0, size, view.offsetY);
    ctx.fillStyle = INK.mapBackdrop;
    ctx.fillRect(
      x,
      y,
      cellEdge(view.node.width, size, view.offsetX) - x,
      cellEdge(view.node.height, size, view.offsetY) - y,
    );
  }
}
