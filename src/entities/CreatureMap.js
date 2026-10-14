import { withinRadius } from '../map/FogOfWar.js';
import { parseCoords } from '../map/MapGeometry.js';
import { describeTile } from '../map/TileCoords.js';
import { tileAt } from '../map/TileIndex.js';
import { isDefeated } from './Creature.js';

/** @typedef {import('../types/creature.js').Creature} Creature */
/** @typedef {import('../types/entities.js').EncounterLocation} EncounterLocation */
/** @typedef {import('../types/entities.js').CreaturePlacement} CreaturePlacement */

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
    return tileAt(node, tileId)?.revealed === true;
  });
}

/**
 * Whether a creature stands exactly on a tile. Unplaced (appears-everywhere)
 * creatures are not on any tile. A friendly or neutral creature joins a
 * fight only by standing on the party's own tile. This is the membership
 * test behind `creaturesOnTile`. The function is exported so a caller
 * resolving one creature by id can ask the question without filtering the
 * whole roster. This function is pure.
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
 * Every creature placed exactly on a tile, defeated ones included. The
 * Build-mode tile menu lists these for editing. This function is pure.
 * @param {Creature[]} creatures
 * @param {EncounterLocation | null} position
 * @returns {Creature[]}
 */
export function creaturesOnTile(creatures, position) {
  if (!position) return [];
  return creatures.filter((c) => isOnTile(c, position));
}

/**
 * How many grid steps from the party's tile a creature can stand and still
 * be part of the encounter there. One step reaches the eight tiles around
 * the party, diagonals included, so a group of foes staged on neighbouring
 * tiles meets the party as one fight instead of one foe at a time.
 */
export const ENCOUNTER_RADIUS = 1;

/**
 * Whether a creature stands in the position's node within `radius` grid
 * steps of its tile. A step counts the same along a row, a column, or a
 * diagonal, as on a battle grid. An unplaced creature is on no tile, so it
 * is never near one. This function is pure.
 * @param {Creature} creature
 * @param {EncounterLocation | null} position
 * @param {number} radius
 * @returns {boolean}
 */
export function isNearTile(creature, position, radius) {
  if (position === null || creature.location === null) return false;
  if (creature.location.nodeId !== position.nodeId) return false;
  const at = parseCoords(creature.location.tileId);
  const center = parseCoords(position.tileId);
  if (!at || !center) return false;
  return Math.max(Math.abs(at.x - center.x), Math.abs(at.y - center.y)) <= radius;
}

/**
 * Every creature that belongs to the encounter at a position: those placed
 * within `radius` grid steps of its tile, whatever their disposition, and
 * defeated ones included. The Encounters panel, the difficulty hint, the
 * Start combat button, the fight roster, and the check that ends a fight
 * when the party walks away all read this one list, so they agree on who
 * the encounter is. This function is pure.
 * @param {Creature[]} creatures
 * @param {EncounterLocation | null} position
 * @param {number} [radius]
 * @returns {Creature[]}
 */
export function encounterGroup(creatures, position, radius = ENCOUNTER_RADIUS) {
  return creatures.filter((c) => isNearTile(c, position, radius));
}

/**
 * The undefeated hostile creatures of the encounter at a position. Only
 * these open an encounter: they raise the arrival alert, fill the Active
 * tab, and start a fight. A friendly or neutral creature near the party
 * stays in the NPCs panel. This function is pure.
 * @param {Creature[]} creatures
 * @param {EncounterLocation | null} position
 * @param {number} [radius]
 * @returns {Creature[]}
 */
export function hostileGroup(creatures, position, radius = ENCOUNTER_RADIUS) {
  return encounterGroup(creatures, position, radius).filter(
    (c) => c.disposition === 'hostile' && !isDefeated(c),
  );
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
 * Turn the given creatures neutral and mark them met, for foes that stand
 * down after a fight or a parley. The Encounter alert fires only for hostile
 * creatures, so a foe left hostile opens it again on the party's next move
 * next to it. The array keeps its identity when no id matches.
 * @param {Creature[]} creatures
 * @param {Set<string>} ids
 * @returns {Creature[]}
 */
export function standDown(creatures, ids) {
  if (!creatures.some((c) => ids.has(c.id))) return creatures;
  return creatures.map((c) => (ids.has(c.id) ? { ...c, disposition: 'neutral', met: true } : c));
}

/**
 * Move one creature to a location, or make it unplaced with null. An unknown
 * id leaves the list unchanged. This is the creature counterpart of
 * `party/CharacterTokens.moveCharacter`.
 * @param {Creature[]} creatures
 * @param {string} id
 * @param {EncounterLocation | null} location
 * @returns {Creature[]}
 */
export function moveCreature(creatures, id, location) {
  return creatures.map((c) => (c.id === id ? { ...c, location } : c));
}

/**
 * Move every companion to the party. A companion is a creature with
 * `travelsWithParty` that is not defeated. The move goes through
 * `moveCreature`, so a companion stays met and the party does not meet it
 * a second time. The array keeps its identity when nothing moves.
 * @param {Creature[]} creatures
 * @param {EncounterLocation} position the party position
 * @returns {Creature[]}
 */
export function followParty(creatures, position) {
  let next = creatures;
  for (const c of creatures) {
    if (c.travelsWithParty !== true || isDefeated(c)) continue;
    if (c.location?.nodeId === position.nodeId && c.location.tileId === position.tileId) continue;
    next = moveCreature(next, c.id, { nodeId: position.nodeId, tileId: position.tileId });
  }
  return next;
}

/**
 * Unplace the creatures standing in any of the given nodes, so they show
 * everywhere instead. A node edit that removes nodes calls this, so no
 * creature keeps a location on a map that no longer exists, which would hide
 * it from every panel. Creatures elsewhere keep their location, and the array
 * keeps its identity when nothing changes. This is the creature counterpart
 * of `party/CharacterTokens.recallFrom`.
 * @param {Creature[]} creatures
 * @param {Set<string>} nodeIds
 * @returns {Creature[]}
 */
export function unplaceFrom(creatures, nodeIds) {
  let changed = false;
  const next = creatures.map((c) => {
    if (!c.location || !nodeIds.has(c.location.nodeId)) return c;
    changed = true;
    return { ...c, location: null };
  });
  return changed ? next : creatures;
}

/**
 * Where the creatures standing in any of the given nodes are, so a caller
 * that is about to move them can put them back later. An unplaced creature,
 * and a creature standing elsewhere, are not in the result.
 * @param {Creature[]} creatures
 * @param {Set<string>} nodeIds
 * @returns {CreaturePlacement[]}
 */
export function creaturePlacementsIn(creatures, nodeIds) {
  /** @type {CreaturePlacement[]} */
  const placements = [];
  for (const c of creatures) {
    if (c.location && nodeIds.has(c.location.nodeId)) {
      placements.push({ creatureId: c.id, location: c.location });
    }
  }
  return placements;
}

/**
 * Put the recorded creatures back where they stood. Only the `location`
 * field changes, so any other edit made to a creature since stays. A
 * placement for a creature that is no longer in the campaign is skipped.
 * @param {Creature[]} creatures
 * @param {CreaturePlacement[]} placements
 * @returns {Creature[]}
 */
export function restoreCreaturePlacements(creatures, placements) {
  if (placements.length === 0) return creatures;
  const byId = new Map(placements.map((p) => [p.creatureId, p.location]));
  return creatures.map((c) => (byId.has(c.id) ? { ...c, location: byId.get(c.id) ?? null } : c));
}

/**
 * Human-readable placement for a creature row: the node's name plus the
 * column and row, counted from 1 as on the map edge, or a fixed label for an
 * unplaced (appears-everywhere) creature.
 * @param {EncounterLocation | null} location
 * @param {(nodeId: string) => string | undefined} getNodeName
 * @returns {string}
 */
export function formatLocation(location, getNodeName) {
  if (!location) return 'Everywhere';
  return `${getNodeName(location.nodeId) ?? location.nodeId}, ${describeTile(location.tileId)}`;
}

/**
 * The foes that the Clear defeated action removes: hostile creatures at 0 HP
 * placed in the node `nodeId` that no running fight lists. A foe on another
 * map or with no location stays. A foe in the order of a running fight also
 * stays, because the fight still draws its chip and counts its experience
 * points when it ends. This function is pure.
 * @param {Creature[]} creatures
 * @param {{ order: { id: string }[] } | null} combat
 * @param {string} nodeId
 * @returns {Creature[]}
 */
export function clearableDefeated(creatures, combat, nodeId) {
  const fighting = new Set(combat?.order.map((p) => p.id));
  return creatures.filter(
    (c) =>
      c.disposition === 'hostile' &&
      c.location?.nodeId === nodeId &&
      isDefeated(c) &&
      !fighting.has(c.id),
  );
}

/**
 * The names of the creatures with a count for each repeated name, in the
 * order each name first appears: "Goblin x3, Wolf".
 * @param {Creature[]} creatures
 * @returns {string}
 */
export function nameTally(creatures) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const c of creatures) counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
  return [...counts].map(([name, n]) => (n > 1 ? `${name} x${n}` : name)).join(', ');
}
