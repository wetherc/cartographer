import { generateNodeTiles, levelsBelow, STACKED_ARCHETYPES } from './MapGenerator.js';
import { placeName } from './GeneratorNames.js';
import { randInt } from './GeneratorRandom.js';
import { mulberry32 } from '../util/Rng.js';

/** @typedef {import('../types/map.js').Tile} Tile */
/** @typedef {import('../types/map.js').NodeKind} NodeKind */
/** @typedef {import('./MapGenerator.js').GenerateOptions} GenerateOptions */
/** @typedef {import('./MapGenerator.js').GeneratedMap} GeneratedMap */
/** @typedef {import('./TilePalette.js').TilePalette} TilePalette */

/**
 * Nested generation: one generated map, plus the sub-maps that its places
 * open into, plus theirs, down to a chosen depth. A wilderness opens into
 * its towns, keep, dungeon, and caves, a town into its buildings, and a
 * world into its regions. Each sub-map draws from its own RNG, seeded from
 * the seed of its parent and the index of its site, so the top map is the
 * same map with or without its sub-maps, and the Generate preview shows the
 * map that the GM gets.
 */

/**
 * The most sub-maps that one generation creates, forced ones included. A
 * vast world opened all the way down reaches the budget on seeds 1 to 5,
 * and 98 to 147 of its places get no map. Its packed save is about 0.18
 * million characters, and localStorage stores two bytes per character, so
 * it adds about 0.36 MiB against the 3 MiB warning of
 * `SaveManager.QUOTA_WARN_BYTES`.
 * The undo log costs more on top of that. The generation's own undo record
 * is the smaller of the new nodes in the save's form and a snapshot of the
 * save before it. Over the example campaign, that is a snapshot of about
 * 0.18 million characters. A New, Load example, or Import over the generated
 * world keeps the replaced save as an undo snapshot, which is a second copy
 * of the whole save.
 * Only the forced sub-maps of the top map can go past the budget, and
 * `MapGenerator.MAX_LEVELS` limits each stack of dungeon or cave levels.
 */
export const SUBMAP_BUDGET = 300;

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   kind: NodeKind,
 *   environ: string | null,
 *   archetype: string,
 *   size: string,
 *   levels?: number,
 *   level?: number,
 *   base?: string,
 *   guide?: import('../types/map.js').TerrainGuide,
 * }} TreeRoot
 * The node being generated and the choice for it. `level` is the number of
 * the node in its stack of levels (see `generateNodeTiles`). `base` is the
 * name that the forced sub-maps of the node add their labels to, and it
 * defaults to `name`. `guide` is the parent terrain under the node, which
 * an open-terrain map follows (see `RegenerateNode.reshapeParent`).
 */

/**
 * @typedef {{
 *   id: string,
 *   parentId: string | null,
 *   name: string,
 *   kind: NodeKind,
 *   environ: string | null,
 *   width: number,
 *   height: number,
 *   tiles: Tile[],
 *   entry: string,
 * }} TreeNode
 */

/**
 * The seed of the sub-map at `index` among the sites of the map with
 * `seed`. The bits of both mix, so near seeds and near indexes give
 * unrelated maps.
 * @param {number} seed @param {number} index
 * @returns {number}
 */
export function childSeed(seed, index) {
  let h = Math.imul((seed >>> 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(index + 1, 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  return h >>> 0;
}

/**
 * How many sub-maps the forced sites of a generated map lead to, with each
 * stack of levels below them.
 * @param {GeneratedMap} gen
 * @returns {number}
 */
export function forcedCost(gen) {
  return gen.sites.reduce((n, site) => (site.forced ? n + 1 + levelsBelow(site) : n), 0);
}

/**
 * Generate a map and its sub-maps, breadth first, so every place one level
 * down gets its map before any place two levels down. `depth` is how many
 * levels of sub-maps to build: 0 builds the map alone. A forced site, such
 * as the stairs down of a dungeon level or the trapdoor of a building,
 * always gets its sub-map at the same depth as its parent, because its tile
 * already leads down.
 *
 * `budget` limits the sub-maps of the whole tree, forced ones included,
 * and the forced ones take the budget first. Each sub-map is generated
 * when its site is taken, so the tree knows its forced sites at once. An
 * optional site then costs its own map, its forced sub-maps, and the
 * levels below them, and the tree takes the site only when the budget has
 * room for all of them. A site that does not fit gives its turn to the next
 * site, which can cost less. The forced sub-maps of the top map always get
 * their maps, even past the budget. `skipped` counts the places within the
 * depth that got no map. A place with no map keeps its marker and no link.
 *
 * Each sub-map gets a name from `GeneratorNames.placeName`, and a dungeon
 * or a cave gets one to three levels, both drawn from its own RNG before
 * its tiles. A forced sub-map takes the name of the map at the top of its
 * stack, with its label, for example "Ashford Barrow (level 2)". The link
 * tiles of each site get the new node id as their `childNodeId`.
 *
 * `makeId` supplies node ids, and the tree also refuses an id it has
 * already handed out, so the ids of one batch never clash. `rng` is the RNG
 * of the top map after its tiles, for the entrance art that the caller
 * draws next.
 * @param {TilePalette} palette
 * @param {TreeRoot} root
 * @param {{ seed: number, depth: number, budget?: number }} options
 * @param {() => string} makeId
 * @returns {{ nodes: TreeNode[], skipped: number, rng: () => number }}
 *   `nodes` starts with the top map, and every parent comes before its children
 */
export function expandTree(palette, root, { seed, depth, budget = SUBMAP_BUDGET }, makeId) {
  const used = new Set([root.id]);
  const freshId = () => {
    let id;
    do id = makeId();
    while (used.has(id));
    used.add(id);
    return id;
  };
  const rng = mulberry32(seed);
  /** @type {GenerateOptions} */
  const spec = {
    archetype: root.archetype,
    size: root.size,
    levels: root.levels,
    level: root.level,
    environ: root.environ ?? undefined,
    guide: root.guide,
  };
  const top = generateNodeTiles(palette, spec, rng);
  const queue = [
    {
      id: root.id,
      parentId: /** @type {string | null} */ (null),
      name: root.name,
      base: root.base ?? root.name,
      kind: root.kind,
      environ: root.environ,
      gen: top,
      seed,
      generation: 0,
    },
  ];
  /** @type {TreeNode[]} */
  const nodes = [];
  // The sub-maps made, plus the ones kept for forced sites that have no
  // map yet.
  let spent = forcedCost(top);
  let skipped = 0;
  for (let q = 0; q < queue.length; q++) {
    const item = queue[q];
    const { gen } = item;
    const tiles = [...gen.tiles];
    const index = new Map(tiles.map((t, i) => [t.id, i]));
    for (const [i, site] of gen.sites.entries()) {
      const generation = item.generation + (site.forced ? 0 : 1);
      if (!site.forced && generation > depth) continue;
      if (!site.forced && spent >= budget) {
        skipped++;
        continue;
      }
      const childRng = mulberry32(childSeed(item.seed, i));
      const name = site.forced ? `${item.base} (${site.label})` : placeName(site, childRng);
      const stacked = STACKED_ARCHETYPES.includes(site.archetype);
      const levels = site.levels ?? (stacked ? 1 + randInt(childRng, 3) : 1);
      const child = generateNodeTiles(
        palette,
        {
          archetype: site.archetype,
          size: site.size,
          levels,
          level: site.level,
          environ: site.environ,
          guide: site.guide,
        },
        childRng,
      );
      if (site.forced) {
        // The parent kept a slot for each level of the stack below this
        // one. A level with no room for its stairs down gives back the rest.
        spent += forcedCost(child) - levelsBelow(site);
      } else {
        const cost = 1 + forcedCost(child);
        if (spent + cost > budget) {
          skipped++;
          continue;
        }
        spent += cost;
      }
      const id = freshId();
      for (const tileId of site.tileIds) {
        const at = /** @type {number} */ (index.get(tileId));
        tiles[at] = { ...tiles[at], childNodeId: id };
      }
      queue.push({
        id,
        parentId: item.id,
        name,
        base: site.forced ? item.base : name,
        kind: site.kind,
        environ: site.environ,
        gen: child,
        seed: childSeed(item.seed, i),
        generation,
      });
    }
    nodes.push({
      id: item.id,
      parentId: item.parentId,
      name: item.name,
      kind: item.kind,
      environ: item.environ,
      width: gen.width,
      height: gen.height,
      tiles,
      entry: gen.entry,
    });
  }
  return { nodes, skipped, rng };
}
