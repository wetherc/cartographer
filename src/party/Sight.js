import { WATCHES } from '../time/GameClock.js';
import { revealAlong } from '../map/FogOfWar.js';
import { revealRoom } from '../map/RoomReveal.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/time.js').GameClock} GameClock */
/** @typedef {import('../types/entities.js').Character} Character */
/**
 * How far a move sees on a node. `group` is the set of characters that
 * move, and it is absent for a move of the whole party.
 * @typedef {(node: MapNode, group?: readonly Character[]) => number} SightRule
 */

/**
 * How far the party sees, in tiles, for each kind of place and light. An
 * outdoor map below the world map (a region, a town, the grounds of a site)
 * shows more in daylight, less at dusk, and little at night. A room inside a
 * structure has no daylight, so its sight stays the same at every hour. A
 * tile of the world map covers a whole region, so the world map keeps a
 * fixed radius that shows the regions next door.
 */
export const SIGHT = Object.freeze({ day: 3, dusk: 2, night: 1, interior: 2, world: 2 });

/**
 * Whether a moving group sees in the dark. Every member needs darkvision
 * from its race, or one member carries an item marked as a light source,
 * such as a torch or a lantern. An empty group sees nothing extra, so a
 * party with no characters keeps the plain radius of the watch.
 * @param {readonly Character[]} group
 * @returns {boolean}
 */
export function seesInDark(group) {
  if (group.length === 0) return false;
  if (group.some((c) => c.inventory.some((i) => i.light === true && i.quantity > 0))) return true;
  return group.every((c) => (c.raceTraits?.darkvision ?? 0) > 0);
}

/**
 * The radius of fog that `group` clears around each tile it stands on or
 * walks through in `node`, at the time on `clock`. Only fog reveal reads
 * it. The detection range of markers and the Nearby list use the party
 * tracker's fixed `revealRadius`, so a foe does not drop out of the Nearby
 * list when night falls. A group that sees in the dark (see `seesInDark`)
 * sees as far at Night as at Dusk, and in a dark interior it sees as far as
 * in daylight outdoors. A lit interior and the world map ignore the group.
 * @param {MapNode} node
 * @param {GameClock | null | undefined} clock
 * @param {readonly Character[]} [group] the characters that move
 * @returns {number}
 */
export function sightRadius(node, clock, group = []) {
  if (node.kind === 'interior') {
    return !litRooms(node) && seesInDark(group) ? SIGHT.day : SIGHT.interior;
  }
  if (node.parentId === null) return SIGHT.world;
  const watch = WATCHES[clock?.watch ?? 0];
  if (watch === 'Night') return seesInDark(group) ? SIGHT.dusk : SIGHT.night;
  return watch === 'Dusk' ? SIGHT.dusk : SIGHT.day;
}

/**
 * The sight rule of a campaign. A move of the whole party sees with the
 * characters that travel with it, which are the ones with no location of
 * their own. Both getters read on each call, so a change of the clock or the
 * roster applies to the next move.
 * @param {() => GameClock | null | undefined} getClock
 * @param {() => readonly Character[]} getCharacters
 * @returns {SightRule}
 */
export function partySight(getClock, getCharacters) {
  return (node, group) =>
    sightRadius(node, getClock(), group ?? getCharacters().filter((c) => !c.location));
}

/** Interior environs whose rooms join by open corridors, so a room fill there would open the whole level. */
const DARK_ENVIRONS = new Set(['dungeon', 'cave', 'cellar']);

/**
 * Whether the rooms of `node` are lit, so a party that walks into a room
 * sees all of it. A building, a castle, or an inn has lit rooms. A dungeon,
 * a cave, and a cellar stay dark, and an interior with no environ stays
 * dark as well, because nothing says what it is.
 * @param {MapNode} node
 * @returns {boolean}
 */
export function litRooms(node) {
  return node.kind === 'interior' && !!node.environ && !DARK_ENVIRONS.has(node.environ);
}

/**
 * Reveal what the party sees from each tile of `tileIds` on `node`: the
 * disc of `radius` around each tile and, on a map with lit rooms, the whole
 * room of each tile. A walk fills each room once. A reveal that changes
 * nothing returns the same node.
 * @param {MapNode} node
 * @param {readonly string[]} tileIds the tiles the party stood on or walked through
 * @param {number} radius
 * @returns {MapNode}
 */
export function revealSight(node, tileIds, radius) {
  const disc = revealAlong(node, tileIds, radius);
  if (!litRooms(node)) return disc;
  const options = { done: new Set() };
  return tileIds.reduce((at, id) => revealRoom(at, id, options), disc);
}
