import { overlayList } from './TileGrid.js';
import { NEIGHBORS4, NEIGHBORS8, parseCoords, tileIdAt } from './MapGeometry.js';
import { ARMS, ArmNetwork, connectorKind } from './Autotile.js';
import { BIOME_TERRAIN, classifyBiome } from './GeneratorTerrain.js';
import { fbm, valueNoise } from './GeneratorNoise.js';
import { GENERATOR_SIZES } from './GeneratorSizes.js';
import { clamp } from '../util/num.js';

/** @typedef {import('../types/map.js').Tile} Tile */
/** @typedef {import('../types/map.js').TerrainGuide} TerrainGuide */
/** @typedef {import('./GeneratorTerrain.js').TerrainField} TerrainField */
/** @typedef {import('./Autotile.js').Arm} Arm */

/**
 * Guided terrain for an open sub-map, such as a region of a world. The
 * sub-map covers the bounding box of its block on the parent map, and each
 * of its cells samples the parent cells at the matching point. Coasts,
 * ranges, forests, and rivers of the parent then sit in the same places on
 * the sub-map, and small noise adds the detail that the parent is too
 * coarse to show. A cell of the sub-map maps to the parent with the same
 * projection that `RegionCrossing.projectAlong` uses for entry and border
 * crossing, so the land where the party arrives matches the parent cell it
 * came from.
 */

/** The smallest ratio between the side of a guided map and its block. */
export const GUIDE_SCALE = 1.5;

/** Elevation lines of a guided field. They match the targets in `CLIMATE`. */
const LINES = { deep: 0.12, sea: 0.3, hill: 0.62, mountain: 0.8 };

/**
 * The elevation `e`, moisture `m`, and temperature `t` that
 * `GeneratorTerrain.classifyBiome` turns back into each biome, with the
 * `LINES` above. Water, hills, and mountains give no moisture, and plain
 * hills and mountains give no temperature, so a foothill takes its climate
 * from the lowland beside it: desert foothills stay dry, and snowy
 * foothills stay cold.
 * @type {Record<string, { e: number, m?: number, t?: number }>}
 */
const CLIMATE = {
  'deep-water': { e: 0.04 },
  water: { e: 0.2 },
  swamp: { e: 0.35, m: 0.88, t: 0.5 },
  grass: { e: 0.47, m: 0.4, t: 0.5 },
  forest: { e: 0.47, m: 0.72, t: 0.5 },
  savanna: { e: 0.47, m: 0.5, t: 0.82 },
  jungle: { e: 0.47, m: 0.8, t: 0.82 },
  desert: { e: 0.47, m: 0.18, t: 0.82 },
  snow: { e: 0.47, m: 0.3, t: 0.16 },
  taiga: { e: 0.47, m: 0.65, t: 0.16 },
  glacier: { e: 0.47, m: 0.3, t: 0 },
  hills: { e: 0.71 },
  badlands: { e: 0.71, m: 0.18, t: 0.82 },
  'snow-hills': { e: 0.71, t: 0.1 },
  mountain: { e: 0.92 },
  'snow-mountain': { e: 0.92, t: 0.1 },
  volcanic: { e: 0.92, m: 0.18, t: 0.95 },
};

/** The climate of a cell with no guide value for it: temperate lowland. */
const DEFAULT_CLIMATE = { e: 0.47, m: 0.45, t: 0.5 };

/**
 * The spread of the detail noise on each field. Fractal noise stays near
 * the middle of its range, so a lowland cell reaches the hill line only
 * rarely, and most detail forms where two parent biomes meet.
 */
const DETAIL = { e: 0.5, m: 0.5, t: 0.2 };

/** How far, in parent cells, the warp noise moves the sample point. */
const WARP = 0.45;

/** Detail features per cell of the sub-map: about one feature per five cells. */
const DETAIL_UNIT = 0.2;

/** A tile image path, with the tile family as its first group. */
const TILE_FAMILY = /^assets\/tiles\/([^/]+)\//;

/** A river piece image path, with the piece name as its first group. */
const RIVER_PIECE = /\/river\/river-([a-z-]+)\.svg$/;

/**
 * The arms of each river piece name. The channel pieces come from
 * `connectorKind`. A bridge or a ford names the road that crosses the
 * river, so `bridge-h` has a north-south channel.
 * @type {Map<string, string>}
 */
const PIECE_ARMS = new Map([
  ...Array.from({ length: 15 }, (_, i) => {
    const arms = ARMS.map(([arm]) => arm).filter((__, k) => (i + 1) & (1 << k));
    return /** @type {[string, string]} */ ([connectorKind(new Set(arms)), arms.join('')]);
  }),
  ['bridge-h', 'ns'],
  ['ford-h', 'ns'],
  ['bridge-v', 'ew'],
  ['ford-v', 'ew'],
]);

/**
 * The guide for a site: the biome and the river arms of each parent cell
 * in the bounding box of `tileIds`, and which of them belong to the block.
 * Cells of the box outside the block keep their own terrain, such as the sea
 * or the land of a neighbor, so the land of the block meets them with the
 * right coast or climate.
 * @param {Tile[]} tiles the tiles of the parent map
 * @param {string[]} tileIds the tiles of the block, at least one
 * @returns {TerrainGuide}
 */
export function terrainGuide(tiles, tileIds) {
  const cells = tileIds.map((id) => /** @type {{ x: number, y: number }} */ (parseCoords(id)));
  const minX = Math.min(...cells.map((c) => c.x));
  const minY = Math.min(...cells.map((c) => c.y));
  const width = Math.max(...cells.map((c) => c.x)) - minX + 1;
  const height = Math.max(...cells.map((c) => c.y)) - minY + 1;
  const byId = new Map(tiles.map((t) => [t.id, t]));
  const own = new Set(tileIds);
  /** @type {(string | null)[]} */
  const biomes = [];
  /** @type {boolean[]} */
  const block = [];
  /** @type {string[]} */
  const rivers = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const id = tileIdAt(minX + x, minY + y);
      const tile = byId.get(id);
      block.push(own.has(id));
      const family = TILE_FAMILY.exec(tile?.imageRef ?? '')?.[1];
      biomes.push(family && family in BIOME_TERRAIN ? family : null);
      const piece = tile
        ? overlayList(tile)
            .map((ref) => RIVER_PIECE.exec(ref)?.[1])
            .find((kind) => kind)
        : undefined;
      rivers.push((piece && PIECE_ARMS.get(piece)) ?? '');
    }
  }
  return { width, height, biomes, rivers, block };
}

/**
 * The size preset of a guided map: the smallest preset at least
 * `GUIDE_SCALE` times the longer side of the guide, or the largest preset.
 * A block of one cell then gets a small map, and a wide block a vast one.
 * @param {TerrainGuide} guide
 * @returns {string}
 */
export function guideSize({ width, height }) {
  const want = Math.max(width, height) * GUIDE_SCALE;
  const presets = Object.entries(GENERATOR_SIZES).sort((a, b) => a[1] - b[1]);
  return (presets.find(([, n]) => n >= want) ?? presets[presets.length - 1])[0];
}

/**
 * The elevation band of an elevation value.
 * @param {number} e
 * @returns {'water' | 'land' | 'hill' | 'mountain'}
 */
function band(e) {
  if (e < LINES.sea) return 'water';
  if (e >= LINES.mountain) return 'mountain';
  return e >= LINES.hill ? 'hill' : 'land';
}

/**
 * The water cells of a guide that join the block. A water cell joins when
 * it touches the block, or when a chain of water cells links it to one
 * that does, by steps to the eight neighbors. A lake inside the land of a
 * neighbor does not join.
 * @param {TerrainGuide} guide
 * @returns {Uint8Array} 1 for each joined water cell, indexed like the guide
 */
function joinedSea({ width: gw, height: gh, biomes, block }) {
  /** @param {number} p @param {(q: number) => boolean} test */
  const anyNeighbor = (p, test) =>
    NEIGHBORS8.some(([dx, dy]) => {
      const x = (p % gw) + dx;
      const y = Math.floor(p / gw) + dy;
      return x >= 0 && y >= 0 && x < gw && y < gh && test(y * gw + x);
    });
  /** @param {number} p */
  const wet = (p) => {
    const b = biomes[p];
    return !block[p] && !!b && band(CLIMATE[b].e) === 'water';
  };
  const sea = new Uint8Array(gw * gh);
  // Each pass joins the water beside what has joined so far. A guide is
  // at most a few dozen cells across, so the passes stay cheap.
  for (let grew = true; grew;) {
    grew = false;
    for (let p = 0; p < sea.length; p++) {
      if (sea[p] || !wet(p) || !anyNeighbor(p, (q) => block[q] || sea[q] === 1)) continue;
      sea[p] = 1;
      grew = true;
    }
  }
  return sea;
}

/**
 * The cells of a guided map that stay painted. A cell stays when its
 * nearest parent cell is in the block, or is water that joins the block
 * (see `joinedSea`), so a coast keeps its sea out to the border of the map.
 * The land of a neighbor stays blank, and the map takes the outline of its
 * block on that side. The warp of the
 * sample point gives the outline the same bends as the terrain. Only the
 * largest connected area of painted cells stays, so a bend of the warp
 * leaves no painted speck that the party cannot walk to. A blank area that
 * does not reach the border fills in, so the map has no blank pit inside.
 * @param {number} size
 * @param {TerrainGuide} guide
 * @param {Int32Array} near the index in the guide of the nearest parent cell of each cell
 * @returns {Uint8Array} 1 for each painted cell, indexed `y * size + x`
 */
export function paintedMask(size, guide, near) {
  const { block } = guide;
  const sea = joinedSea(guide);
  const keep = Array.from(near, (p) => block[p] || sea[p] === 1);
  /**
   * Flood the cells that `ok` accepts from `starts`, by steps to the four
   * side neighbors.
   * @param {number[]} starts @param {(i: number) => boolean} ok
   * @returns {Uint8Array}
   */
  const flood = (starts, ok) => {
    const seen = new Uint8Array(size * size);
    const queue = starts.filter((i) => ok(i));
    for (const i of queue) seen[i] = 1;
    for (let q = 0; q < queue.length; q++) {
      const x = queue[q] % size;
      const y = Math.floor(queue[q] / size);
      for (const [dx, dy] of NEIGHBORS4) {
        const j = (y + dy) * size + x + dx;
        if (x + dx < 0 || y + dy < 0 || x + dx >= size || y + dy >= size) continue;
        if (seen[j] || !ok(j)) continue;
        seen[j] = 1;
        queue.push(j);
      }
    }
    return seen;
  };
  /** @type {Uint8Array} */
  let main = new Uint8Array(size * size);
  let best = 0;
  const done = new Uint8Array(size * size);
  for (let i = 0; i < keep.length; i++) {
    if (!keep[i] || done[i]) continue;
    const area = flood([i], (j) => keep[j]);
    let count = 0;
    for (let j = 0; j < area.length; j++) {
      if (!area[j]) continue;
      done[j] = 1;
      count++;
    }
    if (count > best) [main, best] = [area, count];
  }
  /** @type {number[]} */
  const border = [];
  for (let k = 0; k < size; k++) {
    border.push(k, (size - 1) * size + k, k * size, k * size + size - 1);
  }
  const outside = flood(border, (j) => !main[j]);
  return Uint8Array.from(outside, (o) => (o ? 0 : 1));
}

/**
 * Build the climate fields of a guided map and classify every cell, with
 * the rivers of the guide drawn at the scale of the map. Each field blends
 * the targets of the four parent cells around the sample point, and each
 * parent cell adds only the fields its biome gives (see `CLIMATE`). A cell
 * in the hill or the mountain band whose nearest parent cell is in the same
 * band takes that parent's biome, so plain hills in a desert stay hills and
 * a plain range does not turn to snow beside a snowfield.
 *
 * A river of the guide runs through the cells between the points of its
 * parent cells. Those cells stay above the sea line and below the mountain
 * line, because a river does not cross a mountain. A river that drains into
 * parent water runs until it reaches water, and a river that leaves the
 * box runs to the border and off the map.
 *
 * `painted` marks the cells that the map keeps (see `paintedMask`). The
 * caller drops the others, so the map takes the outline of its block.
 * @param {number} size side length in tiles
 * @param {TerrainGuide} guide
 * @param {() => number} rng
 * @returns {{ field: TerrainField, rivers: ArmNetwork, painted: Uint8Array }}
 */
export function guidedField(size, guide, rng) {
  const noise = {
    e: valueNoise(rng),
    m: valueNoise(rng),
    t: valueNoise(rng),
    wx: valueNoise(rng),
    wy: valueNoise(rng),
  };
  const { width: gw, height: gh } = guide;
  /** The parent coordinate of a child cell along one axis. @param {number} p @param {number} g */
  const toGuide = (p, g) => (g > 1 ? (p * (g - 1)) / (size - 1) : 0);
  /** The child cell of a parent coordinate along one axis. @param {number} p @param {number} g */
  const toChild = (p, g) => (g > 1 ? Math.round((p * (size - 1)) / (g - 1)) : (size - 1) >> 1);
  const n = size * size;
  const elevation = new Float64Array(n);
  const moisture = new Float64Array(n);
  const heat = new Float64Array(n);
  /** The index in the guide of the parent cell nearest each cell. */
  const near = new Int32Array(n);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const dx = x * DETAIL_UNIT;
      const dy = y * DETAIL_UNIT;
      const u = clamp(toGuide(x, gw) + (fbm(noise.wx, dx, dy, 2) - 0.5) * 2 * WARP, 0, gw - 1);
      const v = clamp(toGuide(y, gh) + (fbm(noise.wy, dx, dy, 2) - 0.5) * 2 * WARP, 0, gh - 1);
      const x0 = Math.floor(u);
      const y0 = Math.floor(v);
      const fu = u - x0;
      const fv = v - y0;
      const x1 = Math.min(x0 + 1, gw - 1);
      const y1 = Math.min(y0 + 1, gh - 1);
      const corners = /** @type {[number, number, number][]} */ ([
        [x0, y0, (1 - fu) * (1 - fv)],
        [x1, y0, fu * (1 - fv)],
        [x0, y1, (1 - fu) * fv],
        [x1, y1, fu * fv],
      ]);
      /** @param {'e' | 'm' | 't'} key */
      const blend = (key) => {
        let sum = 0;
        let weight = 0;
        for (const [cx, cy, w] of corners) {
          const value = CLIMATE[guide.biomes[cy * gw + cx] ?? '']?.[key];
          if (value === undefined || w <= 0) continue;
          sum += value * w;
          weight += w;
        }
        return weight > 0 ? sum / weight : DEFAULT_CLIMATE[key];
      };
      elevation[i] = blend('e') + (fbm(noise.e, dx, dy) - 0.5) * DETAIL.e;
      moisture[i] = blend('m') + (fbm(noise.m, dx, dy, 3) - 0.5) * DETAIL.m;
      heat[i] = blend('t') + (fbm(noise.t, dx, dy, 2) - 0.5) * DETAIL.t;
      near[i] = Math.round(v) * gw + Math.round(u);
    }
  }
  const rivers = new ArmNetwork();
  /** Keep a river cell on land and off the mountains. @param {number} x @param {number} y */
  const carve = (x, y) => {
    const i = y * size + x;
    elevation[i] = clamp(elevation[i], LINES.sea + 0.02, LINES.mountain - 0.02);
  };
  /**
   * Run a channel from (ax, ay) to (bx, by), along the longer gap first.
   * With `drain`, the channel stops at the first water cell and does not
   * carve the cells it passes.
   * @param {number} ax @param {number} ay @param {number} bx @param {number} by
   * @param {boolean} drain
   * @returns {boolean} whether the channel stopped at water
   */
  const channel = (ax, ay, bx, by, drain) => {
    let [x, y] = [ax, ay];
    carve(x, y);
    while (x !== bx || y !== by) {
      const step =
        Math.abs(bx - x) >= Math.abs(by - y) ? [Math.sign(bx - x), 0] : [0, Math.sign(by - y)];
      const arm = /** @type {Arm} */ (
        /** @type {readonly [Arm, number, number]} */ (
          ARMS.find(([, sx, sy]) => sx === step[0] && sy === step[1])
        )[0]
      );
      if (drain && elevation[(y + step[1]) * size + x + step[0]] < LINES.sea) {
        rivers.add(x, y, arm);
        return true;
      }
      rivers.join(x, y, arm);
      x += step[0];
      y += step[1];
      if (!drain) carve(x, y);
    }
    return false;
  };
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const ax = toChild(gx, gw);
      const ay = toChild(gy, gh);
      for (const [arm, sx, sy] of ARMS) {
        if (!guide.rivers[gy * gw + gx].includes(arm)) continue;
        const nx = gx + sx;
        const ny = gy + sy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) {
          // The river leaves the box, so it runs to the border and off it.
          const bx = sx ? (sx < 0 ? 0 : size - 1) : ax;
          const by = sy ? (sy < 0 ? 0 : size - 1) : ay;
          if (!channel(ax, ay, bx, by, false)) rivers.add(bx, by, arm);
          continue;
        }
        const next = guide.rivers[ny * gw + nx];
        // Each channel between two river cells runs once, from the cell
        // west or north of the pair.
        if (next && (arm === 'n' || arm === 'w')) continue;
        const bx = toChild(nx, gw);
        const by = toChild(ny, gh);
        if (next) {
          channel(ax, ay, bx, by, false);
        } else {
          // A river cell beside a cell with no river drains into it, which
          // is water on a generated parent. The point of that cell turns to
          // water, so the drain always ends in water.
          const at = by * size + bx;
          elevation[at] = Math.min(elevation[at], LINES.sea - 0.05);
          channel(ax, ay, bx, by, true);
        }
      }
    }
  }
  /** @type {string[]} */
  const biomes = new Array(n);
  for (let i = 0; i < n; i++) {
    const e = elevation[i];
    const parent = guide.biomes[near[i]];
    const high = band(e) === 'hill' || band(e) === 'mountain';
    biomes[i] =
      high && parent && band(CLIMATE[parent].e) === band(e)
        ? parent
        : classifyBiome(e, moisture[i], heat[i], LINES);
  }
  const cells = biomes.map((b) => BIOME_TERRAIN[b]);
  const painted = paintedMask(size, guide, near);
  return { field: { size, elevation, biomes, cells, lines: LINES }, rivers, painted };
}
