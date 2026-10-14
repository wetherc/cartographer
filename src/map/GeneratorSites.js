import { tileIdAt } from './MapGeometry.js';
import { ArmNetwork } from './Autotile.js';
import { chebyshev } from './GeneratorGround.js';
import { distanceTo, layRoad, roadAreas, routeRoad } from './GeneratorRoads.js';

/** @typedef {import('../types/map.js').POIType} POIType */
/** @typedef {import('../types/map.js').GeneratedSite} GeneratedSite */
/** @typedef {import('./GeneratorGround.js').WildTerrain} WildTerrain */

/**
 * The places on an open-terrain map that people built: settlements, a keep,
 * and a dungeon, plus the farmland and roads around them. Each place is a
 * site. A site marks one tile with a marker and names the archetype that the
 * place would have as a sub-map of its own.
 */

/**
 * @typedef {{
 *   x: number,
 *   y: number,
 *   tileId: string,
 *   marker: string,
 *   poi: POIType,
 *   archetype: string,
 *   coast?: boolean,
 * }} Site
 * `marker` is the palette id of the marker art. `archetype` is the
 * generator archetype for the place's own map: town, castle, or dungeon.
 * `coast` marks a settlement beside open water.
 */

/**
 * The rules a site cell keeps, strictest first, as `[margin, shore]`: the
 * fewest cells between the site and the border, and whether the site can
 * stand beside water. `planSites` uses the first rule that leaves room.
 * @type {ReadonlyArray<readonly [number, boolean]>}
 */
const SITE_RULES = [
  [2, false],
  [1, false],
  [1, true],
];

/**
 * How many of each site a map of this side length gets. A small map holds
 * one settlement. A vast map holds five, a keep, and a dungeon.
 * @param {number} size
 */
export function siteCounts(size) {
  return {
    settlements: Math.max(1, Math.round(size / 10)),
    keep: size >= 22 ? 1 : 0,
    dungeon: size >= 14 ? 1 : 0,
  };
}

/**
 * Choose the sites of an open-terrain map. A settlement prefers grass near
 * a river or a lake, because marker art sits on a grass background and
 * towns grow beside water. A settlement with at least four water cells
 * within two cells of it is on the coast and becomes a port, so a pond does
 * not make a harbor. The first settlement takes the best spot, and on a map
 * of 32 cells or more it is a city, on the coast or not. Each later
 * settlement is a village with a chance of one in two. The keep stands at
 * the foot of the hills when it can, and the dungeon stands as far from
 * every settlement as the map allows.
 *
 * No site sits on a river, a shoreline, or within two cells of the border,
 * so its marker never hides an overlay and a road can reach it from every
 * side. The settlements and the keep stand in the one road area (see
 * `roadAreas`) with the most room for them, so a road can join them all.
 * That area has a cell on the border when any area with room does, so a
 * road can leave the map from the sites. A map whose areas all stay off
 * the border, such as an island, takes the area with the most room. The
 * dungeon has no road and can stand in any area. A map with no room
 * that keeps these rules, such as a small map crossed by a lake, lets its
 * sites stand one cell from the border, and then beside the water, so it
 * still gets its settlement. The first rule that finds room in an area on
 * the border wins over a stricter rule that finds room only in an area off
 * the border.
 * @param {WildTerrain} terrain
 * @param {() => number} rng
 * @returns {Site[]}
 */
export function planSites(terrain, rng) {
  const { size, cells, rivers } = terrain;
  const areas = roadAreas(terrain);
  /** @param {number} x @param {number} y @param {number} r @param {(t: string) => boolean} test */
  const within = (x, y, r, test) => {
    for (let yy = Math.max(0, y - r); yy <= Math.min(size - 1, y + r); yy++) {
      for (let xx = Math.max(0, x - r); xx <= Math.min(size - 1, x + r); xx++) {
        if ((xx !== x || yy !== y) && test(cells[yy * size + xx])) return true;
      }
    }
    return false;
  };
  const wet = (/** @type {string} */ t) => t === 'water';
  /** @param {number} x @param {number} y */
  const waterNear = (x, y) => {
    let count = 0;
    for (let yy = Math.max(0, y - 2); yy <= Math.min(size - 1, y + 2); yy++) {
      for (let xx = Math.max(0, x - 2); xx <= Math.min(size - 1, x + 2); xx++) {
        if (cells[yy * size + xx] === 'water') count++;
      }
    }
    return count;
  };
  /**
   * The cells a site can take with a border gap of `margin` cells.
   * @param {number} margin @param {boolean} shore whether a cell beside water counts
   */
  const cellsFor = (margin, shore) => {
    /** @type {{ x: number, y: number }[]} */
    const out = [];
    for (let y = margin; y < size - margin; y++) {
      for (let x = margin; x < size - margin; x++) {
        if (areas[y * size + x] !== -1 && (shore || !within(x, y, 1, wet))) out.push({ x, y });
      }
    }
    return out;
  };
  /** @type {Set<number>} the road areas with a cell on the border */
  const edge = new Set();
  for (let i = 0; i < size; i++) {
    for (const j of [i, (size - 1) * size + i, i * size, i * size + size - 1]) edge.add(areas[j]);
  }
  /** @type {{ x: number, y: number }[]} */
  let open = [];
  /** @type {{ x: number, y: number }[]} */
  let linked = [];
  /**
   * Find the rule and the area for the linked sites. With `border` set,
   * only an area with a border cell counts.
   * @param {boolean} border
   */
  const choose = (border) => {
    for (const [margin, shore] of SITE_RULES) {
      open = cellsFor(margin, shore);
      /** @type {Map<number, number>} */
      const room = new Map();
      for (const { x, y } of open) {
        const a = areas[y * size + x];
        if (!border || edge.has(a)) room.set(a, (room.get(a) ?? 0) + 1);
      }
      const main = [...room].reduce((best, next) => (next[1] > best[1] ? next : best), [-1, 0])[0];
      linked = open.filter(({ x, y }) => areas[y * size + x] === main);
      if (linked.length) return true;
    }
    return false;
  };
  if (!choose(true)) choose(false);
  const counts = siteCounts(size);
  /** @type {Site[]} */
  const sites = [];
  const spacing = Math.max(4, Math.round(size / 5));
  /**
   * Take the best-scoring cell of `from` that keeps `gap` from every site.
   * @param {(x: number, y: number) => number} score
   * @param {number} gap
   * @param {{ x: number, y: number }[]} [from]
   * @returns {{ x: number, y: number } | null}
   */
  const take = (score, gap, from = linked) => {
    let pick = null;
    let top = -Infinity;
    for (const cell of from) {
      if (sites.some((s) => chebyshev(s.x, s.y, cell.x, cell.y) < gap)) continue;
      const s = score(cell.x, cell.y) + rng() * 0.5;
      if (s > top) {
        top = s;
        pick = cell;
      }
    }
    return pick;
  };
  /** @param {number} x @param {number} y */
  const grass = (x, y) => (cells[y * size + x] === 'grass' ? 3 : 0);
  /**
   * @param {{ x: number, y: number } | null} at
   * @param {string} marker @param {POIType} poi @param {string} archetype
   * @param {{ coast?: boolean }} [extra]
   */
  const add = (at, marker, poi, archetype, extra = {}) => {
    if (at) sites.push({ ...at, tileId: tileIdAt(at.x, at.y), marker, poi, archetype, ...extra });
  };

  for (let i = 0; i < counts.settlements; i++) {
    const at = take(
      (x, y) => grass(x, y) + (rivers.near(x, y, 2) ? 2 : 0) + (within(x, y, 2, wet) ? 1.5 : 0),
      spacing,
    );
    const coast = at !== null && waterNear(at.x, at.y) >= 4;
    const later = rng() < 0.5 ? 'village' : 'settlement';
    const marker = i === 0 && size >= 32 ? 'city' : coast ? 'port' : i === 0 ? 'settlement' : later;
    add(at, marker, 'settlement', 'town', { coast });
  }
  if (counts.keep) {
    const hill = (/** @type {string} */ t) => t === 'hills' || t === 'mountain';
    add(
      take((x, y) => grass(x, y) + (within(x, y, 1, hill) ? 2 : 0), 3),
      'castle',
      'landmark',
      'castle',
    );
  }
  if (counts.dungeon) {
    const towns = sites.filter((s) => s.archetype === 'town').map((s) => [s.x, s.y]);
    const far = distanceTo(/** @type {[number, number][]} */ (towns));
    add(
      take((x, y) => grass(x, y) + far(x, y) / 2, 3, open),
      'dungeon',
      'dungeon',
      'dungeon',
    );
  }
  return sites;
}

/**
 * Turn grass around each settlement into farmland: each grass cell within
 * two cells of a settlement becomes a field with a chance of one in two.
 * The settlement's own cell stays grass under its marker.
 * @param {WildTerrain} terrain
 * @param {Site[]} sites
 * @param {() => number} rng
 */
export function plantFarmland(terrain, sites, rng) {
  const { size, cells } = terrain;
  for (const site of sites) {
    if (site.archetype !== 'town') continue;
    for (let y = site.y - 2; y <= site.y + 2; y++) {
      for (let x = site.x - 2; x <= site.x + 2; x++) {
        if (x < 0 || y < 0 || x >= size || y >= size || (x === site.x && y === site.y)) continue;
        if (cells[y * size + x] === 'grass' && rng() < 0.5) cells[y * size + x] = 'farmland';
      }
    }
  }
}

/**
 * Lay the roads that join the settlements and the keep, and the roads that
 * leave the map. The sites join as a minimum spanning tree, shortest link
 * first, so every reachable site connects with no redundant road. The tree
 * grows from the first site, and a site that no road can reach, for
 * example across a lake, stays out of it. Then one road runs from the tree
 * site nearest the border off the map edge, and a map of 32 or more cells
 * gets a second exit on a far part of the border. So every exit leads to
 * the first site. The dungeon gets no road, because it is hidden.
 * @param {WildTerrain} terrain
 * @param {Site[]} sites
 * @returns {{ roads: ArmNetwork, exits: string[] }} `exits` lists the
 *   border tiles where a road leaves the map, first exit first
 */
export function connectSites(terrain, sites) {
  const { size, cells, rivers } = terrain;
  const roads = new ArmNetwork();
  const linked = sites.filter((s) => s.archetype !== 'dungeon');
  const siteAt = new Set(sites.map((s) => s.y * size + s.x));
  /** @type {import('./GeneratorRoads.js').RoadGround} */
  const ground = { size, cells, rivers, roads, blocked: (x, y) => siteAt.has(y * size + x) };
  /** @type {string[]} */
  const exits = [];
  if (!linked.length) return { roads, exits };
  const areas = roadAreas(ground);
  /** @param {Site} s */
  const areaOf = (s) => areas[s.y * size + s.x];

  // Prim's algorithm: grow the tree from the first site by its nearest
  // outside site each round. A pair that no road joins is left out, and a
  // site joins the tree only by a road that exists. A pair in two areas
  // cannot join, so it skips the search.
  const inTree = new Set([linked[0]]);
  const rest = linked.slice(1);
  /** @type {Set<string>} */
  const failed = new Set();
  for (;;) {
    let bestPair = null;
    let bestDist = Infinity;
    for (const a of inTree) {
      for (const b of rest) {
        const d = chebyshev(a.x, a.y, b.x, b.y);
        if (d < bestDist && !failed.has(`${a.tileId} ${b.tileId}`)) {
          bestDist = d;
          bestPair = { a, b };
        }
      }
    }
    if (!bestPair) break;
    const { a, b } = bestPair;
    const path =
      areaOf(a) === areaOf(b) &&
      routeRoad(ground, [a.x, a.y], (x, y) => x === b.x && y === b.y, distanceTo([[b.x, b.y]]));
    if (!path) {
      failed.add(`${a.tileId} ${b.tileId}`);
      continue;
    }
    layRoad(roads, path);
    rest.splice(rest.indexOf(b), 1);
    inTree.add(b);
  }

  /** @param {number} x @param {number} y */
  const edgeGap = (x, y) => Math.min(x, y, size - 1 - x, size - 1 - y);
  // The exits start from the tree, and end on a border cell in its area.
  const home = areaOf(linked[0]);
  /** @type {[number, number][]} */
  const border = [];
  for (let i = 0; i < areas.length; i++) {
    const x = i % size;
    const y = Math.floor(i / size);
    if (home !== -1 && areas[i] === home && edgeGap(x, y) === 0) border.push([x, y]);
  }
  const byEdge = linked
    .filter((s) => inTree.has(s))
    .sort((p, q) => edgeGap(p.x, p.y) - edgeGap(q.x, q.y));
  const wanted = size >= 32 ? 2 : 1;
  for (const site of byEdge) {
    if (exits.length >= wanted) break;
    const firstExit = exits[0]?.split(',').map(Number);
    const goals = new Set(
      border
        .filter(([x, y]) => !firstExit || chebyshev(x, y, firstExit[0], firstExit[1]) >= size / 2)
        .map(([x, y]) => y * size + x),
    );
    // With no goal, each search would cover the whole area and fail.
    if (!goals.size) break;
    const path = routeRoad(ground, [site.x, site.y], (x, y) => goals.has(y * size + x), edgeGap);
    if (!path) continue;
    layRoad(roads, path);
    const [bx, by] = path[path.length - 1];
    roads.add(bx, by, by === 0 ? 'n' : by === size - 1 ? 's' : bx === 0 ? 'w' : 'e');
    exits.push(tileIdAt(bx, by));
  }
  return { roads, exits };
}

/**
 * The sub-map of a site. A settlement opens into a town region: a city
 * gets a large map, a village a small one, and a town or a port a medium
 * one. A keep and a dungeon open into a medium interior.
 * @param {Site} site
 * @returns {GeneratedSite}
 */
export function siteMap(site) {
  const town = site.archetype === 'town';
  return {
    tileIds: [site.tileId],
    archetype: site.archetype,
    kind: town ? 'region' : 'interior',
    environ: !town ? site.archetype : site.coast ? 'coast' : 'grassland',
    size: site.marker === 'city' ? 'large' : site.marker === 'village' ? 'small' : 'medium',
    label: site.marker,
  };
}
