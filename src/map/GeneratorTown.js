import { ArmNetwork, ARMS, OPPOSITE, smoothCoastline } from './Autotile.js';
import { terrainTiles } from './GeneratorGround.js';
import { distanceTo, layRoad, routeRoad } from './GeneratorRoads.js';
import { placeBuildings } from './GeneratorTownBuildings.js';
import { planDocks } from './GeneratorTownDocks.js';
import { randInt, shuffle } from './GeneratorRandom.js';
import { maskAt, tileIdAt } from './MapGeometry.js';
import { planWall, wallRadii } from './GeneratorTownWall.js';

/** @typedef {import('../types/map.js').Tile} Tile */
/** @typedef {import('../types/map.js').GeneratedSite} GeneratedSite */
/** @typedef {import('../types/map.js').TownDock} TownDock */
/** @typedef {import('./Autotile.js').Arm} Arm */
/** @typedef {import('./GeneratorRoads.js').RoadGround} RoadGround */
/** @typedef {import('./TilePalette.js').TilePalette} TilePalette */
/** @typedef {import('./TilePalette.js').PaletteEntry} PaletteEntry */

/**
 * The town archetype generator. A town is a core of streets and buildings
 * around a central crossroads, with farms and fields on the outskirts. Some
 * towns have a river, which the streets cross on bridges. MapGenerator.js
 * keeps the size presets and the archetype dispatch.
 */

/**
 * The interior environ of each building that opens into a sub-map of its
 * own. A well, a fountain, a market, and a graveyard are open ground, so they
 * have no inside. The larger public buildings get a medium map.
 * @type {Record<string, { environ: string, size: string }>}
 */
const BUILDING_INTERIORS = {
  inn: { environ: 'inn', size: 'medium' },
  tavern: { environ: 'tavern', size: 'medium' },
  blacksmith: { environ: 'shop', size: 'small' },
  'general-store': { environ: 'shop', size: 'small' },
  alchemist: { environ: 'shop', size: 'small' },
  bakery: { environ: 'shop', size: 'small' },
  temple: { environ: 'temple', size: 'medium' },
  shrine: { environ: 'temple', size: 'small' },
  'wizard-tower': { environ: 'academy', size: 'small' },
  academy: { environ: 'academy', size: 'medium' },
  barracks: { environ: 'barracks', size: 'medium' },
  guildhall: { environ: 'guildhall', size: 'medium' },
  'town-hall': { environ: 'guildhall', size: 'medium' },
  warehouse: { environ: 'warehouse', size: 'small' },
  stables: { environ: 'warehouse', size: 'small' },
  watermill: { environ: 'warehouse', size: 'small' },
  windmill: { environ: 'warehouse', size: 'small' },
  house: { environ: 'house', size: 'small' },
  cottage: { environ: 'house', size: 'small' },
  farm: { environ: 'house', size: 'small' },
};

/** The extra cost of a bend in a street, so streets run straight. */
const TURN = 0.6;

/** @type {Record<Arm, Arm>} the arm that a transposed grid gives each arm */
const TRANSPOSE = { n: 'w', w: 'n', s: 'e', e: 's' };

/** @typedef {import('./GeneratorTownBuildings.js').TownBuilding} TownBuilding */

/**
 * @typedef {{
 *   size: number,
 *   cells: string[],
 *   rivers: ArmNetwork,
 *   roads: ArmNetwork,
 *   entry: string,
 *   buildings: TownBuilding[],
 *   walls: Map<string, string>,
 *   sea: Arm | null,
 *   docks: TownDock[],
 * }} TownPlan
 * `cells` is the terrain type per cell, indexed `y * size + x`. `entry` is
 * the border cell of the first street out of town. `walls` maps each tile id
 * of the town wall to its piece, for example `wall-h` or `gate-v`, and is
 * empty for a town with no wall. `sea` is the border side of the sea of a
 * port, or null for an inland town. `docks` lists the piers of a port,
 * and is empty for an inland town.
 */

/**
 * A river that crosses the whole town, north to south or west to east. It
 * stays at least two cells from the center line, so it never runs through
 * the crossroads. It moves one cell sideways at random, but never on two
 * rows in a row, so each bend has a straight channel next to it that a
 * bridge fits. When `ring` is the radius of a wall ring, the river never
 * runs along a side of the ring and never bends on it, so it goes straight
 * through the wall under a water gate. A port passes `axis`, so that its
 * river runs across the town into the sea.
 * @param {number} size @param {() => number} rng
 * @param {number} center the index of the center row and column
 * @param {number} [ring] the radius of the ring to keep clear, or 0 for none
 * @param {'v' | 'h'} [axis] north to south (`v`) or west to east (`h`),
 *   or a random choice when omitted
 * @returns {ArmNetwork}
 */
export function townRiver(size, rng, center, ring = 0, axis) {
  const rivers = new ArmNetwork();
  const vertical = axis ? axis === 'v' : rng() < 0.5;
  // Work along the river (v) and across it (u), then transpose for a river
  // that runs west to east.
  /** @param {number} u @param {number} v @param {Arm} arm */
  const add = (u, v, arm) => (vertical ? rivers.add(u, v, arm) : rivers.add(v, u, TRANSPOSE[arm]));
  /** @param {number} u @param {number} v @param {Arm} arm */
  const join = (u, v, arm) =>
    vertical ? rivers.join(u, v, arm) : rivers.join(v, u, TRANSPOSE[arm]);
  /** @param {number} u */
  const clear = (u) =>
    u >= 1 && u <= size - 2 && Math.abs(u - center) >= 2 && Math.abs(u - center) !== ring;
  /** @type {number[]} */
  const offsets = [];
  for (let d = 2; d < Math.max(3, Math.floor(size / 2) - 1); d++) if (d !== ring) offsets.push(d);
  const offset = offsets[randInt(rng, offsets.length)];
  let u = center + (rng() < 0.5 ? -offset : offset);
  add(u, 0, 'n');
  let jogged = true;
  for (let v = 0; v < size; v++) {
    const du = rng() < 0.5 ? -1 : 1;
    const onRing = ring > 0 && Math.abs(v - center) === ring;
    /** @type {boolean} */
    const jog = !jogged && !onRing && v < size - 1 && rng() < 0.25 && clear(u + du);
    if (jog) {
      join(u, v, du < 0 ? 'w' : 'e');
      u += du;
    }
    jogged = jog;
    if (v < size - 1) join(u, v, 's');
    else add(u, v, 's');
  }
  return rivers;
}

/**
 * The sides that the sea of a port can take. The south side keeps the
 * entry street, so the party always enters a port on land.
 * @type {Arm[]}
 */
export const SEA_SIDES = ['n', 'e', 'w'];

/**
 * The ground of a port: water along one border from SEA_SIDES, and grass
 * everywhere else. The sea reaches between `low` and `high` cells into the
 * map, about a tenth of the map side. Its depth moves by one cell at a time
 * along the border, so the shore bends. `smoothCoastline` then fills each
 * notch that the coast pieces cannot draw. The sea keeps well clear of the
 * crossroads and of the middle of each other border, where the streets
 * leave.
 * @param {number} size @param {() => number} rng
 * @returns {{ side: Arm, cells: string[] }} `cells` is indexed `y * size + x`
 */
export function townSea(size, rng) {
  const side = SEA_SIDES[randInt(rng, SEA_SIDES.length)];
  const low = Math.max(1, Math.round(size * 0.08));
  const high = low + Math.round(size * 0.06);
  const cells = new Array(size * size).fill('grass');
  let depth = low + randInt(rng, high - low + 1);
  for (let u = 0; u < size; u++) {
    if (rng() < 0.3) depth = Math.min(high, Math.max(low, depth + (rng() < 0.5 ? -1 : 1)));
    for (let d = 0; d < depth; d++) {
      const [x, y] = side === 'n' ? [u, d] : side === 'w' ? [d, u] : [size - 1 - d, u];
      cells[y * size + x] = 'water';
    }
  }
  return { side, cells: smoothCoastline(cells, size, size) };
}

/**
 * Lay the streets. The first street runs from the south edge to the
 * crossroads. Each later street runs from another edge to the nearest
 * street. A town of 14 cells or more has three ways out, and one of 22 or
 * more has four. In a town of 14 cells or more, short lanes then run from
 * open ground in the core to the nearest street, so the core fills with
 * blocks. A street always finds a
 * way, because the river never bends on two rows in a row and so always
 * has a straight channel to bridge. No street leaves on the side of the
 * sea, so a port of 22 cells or more has three ways out, not four.
 * @param {RoadGround} ground @param {number} c the center index
 * @param {number} core the core radius @param {() => number} rng
 * @param {Arm | null} sea the side of the sea, or null for an inland town
 * @returns {string} the entry: the border cell of the first street
 */
function layStreets(ground, c, core, rng, sea) {
  const { size, rivers, roads } = ground;
  const toCenter = distanceTo([[c, c]]);
  /** @param {number} x @param {number} y */
  const onRoad = (x, y) => roads.has(x, y);
  const count = size >= 22 ? 4 : size >= 14 ? 3 : 2;
  const others = /** @type {Arm[]} */ (['n', 'e', 'w']).filter((side) => side !== sea);
  const sides = /** @type {Arm[]} */ (['s', ...shuffle(others, rng)]).slice(0, count);
  const spread = Math.max(1, Math.floor(size / 6));
  /** @type {string[]} */
  const exits = [];
  for (const side of sides) {
    // The street leaves near the middle of its edge, never on the river.
    /** @type {[number, number][]} */
    const starts = [];
    for (let i = c - spread; i <= c + spread; i++) {
      const at = /** @type {[number, number]} */ (
        side === 'n' ? [i, 0] : side === 's' ? [i, size - 1] : side === 'w' ? [0, i] : [size - 1, i]
      );
      if (!rivers.has(...at)) starts.push(at);
    }
    const start = starts[randInt(rng, starts.length)];
    const goal = exits.length
      ? onRoad
      : (/** @type {number} */ x, /** @type {number} */ y) => x === c && y === c;
    const heading = ARMS.findIndex(([arm]) => arm === OPPOSITE[side]);
    const path = routeRoad(ground, start, goal, toCenter, heading);
    layRoad(roads, /** @type {[number, number][]} */ (path));
    roads.add(start[0], start[1], side);
    exits.push(tileIdAt(...start));
  }
  /** @param {number} x @param {number} y */
  const nearRoad = (x, y) => {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) if (roads.has(x + dx, y + dy)) return true;
    }
    return false;
  };
  /** @type {[number, number][]} */
  const seeds = [];
  for (let y = c - core; y <= c + core; y++) {
    for (let x = c - core; x <= c + core; x++) seeds.push([x, y]);
  }
  // A lane in a town under 14 cells takes the ground that its three
  // buildings need, so a small town gets none.
  let lanes = size >= 14 ? Math.floor(size / 5) : 0;
  for (const [x, y] of shuffle(seeds, rng)) {
    if (!lanes) break;
    if (rivers.has(x, y) || nearRoad(x, y)) continue;
    layRoad(roads, /** @type {[number, number][]} */ (routeRoad(ground, [x, y], onRoad, toCenter)));
    lanes--;
  }
  return exits[0];
}

/**
 * Plan a town: its river, streets, plaza, wall, buildings, and fields, with
 * no tiles. The core is the square of cells within `core` of the
 * crossroads. The plaza paves the cells within one cell of the crossroads,
 * or within two on a map of 32 cells or more. `placeBuildings` in
 * GeneratorTownBuildings.js then puts each building on a 2x2 block of open
 * ground and plants the fields.
 *
 * The `coast` environ makes the town a port, with the sea from `townSea`.
 * The river of a port runs across the town into the sea, and the river
 * cells under the sea drop out of the network, so the channel drains into
 * the water. Streets keep off the sea, and walls and buildings also keep
 * off its shore. `planDocks` then puts one pier, or two in a port of 22
 * cells or more, on the shore, with a street from each quay to the town.
 * It runs after the wall, so a dock street never crosses the wall. A port
 * under 14 cells has no river, because the sea and a river leave too
 * little ground for its three buildings. A town with any
 * other environ has no sea.
 * @param {number} size @param {() => number} rng
 * @param {string} [environ] the environ of the town node
 * @returns {TownPlan}
 */
export function planTown(size, rng, environ) {
  const c = Math.floor(size / 2);
  const core = Math.max(3, Math.round(size * 0.3));
  const port = environ === 'coast' ? townSea(size, rng) : null;
  const cells = port?.cells ?? new Array(size * size).fill('grass');
  const sea = port?.side ?? null;
  const ring = wallRadii(size, c, core)[0] ?? 0;
  const axis = sea === 'n' ? 'v' : sea ? 'h' : undefined;
  const river = rng() < 0.6 && !(port && size < 14);
  const rivers = river ? townRiver(size, rng, c, ring, axis) : new ArmNetwork();
  const water = maskAt(cells, size, size, 'water');
  for (const id of [...rivers.arms.keys()]) {
    const [x, y] = id.split(',').map(Number);
    if (water(x, y)) rivers.drop(x, y);
  }
  /** @param {number} x @param {number} y a cell under the sea or beside it */
  const shore = (x, y) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) if (water(x + dx, y + dy)) return true;
    }
    return false;
  };
  const roads = new ArmNetwork();
  const entry = layStreets({ size, cells, rivers, roads, turn: TURN }, c, core, rng, sea);
  const walls = planWall({ size, roads, rivers, sea: shore, side: sea ?? undefined }, c, core, rng);
  const docks = sea ? planDocks({ size, cells, rivers, roads, turn: TURN }, sea, rng, walls) : [];
  const square = size >= 32 ? 2 : 1;
  /** @param {number} x @param {number} y */
  const paved = (x, y) => Math.max(Math.abs(x - c), Math.abs(y - c)) <= square && !rivers.has(x, y);
  for (let y = c - square; y <= c + square; y++) {
    for (let x = c - square; x <= c + square; x++) if (paved(x, y)) cells[y * size + x] = 'plaza';
  }
  const lot = { size, c, core, cells, roads, rivers, walls, paved, sea: shore };
  const buildings = placeBuildings(lot, rng);
  return { size, cells, rivers, roads, entry, buildings, walls, sea, docks };
}

/**
 * Generate a town from its plan. The streets and the river draw as
 * overlays, with a bridge where a street crosses the river, and the wall
 * pieces draw as overlays in place of any street under them. The plaza
 * takes no street overlay, so the streets open onto the cobbles. Each building
 * marker draws with span 2 over its block, and the covered cells keep their
 * grass under the scaled art. Each building with an inside is a site whose
 * four cells all link to its interior, so the party can enter from any cell
 * under the art. The sea of a port draws as water tiles, and its shore
 * takes the coast overlays. Each quay draws over its coast piece in place
 * of the street piece, because the quay art draws its own street, and each
 * pier draws as dock overlays on the water tiles.
 * @param {TilePalette} palette @param {number} size @param {() => number} rng
 * @param {string} [environ] the environ of the town node; `coast` makes a port
 * @returns {{ tiles: Tile[], entry: string, sites: GeneratedSite[] }}
 */
export function generateTown(palette, size, rng, environ) {
  const plan = planTown(size, rng, environ);
  const bare = new Set(plan.buildings.map((b) => b.id));
  for (let i = 0; i < plan.cells.length; i++) {
    if (plan.cells[i] === 'plaza') bare.add(tileIdAt(i % size, Math.floor(i / size)));
  }
  const tiles = terrainTiles(palette, plan, rng, bare);
  const byId = new Map(tiles.map((t) => [t.id, t]));
  for (const { id, art, poi } of plan.buildings) {
    const tile = /** @type {Tile} */ (byId.get(id));
    tile.imageRef = /** @type {PaletteEntry} */ (palette.get(art)).imageRef;
    tile.span = 2;
    tile.metadata = { ...tile.metadata, poiType: poi };
  }
  for (const [id, piece] of plan.walls) {
    const tile = /** @type {Tile} */ (byId.get(id));
    tile.overlayRef = /** @type {PaletteEntry} */ (palette.getTownWallPiece(piece)).imageRef;
  }
  /** @param {string} kind */
  const dock = (kind) => /** @type {PaletteEntry} */ (palette.getDockPiece(kind)).imageRef;
  for (const { side, quay, pier } of plan.docks) {
    const shore = /** @type {PaletteEntry} */ (palette.getCoastPiece(side)).imageRef;
    /** @type {Tile} */ (byId.get(quay)).overlayRef = [shore, dock(`quay-${side}`)];
    const run = side === 'n' || side === 's' ? 'pier-v' : 'pier-h';
    pier.forEach((id, i) => {
      const kind = i === pier.length - 1 ? `pier-head-${side}` : run;
      /** @type {Tile} */ (byId.get(id)).overlayRef = dock(kind);
    });
  }
  /** @type {GeneratedSite[]} */
  const sites = [];
  for (const { id, art } of plan.buildings) {
    const inside = BUILDING_INTERIORS[art];
    if (!inside) continue;
    const [x, y] = id.split(',').map(Number);
    const tileIds = [
      tileIdAt(x, y),
      tileIdAt(x + 1, y),
      tileIdAt(x, y + 1),
      tileIdAt(x + 1, y + 1),
    ];
    sites.push({ tileIds, archetype: 'building', kind: 'interior', label: art, ...inside });
  }
  return { tiles, entry: plan.entry, sites };
}
