import { createTile } from './TileGrid.js';
import { coastOverlays, riverCourse, smoothCoastline } from './Autotile.js';

/** @typedef {import('../types/map.js').Tile} Tile */
/** @typedef {import('../types/map.js').NodeKind} NodeKind */
/** @typedef {import('./TilePalette.js').TilePalette} TilePalette */

/**
 * Grid side length per size preset. Square grids keep the archetype generators
 * simple and read the same at any size; "large" is big enough to be a genuinely
 * procedurally-generated area rather than a hand-place-able handful of tiles.
 * @type {Record<string, number>}
 */
export const GENERATOR_SIZES = { small: 8, medium: 14, large: 22 };

/**
 * Which archetypes make sense for each node kind — region archetypes lay out
 * open terrain, interior archetypes carve enclosed structures. The Build UI
 * offers only the current node's kind's list.
 * @type {Record<NodeKind, { value: string, label: string }[]>}
 */
export const ARCHETYPES = {
  region: [
    { value: 'wilderness', label: 'Wilderness (procedural terrain)' },
    { value: 'town', label: 'Town (roads + buildings)' },
  ],
  interior: [
    { value: 'dungeon', label: 'Dungeon (rooms + corridors)' },
    { value: 'castle', label: 'Castle (walls + halls)' },
  ],
};

const TERRAIN_BLOBS = ['forest', 'water', 'mountain', 'desert', 'swamp', 'snow', 'hills', 'farmland'];
const TOWN_BUILDINGS = ['tavern', 'inn', 'blacksmith', 'general-store', 'alchemist', 'temple', 'shrine', 'wizard-tower', 'academy', 'barracks'];
const WILDERNESS_LANDMARKS = ['ruins', 'camp', 'standing-stones', 'mine', 'cave-entrance', 'graveyard'];
const FLOOR_KINDS = ['floor-1', 'floor-2', 'floor-3'];

/** @param {TilePalette} palette @param {string} type @param {() => number} rng */
function terrainRef(palette, type, rng) {
  return palette.pickVariant(type, rng).imageRef;
}

/** @param {TilePalette} palette @param {string} kind */
function interiorRef(palette, kind) {
  return palette.getInteriorPiece(kind)?.imageRef ?? '';
}

/** @param {() => number} rng @param {number} n */
function randInt(rng, n) {
  return Math.floor(rng() * n);
}

/**
 * Fisher-Yates shuffle of a copy of `items`, using the injected RNG so a seed
 * reproduces the same order (used to scatter town buildings deterministically).
 * @template T @param {T[]} items @param {() => number} rng @returns {T[]}
 */
function shuffle(items, rng) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Procedural open terrain: a grass base with clustered blobs of every biome
 * grown by probabilistic flood-fill, so terrain reads as contiguous features
 * rather than per-tile noise. Water blobs get sandy coast overlays where they
 * meet land, a river meanders in from the north edge, and a few landmark POI
 * markers (ruins, camps, standing stones...) dot the open ground.
 * Fully tiled, so it connects to the parent along its whole border; entry is
 * the bottom-centre border tile.
 * @param {TilePalette} palette @param {number} size @param {() => number} rng
 * @returns {{ tiles: Tile[], entry: string }}
 */
function generateWilderness(palette, size, rng) {
  /** @type {string[]} terrain type per cell, indexed y*size + x */
  let cells = new Array(size * size).fill('grass');
  const blobCount = Math.max(3, Math.round((size * size) / 16));
  for (let b = 0; b < blobCount; b++) {
    const type = TERRAIN_BLOBS[randInt(rng, TERRAIN_BLOBS.length)];
    const target = 4 + randInt(rng, size);
    /** @type {[number, number][]} */
    const frontier = [[randInt(rng, size), randInt(rng, size)]];
    let placed = 0;
    while (frontier.length && placed < target) {
      const [x, y] = frontier.splice(randInt(rng, frontier.length), 1)[0];
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const idx = y * size + x;
      if (cells[idx] === type) continue;
      cells[idx] = type;
      placed++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (rng() < 0.6) frontier.push([x + dx, y + dy]);
      }
    }
  }
  cells = smoothCoastline(cells, size, size);
  const isWater = (/** @type {number} */ x, /** @type {number} */ y) =>
    x >= 0 && y >= 0 && x < size && y < size && cells[y * size + x] === 'water';
  const coast = coastOverlays(cells, size, size);
  const river = riverCourse(size, size, rng, isWater);
  /** @type {Tile[]} */
  const tiles = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const id = `${x},${y}`;
      // Shoreline draws under the channel, so a river drains through the
      // beach into the water instead of one overlay displacing the other.
      const refs = [];
      const coastPiece = coast.get(id) && palette.getCoastPiece(/** @type {string} */ (coast.get(id)));
      const riverPiece = river.get(id) && palette.getRiverPiece(/** @type {string} */ (river.get(id)));
      if (coastPiece) refs.push(coastPiece.imageRef);
      if (riverPiece) refs.push(riverPiece.imageRef);
      tiles.push(createTile(id, terrainRef(palette, cells[y * size + x], rng),
        refs.length ? { overlayRef: refs.length > 1 ? refs : refs[0] } : {}));
    }
  }
  // Landmark markers on plain grass away from the border, so generated wilds
  // offer something to discover. Grass keeps markers off water/river cells.
  const grassIds = tiles.filter((t) => {
    const [x, y] = t.id.split(',').map(Number);
    const inner = x > 0 && y > 0 && x < size - 1 && y < size - 1;
    return inner && !t.overlayRef && cells[y * size + x] === 'grass';
  }).map((t) => t.id);
  const landmarkCount = Math.min(grassIds.length, Math.max(1, Math.round(size / 7)));
  const spots = shuffle(grassIds, rng);
  shuffle(WILDERNESS_LANDMARKS, rng).slice(0, landmarkCount).forEach((type, i) => {
    const ref = palette.get(type)?.imageRef;
    const tile = tiles.find((t) => t.id === spots[i]);
    if (!ref || !tile) return;
    tile.imageRef = ref;
    tile.metadata = { ...tile.metadata, poiType: 'landmark' };
  });
  return { tiles, entry: `${Math.floor(size / 2)},${size - 1}` };
}

/**
 * A settlement: grass everywhere, a cross of roads through the middle (drawn as
 * an overlay so the grass shows through the verges), and building POI markers
 * scattered on the grass tiles bordering the roads. Entry is the south end of
 * the vertical road, which runs edge to edge.
 * @param {TilePalette} palette @param {number} size @param {() => number} rng
 * @returns {{ tiles: Tile[], entry: string }}
 */
function generateTown(palette, size, rng) {
  // Roads run edge to edge, so the road cross itself connects the town to the
  // parent map on all four sides.
  const mx = Math.floor(size / 2);
  const my = Math.floor(size / 2);
  /** @param {number} x @param {number} y */
  const isRoad = (x, y) => x === mx || y === my;
  // A river runs north-south through town a couple of tiles off the crossroads,
  // bridged where the east-west road crosses it.
  const rx = mx + (rng() < 0.5 ? -1 : 1) * (2 + randInt(rng, Math.max(1, mx - 3)));
  /** @type {Map<string, Tile>} */
  const byId = new Map();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const base = terrainRef(palette, 'grass', rng);
      const tile = createTile(`${x},${y}`, base);
      if (x === rx) {
        const kind = y === my ? 'bridge-h' : 'v';
        tile.overlayRef = palette.getRiverPiece(kind)?.imageRef ?? null;
      } else if (isRoad(x, y)) {
        const kind = x === mx && y === my ? 'cross' : x === mx ? 'v' : 'h';
        tile.overlayRef = palette.getRoadPiece(kind)?.imageRef ?? null;
      }
      byId.set(tile.id, tile);
    }
  }
  // Building sites: grass cells orthogonally adjacent to a road, scattered and
  // capped so a small town stays sparse and a large one fills out.
  /** @type {string[]} */
  const sites = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (isRoad(x, y) || x === rx) continue;
      const touchesRoad = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => isRoad(x + dx, y + dy));
      if (touchesRoad) sites.push(`${x},${y}`);
    }
  }
  const count = Math.min(sites.length, Math.max(3, Math.round(size / 2)));
  const chosen = shuffle(sites, rng).slice(0, count);
  chosen.forEach((id, i) => {
    const building = TOWN_BUILDINGS[i % TOWN_BUILDINGS.length];
    const ref = palette.get(building)?.imageRef;
    const tile = byId.get(id);
    if (!ref || !tile) return;
    tile.imageRef = ref;
    tile.overlayRef = null;
    tile.metadata = { ...tile.metadata, poiType: 'settlement' };
  });
  return { tiles: [...byId.values()], entry: `${mx},${size - 1}` };
}

/**
 * Pick a wall piece for a wall cell from which orthogonal neighbors continue
 * the wall (another wall cell, or a door set into the same run). Piece names
 * describe the connected edges, so four arms make a cross, three a tee (named
 * for its odd arm, matching the tile assets), two an elbow or straight, and a
 * one-armed stub extends its run. An isolated nub falls back to horizontal.
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
 * A dungeon of rectangular rooms joined by L-shaped corridors, all floored,
 * wrapped in walls wherever floor meets the void; stairs up/down sit in the
 * first and last room. Cells that are neither floor nor wall are left empty
 * (no tile), so the level reads as carved out of blank space.
 *
 * How the level connects to what's above it depends on `entrance`: an `edge`
 * level (a dungeon entered from the overworld) gets a corridor carved from the
 * first room to the nearest map edge with a door on the border cell, while a
 * `stairs` level (a deeper floor reached by descending) has no surface exit —
 * its stairs-up tile is the way back, and it becomes the entry. `descend`
 * controls whether a stairs-down tile is placed at all; the bottom level of a
 * multi-level dungeon omits it so no stairs lead nowhere. The returned
 * `stairsDown` is that tile's id (null when omitted), the seam the caller
 * links to the next level via `childNodeId`.
 * @param {TilePalette} palette @param {number} size @param {() => number} rng
 * @param {{ entrance?: 'edge' | 'stairs', descend?: boolean }} [options]
 * @returns {{ tiles: Tile[], entry: string, stairsDown: string | null }}
 */
function generateDungeon(palette, size, rng, options = {}) {
  const entrance = options.entrance ?? 'edge';
  const descend = options.descend ?? true;
  /** @type {boolean[]} floor mask, indexed y*size + x */
  const floor = new Array(size * size).fill(false);
  /** @param {number} x @param {number} y */
  const inBounds = (x, y) => x >= 0 && y >= 0 && x < size && y < size;
  /** @param {number} x @param {number} y */
  const isFloor = (x, y) => inBounds(x, y) && floor[y * size + x];
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
    // Reject rooms that would touch an existing one (keeps a wall between them).
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
  // nearest map edge and put a door on the border cell, so the dungeon is
  // reachable from the parent map instead of floating disconnected in the
  // void. A stairs-entered level skips this — it has no surface exit, and its
  // stairs-up is the entry instead.
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
    entry = side === 0 ? `${ex},0` : side === 1 ? `${ex},${size - 1}` : side === 2 ? `0,${ey}` : `${size - 1},${ey}`;
    entryDoor = side <= 1 ? 'door-h' : 'door-v';
  }

  // Walls wrap the floor wherever it meets the void (8-way, so diagonals are
  // sealed too). Each wall cell's piece comes from which orthogonal neighbors
  // continue the wall — the border door counts, since a door is a wall segment
  // with a leaf in it — so runs, elbows, tees, and crossings all join cleanly.
  /** @type {Set<string>} */
  const walls = new Set();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!isFloor(x, y) && [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].some(([dx, dy]) => isFloor(x + dx, y + dy))) {
        walls.add(`${x},${y}`);
      }
    }
  }
  /** @param {number} x @param {number} y */
  const continuesWall = (x, y) => walls.has(`${x},${y}`) || (entrance === 'edge' && `${x},${y}` === entry);
  /** @type {Tile[]} */
  const tiles = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const id = `${x},${y}`;
      if (isFloor(x, y)) {
        tiles.push(createTile(id, interiorRef(palette, FLOOR_KINDS[randInt(rng, FLOOR_KINDS.length)])));
      } else if (walls.has(id)) {
        const kind = wallKind(continuesWall(x, y - 1), continuesWall(x + 1, y), continuesWall(x, y + 1), continuesWall(x - 1, y));
        tiles.push(createTile(id, interiorRef(palette, kind)));
      }
    }
  }
  // Stairs mark the way up (first room) and, when a level exists below, the
  // way down (last room); an edge level also doors the border cell of its
  // entrance corridor. A stairs-entered level's entry is its stairs-up.
  /** @type {string | null} */
  let stairsDown = null;
  if (centers.length) {
    const up = centers[0];
    const down = centers[centers.length - 1];
    const stamp = (/** @type {string} */ id, /** @type {string} */ kind) => {
      const t = tiles.find((tile) => tile.id === id);
      if (t) t.imageRef = interiorRef(palette, kind);
    };
    stamp(`${up[0]},${up[1]}`, 'stairs-up');
    if (descend) {
      stairsDown = `${down[0]},${down[1]}`;
      if (stairsDown === `${up[0]},${up[1]}`) {
        // Single-room level: shift the descent off the stairs-up cell onto an
        // adjacent floor tile so both stairs exist.
        const neighbor = [[1, 0], [-1, 0], [0, 1], [0, -1]]
          .map(([dx, dy]) => [down[0] + dx, down[1] + dy])
          .find(([x, y]) => isFloor(x, y));
        stairsDown = neighbor ? `${neighbor[0]},${neighbor[1]}` : null;
      }
      if (stairsDown) stamp(stairsDown, 'stairs-down');
    }
    if (entrance === 'edge') stamp(entry, entryDoor);
    else entry = `${up[0]},${up[1]}`;
  }
  return { tiles, entry, stairsDown };
}

/**
 * A castle keep: a floored hall enclosed by a full wall ring with a door in the
 * south wall, split by one interior partition wall (with its own door), and
 * stairs up/down in the top corners of the hall. The south door is the entry
 * connecting the keep to the parent map.
 * @param {TilePalette} palette @param {number} size @param {() => number} rng
 * @returns {{ tiles: Tile[], entry: string }}
 */
function generateCastle(palette, size, rng) {
  const max = size - 1;
  const doorX = Math.floor(size / 2);
  const partitionY = Math.floor(size / 2);
  const partitionDoorX = 1 + randInt(rng, Math.max(1, size - 2));
  /** @type {Tile[]} */
  const tiles = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const id = `${x},${y}`;
      /** @type {string} */
      let kind;
      if (y === max && x === doorX) kind = 'door-h';
      // Corner names describe the connected edges, so the ring's NW corner
      // (walls continuing east and south) takes wall-corner-se, and so on.
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
  const stair = (/** @type {string} */ id, /** @type {string} */ kind) => {
    const t = tiles.find((tile) => tile.id === id);
    if (t) t.imageRef = interiorRef(palette, kind);
  };
  stair('1,1', 'stairs-up');
  stair(`${max - 1},1`, 'stairs-down');
  return { tiles, entry: `${doorX},${max}` };
}

/**
 * Generate a full tile grid for a node from an archetype and size preset. Pure
 * and RNG-injected (pass `Math.random` in the app, a seeded generator in
 * tests). The returned width/height replace the node's dimensions; the caller
 * stamps the tiles in. Every archetype guarantees `entry`: a border tile that
 * exists and connects to the layout's walkable area (a door for interiors, a
 * road end or open ground for regions), so a generated space is always
 * reachable from its parent map.
 * @param {TilePalette} palette
 * @param {{ kind: NodeKind, archetype: string, size: string }} options
 * @param {() => number} rng
 * @returns {{ width: number, height: number, tiles: Tile[], entry: string }}
 */
export function generateNodeTiles(palette, { archetype, size }, rng) {
  const n = GENERATOR_SIZES[size] ?? GENERATOR_SIZES.medium;
  let gen;
  if (archetype === 'town') gen = generateTown(palette, n, rng);
  else if (archetype === 'dungeon') gen = generateDungeon(palette, n, rng, { descend: false });
  else if (archetype === 'castle') gen = generateCastle(palette, n, rng);
  else gen = generateWilderness(palette, n, rng);
  return { width: n, height: n, tiles: gen.tiles, entry: gen.entry };
}

/**
 * Generate a multi-level dungeon as a chain of levels: level 1 is entered from
 * the map edge (corridor + border door), each deeper level is entered by
 * stairs, and every level's stairs-down tile is linked (via the existing
 * `childNodeId` zoom seam) to the level below it, so stairs always connect to
 * a real generated level. The bottom level places no stairs-down, so no stairs
 * lead nowhere. `makeId` supplies each sub-level's node id (injected so the
 * caller can guarantee uniqueness against its grid and tests stay pure).
 *
 * Returns one entry per level, top first: the caller stamps level 1's tiles
 * into the node being generated and creates a child node per deeper level.
 * @param {TilePalette} palette
 * @param {{ size: string, levels: number }} options
 * @param {() => number} rng
 * @param {() => string} makeId
 * @returns {{ id: string | null, width: number, height: number, tiles: Tile[], entry: string }[]}
 *   `id` is null for the first level (it fills the existing node) and a fresh
 *   node id for each level below.
 */
export function generateDungeonLevels(palette, { size, levels }, rng, makeId) {
  const n = GENERATOR_SIZES[size] ?? GENERATOR_SIZES.medium;
  const count = Math.max(1, Math.floor(levels) || 1);
  /** @type {{ id: string | null, width: number, height: number, tiles: Tile[], entry: string }[]} */
  const out = [];
  /** @type {Tile | null} the stairs-down tile awaiting a link to the level below */
  let pendingStairs = null;
  for (let i = 0; i < count; i++) {
    const last = i === count - 1;
    const gen = generateDungeon(palette, n, rng, {
      entrance: i === 0 ? 'edge' : 'stairs',
      // A level only gets stairs-down if a level genuinely exists below it. A
      // level that failed to place them (degenerate single-room layouts with
      // no free neighbor) ends the chain early rather than orphaning levels.
      descend: !last,
    });
    const id = i === 0 ? null : makeId();
    out.push({ id, width: n, height: n, tiles: gen.tiles, entry: gen.entry });
    if (pendingStairs) pendingStairs.childNodeId = /** @type {string} */ (id);
    if (last || !gen.stairsDown) break;
    pendingStairs = gen.tiles.find((t) => t.id === gen.stairsDown) ?? null;
    if (!pendingStairs) break;
  }
  return out;
}
