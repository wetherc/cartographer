import { ARMS, OPPOSITE, connectorKind } from '../map/Autotile.js';
import { overlayList } from '../map/TileGrid.js';
import { isBlocked } from '../map/TileKinds.js';
import { tileIdAt } from '../map/MapGeometry.js';
import { tileXY } from './ExampleStaging.js';

/** @typedef {import('../map/TilePalette.js').TilePalette} TilePalette */
/** @typedef {import('../types/map.js').Tile} Tile */
/** @typedef {import('../map/Autotile.js').Arm} Arm */

const ROAD = /\/road\/road-([a-z-]+)\.svg$/;

/**
 * The arms of each road piece, keyed by its kind, from every set of arms
 * that `connectorKind` names.
 * @type {Map<string, Arm[]>}
 */
const ARMS_OF = new Map();
for (let mask = 1; mask < 16; mask++) {
  const arms = ARMS.filter((_, i) => mask & (1 << i)).map(([arm]) => arm);
  ARMS_OF.set(/** @type {string} */ (connectorKind(new Set(arms))), arms);
}

/**
 * The arms of the road on a tile, or none when the tile has no road.
 * @param {Tile} tile
 * @returns {Arm[]}
 */
export function roadArms(tile) {
  for (const ref of overlayList(tile)) {
    const kind = ROAD.exec(ref)?.[1];
    if (kind) return ARMS_OF.get(kind) ?? [];
  }
  return [];
}

/**
 * Whether a new road can run over a tile: open ground with no wall, water,
 * river, link, or marker.
 * @param {Tile} t
 */
const roadable = (t) =>
  !isBlocked(t) &&
  !t.childNodeId &&
  !t.metadata.poiType &&
  !/\/(water|deep-water|mountain)\//.test(t.imageRef) &&
  overlayList(t).every((ref) => ref.includes('/road/'));

/**
 * The shortest walk from any tile of `from` to `to` over roadable tiles off
 * the road, stepping to the four side neighbors in the fixed order of
 * `ARMS`, or null. The walk starts on a road tile and leaves the road at once.
 * @param {Map<string, Tile>} byId @param {string[]} from @param {string} to
 * @returns {string[] | null}
 */
function walk(byId, from, to) {
  /** @type {Map<string, string>} */
  const back = new Map(from.map((id) => [id, id]));
  const queue = [...from];
  for (let q = 0; q < queue.length; q++) {
    const id = queue[q];
    if (id === to) break;
    const [x, y] = tileXY(id);
    for (const [, dx, dy] of ARMS) {
      const next = tileIdAt(x + dx, y + dy);
      const t = byId.get(next);
      if (!t || back.has(next) || !roadable(t) || roadArms(t).length) continue;
      back.set(next, id);
      queue.push(next);
    }
  }
  if (!back.has(to)) return null;
  const path = [to];
  while (back.get(path[0]) !== path[0]) path.unshift(/** @type {string} */ (back.get(path[0])));
  return path;
}

/**
 * Paint a road on a generated map along the shortest spur from its road to
 * `toId`, and open it through the map edge on the `edge` side.
 * Each tile of the walk gets the connector piece for its arms, and the road
 * tile where the spur starts gains an arm toward it. Returns the walk, or
 * null when no spur reaches `toId` (a map with no road has none), and then
 * paints nothing.
 * @param {{ tiles: Tile[] }} gen @param {TilePalette} palette
 * @param {string} toId @param {Arm} edge
 * @returns {string[] | null}
 */
export function paintRoadTo(gen, palette, toId, edge) {
  const byId = new Map(gen.tiles.map((t) => [t.id, t]));
  const roads = gen.tiles.filter((t) => roadArms(t).length > 0).map((t) => t.id);
  const path = walk(byId, roads, toId);
  if (!path) return null;
  /** @type {Map<string, Set<Arm>>} */
  const arms = new Map(
    path.map((id) => [id, new Set(roadArms(/** @type {Tile} */ (byId.get(id))))]),
  );
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = tileXY(path[i - 1]);
    const [bx, by] = tileXY(path[i]);
    const arm = /** @type {Arm} */ (
      ARMS.find(([, dx, dy]) => ax + dx === bx && ay + dy === by)?.[0]
    );
    arms.get(path[i - 1])?.add(arm);
    arms.get(path[i])?.add(OPPOSITE[arm]);
  }
  arms.get(toId)?.add(edge);
  for (const [id, set] of arms) {
    const tile = /** @type {Tile} */ (byId.get(id));
    const piece = palette.getRoadPiece(/** @type {string} */ (connectorKind(set)));
    const refs = [...overlayList(tile).filter((ref) => !ref.includes('/road/'))];
    if (piece) refs.push(piece.imageRef);
    tile.overlayRef = refs.length > 1 ? refs : (refs[0] ?? null);
  }
  return path;
}
