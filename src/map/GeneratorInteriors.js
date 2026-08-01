import { createTile, tilesById } from './TileGrid.js';
import { randInt } from './GeneratorRandom.js';
import { maskAt, NEIGHBORS4, NEIGHBORS8, tileIdAt } from './MapGeometry.js';

/** @typedef {import('../types/map.js').Tile} Tile */
/** @typedef {import('./TilePalette.js').TilePalette} TilePalette */

/**
 * This file holds the interior, or enclosed-structure, archetype generators:
 * dungeon and castle. It also holds the wall-piece picker that both
 * generators share. This file is split out of MapGenerator.js, which keeps
 * the size presets and the archetype dispatch. The open-terrain archetypes
 * live in GeneratorRegions.js.
 */

const FLOOR_KINDS = ['floor-1', 'floor-2', 'floor-3'];

/** @param {TilePalette} palette @param {string} kind */
function interiorRef(palette, kind) {
  return palette.getInteriorPiece(kind)?.imageRef ?? '';
}

/**
 * Build a stamper that overwrites the image of an already-placed tile. Both
 * interior archetypes build the whole grid first, then re-image a few cells
 * as stairs and doors. Indexing once here avoids a full scan per stamp. An
 * id with no tile behind it, for example a stair cell the layout left as
 * void, is ignored instead of causing an error.
 * @param {Tile[]} tiles @param {TilePalette} palette
 * @returns {(id: string, kind: string) => void}
 */
function tileStamper(tiles, palette) {
  const byId = tilesById(tiles);
  return (id, kind) => {
    const tile = byId.get(id);
    if (tile) tile.imageRef = interiorRef(palette, kind);
  };
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
 * Generate a dungeon of rectangular rooms joined by L-shaped corridors, all
 * floored. Walls wrap the floor wherever it meets the void. Stairs up and
 * down sit in the first and last room. Cells that are neither floor nor wall
 * stay empty, with no tile, so the level reads as carved out of blank space.
 *
 * How the level connects to the level above it depends on `entrance`. An
 * `edge` level, for example a dungeon entered from the overworld, gets a
 * corridor carved from the first room to the nearest map edge, with a door
 * on the border cell. A `stairs` level, for example a deeper floor reached
 * by descending, has no surface exit. Its stairs-up tile is the way back,
 * and it becomes the entry. `descend` controls whether the function places
 * a stairs-down tile at all. The bottom level of a multi-level dungeon
 * omits it, because no lower level exists for it to lead to. The returned
 * `stairsDown` value
 * is that tile id, or null when omitted. The caller links it to the next
 * level through `childNodeId`.
 * @param {TilePalette} palette @param {number} size @param {() => number} rng
 * @param {{ entrance?: 'edge' | 'stairs', descend?: boolean }} [options]
 * @returns {{ tiles: Tile[], entry: string, stairsDown: string | null }}
 */
export function generateDungeon(palette, size, rng, options = {}) {
  const entrance = options.entrance ?? 'edge';
  const descend = options.descend ?? true;
  /** @type {boolean[]} floor mask, indexed y*size + x */
  const floor = new Array(size * size).fill(false);
  /** @param {number} x @param {number} y */
  const inBounds = (x, y) => x >= 0 && y >= 0 && x < size && y < size;
  const isFloor = maskAt(floor, size, size, true);
  /** @param {number} x @param {number} y */
  const carve = (x, y) => {
    if (inBounds(x, y)) floor[y * size + x] = true;
  };

  /** @type {[number, number][]} room centers */
  const centers = [];
  const roomTarget = Math.max(3, Math.round(size / 3));
  for (let attempt = 0; attempt < roomTarget * 4 && centers.length < roomTarget; attempt++) {
    const w = 3 + randInt(rng, 3);
    const h = 3 + randInt(rng, 3);
    const x0 = 1 + randInt(rng, Math.max(1, size - w - 1));
    const y0 = 1 + randInt(rng, Math.max(1, size - h - 1));
    // Reject rooms that touch an existing room. This keeps a wall between
    // rooms.
    let clash = false;
    for (let y = y0 - 1; y <= y0 + h && !clash; y++) {
      for (let x = x0 - 1; x <= x0 + w; x++) {
        if (isFloor(x, y)) clash = true;
      }
    }
    if (clash) continue;
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) carve(x, y);
    }
    centers.push([x0 + (w >> 1), y0 + (h >> 1)]);
  }
  // Connect each room to the previous one with an L-shaped corridor.
  for (let i = 1; i < centers.length; i++) {
    const [ax, ay] = centers[i - 1];
    const [bx, by] = centers[i];
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) carve(x, ay);
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) carve(bx, y);
  }

  // Edge entrance: carve a straight corridor from the first room to the
  // nearest map edge, and put a door on the border cell. This makes the
  // dungeon reachable from the parent map, instead of floating disconnected
  // in the void. A stairs-entered level skips this step, because it has no
  // surface exit. Its stairs-up tile is the entry instead.
  /** @type {string} */
  let entry = '0,0';
  /** @type {'door-h' | 'door-v'} */
  let entryDoor = 'door-h';
  if (centers.length && entrance === 'edge') {
    const [ex, ey] = centers[0];
    const dists = [ey, size - 1 - ey, ex, size - 1 - ex]; // top, bottom, left, right
    const side = dists.indexOf(Math.min(...dists));
    if (side === 0) for (let y = 0; y <= ey; y++) carve(ex, y);
    else if (side === 1) for (let y = ey; y < size; y++) carve(ex, y);
    else if (side === 2) for (let x = 0; x <= ex; x++) carve(x, ey);
    else for (let x = ex; x < size; x++) carve(x, ey);
    entry =
      side === 0
        ? tileIdAt(ex, 0)
        : side === 1
          ? tileIdAt(ex, size - 1)
          : side === 2
            ? tileIdAt(0, ey)
            : tileIdAt(size - 1, ey);
    entryDoor = side <= 1 ? 'door-h' : 'door-v';
  }

  // Walls wrap the floor wherever it meets the void, checked in all eight
  // directions, so diagonals are sealed too. Each wall cell piece depends on
  // which orthogonal neighbors continue the wall. The border door counts as
  // a wall neighbor, because a door is a wall segment with a leaf in it.
  // This makes runs, elbows, tees, and crossings join cleanly.
  /** @type {Set<string>} */
  const walls = new Set();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!isFloor(x, y) && NEIGHBORS8.some(([dx, dy]) => isFloor(x + dx, y + dy))) {
        walls.add(tileIdAt(x, y));
      }
    }
  }
  /** @param {number} x @param {number} y */
  const continuesWall = (x, y) => {
    const id = tileIdAt(x, y);
    return walls.has(id) || (entrance === 'edge' && id === entry);
  };
  /** @type {Tile[]} */
  const tiles = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const id = tileIdAt(x, y);
      if (isFloor(x, y)) {
        tiles.push(
          createTile(id, interiorRef(palette, FLOOR_KINDS[randInt(rng, FLOOR_KINDS.length)])),
        );
      } else if (walls.has(id)) {
        const kind = wallKind(
          continuesWall(x, y - 1),
          continuesWall(x + 1, y),
          continuesWall(x, y + 1),
          continuesWall(x - 1, y),
        );
        tiles.push(createTile(id, interiorRef(palette, kind)));
      }
    }
  }
  // Stairs mark the way up in the first room, and the way down in the last
  // room when a level exists below. An edge level also places a door on the
  // border cell of its entrance corridor. A stairs-entered level uses its
  // stairs-up tile as the entry.
  /** @type {string | null} */
  let stairsDown = null;
  if (centers.length) {
    const up = centers[0];
    const down = centers[centers.length - 1];
    const stamp = tileStamper(tiles, palette);
    stamp(tileIdAt(up[0], up[1]), 'stairs-up');
    if (descend) {
      stairsDown = tileIdAt(down[0], down[1]);
      if (stairsDown === tileIdAt(up[0], up[1])) {
        // Single-room level: move the stairs-down off the stairs-up cell
        // onto an adjacent floor tile, so both stairs exist.
        const neighbor = NEIGHBORS4.map(([dx, dy]) => [down[0] + dx, down[1] + dy]).find(([x, y]) =>
          isFloor(x, y),
        );
        stairsDown = neighbor ? tileIdAt(neighbor[0], neighbor[1]) : null;
      }
      if (stairsDown) stamp(stairsDown, 'stairs-down');
    }
    if (entrance === 'edge') stamp(entry, entryDoor);
    else entry = tileIdAt(up[0], up[1]);
  }
  return { tiles, entry, stairsDown };
}

/**
 * Generate a castle keep: a floored hall enclosed by a full wall ring with a
 * door in the south wall. One interior partition wall, with its own door,
 * splits the hall. Stairs up and down sit in the top corners of the hall.
 * The south door is the entry that connects the keep to the parent map.
 * @param {TilePalette} palette @param {number} size @param {() => number} rng
 * @returns {{ tiles: Tile[], entry: string }}
 */
export function generateCastle(palette, size, rng) {
  const max = size - 1;
  const doorX = Math.floor(size / 2);
  const partitionY = Math.floor(size / 2);
  const partitionDoorX = 1 + randInt(rng, Math.max(1, size - 2));
  /** @type {Tile[]} */
  const tiles = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const id = tileIdAt(x, y);
      /** @type {string} */
      let kind;
      if (y === max && x === doorX) kind = 'door-h';
      // Corner names describe the connected edges. The ring NW corner, where
      // walls continue east and south, takes wall-corner-se.
      else if (x === 0 && y === 0) kind = 'wall-corner-se';
      else if (x === max && y === 0) kind = 'wall-corner-sw';
      else if (x === 0 && y === max) kind = 'wall-corner-ne';
      else if (x === max && y === max) kind = 'wall-corner-nw';
      // The partition tees into the side walls, so the ring keeps a
      // continuous run through the junctions.
      else if (x === 0 && y === partitionY) kind = 'wall-tee-e';
      else if (x === max && y === partitionY) kind = 'wall-tee-w';
      else if (y === 0 || y === max) kind = 'wall-h';
      else if (x === 0 || x === max) kind = 'wall-v';
      else if (y === partitionY) kind = x === partitionDoorX ? 'door-h' : 'wall-h';
      else kind = FLOOR_KINDS[randInt(rng, FLOOR_KINDS.length)];
      tiles.push(createTile(id, interiorRef(palette, kind)));
    }
  }
  const stamp = tileStamper(tiles, palette);
  stamp('1,1', 'stairs-up');
  stamp(tileIdAt(max - 1, 1), 'stairs-down');
  return { tiles, entry: tileIdAt(doorX, max) };
}
