/** @typedef {import('../types/npc.js').NPC} NPC */
/** @typedef {import('../types/npc.js').Disposition} Disposition */
/** @typedef {import('../types/entities.js').EncounterLocation} EncounterLocation */

/** The dispositions an NPC can hold toward the party. */
export const DISPOSITIONS = /** @type {Disposition[]} */ (['friendly', 'neutral', 'hostile']);

/**
 * Create a non-combatant NPC. Unlike an Encounter it has no HP: an NPC is a
 * named, placed, dispositioned campaign figure, not a fight.
 * @param {string} id
 * @param {string} name
 * @param {{ role?: string, disposition?: Disposition, notes?: string, location?: EncounterLocation | null }} [options]
 * @returns {NPC}
 */
export function createNPC(id, name, options = {}) {
  return {
    id,
    name,
    role: options.role ?? '',
    disposition: options.disposition ?? 'neutral',
    notes: options.notes ?? '',
    location: options.location ?? null,
  };
}

/**
 * Fill in fields an NPC loaded from an older save may lack.
 * @param {NPC} npc
 * @returns {NPC}
 */
export function withDefaults(npc) {
  return {
    ...npc,
    role: npc.role ?? '',
    disposition: npc.disposition ?? 'neutral',
    notes: npc.notes ?? '',
    location: npc.location ?? null,
  };
}

/**
 * The NPCs relevant to the party's position: those at the node the party
 * occupies, plus unplaced ones (location === null), matching encountersAt.
 * @param {NPC[]} npcs
 * @param {{ nodeId: string } | null} position
 * @returns {NPC[]}
 */
export function npcsAt(npcs, position) {
  return npcs.filter(
    (n) => n.location === null || (position !== null && n.location.nodeId === position.nodeId),
  );
}

/**
 * Human-readable placement for an NPC row: the node's name plus the tile
 * coordinates, or a fixed label for an unplaced (appears-everywhere) NPC.
 * @param {EncounterLocation | null} location
 * @param {(nodeId: string) => string | undefined} getNodeName
 * @returns {string}
 */
export function formatLocation(location, getNodeName) {
  if (!location) return 'Everywhere';
  return `${getNodeName(location.nodeId) ?? location.nodeId} (${location.tileId})`;
}
