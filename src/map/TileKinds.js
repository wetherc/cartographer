import { overlayList } from './TileGrid.js';

/** @typedef {import('../types/map.js').TileKind} TileKind */
/** @typedef {import('../types/map.js').Tile} Tile */

/**
 * The interior and town wall art that the game rules read, with the meaning
 * of each piece.
 * The party cannot stand on a wall or an obstacle, a door is the authored
 * way into a space, and stairs connect one level to the next. Keeping the
 * meaning here, beside the art list, lets `kindOf` answer from an image
 * reference, with no code matching on a file name.
 */

/**
 * Building-interior pieces, such as castle halls, shop floors, and caves.
 * Like roads, these are distinct pieces picked on purpose, not random
 * variants: flagstone and cave floors, wall segments and corners that share
 * one cross-section, the rough cave wall, doors, cave mouths, and stairs.
 * @type {Record<string, TileKind>}
 */
export const INTERIOR_KINDS = {
  'floor-1': 'floor',
  'floor-2': 'floor',
  'floor-3': 'floor',
  'cave-floor-1': 'floor',
  'cave-floor-2': 'floor',
  'wall-h': 'wall',
  'wall-v': 'wall',
  'wall-corner-ne': 'wall',
  'wall-corner-nw': 'wall',
  'wall-corner-se': 'wall',
  'wall-corner-sw': 'wall',
  'wall-tee-n': 'wall',
  'wall-tee-e': 'wall',
  'wall-tee-s': 'wall',
  'wall-tee-w': 'wall',
  'wall-cross': 'wall',
  'cave-wall': 'wall',
  'door-h': 'door',
  'door-v': 'door',
  'cave-mouth-h': 'door',
  'cave-mouth-v': 'door',
  'stairs-up': 'stairs-up',
  'stairs-down': 'stairs-down',
};

/**
 * Furnishings, overlays with a transparent ground that go on a floor tile.
 * A pillar, a table, a bed, a bookshelf, a shelf, and each counter piece are
 * obstacles, and a trapdoor leads down like stairs down. The other pieces
 * are `plain`, so the tile keeps the meaning of the floor under it.
 * @type {Record<string, TileKind>}
 */
export const FURNISHING_KINDS = {
  altar: 'plain',
  chest: 'plain',
  pillar: 'obstacle',
  throne: 'plain',
  bed: 'obstacle',
  table: 'obstacle',
  hearth: 'plain',
  bookshelf: 'obstacle',
  shelf: 'obstacle',
  counter: 'obstacle',
  'counter-till': 'obstacle',
  'counter-end-e': 'obstacle',
  'counter-end-w': 'obstacle',
  barrel: 'plain',
  rubble: 'plain',
  pool: 'plain',
  trapdoor: 'stairs-down',
};

/**
 * Town wall pieces, overlays in `assets/tiles/town/`. The straight pieces and
 * the gates run east-west (`h`) or north-south (`v`). A gate draws its own
 * street through the wall, and a water gate draws its own river under the
 * wall. A corner is named for its open edges like the interior walls, so
 * `wall-corner-se` caps the north-west corner of a ring. The party cannot
 * stand on a wall segment or a corner tower. A gate and a water gate are
 * `plain`, so a landing or a link can go on a gate.
 * @type {Record<string, TileKind>}
 */
export const TOWN_WALL_KINDS = {
  'wall-h': 'wall',
  'wall-v': 'wall',
  'wall-corner-ne': 'wall',
  'wall-corner-nw': 'wall',
  'wall-corner-se': 'wall',
  'wall-corner-sw': 'wall',
  'gate-h': 'plain',
  'gate-v': 'plain',
  'water-gate-h': 'plain',
  'water-gate-v': 'plain',
};

/**
 * The image reference of an interior piece or a furnishing.
 * @param {string} kind
 * @returns {string}
 */
export const interiorArt = (kind) => `assets/tiles/interior/interior-${kind}.svg`;

/**
 * The image reference of a town wall piece.
 * @param {string} kind
 * @returns {string}
 */
export const townWallArt = (kind) => `assets/tiles/town/town-${kind}.svg`;

/**
 * Every built-in image reference that has a rule meaning, mapped to that
 * meaning. Renaming an asset cannot change a rule without notice, because
 * the art path and the meaning come from the same table.
 * @type {Map<string, TileKind>}
 */
const KIND_BY_REF = new Map([
  ...Object.entries({ ...INTERIOR_KINDS, ...FURNISHING_KINDS }).map(
    ([kind, meaning]) => /** @type {[string, TileKind]} */ ([interiorArt(kind), meaning]),
  ),
  ...Object.entries(TOWN_WALL_KINDS).map(
    ([kind, meaning]) => /** @type {[string, TileKind]} */ ([townWallArt(kind), meaning]),
  ),
]);

/**
 * What one image means to the rules. Anything outside the interior,
 * furnishing, and town wall sets is `plain`, which is walkable and has no
 * special meaning. This includes outdoor terrain, POI markers, and every
 * custom or `data:` image that a GM supplies.
 * @param {string} imageRef
 * @returns {TileKind}
 */
export function kindOf(imageRef) {
  return KIND_BY_REF.get(imageRef) ?? 'plain';
}

/**
 * What a whole tile means to the rules. The topmost overlay with a meaning
 * other than `plain` wins, so a trapdoor on a floor tile leads down and a
 * pillar on it is an obstacle. With no such overlay, the base image decides.
 * @param {Tile} tile
 * @returns {TileKind}
 */
export function tileKind(tile) {
  const overlays = overlayList(tile);
  for (let i = overlays.length - 1; i >= 0; i--) {
    const kind = kindOf(overlays[i]);
    if (kind !== 'plain') return kind;
  }
  return kindOf(tile.imageRef);
}

/**
 * Whether the party can stand on a tile. A wall or an obstacle is never a
 * landing spot or a link target.
 * @param {Tile} tile
 * @returns {boolean}
 */
export function isBlocked(tile) {
  const kind = tileKind(tile);
  return kind === 'wall' || kind === 'obstacle';
}

/**
 * Whether a tile is deep water, which a walk does not cross. The party can
 * still stand on it, for example in a boat, so a GM move onto it asks first
 * instead of refusing. Only the base image counts, because deep water is a
 * terrain family and not an overlay.
 * @param {Tile} tile
 * @returns {boolean}
 */
export function isDeepWater(tile) {
  return tile.imageRef.startsWith('assets/tiles/deep-water/');
}
