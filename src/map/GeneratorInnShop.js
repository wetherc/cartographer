import { tileIdAt } from './MapGeometry.js';
import { DOOR_H, DOOR_V, FLOOR, maskTiles, tileStamper, WALL } from './GeneratorInteriorMask.js';
import { dress, furnisher } from './GeneratorFurnish.js';

/** @typedef {import('../types/map.js').Tile} Tile */
/** @typedef {import('./TilePalette.js').TilePalette} TilePalette */
/** @typedef {import('./GeneratorFurnish.js').Place} Place */

/**
 * The fixed floor plans of an inn, a shop, and a tavern. Each plan starts
 * from the wall ring and the south door of `hallLayout`. A wall across the
 * north part of the building makes the back rooms. In an inn and a shop,
 * the door of that wall sits at its west end. The front room behind the
 * south door is the common room of an inn or the sales floor of a shop. A
 * row of tables two cells in front of that wall is the bar or the counter.
 * The strip of floor behind it joins the door of the back room to the front
 * room past the east end of the row. A tavern turns its bar to run along
 * the east wall, so its back door sits at the east end of the back wall.
 */

/** The smallest building side that fits a plan. A smaller inn, shop, or tavern uses the room split. */
export const PLAN_MIN_SIZE = 8;

/**
 * The depth of the back rooms, in cells. The wall in front of them runs
 * along row `backDepth(size) + 1`.
 * @param {number} size
 */
export const backDepth = (size) => Math.max(2, Math.floor((size - 2) / 3));

/**
 * The row of the stairs between the ground floor and the guest floor of an
 * inn. Both stairs sit against the east wall on this row, one above the
 * other.
 * @param {number} size
 */
export const stairsRow = (size) => Math.floor(size / 2);

/**
 * Wall off cells along row `at` from column `from` to `to`, or down column
 * `at` from row `from` to `to` when `down` is true.
 * @param {number[]} cells @param {number} size @param {number} at
 * @param {number} from @param {number} to @param {boolean} [down]
 */
function wall(cells, size, at, from, to, down = false) {
  for (let i = from; i <= to; i++) cells[down ? i * size + at : at * size + i] = WALL;
}

/**
 * Add the back wall of a plan, with its door at the west end.
 * @param {number[]} cells @param {number} size
 */
function backWall(cells, size) {
  const wy = backDepth(size) + 1;
  wall(cells, size, wy, 1, size - 2);
  cells[wy * size + 1] = DOOR_H;
}

/** The column where the kitchen of an inn ends. @param {number} size */
const kitchenEnd = (size) => Math.floor((size - 2) / 2);

/**
 * Put barrels along the north wall of a back room and a chest in its
 * south-east corner.
 * @param {Place} place @param {() => number} rng
 * @param {number} x0 @param {number} x1 @param {number} y1 the last row of the room
 */
function stock(place, rng, x0, x1, y1) {
  for (let x = x0; x <= x1; x++) if (rng() < 0.6) place(x, 1, 'barrel');
  place(x1, y1, 'chest');
}

/**
 * Lay out the walls of the ground floor of an inn: the kitchen in the
 * north-west, the pantry in the north-east, and the common room in front.
 * The kitchen door opens behind the bar, and the pantry door opens into the
 * common room. The result is the cell index of the stairs up to the guest
 * floor, on the east wall of the common room.
 * @param {number[]} cells a wall ring with its south door @param {number} size
 * @returns {number}
 */
export function innWalls(cells, size) {
  const depth = backDepth(size);
  const kx = kitchenEnd(size);
  backWall(cells, size);
  wall(cells, size, kx + 1, 1, depth, true);
  cells[(depth + 1) * size + kx + 2] = DOOR_H;
  return stairsRow(size) * size + size - 2;
}

/**
 * Furnish an inn laid out by `innWalls`. The kitchen has a hearth, a work
 * table, and a barrel, and the pantry has barrels and a chest. The bar runs
 * in front of the kitchen, and tables fill the rest of the common room.
 * @param {Place} place @param {() => number} rng @param {number} size
 */
export function furnishInn(place, rng, size) {
  const depth = backDepth(size);
  const kx = kitchenEnd(size);
  for (let x = 1; x < kx; x++) place(x, depth + 3, 'table');
  place((1 + kx) >> 1, 1, 'hearth');
  place((1 + kx) >> 1, depth, 'table');
  place(1, 1, 'barrel');
  stock(place, rng, kx + 2, size - 2, depth);
  for (let y = depth + 5; y <= size - 3; y += 2) {
    for (let x = 2; x <= size - 3; x += 3) if (rng() < 0.85) place(x, y, 'table');
  }
}

/**
 * Lay out the walls of the ground floor of a shop: one storeroom across the
 * back, and the sales floor in front.
 * @param {number[]} cells a wall ring with its south door @param {number} size
 */
export const shopWalls = backWall;

/**
 * Furnish a shop laid out by `shopWalls`. The storeroom has barrels and
 * chests. The counter crosses the sales floor from the west wall, with a
 * gap of two cells at its east end. It has one till section in its middle
 * and an end piece that closes its east end. Shelves line the side walls in
 * front of it. A large shop also has a display table in the middle of the
 * floor.
 * @param {Place} place @param {() => number} rng @param {number} size
 */
export function furnishShop(place, rng, size) {
  const depth = backDepth(size);
  const last = size - 4;
  const till = (1 + last) >> 1;
  for (let x = 1; x <= last; x++) {
    const piece = x === last ? 'counter-end-e' : x === till ? 'counter-till' : 'counter';
    place(x, depth + 3, piece);
  }
  stock(place, rng, 2, size - 2, depth);
  if (depth >= 3) place(1, depth, 'chest');
  for (let y = depth + 5; y <= size - 3; y++) {
    place(1, y, 'shelf');
    place(size - 2, y, 'shelf');
  }
  if (size >= 12) place(size >> 1, depth + 6, 'table');
}

/** The column where the storeroom of a tavern ends. @param {number} size */
const storeEnd = (size) => Math.floor((size - 2) / 3);

/** The column of the bar of a tavern, two cells in from the east wall. @param {number} size */
export const barColumn = (size) => size - 3;

/**
 * Lay out the walls of a tavern: the storeroom in the north-west, the
 * kitchen in the north-east, and the taproom in front. The kitchen door sits
 * at the east end of the back wall and opens behind the bar. The storeroom
 * opens only into the kitchen, through a door in the wall between them.
 * @param {number[]} cells a wall ring with its south door @param {number} size
 */
export function tavernWalls(cells, size) {
  const depth = backDepth(size);
  const sx = storeEnd(size);
  wall(cells, size, depth + 1, 1, size - 2);
  cells[(depth + 1) * size + size - 2] = DOOR_H;
  wall(cells, size, sx + 1, 1, depth, true);
  cells[depth * size + sx + 1] = DOOR_V;
}

/**
 * Furnish a tavern laid out by `tavernWalls`. The bar runs down
 * `barColumn` from the back wall and stops two cells short of the south
 * wall. The strip between the bar and the east wall joins the kitchen door
 * to the taproom past the south end of the bar. The taproom has a hearth
 * against the back wall and rows of long tables, each two tables wide, with
 * an aisle in front of the bar. The kitchen has a hearth, a work table, and
 * a barrel, and the storeroom has barrels and a chest.
 * @param {Place} place @param {() => number} rng @param {number} size
 */
export function furnishTavern(place, rng, size) {
  const depth = backDepth(size);
  const sx = storeEnd(size);
  const bx = barColumn(size);
  for (let y = depth + 2; y <= size - 4; y++) place(bx, y, 'table');
  // Long tables start in columns 2, 5, 8, and so on, and end one cell
  // before the aisle. The hearth takes the middle gap between them.
  const starts = [];
  for (let x = 2; x + 1 <= bx - 2; x += 3) starts.push(x);
  place(1 + 3 * (starts.length >> 1), depth + 2, 'hearth');
  for (let y = size - 3; y >= depth + 3; y -= 2) {
    for (const x of starts) {
      if (rng() >= 0.85) continue;
      place(x, y, 'table');
      place(x + 1, y, 'table');
    }
  }
  const kx = (sx + size) >> 1;
  place(kx, 1, 'hearth');
  place(kx, depth, 'table');
  place(size - 2, 1, 'barrel');
  for (let x = 1; x <= sx; x++) if (rng() < 0.6) place(x, 1, 'barrel');
  place(1, depth, 'chest');
}

/**
 * Generate the guest floor above an inn: a corridor from west to east along
 * `stairsRow`, with the stairs down at its east end, and guest rooms north
 * and south of it. Each room is at least two cells wide, with a door onto
 * the corridor in its west column, a bed in its far east corner, and
 * sometimes a chest. The stairs down are the entry, and they sit above the
 * stairs up of the ground floor.
 * @param {TilePalette} palette @param {number} size @param {() => number} rng
 * @returns {{ tiles: Tile[], entry: string }}
 */
export function generateGuestFloor(palette, size, rng) {
  const max = size - 1;
  const cy = stairsRow(size);
  /** @type {number[]} */
  const cells = Array.from({ length: size * size }, (_, i) => {
    const x = i % size;
    const y = Math.floor(i / size);
    return x === 0 || y === 0 || x === max || y === max ? WALL : FLOOR;
  });
  wall(cells, size, cy - 1, 1, max - 1);
  wall(cells, size, cy + 1, 1, max - 1);
  /** @type {[number, number][]} the first and the last column of each room */
  const spans = [];
  for (let x0 = 1; x0 < max;) {
    // The last room takes the columns left over, so no room is narrower
    // than two cells.
    const x1 = max - 1 - (x0 + 2) < 3 ? max - 1 : x0 + 2;
    spans.push([x0, x1]);
    if (x1 < max - 1) {
      wall(cells, size, x1 + 1, 1, cy - 2, true);
      wall(cells, size, x1 + 1, cy + 2, max - 1, true);
    }
    cells[(cy - 1) * size + x0] = DOOR_H;
    cells[(cy + 1) * size + x0] = DOOR_H;
    x0 = x1 + 2;
  }
  const tiles = maskTiles(palette, cells, size, rng);
  const entry = tileIdAt(max - 1, cy);
  tileStamper(tiles, palette)(entry, 'stairs-down');
  const stairs = cy * size + max - 1;
  const { place, placed } = furnisher(cells, size, [max - 1, cy], new Set([stairs]));
  for (const [x0, x1] of spans) {
    place(x1, 1, 'bed');
    place(x1, max - 1, 'bed');
    if (rng() < 0.5) place(x0, 1, 'chest');
    if (rng() < 0.5) place(x0, max - 1, 'chest');
  }
  dress(tiles, palette, size, placed);
  return { tiles, entry };
}

/**
 * @typedef {{
 *   walls: (cells: number[], size: number) => number | null,
 *   furnish: (place: Place, rng: () => number, size: number) => void,
 * }} FloorPlan
 * One fixed floor plan. `walls` adds the inner walls and doors to a wall
 * ring, and its result is the cell index of the stairs up, or null for a
 * building with no upper floor. `furnish` then places the furnishings.
 */

/**
 * The fixed floor plans by building environ.
 * @type {Readonly<Record<string, FloorPlan>>}
 */
export const FLOOR_PLANS = Object.freeze({
  inn: { walls: innWalls, furnish: furnishInn },
  shop: {
    walls: (cells, size) => {
      shopWalls(cells, size);
      return null;
    },
    furnish: furnishShop,
  },
  tavern: {
    walls: (cells, size) => {
      tavernWalls(cells, size);
      return null;
    },
    furnish: furnishTavern,
  },
});

/**
 * The floor plan of a building, or null when its environ has no plan or the
 * building is smaller than `PLAN_MIN_SIZE`.
 * @param {number} size @param {string} [environ]
 * @returns {FloorPlan | null}
 */
export function floorPlan(size, environ = '') {
  // An own-key test, so an environ such as "constructor" has no plan.
  if (size < PLAN_MIN_SIZE || !Object.prototype.hasOwnProperty.call(FLOOR_PLANS, environ)) {
    return null;
  }
  return FLOOR_PLANS[environ];
}
