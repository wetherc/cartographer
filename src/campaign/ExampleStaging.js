import { expandTree, childSeed } from '../map/GeneratorTree.js';
import { STACKED_ARCHETYPES } from '../map/MapGenerator.js';
import { placeName } from '../map/GeneratorNames.js';
import { randInt } from '../map/GeneratorRandom.js';
import { isBlocked, tileKind } from '../map/TileKinds.js';
import { NEIGHBORS4, NEIGHBORS8, parseCoords, tileIdAt } from '../map/MapGeometry.js';
import { mulberry32 } from '../util/Rng.js';

/** @typedef {import('../map/TilePalette.js').TilePalette} TilePalette */
/** @typedef {import('../types/map.js').Tile} Tile */
/** @typedef {import('../types/map.js').GeneratedSite} GeneratedSite */
/** @typedef {import('../map/MapGenerator.js').GeneratedMap} GeneratedMap */
/** @typedef {import('../map/GeneratorTree.js').TreeNode} TreeNode */
/** @typedef {import('../map/GeneratorTree.js').TreeRoot} TreeRoot */

/**
 * Helpers that put the example story onto generated maps: node ids that
 * stay unique across the whole campaign, the expansion of a map's sites
 * into sub-maps, and the pickers that find a tile for a camp, a boss, or an
 * NPC. Every choice here depends only on the generated tiles, so a fixed
 * seed gives the same placements on every load.
 */

/**
 * A source of node ids that are unique across one campaign build. Each call
 * of `next(prefix)` returns `prefix-1`, `prefix-2`, and so on, and skips an
 * id that is already taken. `take(id)` claims a fixed id and throws when
 * another node has it, because two nodes with one id would silently replace
 * each other in the grid.
 */
export class IdPool {
  constructor() {
    /** @type {Set<string>} */
    this.used = new Set();
  }

  /** @param {string} id @returns {string} */
  take(id) {
    if (this.used.has(id)) throw new Error(`The node id ${id} is already taken.`);
    this.used.add(id);
    return id;
  }

  /** @param {string} prefix @returns {string} */
  next(prefix) {
    let n = 1;
    while (this.used.has(`${prefix}-${n}`)) n++;
    return this.take(`${prefix}-${n}`);
  }
}

/**
 * The fixed choices for one story site: its node id and name, and
 * optionally a new archetype, environ, level count, or sub-map depth.
 * @typedef {{
 *   id: string,
 *   name: string,
 *   archetype?: string,
 *   environ?: string,
 *   size?: string,
 *   levels?: number,
 *   depth?: number,
 * }} SiteOverride
 */

/**
 * Build the sub-maps of every site on a generated map. A story site takes
 * the id, the name, and the other choices of its override. Any other site
 * gets an id from `ids`, a name from `GeneratorNames.placeName`, and its
 * own map with no optional sub-maps. Forced sub-maps, such as the levels
 * below a dungeon or the upper floor of a castle, always come with their
 * map. Each site draws its seed from the seed of the map and the index of
 * the site, as `GeneratorTree.expandTree` does. The tiles of each site get
 * the new node id as their `childNodeId`, in the tiles of `gen` itself.
 * @param {TilePalette} palette
 * @param {{ id: string, gen: GeneratedMap, seed: number }} top
 * @param {Map<number, SiteOverride>} overrides keyed by site index
 * @param {IdPool} ids
 * @returns {{ nodes: TreeNode[], childIds: string[] }} every sub-map with
 *   its parent before it, and the node id of each site by index
 */
export function expandSites(palette, { id, gen, seed }, overrides, ids) {
  /** @type {TreeNode[]} */
  const nodes = [];
  /** @type {string[]} */
  const childIds = [];
  const byId = new Map(gen.tiles.map((t) => [t.id, t]));
  gen.sites.forEach((site, i) => {
    const siteSeed = childSeed(seed, i);
    const nameRng = mulberry32(siteSeed);
    const story = overrides.get(i);
    const archetype = story?.archetype ?? site.archetype;
    const stacked = STACKED_ARCHETYPES.includes(archetype);
    const name = story?.name ?? placeName(site, nameRng);
    const levels = story?.levels ?? site.levels ?? (stacked ? 1 + randInt(nameRng, 3) : 1);
    const childId = story ? ids.take(story.id) : ids.next(id);
    /** @type {TreeRoot} */
    const root = {
      id: childId,
      name,
      kind: site.kind,
      environ: story?.environ ?? site.environ,
      archetype,
      size: story?.size ?? site.size,
      levels,
      level: site.level,
    };
    const tree = expandTree(palette, root, { seed: siteSeed, depth: story?.depth ?? 0 }, () =>
      ids.next(childId),
    );
    const [head, ...below] = tree.nodes;
    nodes.push({ ...head, parentId: id }, ...below);
    childIds.push(childId);
    for (const tileId of site.tileIds) {
      const tile = /** @type {Tile} */ (byId.get(tileId));
      tile.childNodeId = childId;
    }
  });
  return { nodes, childIds };
}

/** Coordinates of a grid tile id. @param {string} id @returns {[number, number]} */
export function tileXY(id) {
  const { x, y } = /** @type {{ x: number, y: number }} */ (parseCoords(id));
  return [x, y];
}

/**
 * Manhattan distance between two tile ids.
 * @param {string} a @param {string} b
 * @returns {number}
 */
export function tileDistance(a, b) {
  const [ax, ay] = tileXY(a);
  const [bx, by] = tileXY(b);
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

/**
 * Whether the party can stand on a tile and meet what stands there: the
 * tile links to no sub-map, because a click on a linked tile zooms into the
 * sub-map, the tile is not a wall or an obstacle, and it is not water,
 * which the rules let a party cross but where no NPC keeps a post.
 * @param {Tile} t
 * @returns {boolean}
 */
export function isStandable(t) {
  return !t.childNodeId && !isBlocked(t) && !t.span && !/\/(water|deep-water)\//.test(t.imageRef);
}

/**
 * Open wilderness ground: bare grass or forest with no overlay, no marker,
 * and no link, so a stamped landmark never covers water, a river, or a
 * generated place.
 * @param {Tile} t
 * @returns {boolean}
 */
export function isOpenGround(t) {
  return (
    !t.overlayRef &&
    !t.childNodeId &&
    !t.metadata.poiType &&
    /\/(grass|forest|hills|swamp|snow|snow-hills|taiga|desert|savanna|badlands|jungle)\//.test(
      t.imageRef,
    )
  );
}

/**
 * Bare interior floor, not stairs, a door, a wall, or a furnishing such as an
 * altar or a table, where a creature can stand.
 * @param {Tile} t
 * @returns {boolean}
 */
export function isBareFloor(t) {
  return tileKind(t) === 'floor' && !t.childNodeId && !t.overlayRef;
}

/**
 * The ids of every tile that a walk from `from` reaches through tiles that
 * are not a wall or an obstacle, stepping to the four side neighbours as
 * `MapPath.hasOpenPath` does. A staged creature on a tile outside this set
 * stands where the party can never meet it.
 * @param {{ tiles: Tile[] }} gen @param {string} from
 * @returns {Set<string>}
 */
export function reachableFrom(gen, from) {
  const byId = new Map(gen.tiles.map((t) => [t.id, t]));
  const seen = new Set([from]);
  const queue = [from];
  for (let q = 0; q < queue.length; q++) {
    const [x, y] = tileXY(queue[q]);
    for (const [dx, dy] of NEIGHBORS4) {
      const id = tileIdAt(x + dx, y + dy);
      const t = byId.get(id);
      if (!t || seen.has(id) || isBlocked(t)) continue;
      seen.add(id);
      queue.push(id);
    }
  }
  return seen;
}

/**
 * A picker for staging story content on a generated map. Each call returns
 * the unused candidate tile farthest from `from` (the entry of the map when
 * omitted), and keeps at least `gap` tiles between picks while possible, so
 * bosses and landmarks land deep in the layout instead of at the door. When
 * no candidate is left, the picker returns the entry. `margin` keeps candidates that many tiles off the border, so an outdoor
 * camp or a boss does not stand in a corner of the map.
 * @param {{ tiles: Tile[], entry: string, width?: number, height?: number }} gen
 * @param {(tile: Tile) => boolean} ok
 * @param {{ gap?: number, from?: string, near?: boolean, margin?: number }} [options]
 *   `near` picks the nearest candidate first instead of the farthest
 * @returns {() => string}
 */
export function makeSpotPicker(
  gen,
  ok,
  { gap = 3, from = gen.entry, near = false, margin = 0 } = {},
) {
  const sign = near ? 1 : -1;
  const width = gen.width ?? Infinity;
  const height = gen.height ?? Infinity;
  /** @param {string} id */
  const inside = (id) => {
    const [x, y] = tileXY(id);
    return x >= margin && y >= margin && x < width - margin && y < height - margin;
  };
  const candidates = gen.tiles
    .filter((t) => ok(t) && inside(t.id))
    .map((t) => t.id)
    .sort((a, b) => sign * (tileDistance(a, from) - tileDistance(b, from)));
  /** @type {string[]} */
  const used = [];
  return () => {
    const spaced = candidates.find(
      (id) => !used.includes(id) && used.every((u) => tileDistance(u, id) >= gap),
    );
    const next = spaced ?? candidates.find((id) => !used.includes(id)) ?? gen.entry;
    used.push(next);
    return next;
  };
}

/**
 * The standable tile nearest `tileId`, searching outward ring by ring, so an
 * NPC who keeps a shop or a boss who guards a camp stands beside its marker
 * instead of on it. The search prefers the eight neighbors, and falls back
 * to the entry of the map.
 * @param {{ tiles: Tile[], entry: string }} gen
 * @param {string} tileId
 * @returns {string}
 */
export function besideTile(gen, tileId) {
  const byId = new Map(gen.tiles.map((t) => [t.id, t]));
  const [x, y] = tileXY(tileId);
  for (let r = 1; r <= 4; r++) {
    for (const [dx, dy] of NEIGHBORS8) {
      const t = byId.get(tileIdAt(x + dx * r, y + dy * r));
      if (t && isStandable(t) && !t.metadata.poiType) return t.id;
    }
  }
  return gen.entry;
}

/**
 * Replace a generated tile's art with a landmark marker and GM notes, so a
 * story place has a visible anchor on the map. The marker links nowhere, so
 * the party can walk onto it.
 * @param {{ tiles: Tile[] }} gen @param {TilePalette} palette
 * @param {string} tileId @param {string} imageId @param {string} notes
 */
export function stampMarker(gen, palette, tileId, imageId, notes) {
  const tile = gen.tiles.find((t) => t.id === tileId);
  const ref = palette.get(imageId)?.imageRef;
  if (!tile || !ref) return;
  tile.imageRef = ref;
  tile.overlayRef = null;
  tile.metadata = { ...tile.metadata, poiType: 'landmark', notes };
}

/**
 * Add GM notes to a tile, such as the marker of a generated place.
 * @param {{ tiles: Tile[] }} gen @param {string} tileId @param {string} notes
 */
export function noteTile(gen, tileId, notes) {
  const tile = gen.tiles.find((t) => t.id === tileId);
  if (tile) tile.metadata = { ...tile.metadata, notes };
}
