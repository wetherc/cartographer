import { parseCoords } from '../map/MapGeometry.js';
import { isDefeated } from '../entities/Creature.js';

/** @typedef {import('../types/creature.js').Creature} Creature */

/**
 * One line of the Nearby encounters list. Standing foes that share a name
 * form one group. Every defeated foe goes into one group with the key
 * `DEFEATED_KEY`. `distance` is the distance in tiles of the nearest member,
 * or null when no member is placed on the party's map. `unplaced` is true
 * when a member has no place at all, which means it shows on every map.
 * `current` and `max` add up the HP of the members.
 * @typedef {{ key: string, name: string, title: string, members: Creature[],
 *   distance: number | null, unplaced: boolean, current: number, max: number }} NearbyGroup
 */

/** The key of the group that collects every defeated foe. */
export const DEFEATED_KEY = 'defeated';

/**
 * The straight-line distance in tiles from the party to a creature, rounded
 * to a whole tile. A creature with no place on the party's map gives null.
 * @param {Creature} creature
 * @param {{ nodeId: string, tileId: string } | null} position
 * @returns {number | null}
 */
export function distanceTo(creature, position) {
  if (!creature.location || !position || creature.location.nodeId !== position.nodeId) return null;
  const p = parseCoords(creature.location.tileId);
  const q = parseCoords(position.tileId);
  return p && q ? Math.round(Math.hypot(p.x - q.x, p.y - q.y)) : null;
}

/**
 * The distance as the list shows it. A group with no member on this map
 * reads "Not on this map", unless a member is unplaced. An unplaced foe
 * shows on every map, so the line shows no distance for it.
 * @param {number | null} distance
 * @param {boolean} [unplaced]
 * @returns {string}
 */
export function distanceText(distance, unplaced = false) {
  if (distance === null) return unplaced ? '' : 'Not on this map';
  return distance === 1 ? '1 tile away' : `${distance} tiles away`;
}

/**
 * Group the Nearby foes for the compact list. Standing groups come nearest
 * first, then by name, and a group with no distance comes after the placed
 * ones. The defeated group comes last, and it exists only when a foe is
 * defeated. A group of more than one foe has the title "Gray Wolf x4".
 * @param {Creature[]} creatures
 * @param {{ nodeId: string, tileId: string } | null} position
 * @returns {NearbyGroup[]}
 */
export function groupNearby(creatures, position) {
  /** @type {Map<string, Creature[]>} */
  const byName = new Map();
  /** @type {Creature[]} */
  const defeated = [];
  for (const c of creatures) {
    if (isDefeated(c)) defeated.push(c);
    else byName.set(c.name, [...(byName.get(c.name) ?? []), c]);
  }
  const standing = [...byName].map(([name, members]) =>
    group(
      `name:${name}`,
      name,
      members.length > 1 ? `${name} x${members.length}` : name,
      members,
      position,
    ),
  );
  standing.sort(
    (a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity) || a.name.localeCompare(b.name),
  );
  return defeated.length > 0
    ? [
        ...standing,
        group(DEFEATED_KEY, 'Defeated', `Defeated (${defeated.length})`, defeated, position),
      ]
    : standing;
}

/**
 * @param {string} key
 * @param {string} name
 * @param {string} title
 * @param {Creature[]} members
 * @param {{ nodeId: string, tileId: string } | null} position
 * @returns {NearbyGroup}
 */
function group(key, name, title, members, position) {
  const distances = members
    .map((c) => distanceTo(c, position))
    .filter(/** @returns {d is number} */ (d) => d !== null);
  return {
    key,
    name,
    title,
    members,
    distance: distances.length > 0 ? Math.min(...distances) : null,
    unplaced: members.some((c) => !c.location),
    current: members.reduce((sum, c) => sum + Math.max(0, c.currentHP), 0),
    max: members.reduce((sum, c) => sum + c.maxHP, 0),
  };
}
