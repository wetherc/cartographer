import { randInt } from './GeneratorRandom.js';
import { tileIdAt } from './MapGeometry.js';
import {
  besideDoor,
  DOOR_H,
  DOOR_V,
  FLOOR,
  interiorRef,
  isDoor,
  maskTiles,
  tileStamper,
  walkDistances,
  WALL,
} from './GeneratorInteriorMask.js';
import { dress, furnishHalls, furnisher } from './GeneratorFurnish.js';
import { floorPlan } from './GeneratorInnShop.js';

/** @typedef {import('../types/map.js').Tile} Tile */
/** @typedef {import('./TilePalette.js').TilePalette} TilePalette */
/** @typedef {import('./GeneratorFurnish.js').Room} Room */

/**
 * The walled archetypes: castle and building. Both fill the whole grid with
 * a wall ring around a floored interior, with the entrance door in the
 * middle of the south wall. The interior splits into rooms by binary space
 * partition: a wall cuts a room in two, with one door in it, and each half
 * can split again. Every room then connects to the entrance through the
 * doors of the walls that made it.
 */

/**
 * @typedef {{ minRoom: number, maxDepth: number }} HallStyle
 * `minRoom` is the smallest room side, in cells. `maxDepth` limits how many
 * times a room splits. After the second split, each room also stops with a
 * chance of one in four, so room sizes vary.
 */

/**
 * The column of the entrance door in the south wall.
 * @param {number} size
 */
export const doorColumn = (size) => Math.floor(size / 2);

/**
 * The first cell of `order` that can take a staircase: a floor cell with no
 * door beside it, which no other staircase takes, and whose loss leaves every
 * other open cell joined to the entrance door. Null when no cell fits.
 * @param {number[]} cells @param {number} size @param {number[]} order cell indexes
 * @param {number[]} [taken] cell indexes of the staircases already placed
 * @returns {number | null}
 */
export function stairsCell(cells, size, order, taken = []) {
  const open = cells.filter((code) => code === FLOOR || isDoor(code)).length;
  const door = /** @type {const} */ ([doorColumn(size), size - 1]);
  for (const i of order) {
    const x = i % size;
    const y = Math.floor(i / size);
    if (cells[i] !== FLOOR || taken.includes(i) || besideDoor(cells, size, x, y)) continue;
    const blocked = new Set([...taken, i]);
    const dist = walkDistances(cells, size, door[0], door[1], blocked);
    if (dist.filter((d) => d >= 0).length === open - blocked.size) return i;
  }
  return null;
}

/**
 * The cell indexes of a room, its corners first in the given order, then
 * the rest row by row.
 * @param {Room} room @param {number} size @param {[number, number][]} first
 * @returns {number[]}
 */
function roomOrder(room, size, first) {
  const out = first.map(([x, y]) => y * size + x);
  for (let y = room.y0; y <= room.y1; y++) {
    for (let x = room.x0; x <= room.x1; x++) out.push(y * size + x);
  }
  return out;
}

/**
 * Lay out a walled hall and split it into rooms.
 * @param {number} size @param {() => number} rng @param {HallStyle} style
 * @returns {{ cells: number[], rooms: Room[], entry: string }}
 */
export function hallLayout(size, rng, style) {
  const max = size - 1;
  /** @type {number[]} */
  const cells = Array.from({ length: size * size }, (_, i) => {
    const x = i % size;
    const y = Math.floor(i / size);
    return x === 0 || y === 0 || x === max || y === max ? WALL : FLOOR;
  });
  const doorX = doorColumn(size);
  cells[max * size + doorX] = DOOR_H;
  /** @param {number} x @param {number} y */
  const doorAt = (x, y) => isDoor(cells[y * size + x]);
  /** @type {Room[]} */
  const rooms = [];
  /** @param {Room} room @param {number} depth */
  const split = (room, depth) => {
    const { x0, y0, x1, y1 } = room;
    const stop = depth >= style.maxDepth || (depth >= 2 && rng() < 0.25);
    // A wall may not end beside a door in the wall around the room, because
    // it would block that door from one side.
    const across = [];
    for (let x = x0 + style.minRoom; x <= x1 - style.minRoom; x++) {
      if (!doorAt(x, y0 - 1) && !doorAt(x, y1 + 1)) across.push(x);
    }
    const down = [];
    for (let y = y0 + style.minRoom; y <= y1 - style.minRoom; y++) {
      if (!doorAt(x0 - 1, y) && !doorAt(x1 + 1, y)) down.push(y);
    }
    if (stop || (!across.length && !down.length)) {
      rooms.push(room);
      return;
    }
    // Cut the longer side, so rooms stay close to square.
    const w = x1 - x0;
    const h = y1 - y0;
    const vertical = !down.length || (across.length > 0 && (w > h || (w === h && rng() < 0.5)));
    if (vertical) {
      const x = across[randInt(rng, across.length)];
      for (let y = y0; y <= y1; y++) cells[y * size + x] = WALL;
      cells[(y0 + randInt(rng, y1 - y0 + 1)) * size + x] = DOOR_V;
      split({ x0, y0, x1: x - 1, y1 }, depth + 1);
      split({ x0: x + 1, y0, x1, y1 }, depth + 1);
    } else {
      const y = down[randInt(rng, down.length)];
      for (let x = x0; x <= x1; x++) cells[y * size + x] = WALL;
      cells[y * size + x0 + randInt(rng, x1 - x0 + 1)] = DOOR_H;
      split({ x0, y0, x1, y1: y - 1 }, depth + 1);
      split({ x0, y0: y + 1, x1, y1 }, depth + 1);
    }
  };
  split({ x0: 1, y0: 1, x1: max - 1, y1: max - 1 }, 0);
  return { cells, rooms, entry: tileIdAt(doorX, max) };
}

/**
 * Put the furnishings on a finished hall. Every open cell stays joined to
 * the way in, which is the south door, or the given cell of a hall with no
 * door. The room with the way in is the entrance room of a building.
 * @param {Tile[]} tiles @param {TilePalette} palette @param {number[]} cells
 * @param {number} size @param {() => number} rng @param {Room[]} rooms
 * @param {boolean} castle @param {number[]} reserved cell indexes of the stairs
 * @param {[number, number]} [way] the way in of a hall with no door
 * @param {string} [environ] the environ of a building, which picks its layout
 */
function furnishHall(tiles, palette, cells, size, rng, rooms, castle, reserved, way, environ) {
  const doorX = doorColumn(size);
  const start = way ?? [doorX, size - 1];
  const { place, placed } = furnisher(cells, size, start, new Set(reserved));
  furnishHalls(place, rng, rooms, { castle, entrance: way ?? [doorX, size - 2], environ });
  dress(tiles, palette, size, placed);
}

/**
 * Generate a castle keep: halls and chambers of at least three cells a
 * side. The stairs up sit in the top-left corner of the first room. The
 * stairs down sit in the last room, on the first cell that `stairsCell`
 * accepts. The top-right, top-left, bottom-right, and bottom-left corners
 * come first, then the other cells of the room. The south door is
 * the entry that connects the keep to the parent map. The largest room is
 * the great hall, with a throne and pillars. `stairsUp` and `stairsDown`
 * name the stairs, so the caller can link them to the upper floor and to
 * the dungeon below.
 * @param {TilePalette} palette @param {number} size @param {() => number} rng
 * @returns {{ tiles: Tile[], entry: string, stairsUp: string, stairsDown: string }}
 */
export function generateCastle(palette, size, rng) {
  const { cells, rooms, entry } = hallLayout(size, rng, { minRoom: 3, maxDepth: 6 });
  const tiles = maskTiles(palette, cells, size, rng);
  const stamp = tileStamper(tiles, palette);
  const first = rooms[0];
  const last = rooms[rooms.length - 1];
  const up = first.y0 * size + first.x0;
  /** @type {[number, number][]} */
  const corners = [
    [last.x1, last.y0],
    [last.x0, last.y0],
    [last.x1, last.y1],
    [last.x0, last.y1],
  ];
  // A room of three by three cells or more always has a cell that fits. Its
  // middle cell has no door beside it, and the loss of one cell does not
  // split a rectangle of that size.
  const down = /** @type {number} */ (
    stairsCell(cells, size, roomOrder(last, size, corners), [up])
  );
  const stairsUp = tileIdAt(first.x0, first.y0);
  const stairsDown = tileIdAt(down % size, Math.floor(down / size));
  stamp(stairsUp, 'stairs-up');
  stamp(stairsDown, 'stairs-down');
  furnishHall(tiles, palette, cells, size, rng, rooms, true, [up, down]);
  return { tiles, entry, stairsUp, stairsDown };
}

/**
 * Generate the upper floor of a castle keep: chambers of at least three
 * cells a side inside a wall ring with no door. The stairs down sit in the
 * top-left corner of the first room, above the stairs up of the floor
 * below, and they are the entry. The room with the stairs has a hearth and
 * a table, and each other room gets a role at random.
 * @param {TilePalette} palette @param {number} size @param {() => number} rng
 * @returns {{ tiles: Tile[], entry: string }}
 */
export function generateUpperFloor(palette, size, rng) {
  const { cells, rooms } = hallLayout(size, rng, { minRoom: 3, maxDepth: 6 });
  cells[(size - 1) * size + doorColumn(size)] = WALL;
  const tiles = maskTiles(palette, cells, size, rng);
  const { x0, y0 } = rooms[0];
  const entry = tileIdAt(x0, y0);
  tileStamper(tiles, palette)(entry, 'stairs-down');
  furnishHall(tiles, palette, cells, size, rng, rooms, false, [y0 * size + x0], [x0, y0]);
  return { tiles, entry };
}

/** The chance that a building has a cellar under a trapdoor. */
export const CELLAR_CHANCE = 0.3;

/**
 * Generate the inside of one building, such as a house, a shop, or a
 * temple: a few small rooms of at least two cells a side. A temple is one
 * open nave with no inner walls, so its altar and colonnade fill the
 * building. An inn, a shop, and a tavern of `PLAN_MIN_SIZE` or more follow
 * the fixed plans of `GeneratorInnShop.js`, and an inn also gets stairs up to its
 * guest floor. `stairsUp` names that tile, so the caller can link it to the
 * guest floor. `environ`, such as `inn` or `temple`, picks the furnishings
 * (`GeneratorFurnish.BUILDING_LAYOUTS`). A building has a cellar with a
 * chance of `CELLAR_CHANCE`. Its trapdoor goes on the floor
 * cell farthest from the entrance that `stairsCell` accepts, and
 * `stairsDown` names that tile, so the caller can link it to the cellar
 * level. The building picks the trapdoor cell before the furnishings, so no
 * obstacle goes beside it and no walk has to cross it. A building with no
 * cellar leaves that cell bare.
 * @param {TilePalette} palette @param {number} size @param {() => number} rng
 * @param {string} [environ]
 * @returns {{ tiles: Tile[], entry: string, stairsDown: string | null, stairsUp: string | null }}
 */
export function generateBuilding(palette, size, rng, environ) {
  const plan = floorPlan(size, environ);
  const maxDepth = environ === 'temple' || plan ? 0 : 3;
  const { cells, rooms, entry } = hallLayout(size, rng, { minRoom: 2, maxDepth });
  const up = plan ? plan.walls(cells, size) : null;
  const tiles = maskTiles(palette, cells, size, rng);
  const stairsUp = up === null ? null : tileIdAt(up % size, Math.floor(up / size));
  if (stairsUp) tileStamper(tiles, palette)(stairsUp, 'stairs-up');
  const taken = up === null ? [] : [up];
  const dist = walkDistances(cells, size, doorColumn(size), size - 1);
  const far = cells.flatMap((code, i) => (code === FLOOR ? [i] : []));
  const at = stairsCell(
    cells,
    size,
    far.sort((a, b) => dist[b] - dist[a]),
    taken,
  );
  const reserved = at === null ? taken : [...taken, at];
  if (plan) {
    const { place, placed } = furnisher(
      cells,
      size,
      [doorColumn(size), size - 1],
      new Set(reserved),
    );
    plan.furnish(place, rng, size);
    dress(tiles, palette, size, placed);
  } else {
    furnishHall(tiles, palette, cells, size, rng, rooms, false, reserved, undefined, environ);
  }
  if (at === null || rng() >= CELLAR_CHANCE) return { tiles, entry, stairsDown: null, stairsUp };
  const stairsDown = tileIdAt(at % size, Math.floor(at / size));
  const tile = /** @type {Tile} */ (tiles.find((t) => t.id === stairsDown));
  tile.overlayRef = interiorRef(palette, 'trapdoor');
  return { tiles, entry, stairsDown, stairsUp };
}
