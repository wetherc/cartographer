import { blockFor } from './MapExits.js';
import { resolveReturnTile } from './EntryPoint.js';
import { tileIdAt } from './MapGeometry.js';
import { tileWithinBounds } from './NodeEdits.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/map.js').PartyPosition} PartyPosition */
/** @typedef {import('../types/entities.js').EncounterLocation} EncounterLocation */
/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/creature.js').Creature} Creature */
/** @typedef {import('../types/handout.js').Handout} Handout */

/**
 * Where every map location goes when a node is deleted or shrinks. The party
 * position, each split character, each placed creature, and each handout
 * point at a node and often at a tile. A node edit can leave any of them
 * pointing at nothing. A dangling party position breaks the next load, so
 * `PartyTracker` refuses it. The other dangling references hide entities
 * from every panel. These functions decide the new location of each one.
 * `app/nodeActions.js` applies the answers.
 */

/**
 * The locations that a node edit can move. Handouts carry a node only, so a
 * shrink leaves them alone and a delete drops their node.
 * @typedef {{ party: PartyPosition, characters: Character[], creatures: Creature[], handouts: Handout[] }} WorldLocations
 */

/**
 * The tile the party lands on when the subtree under `rootId` is deleted
 * while the party stands inside it. The party comes out beside the block
 * that the deleted node occupies in its parent, the same tile a walk out of
 * the child lands on. With no block, the party lands on the painted tile
 * nearest the parent's centre. The answer is null when no parent survives,
 * which is the case for a root node. The caller refuses the delete then.
 * @param {MapNode[]} nodes every node in the grid, before the delete
 * @param {string} rootId the node being deleted
 * @param {Set<string>} doomed the ids the delete removes
 * @returns {PartyPosition | null}
 */
export function deleteLanding(nodes, rootId, doomed) {
  const root = nodes.find((n) => n.id === rootId);
  const parent = root?.parentId ? nodes.find((n) => n.id === root.parentId) : null;
  if (!parent || doomed.has(parent.id)) return null;
  const group = blockFor(parent, rootId);
  const preferred = group
    ? tileIdAt(group.maxX + 1, Math.floor((group.minY + group.maxY) / 2))
    : tileIdAt(Math.floor(parent.width / 2), Math.floor(parent.height / 2));
  return { nodeId: parent.id, tileId: resolveReturnTile(parent, preferred, rootId) };
}

/**
 * Apply `move` to each entity's location. An entity without a location
 * stays as it is. The array keeps its identity when nothing moves, so the
 * panels that compare by identity skip a redraw.
 * @template {{ location?: EncounterLocation | null }} T
 * @param {T[]} entities
 * @param {(location: EncounterLocation) => EncounterLocation | null} move
 * @returns {T[]}
 */
function mapLocations(entities, move) {
  let changed = false;
  const next = entities.map((entity) => {
    const location = entity.location ?? null;
    if (!location) return entity;
    const moved = move(location);
    if (moved === location) return entity;
    changed = true;
    return { ...entity, location: moved };
  });
  return changed ? next : entities;
}

/**
 * Every location after the nodes in `doomed` are deleted. The party moves
 * to `landing` when its node is doomed. A split character on a doomed node
 * loses its own location and rejoins the party. A creature on a doomed node
 * becomes unplaced. A handout bound to a doomed node becomes campaign-wide.
 * Locations outside the doomed set keep their identity.
 * @param {WorldLocations} world
 * @param {Set<string>} doomed
 * @param {PartyPosition} landing where the party goes, from `deleteLanding`
 * @returns {WorldLocations}
 */
export function locationsAfterDelete(world, doomed, landing) {
  /** @param {EncounterLocation} location */
  const drop = (location) => (doomed.has(location.nodeId) ? null : location);
  let handoutsChanged = false;
  const handouts = world.handouts.map((h) => {
    if (h.nodeId === null || !doomed.has(h.nodeId)) return h;
    handoutsChanged = true;
    return { ...h, nodeId: null };
  });
  return {
    party: doomed.has(world.party.nodeId) ? landing : world.party,
    characters: mapLocations(world.characters, drop),
    creatures: mapLocations(world.creatures, drop),
    handouts: handoutsChanged ? handouts : world.handouts,
  };
}

/**
 * Every location after the node `nodeId` shrinks to `width` by `height`.
 * Each location in that node outside the new bounds moves to the nearest
 * tile inside them, through `tileWithinBounds`. Locations in other nodes,
 * and locations already inside the bounds, keep their identity.
 * @param {WorldLocations} world
 * @param {string} nodeId
 * @param {number} width
 * @param {number} height
 * @returns {WorldLocations}
 */
export function locationsAfterShrink(world, nodeId, width, height) {
  /**
   * @template {EncounterLocation} L
   * @param {L} location
   * @returns {L}
   */
  const pull = (location) => {
    if (location.nodeId !== nodeId) return location;
    const tileId = tileWithinBounds(location.tileId, width, height);
    return tileId ? { ...location, tileId } : location;
  };
  return {
    party: pull(world.party),
    characters: mapLocations(world.characters, pull),
    creatures: mapLocations(world.creatures, pull),
    handouts: world.handouts,
  };
}
