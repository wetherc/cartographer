import { randInt } from './GeneratorRandom.js';
import { parseCoords, tileIdAt } from './MapGeometry.js';
import {
  farthest,
  floorCells,
  FLOOR,
  maskTiles,
  tileStamper,
  tunnelToEdge,
  VOID,
  walkDistances,
  wrapWalls,
} from './GeneratorInteriorMask.js';
import { dress, furnishDungeon, furnisher } from './GeneratorFurnish.js';

/** @typedef {import('../types/map.js').Tile} Tile */
/** @typedef {import('./TilePalette.js').TilePalette} TilePalette */
/** @typedef {import('./GeneratorInteriorMask.js').MaskArt} MaskArt */
/** @typedef {import('./GeneratorFurnish.js').Place} Place */
/** @typedef {import('./GeneratorFurnish.js').LevelFacts} LevelFacts */
/** @typedef {import('./GeneratorFurnish.js').Room} Room */

/**
 * The dungeon archetype: rooms joined by corridors, one level at a time.
 * The cave archetype lives in GeneratorCave.js, and the castle and building
 * archetypes in GeneratorHalls.js. All of them draw on the cell mask in
 * GeneratorInteriorMask.js.
 */

/**
 * @typedef {{
 *   entrance?: 'edge' | 'stairs',
 *   descend?: boolean,
 * }} LevelOptions
 * How one level of a dungeon or a cave connects to its neighbors. An `edge`
 * level, for example a dungeon entered from the overworld, gets a corridor
 * carved to the nearest map edge, with a door on the border cell, and no
 * stairs up. A `stairs` level, for example a deeper floor reached by
 * descending, has no surface exit. Its stairs-up tile is the way back, and
 * it becomes the entry. `descend` controls whether the level gets a
 * stairs-down tile. The bottom level of a multi-level dungeon omits it,
 * because no lower level exists for it to lead to.
 */

/**
 * @typedef {{ tiles: Tile[], entry: string, stairsDown: string | null }} Level
 * `stairsDown` is the stairs-down tile id, or null when the level has none.
 * The caller links it to the next level through `childNodeId`.
 */

/**
 * @typedef {{
 *   up: [number, number],
 *   candidates: [number, number][],
 *   door: string | null,
 *   art?: MaskArt,
 *   furnish?: (place: Place, facts: LevelFacts) => void,
 * }} LevelLayout
 * Where the stairs and the way in go on a finished level. The stairs up of a
 * stairs level go on `up`, and so does the start of the tunnel of an edge
 * level. The stairs down go on the candidate farthest from the way in. `door`
 * is the border door of an edge level, or null for a stairs level. `art` is
 * the set of pieces to draw with, and `furnish` places the furnishings.
 */

/**
 * Put the stairs, the entry, and the furnishings on a finished level. The
 * stairs down go on the candidate farthest from the way in by walking
 * distance, so a descent makes the party cross the level. The way in is the
 * border door of an edge level and the stairs up of a stairs level.
 * @param {TilePalette} palette @param {number[]} cells @param {number} size
 * @param {() => number} rng @param {LevelLayout} layout @param {boolean} descend
 * @returns {Level}
 */
export function finishLevel(palette, cells, size, rng, layout, descend) {
  wrapWalls(cells, size);
  const tiles = maskTiles(palette, cells, size, rng, layout.art);
  const stamp = tileStamper(tiles, palette);
  const [ux, uy] = layout.up;
  // An edge level is entered by its door, and no level above it exists, so
  // stairs up there would lead nowhere. Its tunnel starts from a bare floor
  // cell instead.
  if (!layout.door) stamp(tileIdAt(ux, uy), 'stairs-up');
  // Distances count from the way in, which is the door of an edge level. The
  // search over every floor cell then never picks the tunnel cell beside
  // the door.
  const from = (layout.door && parseCoords(layout.door)) || { x: ux, y: uy };
  const dist = walkDistances(cells, size, from.x, from.y);
  const reserved = new Set([uy * size + ux]);
  /** @type {string | null} */
  let stairsDown = null;
  if (descend) {
    // A level with one room has no other candidate, so the stairs down go
    // on the floor cell farthest from the way in.
    const down =
      farthest(dist, size, layout.candidates) ?? farthest(dist, size, floorCells(cells, size));
    if (down) {
      stairsDown = tileIdAt(down[0], down[1]);
      stamp(stairsDown, 'stairs-down');
      reserved.add(down[1] * size + down[0]);
    }
  }
  if (layout.furnish) {
    const { place, placed } = furnisher(cells, size, layout.up, reserved);
    layout.furnish(place, { floor: floorCells(cells, size), dist, size, descend });
    dress(tiles, palette, size, placed);
  }
  return { tiles, entry: layout.door ?? tileIdAt(ux, uy), stairsDown };
}

/**
 * Generate one dungeon level: rectangular and round rooms joined by
 * corridors, all floored, with walls wherever the floor meets the void.
 * The corridors follow a minimum spanning tree over the room centers, so
 * every room connects, plus a few extra links between near rooms, so the
 * level has loops and more than one way through. Each corridor bends once,
 * and a coin toss picks whether it runs across first or down first. Rooms
 * grow with the map, so a vast dungeon has halls as well as cells. The
 * way in (the stairs up, or the start of the tunnel to the edge) sits in the
 * first room, and the stairs down sit in the room farthest from it. `furnishDungeon` then puts pillars, altars, barrels, rubble, and
 * the treasure of the bottom level in the rooms.
 * @param {TilePalette} palette @param {number} size @param {() => number} rng
 * @param {LevelOptions} [options]
 * @returns {Level}
 */
export function generateDungeon(palette, size, rng, options = {}) {
  const entrance = options.entrance ?? 'edge';
  const descend = options.descend ?? true;
  /** @type {number[]} */
  const cells = new Array(size * size).fill(VOID);
  /** @param {number} x @param {number} y */
  const carve = (x, y) => {
    if (x >= 0 && y >= 0 && x < size && y < size) cells[y * size + x] = FLOOR;
  };

  /** @type {[number, number][]} room centers */
  const centers = [];
  /** @type {Room[]} */
  const rooms = [];
  const target = Math.max(3, Math.round(size / 3 + (size * size) / 400));
  const spread = 3 + Math.floor(size / 16);
  for (let attempt = 0; attempt < target * 4 && centers.length < target; attempt++) {
    const w = 3 + randInt(rng, spread);
    const h = 3 + randInt(rng, spread);
    const x0 = 1 + randInt(rng, Math.max(1, size - w - 1));
    const y0 = 1 + randInt(rng, Math.max(1, size - h - 1));
    // Reject rooms that touch an existing room. This keeps a wall between
    // rooms.
    let clash = false;
    for (let y = y0 - 1; y <= y0 + h && !clash; y++) {
      for (let x = x0 - 1; x <= x0 + w; x++) {
        if (cells[y * size + x] === FLOOR) clash = true;
      }
    }
    if (clash) continue;
    // A round room trims its corners: one cell each for a small room, three
    // for a room of seven cells or more on each side.
    const cut = w >= 5 && h >= 5 && rng() < 0.35 ? (w >= 7 && h >= 7 ? 2 : 1) : 0;
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const cx = Math.min(x - x0, x0 + w - 1 - x);
        const cy = Math.min(y - y0, y0 + h - 1 - y);
        if (cx + cy >= cut) carve(x, y);
      }
    }
    centers.push([x0 + (w >> 1), y0 + (h >> 1)]);
    rooms.push({ x0, y0, x1: x0 + w - 1, y1: y0 + h - 1, round: cut > 0 });
  }

  for (const [a, b] of roomLinks(centers, rng)) {
    const [ax, ay] = centers[a];
    const [bx, by] = centers[b];
    const bendX = rng() < 0.5 ? bx : ax;
    const bendY = bendX === bx ? ay : by;
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) carve(x, bendY);
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) carve(bendX, y);
  }

  const up = centers[0];
  const door = entrance === 'edge' ? tunnelToEdge(cells, size, up[0], up[1]) : null;
  return finishLevel(
    palette,
    cells,
    size,
    rng,
    {
      up,
      candidates: centers.slice(1),
      door,
      furnish: (place, facts) => furnishDungeon(place, rng, rooms, facts),
    },
    descend,
  );
}

/**
 * The corridors of a dungeon level, as pairs of room indexes. The minimum
 * spanning tree comes first, built with Prim's algorithm on the Manhattan
 * distance between centers. Then about one room in seven adds a loop: a
 * link between two near rooms that the tree does not join.
 * @param {[number, number][]} centers @param {() => number} rng
 * @returns {[number, number][]}
 */
export function roomLinks(centers, rng) {
  /** @param {number} a @param {number} b */
  const gap = (a, b) =>
    Math.abs(centers[a][0] - centers[b][0]) + Math.abs(centers[a][1] - centers[b][1]);
  /** @type {[number, number][]} */
  const links = [];
  const inTree = [0];
  const rest = centers.map((_, i) => i).slice(1);
  while (rest.length) {
    let best = /** @type {[number, number]} */ ([0, rest[0]]);
    for (const a of inTree) {
      for (const b of rest) if (gap(a, b) < gap(...best)) best = [a, b];
    }
    links.push(best);
    inTree.push(best[1]);
    rest.splice(rest.indexOf(best[1]), 1);
  }
  const joined = new Set(links.map(([a, b]) => `${Math.min(a, b)},${Math.max(a, b)}`));
  /** @type {[number, number][]} */
  const spare = [];
  for (let a = 0; a < centers.length; a++) {
    for (let b = a + 1; b < centers.length; b++) if (!joined.has(`${a},${b}`)) spare.push([a, b]);
  }
  spare.sort((p, q) => gap(...p) - gap(...q));
  let loops = Math.round(centers.length / 7);
  for (const pair of spare) {
    if (loops <= 0) break;
    if (rng() < 0.5) continue;
    links.push(pair);
    loops--;
  }
  return links;
}
