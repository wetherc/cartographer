import { withinRadius } from '../map/FogOfWar.js';
import { isDefeated } from './Creature.js';

/** @typedef {import('../types/creature.js').Creature} Creature */
/** @typedef {import('../types/entities.js').EncounterLocation} EncounterLocation */

/**
 * The creatures relevant to the party's position: those placed in the node
 * the party occupies, plus unplaced ones (location === null), which show
 * everywhere. Placement is per-node, not per-tile, so a creature does not
 * vanish when the party steps one tile sideways. This function is pure.
 * @param {Creature[]} creatures
 * @param {{ nodeId: string } | null} position
 * @returns {Creature[]}
 */
export function creaturesAt(creatures, position) {
  return creatures.filter(
    (c) => c.location === null || (position !== null && c.location.nodeId === position.nodeId),
  );
}

/**
 * The creatures that a GM's Play sidebar lists: those close enough to
 * matter, placed in the party's node within `radius` grid cells of its
 * tile, plus unplaced ones. Distance is the same Euclidean rule that the
 * fog uses. This function is pure.
 * @param {Creature[]} creatures
 * @param {{ nodeId: string, tileId: string } | null} position
 * @param {number} radius
 * @returns {Creature[]}
 */
export function creaturesNear(creatures, position, radius) {
  return creatures.filter(
    (c) =>
      c.location === null ||
      (position !== null &&
        c.location.nodeId === position.nodeId &&
        withinRadius(c.location.tileId, position.tileId, radius)),
  );
}

/**
 * The non-hostile creatures the players know about at the party's position:
 * unplaced ones, plus placed ones the party already met. The GM-facing list
 * reads `creaturesAt` and filters on disposition alone. Hostile creatures
 * are not listed here at all. The players discover them through
 * `discoveredHostiles` instead. This function is pure.
 * @param {Creature[]} creatures
 * @param {{ nodeId: string } | null} position
 * @returns {Creature[]}
 */
export function knownCreaturesAt(creatures, position) {
  return creaturesAt(creatures, position).filter(
    (c) => c.disposition !== 'hostile' && (c.location === null || c.met),
  );
}

/**
 * The hostile creatures that a player's sidebar lists: only what the party
 * discovered. A placed hostile counts as discovered once its tile is
 * revealed through the fog of war (checked against `node`, the party's
 * current node). An unplaced one counts as discovered only once the party
 * walks into it (`met`). This function is pure.
 * @param {Creature[]} creatures
 * @param {{ nodeId: string } | null} position
 * @param {import('../types/map.js').MapNode | null} node the party's current node
 * @returns {Creature[]}
 */
export function discoveredHostiles(creatures, position, node) {
  return creatures.filter((c) => {
    if (c.disposition !== 'hostile') return false;
    if (c.location === null) return c.met === true;
    if (position === null || node === null || c.location.nodeId !== position.nodeId) return false;
    const { tileId } = c.location;
    return node.tiles.some((t) => t.id === tileId && t.revealed);
  });
}

/**
 * Whether a creature stands exactly on a tile. Unplaced (appears-everywhere)
 * creatures are not on any tile. A creature joins a fight only by standing
 * on its own. This is the membership test behind `creaturesOnTile`. The
 * function is exported so a caller resolving one creature by id can ask the
 * question without filtering the whole roster. This function is pure.
 * @param {Creature} creature
 * @param {EncounterLocation | null} position
 * @returns {boolean}
 */
export function isOnTile(creature, position) {
  return (
    position !== null &&
    creature.location !== null &&
    creature.location.nodeId === position.nodeId &&
    creature.location.tileId === position.tileId
  );
}

/**
 * Every creature placed exactly on a tile, defeated ones included. These
 * are the participants when a fight starts there. This function is pure.
 * @param {Creature[]} creatures
 * @param {EncounterLocation | null} position
 * @returns {Creature[]}
 */
export function creaturesOnTile(creatures, position) {
  if (!position) return [];
  return creatures.filter((c) => isOnTile(c, position));
}

/**
 * The undefeated hostile creatures placed exactly on a tile. This is the
 * threat that a step onto the tile walks into: it feeds the arrival alert,
 * and it is enough on its own to start a fight. This function is pure.
 * @param {Creature[]} creatures
 * @param {EncounterLocation | null} position
 * @returns {Creature[]}
 */
export function hostileCreaturesOnTile(creatures, position) {
  return creaturesOnTile(creatures, position).filter(
    (c) => c.disposition === 'hostile' && !isDefeated(c),
  );
}

/**
 * The hostile creatures placed exactly on a tile, defeated ones included.
 * This lists who stands there at all, rather than who can still fight. A
 * running fight reads this, since a foe dropping to 0 HP is a turn in the
 * fight and not the end of it, while a creature deleted or left behind is
 * gone for good. This function is pure.
 * @param {Creature[]} creatures
 * @param {EncounterLocation | null} position
 * @returns {Creature[]}
 */
export function hostileCreaturesAtTile(creatures, position) {
  return creaturesOnTile(creatures, position).filter((c) => c.disposition === 'hostile');
}

/**
 * Mark as met every placed creature standing on the party's exact tile.
 * Landing there is the introduction: it reveals a non-hostile creature to
 * the players, and it writes one travelogue line for any creature. Returns
 * the roster (possibly unchanged) and the creatures newly met by this
 * landing, so the caller can log each introduction once. This function is
 * pure.
 * @param {Creature[]} creatures
 * @param {EncounterLocation | null} position
 * @returns {{ creatures: Creature[], met: Creature[] }}
 */
export function meetCreatures(creatures, position) {
  /** @type {Creature[]} */
  const met = [];
  if (!position) return { creatures, met };
  const next = creatures.map((c) => {
    if (c.met || !isOnTile(c, position)) return c;
    const introduced = { ...c, met: true };
    met.push(introduced);
    return introduced;
  });
  return met.length > 0 ? { creatures: next, met } : { creatures, met };
}

/**
 * Human-readable placement for a creature row: the node's name plus the
 * tile coordinates, or a fixed label for an unplaced (appears-everywhere)
 * creature.
 * @param {EncounterLocation | null} location
 * @param {(nodeId: string) => string | undefined} getNodeName
 * @returns {string}
 */
export function formatLocation(location, getNodeName) {
  if (!location) return 'Everywhere';
  return `${getNodeName(location.nodeId) ?? location.nodeId} (${location.tileId})`;
}
