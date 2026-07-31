/**
 * Pure derivations over a running combat: which side a combatant fights on,
 * whether it is out of the fight, and the full per-participant view a combat
 * surface renders from. The UI layers used to derive these ad hoc (the
 * initiative panel one way, the target assembly another), so this module is
 * the one statement of each rule. It resolves nothing itself: the caller
 * injects `resolve`, which maps a participant id to the entity holding it,
 * because only the wiring layer can see every collection an id might live in.
 */

import { effectiveStatBlock, isDefeated } from '../entities/Encounter.js';
import { armorClass } from '../entities/Equipment.js';
import { getHP } from '../entities/Character.js';

/** @typedef {import('../types/combat.js').CombatState} CombatState */
/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').Encounter} Encounter */
/** @typedef {import('../types/npc.js').NPC} NPC */

/**
 * A participant id resolved to whatever holds it. The `kind` names which
 * collection, and `entity` is the live object, read fresh per render so a
 * rename or an HP change mid-fight shows up on the next draw.
 * @typedef {(
 *   { kind: 'character', entity: Character }
 *   | { kind: 'encounter', entity: Encounter }
 *   | { kind: 'npc', entity: NPC }
 * )} ResolvedCombatant
 */

/**
 * Everything a combat surface needs to draw one participant. `name` is null
 * when nothing holds the id any more (an entity deleted mid-fight, an NPC who
 * walked off), in which case the numeric fields fall back to neutral values:
 * the row still renders so the order and the turn pointer keep lining up.
 * `hp` is null for an NPC, which carries none.
 * @typedef {{
 *   id: string,
 *   name: string | null,
 *   side: 'party' | 'foe',
 *   initiative: number,
 *   hp: { current: number, max: number } | null,
 *   ac: number | null,
 *   conditions: import('../types/entities.js').Condition[],
 *   defeated: boolean,
 *   mayAct: boolean,
 * }} CombatantRow
 */

/**
 * @typedef {{ round: number, turnIndex: number, rows: CombatantRow[] }} CombatView
 */

/**
 * Which side a resolved combatant fights on: the party's characters and its
 * friendly or neutral NPCs against the encounters and the hostile NPCs.
 * @param {ResolvedCombatant} found
 * @returns {'party' | 'foe'}
 */
export function sideOf(found) {
  if (found.kind === 'encounter') return 'foe';
  if (found.kind === 'npc') return found.entity.disposition === 'hostile' ? 'foe' : 'party';
  return 'party';
}

/**
 * Whether a combatant is out of the fight: a defeated encounter or a
 * character at 0 HP. NPCs carry no HP yet, so they never read as downed.
 * @param {ResolvedCombatant} found
 * @returns {boolean}
 */
export function isDowned(found) {
  if (found.kind === 'encounter') return isDefeated(found.entity);
  if (found.kind === 'character') {
    const hp = getHP(found.entity);
    return Boolean(hp && hp.current <= 0);
  }
  return false;
}

/**
 * The combatant's HP as a current/max pair, or null where it tracks none.
 * @param {ResolvedCombatant} found
 * @returns {{ current: number, max: number } | null}
 */
export function hpOf(found) {
  if (found.kind === 'encounter') {
    return { current: found.entity.currentHP, max: found.entity.maxHP };
  }
  if (found.kind === 'character') {
    const hp = getHP(found.entity);
    return hp ? { current: hp.current, max: hp.max } : null;
  }
  return null;
}

/**
 * The combatant's armor class: an encounter's effective AC (stat modifiers
 * applied), a character's armor AC, an NPC's raw stat or null when it has
 * none entered.
 * @param {ResolvedCombatant} found
 * @returns {number | null}
 */
export function acOf(found) {
  if (found.kind === 'encounter') return effectiveStatBlock(found.entity).AC ?? 10;
  if (found.kind === 'character') return armorClass(found.entity);
  return found.entity.stats?.AC ?? null;
}

/**
 * Whether this viewer may drive a participant's turn: the GM anywhere, a
 * player only on the party-side character their tab is bound to. A foe is the
 * GM's alone even if a player somehow holds its id.
 * @param {ResolvedCombatant | null} found
 * @param {{ gm: boolean, boundCharacterId: string | null }} viewer
 * @param {string} id
 * @returns {boolean}
 */
export function mayActOn(found, viewer, id) {
  if (viewer.gm) return true;
  if (!found || sideOf(found) === 'foe') return false;
  return viewer.boundCharacterId === id;
}

/**
 * Assemble the full view of a running combat for one viewer: the round, the
 * turn pointer, and one row per participant in order. Pure over its inputs:
 * the combat state, the injected id resolver, and who is looking.
 * @param {CombatState} combat
 * @param {(id: string) => ResolvedCombatant | null} resolve
 * @param {{ gm: boolean, boundCharacterId?: string | null }} viewer
 * @returns {CombatView}
 */
export function buildCombatView(combat, resolve, viewer) {
  const who = { gm: viewer.gm, boundCharacterId: viewer.boundCharacterId ?? null };
  const rows = combat.order.map((participant) => {
    const found = resolve(participant.id);
    return {
      id: participant.id,
      name: found ? found.entity.name : null,
      side: found ? sideOf(found) : /** @type {'party'} */ ('party'),
      initiative: participant.initiative,
      hp: found ? hpOf(found) : null,
      ac: found ? acOf(found) : null,
      conditions: found && found.kind !== 'npc' ? (found.entity.conditions ?? []) : [],
      defeated: found ? isDowned(found) : false,
      mayAct: mayActOn(found, who, participant.id),
    };
  });
  return { round: combat.round, turnIndex: combat.index, rows };
}
