import { generateWilds } from './GeneratorWilds.js';
import { generateTown } from './GeneratorTown.js';
import { generateDungeon } from './GeneratorInteriors.js';
import { generateCave } from './GeneratorCave.js';
import { generateBuilding, generateCastle, generateUpperFloor } from './GeneratorHalls.js';
import { generateWorld } from './GeneratorWorld.js';
import { generateGuestFloor } from './GeneratorInnShop.js';
import { GENERATOR_SIZES } from './GeneratorSizes.js';

/** @typedef {import('../types/map.js').Tile} Tile */
/** @typedef {import('../types/map.js').NodeKind} NodeKind */
/** @typedef {import('../types/map.js').GeneratedSite} GeneratedSite */
/** @typedef {import('./TilePalette.js').TilePalette} TilePalette */

/**
 * The map-generation front door: size presets, the archetype catalog the
 * Build UI offers, and the dispatchers that run a generator and hand the
 * caller a stampable tile grid. The archetype generators themselves live in
 * GeneratorWilds.js (wilderness and its climate variants), GeneratorTown.js
 * (town), GeneratorInteriors.js (dungeon), GeneratorCave.js (cave),
 * GeneratorHalls.js (castle, building), and GeneratorWorld.js (world).
 */

/** The size presets, from `GeneratorSizes.js`. */
export { GENERATOR_SIZES };

/**
 * The size presets as the Generate dialog lists them, smallest first.
 * @type {{ value: string, label: string }[]}
 */
export const SIZE_OPTIONS = Object.entries(GENERATOR_SIZES).map(([value, n]) => ({
  value,
  label: `${value[0].toUpperCase()}${value.slice(1)} (${n} x ${n})`,
}));

/**
 * Which archetypes make sense for each node kind. Region archetypes lay out
 * open terrain. Interior archetypes carve enclosed structures. The Build UI
 * offers only the list for the current node's kind.
 * @type {Record<NodeKind, { value: string, label: string }[]>}
 */
export const ARCHETYPES = {
  region: [
    { value: 'wilderness', label: 'Wilderness (temperate terrain)' },
    { value: 'highlands', label: 'Highlands (hills + mountain ranges)' },
    { value: 'frontier', label: 'Frontier (cold north: snow + taiga)' },
    { value: 'desert', label: 'Desert (hot + dry)' },
    { value: 'wetlands', label: 'Wetlands (lakes, swamp, many rivers)' },
    { value: 'island', label: 'Island (land ringed by sea)' },
    { value: 'town', label: 'Town (roads + buildings)' },
    { value: 'world', label: 'World (a continent split into regions)' },
  ],
  interior: [
    { value: 'dungeon', label: 'Dungeon (rooms + corridors)' },
    { value: 'cave', label: 'Cave (winding caverns)' },
    { value: 'castle', label: 'Castle (walls + halls)' },
    { value: 'building', label: 'Building (a few small rooms)' },
  ],
};

/**
 * The archetypes that stack into levels joined by stairs. The Generate
 * dialog shows its Levels field for these alone.
 */
export const STACKED_ARCHETYPES = ['dungeon', 'cave'];

/**
 * The most levels in one stack of dungeon or cave levels, counted from the
 * first level. Each level is a node of its own, so a stack with no limit
 * can make a save too large to store. `generateNodeTiles` stops a stack at
 * this level, and the Generate dialog limits its Levels field to it.
 */
export const MAX_LEVELS = 10;

/**
 * How many levels a stack can still add, counting the level `level` itself.
 * The result is at least 1, because the level itself always exists.
 * @param {number} level
 * @returns {number}
 */
export function levelsLeft(level) {
  return Math.max(1, MAX_LEVELS - level + 1);
}

/**
 * The archetypes for an interior node that its parent reaches by a
 * staircase, by the tile kind that leads back to the parent. A node that
 * returns by its stairs up is a level below its parent, and a node that
 * returns by its stairs down is a floor above it. Each of these archetypes
 * gives the node the staircase back, so the parent's stairs always land on
 * a staircase. A castle or a building in this place adds a door to a floor
 * that has no outside, and a castle adds a second upper floor and a second
 * dungeon to the stack.
 * @type {Record<'stairs-up' | 'stairs-down', { value: string, label: string }[]>}
 */
export const STAIRWAY_ARCHETYPES = {
  'stairs-up': [
    { value: 'dungeon', label: 'Dungeon (rooms + corridors)' },
    { value: 'cave', label: 'Cave (winding caverns)' },
    { value: 'cellar', label: 'Cellar (one small level)' },
  ],
  'stairs-down': [{ value: 'upper-floor', label: 'Upper floor (chambers above a hall)' }],
};

/**
 * The archetypes that the Generate dialog offers for a node. `back` is the
 * tile kind that leads from the node back to its parent, when the parent
 * reaches the node by a staircase (`MapExits.stairwayTo`). A region never
 * takes the stairway list, because stairs join interiors only.
 * @param {NodeKind} kind
 * @param {'stairs-up' | 'stairs-down' | null} back
 * @returns {{ value: string, label: string }[]}
 */
export function archetypesFor(kind, back) {
  return kind === 'interior' && back ? STAIRWAY_ARCHETYPES[back] : ARCHETYPES[kind];
}

/**
 * The archetypes whose maps have places that open into sub-maps of their
 * own, such as the settlements of a wilderness or the buildings of a town.
 * The Generate dialog shows its Sub-maps field for these alone.
 */
export const NESTED_ARCHETYPES = ARCHETYPES.region.map((a) => a.value);

/**
 * @typedef {{
 *   archetype: string,
 *   size: string,
 *   levels?: number,
 *   level?: number,
 *   environ?: string,
 *   guide?: import('../types/map.js').TerrainGuide,
 * }} GenerateOptions
 * `guide` is the parent terrain under the node, which the ground of an
 * open-terrain archetype follows (see `GeneratorGuide.guidedField`). The
 * other archetypes ignore it.
 */

/**
 * @typedef {{
 *   width: number,
 *   height: number,
 *   tiles: Tile[],
 *   entry: string,
 *   sites: GeneratedSite[],
 * }} GeneratedMap
 */

/**
 * How many levels a stack of dungeon or cave levels has from the level of
 * `options` down, with `MAX_LEVELS` applied. The result is at least 1.
 * @param {GenerateOptions} options
 * @returns {number}
 */
function stackLevels({ levels, level = 1 }) {
  const asked = Math.floor(levels ?? 1) || 1;
  return Math.max(1, Math.min(asked, levelsLeft(level)));
}

/**
 * How many levels a dungeon or a cave level with `options` has below it in
 * its stack, and 0 for any other archetype. Each of those levels is a
 * forced sub-map, so `GeneratorTree.expandTree` keeps this many sub-maps of
 * its budget for them before they exist. A level whose layout has no room
 * for its stairs down ends the stack early and has fewer.
 * @param {GenerateOptions} options
 * @returns {number}
 */
export function levelsBelow(options) {
  return STACKED_ARCHETYPES.includes(options.archetype) ? stackLevels(options) - 1 : 0;
}

/**
 * Generate a full tile grid for a node from an archetype and size preset.
 * This is a pure function with an injected RNG (pass `Math.random` in the
 * app, a seeded generator in tests). The returned width and height replace
 * the node's dimensions. The caller stamps the tiles in. Every archetype
 * guarantees `entry`: a border tile that exists and connects to the layout's
 * walkable area (a door for interiors, a road end or open ground for
 * regions). A generated space is then always reachable from its parent map.
 * A world and an open map with no road exit, such as an island, enter on
 * the land tile nearest the middle of the south border instead, because
 * their border can be sea.
 *
 * `sites` lists the places on the map that open into sub-maps of their own.
 * `GeneratorTree.expandTree` builds those sub-maps. A dungeon or a cave with
 * more than one level gets stairs down, and its site for the level below is
 * forced, so the stairs always lead to a real level. `level` is the number
 * of this level, and a level below the first is entered by its stairs up.
 * The stack ends at level `MAX_LEVELS`, whatever `levels` asks for.
 * A building takes its furnishings from `environ`, for example `inn` or
 * `temple`. A town with the `coast` environ is a port, with sea along one
 * border other than the south, and a town with any other environ is
 * inland. A building with a trapdoor has a forced site for its cellar, which is a
 * small dungeon level entered by its stairs up. The `cellar` archetype
 * generates that level. An inn has a forced site for its guest floor, which
 * the `upper-floor` archetype generates with the `inn` environ
 * (`GeneratorInnShop.generateGuestFloor`). A castle has forced sites for its upper floor,
 * which the `upper-floor` archetype generates and the party enters by its
 * stairs down, and for one dungeon level below it. No generated stairs
 * lead nowhere.
 * @param {TilePalette} palette
 * @param {GenerateOptions} options
 * @param {() => number} rng
 * @returns {GeneratedMap}
 */
export function generateNodeTiles(palette, options, rng) {
  const { archetype, size, environ = archetype } = options;
  const n = GENERATOR_SIZES[size] ?? GENERATOR_SIZES.medium;
  const level = options.level ?? 1;
  const levels = stackLevels(options);
  /** @param {{ tiles: Tile[], entry: string }} gen @param {GeneratedSite[]} [sites] */
  const done = (gen, sites = []) => ({
    width: n,
    height: n,
    tiles: gen.tiles,
    entry: gen.entry,
    sites,
  });
  if (STACKED_ARCHETYPES.includes(archetype)) {
    const make = archetype === 'cave' ? generateCave : generateDungeon;
    const entrance = level > 1 ? 'stairs' : 'edge';
    const gen = make(palette, n, rng, { entrance, descend: levels > 1 });
    if (!gen.stairsDown) return done(gen);
    const below = {
      tileIds: [gen.stairsDown],
      archetype,
      kind: /** @type {NodeKind} */ ('interior'),
      environ,
      size,
      label: `level ${level + 1}`,
      forced: true,
      levels: levels - 1,
      level: level + 1,
    };
    return done(gen, [below]);
  }
  if (archetype === 'cellar') {
    return done(generateDungeon(palette, n, rng, { entrance: 'stairs', descend: false }));
  }
  if (archetype === 'building') {
    const gen = generateBuilding(palette, n, rng, environ);
    /** @type {GeneratedSite[]} */
    const sites = [];
    if (gen.stairsUp) {
      sites.push({
        tileIds: [gen.stairsUp],
        archetype: 'upper-floor',
        kind: 'interior',
        environ,
        size,
        label: 'guest floor',
        forced: true,
      });
    }
    if (gen.stairsDown) {
      sites.push({
        tileIds: [gen.stairsDown],
        archetype: 'cellar',
        kind: 'interior',
        environ: 'cellar',
        size: 'small',
        label: 'cellar',
        forced: true,
      });
    }
    return done(gen, sites);
  }
  if (archetype === 'castle') {
    const gen = generateCastle(palette, n, rng);
    const interior = /** @type {NodeKind} */ ('interior');
    const above = {
      tileIds: [gen.stairsUp],
      archetype: 'upper-floor',
      kind: interior,
      environ,
      size,
      label: 'upper floor',
      forced: true,
    };
    const below = {
      tileIds: [gen.stairsDown],
      archetype: 'dungeon',
      kind: interior,
      environ: 'dungeon',
      size,
      label: 'dungeons',
      forced: true,
      levels: 1,
      level: 2,
    };
    return done(gen, [above, below]);
  }
  if (archetype === 'upper-floor') {
    return done((environ === 'inn' ? generateGuestFloor : generateUpperFloor)(palette, n, rng));
  }
  let open;
  if (archetype === 'town') open = generateTown(palette, n, rng, environ);
  else if (archetype === 'world') open = generateWorld(palette, n, rng);
  else open = generateWilds(palette, n, rng, archetype, options.guide);
  return done(open, open.sites);
}
