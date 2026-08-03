import { defaultStats } from './Character.js';
import { withCasterFields, ensureCasterFields } from './Caster.js';
import { capitalize } from '../util/text.js';

/** @typedef {import('../types/npc.js').NPC} NPC */
/** @typedef {import('../types/npc.js').Disposition} Disposition */
/** @typedef {import('../types/entities.js').EncounterLocation} EncounterLocation */

/** The dispositions an NPC can hold toward the party. */
export const DISPOSITIONS = /** @type {Disposition[]} */ (['friendly', 'neutral', 'hostile']);

/** The dispositions as select options, shared by every NPC form.
 * @returns {{ value: Disposition, label: string }[]} */
export function dispositionOptions() {
  return DISPOSITIONS.map((d) => ({ value: d, label: capitalize(d) }));
}

/**
 * Create a non-combatant NPC. Unlike an Encounter it has no HP: an NPC is a
 * named, placed, dispositioned campaign figure, not a fight.
 * @param {string} id
 * @param {string} name
 * @param {{ role?: string, disposition?: Disposition, notes?: string, stats?: Record<string, number>, location?: EncounterLocation | null, met?: boolean, class?: string, casterLevel?: number, spellbook?: import('../types/entities.js').Spellbook }} [options]
 * @returns {NPC}
 */
export function createNPC(id, name, options = {}) {
  const npc = {
    id,
    name,
    role: options.role ?? '',
    disposition: options.disposition ?? 'neutral',
    notes: options.notes ?? '',
    stats: { ...defaultStats(), ...options.stats },
    location: options.location ?? null,
    met: options.met ?? false,
    conditions: [],
  };
  // A caster class stamps spell slots and an empty spellbook. An NPC has no
  // fighting level, so its caster level defaults to 1.
  return withCasterFields(npc, options, options.casterLevel ?? 1);
}

/**
 * Fill in fields an NPC loaded from an older save can lack.
 * @param {NPC} npc
 * @returns {NPC}
 */
export function withDefaults(npc) {
  return ensureCasterFields(
    {
      ...npc,
      role: npc.role ?? '',
      disposition: npc.disposition ?? 'neutral',
      notes: npc.notes ?? '',
      stats: { ...defaultStats(), ...npc.stats },
      location: npc.location ?? null,
      met: npc.met ?? false,
      conditions: npc.conditions ?? [],
    },
    npc.casterLevel ?? 1,
  );
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
 * The NPCs the players know about at the party's position: unplaced NPCs
 * plus placed ones the party already met. The GM-facing list uses `npcsAt`
 * unfiltered. This is the player-facing view of the same roster. This
 * function is pure.
 * @param {NPC[]} npcs
 * @param {{ nodeId: string } | null} position
 * @returns {NPC[]}
 */
export function knownNpcsAt(npcs, position) {
  return npcsAt(npcs, position).filter((n) => n.location === null || n.met);
}

/**
 * Mark as met every placed NPC standing on the party's exact tile. Landing
 * there is the introduction that reveals the NPC to the players. Returns
 * the roster (possibly unchanged) and the NPCs newly met by this landing,
 * so the caller can log each introduction. This function is pure.
 * @param {NPC[]} npcs
 * @param {EncounterLocation | null} position
 * @returns {{ npcs: NPC[], met: NPC[] }}
 */
export function meetNPCs(npcs, position) {
  /** @type {NPC[]} */
  const met = [];
  if (!position) return { npcs, met };
  const next = npcs.map((n) => {
    if (
      n.met ||
      n.location === null ||
      n.location.nodeId !== position.nodeId ||
      n.location.tileId !== position.tileId
    ) {
      return n;
    }
    const introduced = { ...n, met: true };
    met.push(introduced);
    return introduced;
  });
  return met.length > 0 ? { npcs: next, met } : { npcs, met };
}

/**
 * Whether an NPC stands exactly on a tile. Unplaced (appears-everywhere)
 * NPCs are not on any tile. An NPC joins a fight only by standing on its
 * own. This is the membership test behind `npcsOnTile`. The function is
 * exported so a caller resolving one NPC by id can ask the question
 * without filtering the whole roster. This function is pure.
 * @param {NPC} npc
 * @param {EncounterLocation | null} position
 * @returns {boolean}
 */
export function isOnTile(npc, position) {
  return (
    position !== null &&
    npc.location !== null &&
    npc.location.nodeId === position.nodeId &&
    npc.location.tileId === position.tileId
  );
}

/**
 * The NPCs placed exactly on a tile. These are the participants when an
 * encounter triggers there. Unlike `npcsAt`, this function excludes
 * unplaced (appears-everywhere) NPCs. This function is pure.
 * @param {NPC[]} npcs
 * @param {EncounterLocation | null} position
 * @returns {NPC[]}
 */
export function npcsOnTile(npcs, position) {
  if (!position) return [];
  return npcs.filter((n) => isOnTile(n, position));
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
