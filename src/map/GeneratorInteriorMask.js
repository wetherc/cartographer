import { createTile, tilesById } from './TileGrid.js';
import { randInt } from './GeneratorRandom.js';
import { NEIGHBORS4, NEIGHBORS8, tileIdAt } from './MapGeometry.js';
import { variantIndexAt } from './TileCatalog.js';

/** @typedef {import('../types/map.js').Tile} Tile */
/** @typedef {import('./TilePalette.js').TilePalette} TilePalette */

/**
 * The cell mask that every interior generator draws on, and the builder that
 * turns a finished mask into tiles. A generator carves floor, walls, and
 * doors into a flat array of cell codes. Then `maskTiles` picks a floor
 * variant for each floor cell and a wall piece for each wall cell, from the
 * wall and door cells around it. A void cell gets no tile, so a dungeon or a
 * cave reads as carved out of blank space.
 */

/** A cell with no tile. */
export const VOID = 0;
/** A walkable floor cell. */
export const FLOOR = 1;
/** A wall cell. */
export const WALL = 2;
/** A door set in a horizontal wall run, which a party passes north-south. */
export const DOOR_H = 3;
/** A door set in a vertical wall run, which a party passes east-west. */
export const DOOR_V = 4;

/**
 * @typedef {{ floors: string[], wall: (n: boolean, e: boolean, s: boolean, w: boolean) => string, doorH: string, doorV: string }} MaskArt
 * The interior pieces that `maskTiles` draws a mask with. `floors` are the
 * floor variants, `wall` picks the wall piece from the arms that join it, and
 * `doorH` and `doorV` are the doors in a horizontal and a vertical wall run.
 */

/** @param {TilePalette} palette @param {string} kind */
export function interiorRef(palette, kind) {
  return palette.getInteriorPiece(kind)?.imageRef ?? '';
}

/** @param {number} code */
export const isDoor = (code) => code === DOOR_H || code === DOOR_V;

/**
 * Whether a door is one of the four orthogonal neighbors of (x, y). A
 * staircase does not go on such a cell, because a click on a linked tile
 * always follows the link, and the party could then never walk through
 * the door.
 * @param {number[]} cells @param {number} size @param {number} x @param {number} y
 */
export function besideDoor(cells, size, x, y) {
  return NEIGHBORS4.some(([dx, dy]) => {
    const nx = x + dx;
    const ny = y + dy;
    return nx >= 0 && ny >= 0 && nx < size && ny < size && isDoor(cells[ny * size + nx]);
  });
}

/**
 * Pick a wall piece for a wall cell, based on which orthogonal neighbors
 * continue the wall. A neighbor can be another wall cell or a door set into
 * the same run. Piece names describe the connected edges: four arms make a
 * cross, three arms make a tee named for its odd arm to match the tile
 * assets, two arms make an elbow or a straight piece, and one arm extends
 * its run. An isolated cell with no connected arm falls back to horizontal.
 * @param {boolean} n @param {boolean} e @param {boolean} s @param {boolean} w
 * @returns {string}
 */
export function wallKind(n, e, s, w) {
  const arms = Number(n) + Number(e) + Number(s) + Number(w);
  if (arms === 4) return 'wall-cross';
  if (arms === 3) return !s ? 'wall-tee-n' : !w ? 'wall-tee-e' : !n ? 'wall-tee-s' : 'wall-tee-w';
  if (n && s) return 'wall-v';
  if (e && w) return 'wall-h';
  if (n && e) return 'wall-corner-ne';
  if (n && w) return 'wall-corner-nw';
  if (s && e) return 'wall-corner-se';
  if (s && w) return 'wall-corner-sw';
  if (n || s) return 'wall-v';
  return 'wall-h';
}

/**
 * Dressed stone: the flagstone floors, the jointed walls, and wooden doors.
 * @type {MaskArt}
 */
export const STONE_ART = {
  floors: ['floor-1', 'floor-2', 'floor-3'],
  wall: wallKind,
  doorH: 'door-h',
  doorV: 'door-v',
};

/**
 * Natural rock: the cave floors, one rough wall piece with no connector
 * kinds, and a cave mouth for the way in. A cave wall has no straight runs
 * to join, so every wall cell draws the same piece.
 * @type {MaskArt}
 */
export const CAVE_ART = {
  floors: ['cave-floor-1', 'cave-floor-2'],
  wall: () => 'cave-wall',
  doorH: 'cave-mouth-h',
  doorV: 'cave-mouth-v',
};

/**
 * Turn every void cell that touches a floor or door cell, in any of eight
 * directions, into wall. The diagonal check seals the corners of rooms and
 * corridors, so no floor cell sees the void.
 * @param {number[]} cells @param {number} size
 */
export function wrapWalls(cells, size) {
  const open = (/** @type {number} */ x, /** @type {number} */ y) =>
    x >= 0 &&
    y >= 0 &&
    x < size &&
    y < size &&
    (cells[y * size + x] === FLOOR || isDoor(cells[y * size + x]));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (cells[y * size + x] !== VOID) continue;
      if (NEIGHBORS8.some(([dx, dy]) => open(x + dx, y + dy))) cells[y * size + x] = WALL;
    }
  }
}

/**
 * Carve a straight corridor from (x, y) to the nearest map edge and set a
 * door in the border cell. The door is the way in from the parent map.
 * @param {number[]} cells @param {number} size @param {number} x @param {number} y
 * @returns {string} the id of the border door
 */
export function tunnelToEdge(cells, size, x, y) {
  const gaps = [y, size - 1 - y, x, size - 1 - x]; // north, south, west, east
  const side = gaps.indexOf(Math.min(...gaps));
  const [dx, dy] = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ][side];
  let cx = x;
  let cy = y;
  for (let i = 0; i < gaps[side]; i++) {
    cells[cy * size + cx] = FLOOR;
    cx += dx;
    cy += dy;
  }
  cells[cy * size + cx] = side <= 1 ? DOOR_H : DOOR_V;
  return tileIdAt(cx, cy);
}

/**
 * Walking distance in steps from (x, y) to every floor and door cell, or -1
 * for a cell that the walk cannot reach. The walk also stays off the cells in
 * `blocked`, for example the cells under a pillar or a table.
 * @param {number[]} cells @param {number} size @param {number} x @param {number} y
 * @param {Set<number>} [blocked] cell indexes that the walk cannot enter
 * @returns {Int32Array}
 */
export function walkDistances(cells, size, x, y, blocked) {
  const dist = new Int32Array(size * size).fill(-1);
  dist[y * size + x] = 0;
  const queue = [y * size + x];
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const cx = i % size;
    const cy = Math.floor(i / size);
    for (const [dx, dy] of NEIGHBORS4) {
      const nx = cx + dx;
      const ny = cy + dy;
      const j = ny * size + nx;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size || dist[j] !== -1) continue;
      if (cells[j] !== FLOOR && !isDoor(cells[j])) continue;
      if (blocked?.has(j)) continue;
      dist[j] = dist[i] + 1;
      queue.push(j);
    }
  }
  return dist;
}

/**
 * The floor variant of the cell at (x, y): the pick of `variantIndexAt`, so
 * the tile codec stores the cell as its floor family alone (see
 * `TileCatalog.variantIdAt`, whose family order `floors` follows). The
 * function still draws from `rng` once, so the draws after it, and the rest
 * of a seeded interior with them, do not depend on how the floor is picked.
 * @param {string[]} floors @param {number} x @param {number} y
 * @param {() => number} rng
 * @returns {string}
 */
function floorAt(floors, x, y, rng) {
  randInt(rng, floors.length);
  return floors[variantIndexAt(floors.length, x, y)];
}

/**
 * Build the tiles of a finished mask. Each floor cell gets the floor
 * variant that its position picks (`floorAt`). Each wall cell gets the wall
 * piece that joins the wall and door cells beside it, because a door is a
 * wall segment with a leaf in it.
 * @param {TilePalette} palette @param {number[]} cells @param {number} size
 * @param {() => number} rng
 * @param {MaskArt} [art] the pieces to draw with, dressed stone by default
 * @returns {Tile[]}
 */
export function maskTiles(palette, cells, size, rng, art = STONE_ART) {
  const joins = (/** @type {number} */ x, /** @type {number} */ y) =>
    x >= 0 &&
    y >= 0 &&
    x < size &&
    y < size &&
    (cells[y * size + x] === WALL || isDoor(cells[y * size + x]));
  /** @type {Tile[]} */
  const tiles = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const code = cells[y * size + x];
      /** @type {string} */
      let kind;
      if (code === FLOOR) kind = floorAt(art.floors, x, y, rng);
      else if (code === WALL) {
        kind = art.wall(joins(x, y - 1), joins(x + 1, y), joins(x, y + 1), joins(x - 1, y));
      } else if (code === DOOR_H) kind = art.doorH;
      else if (code === DOOR_V) kind = art.doorV;
      else continue;
      tiles.push(createTile(tileIdAt(x, y), interiorRef(palette, kind)));
    }
  }
  return tiles;
}

/**
 * Build a stamper that overwrites the image of an already-placed tile, for
 * the stairs that go on a finished layout. Indexing once here avoids a full
 * scan per stamp. An id with no tile behind it is ignored.
 * @param {Tile[]} tiles @param {TilePalette} palette
 * @returns {(id: string, kind: string) => void}
 */
export function tileStamper(tiles, palette) {
  const byId = tilesById(tiles);
  return (id, kind) => {
    const tile = byId.get(id);
    if (tile) tile.imageRef = interiorRef(palette, kind);
  };
}

/**
 * The candidate cell farthest by walking distance from the cell that
 * `dist` was measured from. Stairs down go there, so a level makes the
 * party cross it. A candidate the walk cannot reach, or the start cell
 * itself, is never picked.
 * @param {Int32Array} dist @param {number} size @param {[number, number][]} candidates
 * @returns {[number, number] | null}
 */
export function farthest(dist, size, candidates) {
  let pick = null;
  let top = 0;
  for (const [x, y] of candidates) {
    const d = dist[y * size + x];
    if (d > top) {
      top = d;
      pick = /** @type {[number, number]} */ ([x, y]);
    }
  }
  return pick;
}

/**
 * Keep only the largest 4-connected area of floor and door cells, and turn
 * every other cell to void.
 * @param {number[]} cells @param {number} size
 * @returns {number[]}
 */
export function largestArea(cells, size) {
  const seen = new Uint8Array(size * size);
  /** @type {Int32Array | null} */
  let best = null;
  let bestSize = 0;
  cells.forEach((code, i) => {
    if (seen[i] || (code !== FLOOR && !isDoor(code))) return;
    const dist = walkDistances(cells, size, i % size, Math.floor(i / size));
    let count = 0;
    dist.forEach((d, j) => {
      if (d >= 0) {
        seen[j] = 1;
        count++;
      }
    });
    if (count > bestSize) {
      bestSize = count;
      best = dist;
    }
  });
  const keep = best;
  return cells.map((code, i) => (keep && keep[i] >= 0 ? code : VOID));
}

/**
 * The coordinates of every floor cell, row by row.
 * @param {number[]} cells @param {number} size
 * @returns {[number, number][]}
 */
export function floorCells(cells, size) {
  /** @type {[number, number][]} */
  const out = [];
  cells.forEach((code, i) => {
    if (code === FLOOR) out.push([i % size, Math.floor(i / size)]);
  });
  return out;
}
