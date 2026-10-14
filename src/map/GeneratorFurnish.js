import { tilesById } from './TileGrid.js';
import { randInt, shuffle } from './GeneratorRandom.js';
import { NEIGHBORS4, tileIdAt } from './MapGeometry.js';
import { FLOOR, interiorRef, isDoor, walkDistances } from './GeneratorInteriorMask.js';
import { FURNISHING_KINDS } from './TileKinds.js';

/** @typedef {import('../types/map.js').Tile} Tile */
/** @typedef {import('./TilePalette.js').TilePalette} TilePalette */

/**
 * Furnishings for generated interiors. A furnishing is an overlay on a floor
 * tile. The generators place them on the cell mask after the stairs, through
 * a furnisher that refuses any cell where a furnishing does not fit. An
 * obstacle, such as a pillar or a table, never goes beside a door or a
 * staircase, and never cuts a floor cell off from the way in.
 */

/**
 * @typedef {{ x0: number, y0: number, x1: number, y1: number, round?: boolean }} Room
 * The floor cells of a room, corners inclusive. A round room has trimmed
 * corners.
 */

/**
 * @typedef {(x: number, y: number, kind: string) => boolean} Place
 * Put a furnishing on a cell. The result is false when the furnishing does
 * not fit there.
 */

/**
 * A furnisher for one finished mask. The walk from the way in never crosses
 * a reserved cell, because a click on a staircase always follows its link.
 * An obstacle may not take away any cell of that walk except its own.
 * @param {number[]} cells @param {number} size
 * @param {[number, number]} start the way in, which every open cell stays joined to
 * @param {Set<number>} reserved cell indexes that take no furnishing, such as stairs
 * @returns {{ place: Place, placed: Map<number, string> }}
 */
export function furnisher(cells, size, start, reserved) {
  /** @type {Map<number, string>} */
  const placed = new Map();
  const startIndex = start[1] * size + start[0];
  /** @type {Set<number>} the reserved cells and the obstacles */
  const blocked = new Set([...reserved].filter((i) => i !== startIndex));
  const reach = () =>
    walkDistances(cells, size, start[0], start[1], blocked).filter((d) => d >= 0).length;
  let reached = reach();
  const inside = (/** @type {number} */ x, /** @type {number} */ y) =>
    x >= 0 && y >= 0 && x < size && y < size;
  /** @type {Place} */
  const place = (x, y, kind) => {
    const i = y * size + x;
    if (!inside(x, y) || cells[i] !== FLOOR || placed.has(i) || reserved.has(i)) return false;
    if (FURNISHING_KINDS[kind] === 'obstacle') {
      const crowds = NEIGHBORS4.some(([dx, dy]) => {
        const j = (y + dy) * size + x + dx;
        return inside(x + dx, y + dy) && (isDoor(cells[j]) || reserved.has(j));
      });
      if (crowds) return false;
      blocked.add(i);
      const now = reach();
      if (now < reached - 1) {
        blocked.delete(i);
        return false;
      }
      reached = now;
    }
    placed.set(i, kind);
    return true;
  };
  return { place, placed };
}

/**
 * Draw the placed furnishings as overlays on their floor tiles.
 * @param {Tile[]} tiles @param {TilePalette} palette @param {number} size
 * @param {Map<number, string>} placed
 */
export function dress(tiles, palette, size, placed) {
  const byId = tilesById(tiles);
  for (const [i, kind] of placed) {
    const tile = byId.get(tileIdAt(i % size, Math.floor(i / size)));
    if (tile) tile.overlayRef = interiorRef(palette, kind);
  }
}

/** @param {Room} room */
const midX = (room) => (room.x0 + room.x1) >> 1;
/** @param {Room} room */
const midY = (room) => (room.y0 + room.y1) >> 1;
/** @param {Room} room @returns {[number, number][]} */
const corners = (room) => [
  [room.x0, room.y0],
  [room.x1, room.y0],
  [room.x0, room.y1],
  [room.x1, room.y1],
];

/**
 * Two rows of pillars, one cell inside the north and the south walls, with
 * a gap of one cell between pillars.
 * @param {Place} place @param {Room} room
 */
function colonnade(place, room) {
  for (let x = room.x0 + 1; x < room.x1; x += 2) {
    place(x, room.y0 + 1, 'pillar');
    place(x, room.y1 - 1, 'pillar');
  }
}

/**
 * What a room of a castle or a building is for, and the furnishings that
 * show it.
 * @type {Record<string, (place: Place, room: Room, rng: () => number) => void>}
 */
const ROLES = {
  bedroom(place, room) {
    place(room.x0, room.y0, 'bed');
    if (room.x1 - room.x0 >= 3) place(room.x0 + 2, room.y0, 'bed');
  },
  dining(place, room) {
    const y = midY(room);
    place(midX(room), y, 'table');
    if (room.x1 - room.x0 >= 4) {
      place(midX(room) - 1, y, 'table');
      place(midX(room) + 1, y, 'table');
    }
  },
  library(place, room) {
    for (let x = room.x0; x <= room.x1; x++) place(x, room.y0, 'bookshelf');
  },
  storeroom(place, room, rng) {
    for (const [x, y] of corners(room)) if (rng() < 0.6) place(x, y, 'barrel');
    if (rng() < 0.3) place(midX(room), midY(room), 'chest');
  },
  chapel(place, room) {
    place(midX(room), room.y0, 'altar');
  },
  empty() {},
};

/**
 * @typedef {{ main: (place: Place, room: Room, rng: () => number) => void, roles: string[] }} Layout
 * How a building furnishes its rooms. `main` furnishes the room behind the
 * entrance, and each other room draws its role from `roles`.
 */

/** The layout of a home, and of any building whose environ has no layout. */
const HOME = {
  /** @type {Layout['main']} */
  main(place, room, rng) {
    place(midX(room), room.y0, 'hearth');
    ROLES.dining(place, room, rng);
  },
  roles: ['bedroom', 'dining', 'library', 'storeroom', 'empty'],
};

/**
 * The layout of a building by its environ (`BUILDING_INTERIORS` in
 * `GeneratorTown.js`). An inn has guest bedrooms, a temple an altar and a
 * colonnade, a barracks a dormitory, and a shop or a warehouse its stock.
 * @type {Record<string, Layout>}
 */
export const BUILDING_LAYOUTS = {
  house: HOME,
  inn: { main: HOME.main, roles: ['bedroom', 'bedroom', 'bedroom', 'storeroom'] },
  tavern: { main: HOME.main, roles: ['storeroom', 'dining', 'bedroom'] },
  guildhall: { main: HOME.main, roles: ['library', 'dining', 'storeroom'] },
  shop: {
    main(place, room, rng) {
      place(midX(room), midY(room), 'table');
      ROLES.storeroom(place, room, rng);
    },
    roles: ['storeroom', 'storeroom', 'bedroom'],
  },
  warehouse: { main: ROLES.storeroom, roles: ['storeroom', 'storeroom', 'empty'] },
  temple: {
    main(place, room) {
      place(midX(room), room.y0, 'altar');
      if (room.x1 - room.x0 >= 4 && room.y1 - room.y0 >= 4) colonnade(place, room);
    },
    roles: ['chapel', 'bedroom', 'library'],
  },
  academy: {
    main(place, room, rng) {
      ROLES.library(place, room, rng);
      place(midX(room), midY(room), 'table');
    },
    roles: ['library', 'library', 'bedroom'],
  },
  barracks: {
    main(place, room) {
      for (let x = room.x0; x <= room.x1; x += 2) place(x, room.y0, 'bed');
    },
    roles: ['bedroom', 'bedroom', 'storeroom', 'dining'],
  },
};

/**
 * Furnish the rooms of a castle or a building. A castle puts a throne and
 * two rows of pillars in its largest room, the great hall. A building
 * furnishes the room behind its entrance and picks the roles of its other
 * rooms by its environ (`BUILDING_LAYOUTS`), and a home puts a hearth and a
 * table behind the entrance. Each other room gets a role at random.
 * @param {Place} place @param {() => number} rng @param {Room[]} rooms
 * @param {{ castle: boolean, entrance: [number, number], environ?: string }} hall
 *   `entrance` is the floor cell inside the entrance door
 */
export function furnishHalls(place, rng, rooms, { castle, entrance, environ = '' }) {
  const area = (/** @type {Room} */ r) => (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
  const [ex, ey] = entrance;
  const main = castle
    ? rooms.reduce((a, b) => (area(b) > area(a) ? b : a))
    : rooms.find((r) => ex >= r.x0 && ex <= r.x1 && ey >= r.y0 && ey <= r.y1);
  // An own-key test, so an environ such as "constructor" reads as a home.
  const own = Object.prototype.hasOwnProperty.call(BUILDING_LAYOUTS, environ);
  const layout = own ? BUILDING_LAYOUTS[environ] : HOME;
  const roles = castle
    ? ['bedroom', 'dining', 'library', 'storeroom', 'chapel', 'empty']
    : layout.roles;
  for (const room of rooms) {
    if (room !== main) ROLES[roles[randInt(rng, roles.length)]](place, room, rng);
  }
  if (!main) return;
  if (castle) {
    place(midX(main), main.y0, 'throne');
    if (main.x1 - main.x0 >= 4) {
      for (let y = main.y0 + 2; y < main.y1; y += 2) {
        place(main.x0 + 1, y, 'pillar');
        place(main.x1 - 1, y, 'pillar');
      }
    }
  } else {
    layout.main(place, main, rng);
  }
}

/**
 * Scatter a furnishing over random floor cells.
 * @param {Place} place @param {() => number} rng @param {[number, number][]} floor
 * @param {string} kind @param {number} tries
 */
function scatter(place, rng, floor, kind, tries) {
  for (let t = 0; t < tries && floor.length; t++) {
    const [x, y] = floor[randInt(rng, floor.length)];
    place(x, y, kind);
  }
}

/**
 * Put a chest on the floor cell farthest from the way in, or on the next
 * farthest cell where it fits.
 * @param {Place} place @param {[number, number][]} floor
 * @param {Int32Array} dist @param {number} size
 */
function hoard(place, floor, dist, size) {
  const far = [...floor].sort((a, b) => dist[b[1] * size + b[0]] - dist[a[1] * size + a[0]]);
  far.some(([x, y]) => place(x, y, 'chest'));
}

/**
 * @typedef {{ floor: [number, number][], dist: Int32Array, size: number, descend: boolean }} LevelFacts
 * What a furnishing recipe knows about a finished level: its floor cells,
 * the walking distance of each cell from the way in, the map size, and
 * whether the level has a way down. The bottom level of a dungeon or a cave
 * keeps its treasure in the chest farthest from the way in.
 */

/**
 * Furnish a dungeon level: rows of pillars in some large square rooms, and
 * a chance of an altar, a stack of barrels, and a chest. Rubble lies about
 * the level.
 * @param {Place} place @param {() => number} rng @param {Room[]} rooms
 * @param {LevelFacts} level
 */
export function furnishDungeon(place, rng, rooms, { floor, dist, size, descend }) {
  const rest = shuffle(rooms.slice(1), rng);
  for (const room of rest) {
    const big = room.x1 - room.x0 >= 6 && room.y1 - room.y0 >= 6;
    if (big && !room.round && rng() < 0.5) colonnade(place, room);
  }
  const [altar, store] = rest;
  if (altar && rng() < 0.3) place(midX(altar), altar.y0, 'altar');
  if (store && rng() < 0.5) {
    for (const [x, y] of corners(store)) if (rng() < 0.5) place(x, y, 'barrel');
  }
  if (!descend) hoard(place, floor, dist, size);
  scatter(place, rng, floor, 'rubble', Math.round(size / 6));
}

/**
 * Furnish a cave level: a few pools, each a cell with some of its
 * neighbors, and rubble on the cavern floor.
 * @param {Place} place @param {() => number} rng @param {LevelFacts} level
 */
export function furnishCave(place, rng, { floor, dist, size, descend }) {
  const pools = 1 + randInt(rng, 1 + Math.floor(size / 24));
  for (let p = 0; p < pools; p++) {
    const [x, y] = floor[randInt(rng, floor.length)];
    place(x, y, 'pool');
    for (const [dx, dy] of NEIGHBORS4) if (rng() < 0.5) place(x + dx, y + dy, 'pool');
  }
  if (!descend) hoard(place, floor, dist, size);
  scatter(place, rng, floor, 'rubble', Math.round(size / 5));
}
