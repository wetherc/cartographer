import { generateWilderness, generateTown } from './GeneratorRegions.js';
import { generateDungeon, generateCastle } from './GeneratorInteriors.js';

/** @typedef {import('../types/map.js').Tile} Tile */
/** @typedef {import('../types/map.js').NodeKind} NodeKind */
/** @typedef {import('./TilePalette.js').TilePalette} TilePalette */

/**
 * The map-generation front door: size presets, the archetype catalog the
 * Build UI offers, and the dispatchers that run a generator and hand the
 * caller a stampable tile grid. The archetype generators themselves live in
 * GeneratorRegions.js (wilderness, town) and GeneratorInteriors.js (dungeon,
 * castle).
 */

/**
 * Grid side length per size preset. Square grids keep the archetype
 * generators simple and give the same result at any size. The "large"
 * preset is big enough to be a real procedurally generated area, not a
 * handful of tiles a GM can place by hand.
 * @type {Record<string, number>}
 */
export const GENERATOR_SIZES = { small: 8, medium: 14, large: 22 };

/**
 * Which archetypes make sense for each node kind. Region archetypes lay out
 * open terrain. Interior archetypes carve enclosed structures. The Build UI
 * offers only the list for the current node's kind.
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

/**
 * Generate a full tile grid for a node from an archetype and size preset.
 * This is a pure function with an injected RNG (pass `Math.random` in the
 * app, a seeded generator in tests). The returned width and height replace
 * the node's dimensions. The caller stamps the tiles in. Every archetype
 * guarantees `entry`: a border tile that exists and connects to the layout's
 * walkable area (a door for interiors, a road end or open ground for
 * regions). A generated space is then always reachable from its parent map.
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
 * Generate a multi-level dungeon as a chain of levels. Level 1 is entered
 * from the map edge through a corridor and a border door. Each deeper level
 * is entered by stairs. Every level's stairs-down tile links, through the
 * existing `childNodeId` zoom link, to the level below it, so stairs always
 * connect to a real generated level. The bottom level places no stairs-down,
 * so no stairs lead to nothing. `makeId` supplies each sub-level's node id.
 * It is injected so the caller can guarantee uniqueness against its grid and
 * tests stay pure.
 *
 * This returns one entry per level, top first. The caller stamps level 1's
 * tiles into the node being generated and creates a child node per deeper level.
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
      // A level gets stairs-down only if a level genuinely exists below it.
      // A level that failed to place them (a degenerate single-room layout
      // with no free neighbor) ends the chain early instead of orphaning levels.
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
