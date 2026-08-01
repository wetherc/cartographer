import { parseCoords } from './MapGeometry.js';
import { tileAtXY } from './TileIndex.js';

/** @typedef {import('./MapRenderer.js').MapRenderer} MapRenderer */
/** @typedef {import('./MapRenderer.js').MapView} MapView */

/**
 * The shape one marker pass draws, given the tile's screen origin and size.
 * It sets its own colors and traces a path. The caller fills and strokes the
 * path. This is a module-level constant, not a closure built per frame.
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
 * detection-range rule that gates them. This layer is split out of
 * MapRenderer, so the renderer keeps only the terrain, fog, and region
 * passes. This layer reads the host's ctx and tileSize, and draws over the
 * finished tiles.
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
   * The parsed grid coordinates that markers are detected against: the
   * party's tile, plus every character token's tile. A scout who wandered
   * off senses danger around their own position, not only the party's
   * position. This function parses the coordinates once per frame. MapCanvas
   * gives the renderer a fresh view snapshot per draw, so the snapshot
   * object also serves as the memo key. markerVisible calls this function
   * once per marker and per point of interest tile within one frame.
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
   * Remove the memoized anchors and the view they were parsed from. The host
   * calls this at the end of every frame. Without this call, the last drawn
   * view stays reachable from the renderer, and through it, a whole node's
   * tile list. This can keep a node in memory that no one else holds, for as
   * long as the map stays idle after a paint stroke.
   */
  releaseFrame() {
    this._anchorsView = null;
    this._anchors = [];
  }

  /**
   * Whether a marker at a tile is within detection range of the party or a
   * character token. This uses the same Euclidean rule as
   * FogOfWar.withinRadius. Build mode shows every marker. In Play mode, a
   * node the party is not in has no anchors, so its markers stay hidden.
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
   * Mark tiles that carry a live encounter with a red diamond in the tile's
   * upper corner. This makes a point of danger read as distinct from the
   * gold party dot and a point of interest outline. Markers follow the fog
   * of war loosely. The party or any split-off character senses danger out
   * to the detection range, which is twice the fog reveal radius, even on
   * tiles still under fog, but never further.
   * @param {MapView} view
   */
  renderEncounterMarkers(view) {
    this._renderMarkers(view, view.encounterTileIds, encounterDiamond);
  }

  /**
   * One marker pass. For every listed tile that is within detection range
   * and parses as a grid coordinate, draw `shape` at that tile. The
   * encounter pass and the NPC pass differ only in the shape, so they share
   * this loop.
   * @param {MapView} view
   * @param {string[] | undefined} ids
   * @param {MarkerShape} shape
   */
  _renderMarkers(view, ids, shape) {
    if (!ids || ids.length === 0 || !view.node) return;
    const { ctx, tileSize } = this.host;
    // This inlines one rect's worth of arithmetic per marker instead of
    // returning an object, because this loop runs every frame.
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
   * Mark tiles that hold a placed NPC with a blue circle in the tile's
   * upper-left corner. This mirrors the encounter diamond's upper-right
   * spot, so a tile can carry both markers without overlap, and reads as a
   * person rather than a threat. This uses the same detection rule as
   * encounters: the marker shows only within detection range of the party
   * or a character token. Build mode marks all NPCs.
   * @param {MapView} view
   */
  renderNPCMarkers(view) {
    this._renderMarkers(view, view.npcTileIds, npcCircle);
  }

  /**
   * Badge the door and stairway tiles the party can leave an interior
   * through. This makes the one authored way out read as usable, not as
   * scenery. Unlike the encounter and NPC markers, this ignores detection
   * range, because the way the party came in is not something to sense at a
   * distance. An unrevealed tile stays unmarked, because a door nobody has
   * found yet reveals the shape of the map through the fog.
   * @param {MapView} view
   */
  renderExitMarkers(view) {
    const node = view.node;
    if (!node || !view.exits?.length) return;
    const { ctx, tileSize } = this.host;
    const size = tileSize * view.scale;
    for (const exit of view.exits) {
      if (exit.kind !== 'tile') continue;
      const coords = parseCoords(exit.tileId);
      if (!coords) continue;
      const tile = tileAtXY(node, coords.x, coords.y);
      if (!tile || (!tile.revealed && !view.revealAll)) continue;
      const sx = coords.x * size + view.offsetX;
      const sy = coords.y * size + view.offsetY;
      if (sx + size < 0 || sy + size < 0 || sx > view.canvasWidth || sy > view.canvasHeight)
        continue;
      // This uses the tile's lower-right quadrant. The NPC circle holds the
      // upper left, the encounter diamond the upper right, and the party dot
      // the center. A staircase down to the parent level gets a downward
      // chevron, to match tile art that visibly descends.
      const down = exit.via === 'stairs-down';
      this._drawExitBadge(ctx, sx + size * 0.74, sy + size * 0.74, size * 0.15, down);
    }
  }

  /**
   * A parchment disc with a chevron, marking a tile as a way out. The
   * chevron points up for a door, or for a staircase that climbs to the
   * parent level. It points down for a staircase that descends to the
   * parent level.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} cx
   * @param {number} cy
   * @param {number} r
   * @param {boolean} [down]
   */
  _drawExitBadge(ctx, cx, cy, r, down = false) {
    ctx.save();
    ctx.fillStyle = '#e6d7b4';
    ctx.strokeStyle = '#2a2114';
    ctx.lineWidth = Math.max(1.5, r * 0.2);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const tip = down ? -1 : 1;
    ctx.moveTo(cx - r * 0.45, cy + r * 0.28 * tip);
    ctx.lineTo(cx, cy - r * 0.34 * tip);
    ctx.lineTo(cx + r * 0.45, cy + r * 0.28 * tip);
    ctx.stroke();
    ctx.restore();
  }

  /** Gold dot for the party's tile. This is skipped when a character token
   * stands on that tile, because the token already shows presence, and the
   * dot underneath adds clutter. This still draws for an empty roster,
   * or a party tile whose members all wandered off, to keep the anchor
   * visible.
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
   * Per-character tokens: one small gold dot per character. The dots spread
   * across the tile when several characters share it. The characters'
   * names stack above the tile. This uses the same palette as the party
   * dot, so a token reads as part of the party, distinct from the blue NPC
   * circle and the red encounter diamond.
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
      // Dots spread evenly along the tile's midline. A lone token sits centered.
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

      // Names stack above the tile, with the nearest name closest to it. This
      // is skipped when tiles are too small for the label to be legible.
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
