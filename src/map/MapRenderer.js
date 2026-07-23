import { parseCoords, tileRect } from './MapGeometry.js';
import { withinRadius } from './FogOfWar.js';
import { groupImageChunks } from './RegionGroups.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('./RegionGroups.js').RegionGroup} RegionGroup */

/**
 * A snapshot of everything the renderer needs to draw a frame. MapCanvas owns
 * this state (pan/zoom, current node, selection/party/cursor ids, mode flags)
 * and hands a fresh view to the renderer on every draw, so the renderer holds
 * no map state of its own beyond its image cache.
 * @typedef {Object} MapView
 * @property {number} canvasWidth
 * @property {number} canvasHeight
 * @property {MapNode | null} node
 * @property {RegionGroup[]} regionGroups
 * @property {number} offsetX
 * @property {number} offsetY
 * @property {number} scale
 * @property {boolean} revealAll draw every tile's image regardless of fog (Build mode)
 * @property {number} markerRange detection range in grid cells: encounter/NPC/POI markers only draw within this Euclidean distance of the party or a character token
 * @property {string | null} partyTileId
 * @property {string[]} [encounterTileIds] tiles carrying a live encounter, marked when revealed
 * @property {string[]} [npcTileIds] tiles holding a placed NPC, marked when revealed
 * @property {{ tileId: string, name: string }[]} [characterTokens] per-character markers, named above their tile
 * @property {string | null} selectedTileId
 * @property {string | null} cursorCellId
 * @property {boolean} focused whether the keyboard cursor outline shows
 * @property {import('./TilePaint.js').CellRect | null} marquee
 */

/**
 * Draws a MapNode's tile grid, fog, region overlays, and the party/selection/
 * cursor decorations onto a 2d context. Pure "draw from a view snapshot": it
 * reads a MapView and paints, keeping no pan/zoom or selection state itself, so
 * MapCanvas stays the single owner of interaction state. The one piece of
 * mutable state it keeps is an image cache; a freshly-loaded image calls back
 * so the canvas can re-render once the bytes arrive.
 */
export class MapRenderer {
  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {{ tileSize: number, getNodeName?: (nodeId: string) => string | undefined, onImageLoad?: () => void }} options
   */
  constructor(ctx, options) {
    this.ctx = ctx;
    this.tileSize = options.tileSize;
    this.getNodeName = options.getNodeName;
    this.onImageLoad = options.onImageLoad;
    /** @type {Map<string, HTMLImageElement>} */
    this.imageCache = new Map();
  }

  /**
   * @param {string} imageRef
   * @returns {HTMLImageElement}
   */
  _getImage(imageRef) {
    let img = this.imageCache.get(imageRef);
    if (!img) {
      img = new Image();
      img.src = `/${imageRef}`;
      img.onload = () => this.onImageLoad?.();
      this.imageCache.set(imageRef, img);
    }
    return img;
  }

  /**
   * Draw one frame of the map from a view snapshot.
   * @param {MapView} view
   */
  render(view) {
    const { ctx } = this;
    ctx.clearRect(0, 0, view.canvasWidth, view.canvasHeight);
    if (!view.node) return;

    this._renderMapBounds(view);
    const groupCover = this._renderGroupImages(view);
    this._renderTiles(view, groupCover);
    this._renderRegionGroups(view);
    this._renderMarquee(view);
    this._renderSelection(view);
    this._renderEncounterMarkers(view);
    this._renderNPCMarkers(view);
    this._renderPartyMarker(view);
    this._renderCharacterTokens(view);
    this._renderCursor(view);
    this._renderMapBoundsBorder(view);
    this._renderCoordinates(view);
  }

  /**
   * Draw column (x) numbers above the top row and row (y) numbers left of the
   * first column, so a GM can read a tile's coordinate off the grid. Labels
   * hang off the grid edge and pan with it. Skipped when tiles are too small to
   * label without clutter.
   * @param {MapView} view
   */
  _renderCoordinates(view) {
    if (!view.node) return;
    const size = this.tileSize * view.scale;
    if (size < 20) return; // too dense to be legible
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = 'rgba(230, 215, 180, 0.8)';
    // Font is in buffer pixels, which are devicePixelRatio-times denser than CSS
    // pixels, so a small cap renders illegibly on a HiDPI canvas. Scale with the
    // tile and only cap generously.
    const fontSize = Math.round(Math.max(14, Math.min(size * 0.3, 42)));
    ctx.font = `600 ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const pad = fontSize * 0.9;
    for (let x = 0; x < view.node.width; x++) {
      const cx = view.offsetX + (x + 0.5) * size;
      if (cx < 0 || cx > view.canvasWidth) continue;
      ctx.fillText(String(x), cx, view.offsetY - pad);
    }
    for (let y = 0; y < view.node.height; y++) {
      const cy = view.offsetY + (y + 0.5) * size;
      if (cy < 0 || cy > view.canvasHeight) continue;
      ctx.fillText(String(y), view.offsetX - pad, cy);
    }
    ctx.restore();
  }

  /**
   * Draw each multi-tile region block on an outdoor map as scaled images in
   * chunks of at most 2x2 tiles, so a sub-region entrance reads as a landmark
   * instead of repeated tiles — a 4x4 block gets four distinct 2x2 images, not
   * one image stretched 4x. Interiors keep per-tile rendering, as do ragged
   * groups (their bounding box would paint over neighboring tiles). The
   * per-tile pass then skips the base images of every covered tile, while its
   * fog rects and path overlays still draw per tile on top, so a partially
   * explored block reveals the scaled image piecewise and a road through a
   * region stays 1x1. Returns the covered tile ids for that skip.
   * @param {MapView} view
   * @returns {Set<string>}
   */
  _renderGroupImages(view) {
    /** @type {Set<string>} */
    const covered = new Set();
    if (!view.node || view.node.kind !== 'region') return covered;
    const { ctx } = this;
    for (const group of view.regionGroups) {
      if (group.tileIds.length < 2) continue;
      for (const chunk of groupImageChunks(view.node, group)) {
        for (const id of chunk.tileIds) covered.add(id);

        const topLeft = tileRect(chunk.minX, chunk.minY, this.tileSize, view.offsetX, view.offsetY, view.scale);
        const bottomRight = tileRect(chunk.maxX, chunk.maxY, this.tileSize, view.offsetX, view.offsetY, view.scale);
        const w = bottomRight.sx + bottomRight.size - topLeft.sx;
        const h = bottomRight.sy + bottomRight.size - topLeft.sy;
        if (topLeft.sx + w < 0 || topLeft.sy + h < 0 || topLeft.sx > view.canvasWidth || topLeft.sy > view.canvasHeight) continue;

        const img = this._getImage(chunk.imageRef);
        if (img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, topLeft.sx, topLeft.sy, w, h);
        } else {
          ctx.fillStyle = '#333';
          ctx.fillRect(topLeft.sx, topLeft.sy, w, h);
        }
      }
    }
    return covered;
  }

  /**
   * Draw every in-view tile: fog rect when unrevealed (outside Build mode), the
   * base terrain image, any path/road overlay on top, and a POI outline. Tiles
   * in `groupCover` skip their base image — a scaled region-block image was
   * already drawn beneath them — but keep fog, overlays, and POI outlines.
   * @param {MapView} view
   * @param {Set<string>} groupCover
   */
  _renderTiles(view, groupCover) {
    const { ctx } = this;
    const node = view.node;
    if (!node) return;
    for (const tile of node.tiles) {
      const coords = parseCoords(tile.id);
      if (!coords) continue;
      const { sx, sy, size } = tileRect(coords.x, coords.y, this.tileSize, view.offsetX, view.offsetY, view.scale);
      if (sx + size < 0 || sy + size < 0 || sx > view.canvasWidth || sy > view.canvasHeight) continue;

      if (!tile.revealed && !view.revealAll) {
        // A distinctly lighter fill than the map backdrop and the empty-canvas
        // background, so an unexplored-but-real tile reads as fog, not void.
        ctx.fillStyle = '#48412f';
        ctx.fillRect(sx, sy, size, size);
        continue;
      }

      // A tile carrying only an overlay (a path on an as-yet-unpainted cell)
      // has an empty base, so let the map backdrop show through rather than
      // drawing a placeholder under the path.
      if (tile.imageRef && !groupCover.has(tile.id)) {
        const img = this._getImage(tile.imageRef);
        if (img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, sx, sy, size, size);
        } else {
          ctx.fillStyle = '#333';
          ctx.fillRect(sx, sy, size, size);
        }
      }

      // A path/road overlay draws on top of the base terrain, so a road can sit
      // on sand, snow, etc. rather than replacing the tile beneath it.
      if (tile.overlayRef) {
        const overlay = this._getImage(tile.overlayRef);
        if (overlay.complete && overlay.naturalWidth > 0) {
          ctx.drawImage(overlay, sx, sy, size, size);
        }
      }

      // A drawn tile carrying a POI type gets a prominent outline. A POI marked
      // discoverable stays hidden until the party reaches it (unless authoring,
      // where the GM sees everything), so secret sites aren't given away by fog
      // reveal alone — and like the encounter/NPC markers, an outline only
      // shows within detection range of the party or a character token.
      const poiVisible =
        tile.metadata.poiType &&
        (view.revealAll ||
          ((!tile.metadata.discoverable || tile.metadata.discovered) &&
            this._markerVisible(view, tile.id)));
      if (poiVisible) this._renderPoiOutline(sx, sy, size);
    }
  }

  /**
   * Outline a discovered point-of-interest tile with a glowing gold border, so
   * it reads as special against surrounding terrain. Drawn per tile inside the
   * tile loop rather than as an overlay pass, so it sits directly on the tile.
   * @param {number} sx
   * @param {number} sy
   * @param {number} size
   */
  _renderPoiOutline(sx, sy, size) {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = '#ffd24a';
    ctx.lineWidth = Math.max(2, size * 0.06);
    ctx.shadowColor = 'rgba(255, 190, 60, 0.9)';
    ctx.shadowBlur = size * 0.18;
    const inset = ctx.lineWidth / 2 + 1;
    ctx.strokeRect(sx + inset, sy + inset, size - inset * 2, size - inset * 2);
    ctx.restore();
  }

  /** Draw the keyboard cursor cell while the canvas is focused, distinct from
   * the Build selection (solid gold) and party marker (dot).
   * @param {MapView} view */
  _renderCursor(view) {
    if (!view.focused || !view.cursorCellId) return;
    const coords = parseCoords(view.cursorCellId);
    if (!coords) return;
    const { ctx } = this;
    const { sx, sy, size } = tileRect(coords.x, coords.y, this.tileSize, view.offsetX, view.offsetY, view.scale);
    ctx.save();
    ctx.strokeStyle = '#5ec8ff';
    ctx.lineWidth = 3;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(sx + 1.5, sy + 1.5, size - 3, size - 3);
    ctx.restore();
  }

  /** Dashed outline + tint over the region tool's in-progress drag block.
   * @param {MapView} view */
  _renderMarquee(view) {
    if (!view.marquee) return;
    const { ctx } = this;
    const topLeft = tileRect(view.marquee.minX, view.marquee.minY, this.tileSize, view.offsetX, view.offsetY, view.scale);
    const bottomRight = tileRect(view.marquee.maxX, view.marquee.maxY, this.tileSize, view.offsetX, view.offsetY, view.scale);
    const w = bottomRight.sx + bottomRight.size - topLeft.sx;
    const h = bottomRight.sy + bottomRight.size - topLeft.sy;
    ctx.save();
    ctx.fillStyle = 'rgba(224, 193, 75, 0.18)';
    ctx.fillRect(topLeft.sx, topLeft.sy, w, h);
    ctx.strokeStyle = '#e0c14b';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(topLeft.sx + 1, topLeft.sy + 1, w - 2, h - 2);
    ctx.restore();
  }

  /** Outline the Build-mode selected tile so the GM sees which tile the
   * inspector and palette act on.
   * @param {MapView} view */
  _renderSelection(view) {
    if (!view.selectedTileId) return;
    const coords = parseCoords(view.selectedTileId);
    if (!coords) return;
    const { ctx } = this;
    const { sx, sy, size } = tileRect(coords.x, coords.y, this.tileSize, view.offsetX, view.offsetY, view.scale);
    ctx.save();
    ctx.strokeStyle = '#e0c14b';
    ctx.lineWidth = 3;
    ctx.strokeRect(sx + 1.5, sy + 1.5, size - 3, size - 3);
    ctx.restore();
  }

  /**
   * Fill the node's full width x height extent with a map-area backdrop, drawn
   * before the tiles. This gives the map a definite shape even where no tile is
   * revealed, so panning past the edge is visually obvious.
   * @param {MapView} view
   */
  _renderMapBounds(view) {
    const { ctx } = this;
    if (!view.node) return;
    const size = this.tileSize * view.scale;
    ctx.fillStyle = '#241f16';
    ctx.fillRect(view.offsetX, view.offsetY, view.node.width * size, view.node.height * size);
  }

  /** Stroke the node extent after tiles so the world edge is always visible.
   * @param {MapView} view */
  _renderMapBoundsBorder(view) {
    const { ctx } = this;
    if (!view.node) return;
    const size = this.tileSize * view.scale;
    ctx.save();
    ctx.strokeStyle = 'rgba(230, 215, 180, 0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(view.offsetX, view.offsetY, view.node.width * size, view.node.height * size);
    ctx.restore();
  }

  /**
   * The tiles markers are detected from: the party's tile plus every
   * character token's tile, so a scout who wandered off senses danger around
   * their own position, not just the party's.
   * @param {MapView} view
   * @returns {string[]}
   */
  _markerAnchors(view) {
    const anchors = (view.characterTokens ?? []).map((t) => t.tileId);
    if (view.partyTileId) anchors.push(view.partyTileId);
    return anchors;
  }

  /**
   * Whether a marker at a tile is within detection range of the party or a
   * character token. Build mode sees everything; in Play a node the party
   * isn't in has no anchors, so its markers stay hidden.
   * @param {MapView} view
   * @param {string} tileId
   * @returns {boolean}
   */
  _markerVisible(view, tileId) {
    if (view.revealAll) return true;
    return this._markerAnchors(view).some((a) => withinRadius(tileId, a, view.markerRange));
  }

  /**
   * Mark tiles carrying a live encounter with a red diamond in the tile's upper
   * corner, so a point of danger reads distinctly from the gold party dot and a
   * POI outline. Markers respect the fog of war loosely: a danger is sensed out
   * to the detection range (twice the fog reveal radius) around the party and
   * any split-off character, even on still-fogged tiles, but never further.
   * @param {MapView} view
   */
  _renderEncounterMarkers(view) {
    const ids = view.encounterTileIds;
    if (!ids || ids.length === 0 || !view.node) return;
    const { ctx } = this;
    for (const id of ids) {
      if (!this._markerVisible(view, id)) continue;
      const coords = parseCoords(id);
      if (!coords) continue;
      const { sx, sy, size } = tileRect(coords.x, coords.y, this.tileSize, view.offsetX, view.offsetY, view.scale);
      const cx = sx + size * 0.74;
      const cy = sy + size * 0.26;
      const r = size * 0.16;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#a5352b';
      ctx.strokeStyle = '#2a0f0c';
      ctx.lineWidth = Math.max(1.5, size * 0.03);
      ctx.beginPath();
      ctx.rect(-r, -r, r * 2, r * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  /**
   * Mark tiles holding a placed NPC with a blue circle in the tile's upper-left
   * corner — mirroring the encounter diamond's upper-right spot, so a tile can
   * carry both without overlap, and reading as a person rather than a threat.
   * Same detection rule as encounters: marked only within the detection range
   * of the party or a character token (Build marks all).
   * @param {MapView} view
   */
  _renderNPCMarkers(view) {
    const ids = view.npcTileIds;
    if (!ids || ids.length === 0 || !view.node) return;
    const { ctx } = this;
    for (const id of ids) {
      if (!this._markerVisible(view, id)) continue;
      const coords = parseCoords(id);
      if (!coords) continue;
      const { sx, sy, size } = tileRect(coords.x, coords.y, this.tileSize, view.offsetX, view.offsetY, view.scale);
      ctx.save();
      ctx.fillStyle = '#3563a5';
      ctx.strokeStyle = '#101f36';
      ctx.lineWidth = Math.max(1.5, size * 0.03);
      ctx.beginPath();
      ctx.arc(sx + size * 0.26, sy + size * 0.26, size * 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  /** Gold dot for the party's tile. Skipped when a character token stands on
   * that tile — the tokens carry the presence, so the dot underneath would
   * only add clutter. It still draws for an empty roster (or a party tile all
   * of whose members wandered off), keeping the anchor visible.
   * @param {MapView} view */
  _renderPartyMarker(view) {
    if (!view.partyTileId) return;
    if (view.characterTokens?.some((t) => t.tileId === view.partyTileId)) return;
    const coords = parseCoords(view.partyTileId);
    if (!coords) return;
    const { ctx } = this;
    const { sx, sy, size } = tileRect(coords.x, coords.y, this.tileSize, view.offsetX, view.offsetY, view.scale);

    ctx.save();
    ctx.fillStyle = '#e0c14b';
    ctx.strokeStyle = '#3a2f0a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx + size / 2, sy + size / 2, size * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Per-character tokens: a small gold dot per character, spread across their
   * tile when several share it, with the characters' names stacked above the
   * tile. Same palette as the party dot so a token reads as "one of ours",
   * distinct from the blue NPC circle and the red encounter diamond.
   * @param {MapView} view
   */
  _renderCharacterTokens(view) {
    const tokens = view.characterTokens;
    if (!tokens || tokens.length === 0 || !view.node) return;
    const { ctx } = this;
    /** @type {Map<string, string[]>} tile id -> names standing there */
    const byTile = new Map();
    for (const token of tokens) {
      const names = byTile.get(token.tileId) ?? [];
      names.push(token.name);
      byTile.set(token.tileId, names);
    }
    for (const [tileId, names] of byTile) {
      const coords = parseCoords(tileId);
      if (!coords) continue;
      const { sx, sy, size } = tileRect(coords.x, coords.y, this.tileSize, view.offsetX, view.offsetY, view.scale);
      if (sx + size < 0 || sy + size < 0 || sx > view.canvasWidth || sy > view.canvasHeight) continue;

      ctx.save();
      // Dots spread evenly along the tile's midline; a lone token sits centred.
      const r = Math.min(size * 0.14, (size * 0.8) / (names.length * 2));
      names.forEach((_, i) => {
        const cx = sx + (size * (i + 1)) / (names.length + 1);
        ctx.fillStyle = '#e0c14b';
        ctx.strokeStyle = '#3a2f0a';
        ctx.lineWidth = Math.max(1.5, size * 0.03);
        ctx.beginPath();
        ctx.arc(cx, sy + size / 2, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });

      // Names stack above the tile, nearest name closest to it. Skipped when
      // tiles get too small for the label to be legible.
      if (size >= 24) {
        const fontSize = Math.round(Math.max(11, Math.min(size * 0.24, 26)));
        ctx.font = `600 ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        names.forEach((name, i) => {
          const ty = sy - 3 - (names.length - 1 - i) * (fontSize + 2);
          const width = ctx.measureText(name).width;
          ctx.fillStyle = 'rgba(20, 16, 8, 0.72)';
          ctx.fillRect(sx + size / 2 - width / 2 - 3, ty - fontSize - 1, width + 6, fontSize + 4);
          ctx.fillStyle = '#f2e4bd';
          ctx.fillText(name, sx + size / 2, ty);
        });
      }
      ctx.restore();
    }
  }

  /** @param {MapView} view */
  _renderRegionGroups(view) {
    const { ctx } = this;
    // Outside Build mode, a region stays hidden until the party has discovered
    // at least one of its tiles through the fog, so the overworld doesn't
    // reveal where every unexplored region sits.
    const revealedIds = view.revealAll
      ? null
      : new Set((view.node?.tiles ?? []).filter((t) => t.revealed).map((t) => t.id));
    for (const group of view.regionGroups) {
      if (revealedIds && !group.tileIds.some((id) => revealedIds.has(id))) continue;
      const topLeft = tileRect(group.minX, group.minY, this.tileSize, view.offsetX, view.offsetY, view.scale);
      const bottomRight = tileRect(group.maxX, group.maxY, this.tileSize, view.offsetX, view.offsetY, view.scale);
      const x = topLeft.sx;
      const y = topLeft.sy;
      const w = bottomRight.sx + bottomRight.size - topLeft.sx;
      const h = bottomRight.sy + bottomRight.size - topLeft.sy;
      if (x + w < 0 || y + h < 0 || x > view.canvasWidth || y > view.canvasHeight) continue;

      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

      const name = this.getNodeName?.(group.childNodeId);
      if (name) {
        ctx.font = '12px sans-serif';
        ctx.textBaseline = 'top';
        const label = ` ${name} `;
        const metrics = ctx.measureText(label);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(x, y, metrics.width, 16);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, x, y + 2);
      }
      ctx.restore();
    }
  }
}
