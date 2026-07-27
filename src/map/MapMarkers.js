import { parseCoords } from './MapGeometry.js';

/** @typedef {import('./MapRenderer.js').MapRenderer} MapRenderer */
/** @typedef {import('./MapRenderer.js').MapView} MapView */

/**
 * The shape one marker pass draws, given the tile's screen origin and size. It
 * sets its own colors and traces a path; the caller fills and strokes it.
 * Module-level constants rather than closures built per frame.
 * @typedef {(ctx: CanvasRenderingContext2D, sx: number, sy: number, size: number) => void} MarkerShape
 */

/** A red diamond in the tile's upper-right corner. @type {MarkerShape} */
const encounterDiamond = (ctx, sx, sy, size) => {
  const r = size * 0.16;
  ctx.translate(sx + size * 0.74, sy + size * 0.26);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = '#a5352b';
  ctx.strokeStyle = '#2a0f0c';
  ctx.beginPath();
  ctx.rect(-r, -r, r * 2, r * 2);
};

/** A blue circle in the tile's upper-left corner. @type {MarkerShape} */
const npcCircle = (ctx, sx, sy, size) => {
  ctx.fillStyle = '#3563a5';
  ctx.strokeStyle = '#101f36';
  ctx.beginPath();
  ctx.arc(sx + size * 0.26, sy + size * 0.26, size * 0.15, 0, Math.PI * 2);
};

/**
 * The marker layer of the map render: the gold party dot, per-character
 * tokens, red encounter diamonds, and blue NPC circles, plus the shared
 * detection-range rule that gates them. Split out of MapRenderer so the
 * renderer keeps the terrain/fog/region passes; this layer reads the host's
 * ctx and tileSize and draws over the finished tiles.
 */
export class MapMarkers {
  /** @param {MapRenderer} host */
  constructor(host) {
    this.host = host;
    /** @type {MapView | null} the view the parsed anchors below belong to */
    this._anchorsView = null;
    /** @type {{ x: number, y: number }[]} */
    this._anchors = [];
  }

  /**
   * The parsed grid coordinates markers are detected from: the party's tile
   * plus every character token's tile, so a scout who wandered off senses
   * danger around their own position, not just the party's. Parsed once per
   * frame — MapCanvas hands the renderer a fresh view snapshot per draw, so
   * the snapshot object doubles as the memo key; markerVisible is called per
   * marker and per POI tile within one frame.
   * @param {MapView} view
   * @returns {{ x: number, y: number }[]}
   */
  _markerAnchors(view) {
    if (this._anchorsView === view) return this._anchors;
    /** @type {{ x: number, y: number }[]} */
    const anchors = [];
    for (const token of view.characterTokens ?? []) {
      const coords = parseCoords(token.tileId);
      if (coords) anchors.push(coords);
    }
    if (view.partyTileId) {
      const coords = parseCoords(view.partyTileId);
      if (coords) anchors.push(coords);
    }
    this._anchorsView = view;
    this._anchors = anchors;
    return anchors;
  }

  /**
   * Drop the memoized anchors and the view they were parsed from, called by the
   * host at the end of every frame. Without it the last drawn view — and through
   * it a whole node's tile list — stays reachable from the renderer for as long
   * as the map is idle, which after a paint stroke is a node no one else holds.
   */
  releaseFrame() {
    this._anchorsView = null;
    this._anchors = [];
  }

  /**
   * Whether a marker at a tile is within detection range (Euclidean, the same
   * rule as FogOfWar.withinRadius) of the party or a character token. Build
   * mode sees everything; in Play a node the party isn't in has no anchors, so
   * its markers stay hidden.
   * @param {MapView} view
   * @param {string} tileId
   * @returns {boolean}
   */
  markerVisible(view, tileId) {
    if (view.revealAll) return true;
    const coords = parseCoords(tileId);
    if (!coords) return false;
    const rangeSq = view.markerRange * view.markerRange;
    return this._markerAnchors(view).some((a) => {
      const dx = coords.x - a.x;
      const dy = coords.y - a.y;
      return dx * dx + dy * dy <= rangeSq;
    });
  }

  /**
   * Mark tiles carrying a live encounter with a red diamond in the tile's upper
   * corner, so a point of danger reads distinctly from the gold party dot and a
   * POI outline. Markers respect the fog of war loosely: a danger is sensed out
   * to the detection range (twice the fog reveal radius) around the party and
   * any split-off character, even on still-fogged tiles, but never further.
   * @param {MapView} view
   */
  renderEncounterMarkers(view) {
    this._renderMarkers(view, view.encounterTileIds, encounterDiamond);
  }

  /**
   * One marker pass: for every listed tile that is within detection range and
   * parses as a grid coordinate, draw `shape` at that tile. The encounter and
   * NPC passes differ only in the shape, so they share this loop.
   * @param {MapView} view
   * @param {string[] | undefined} ids
   * @param {MarkerShape} shape
   */
  _renderMarkers(view, ids, shape) {
    if (!ids || ids.length === 0 || !view.node) return;
    const { ctx, tileSize } = this.host;
    // One rect's worth of arithmetic per marker, inlined rather than returned as
    // an object: these loops run every frame.
    const size = tileSize * view.scale;
    const lineWidth = Math.max(1.5, size * 0.03);
    for (const id of ids) {
      if (!this.markerVisible(view, id)) continue;
      const coords = parseCoords(id);
      if (!coords) continue;
      ctx.save();
      ctx.lineWidth = lineWidth;
      shape(ctx, coords.x * size + view.offsetX, coords.y * size + view.offsetY, size);
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
  renderNPCMarkers(view) {
    this._renderMarkers(view, view.npcTileIds, npcCircle);
  }

  /** Gold dot for the party's tile. Skipped when a character token stands on
   * that tile — the tokens carry the presence, so the dot underneath would
   * only add clutter. It still draws for an empty roster (or a party tile all
   * of whose members wandered off), keeping the anchor visible.
   * @param {MapView} view */
  renderPartyMarker(view) {
    if (!view.partyTileId) return;
    if (view.characterTokens?.some((t) => t.tileId === view.partyTileId)) return;
    const coords = parseCoords(view.partyTileId);
    if (!coords) return;
    const { ctx, tileSize } = this.host;
    const size = tileSize * view.scale;
    const sx = coords.x * size + view.offsetX;
    const sy = coords.y * size + view.offsetY;

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
  renderCharacterTokens(view) {
    const tokens = view.characterTokens;
    if (!tokens || tokens.length === 0 || !view.node) return;
    const { ctx, tileSize } = this.host;
    /** @type {Map<string, string[]>} tile id -> names standing there */
    const byTile = new Map();
    for (const token of tokens) {
      const names = byTile.get(token.tileId) ?? [];
      names.push(token.name);
      byTile.set(token.tileId, names);
    }
    const size = tileSize * view.scale;
    for (const [tileId, names] of byTile) {
      const coords = parseCoords(tileId);
      if (!coords) continue;
      const sx = coords.x * size + view.offsetX;
      const sy = coords.y * size + view.offsetY;
      if (sx + size < 0 || sy + size < 0 || sx > view.canvasWidth || sy > view.canvasHeight)
        continue;

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
}
