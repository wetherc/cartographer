import { indexById } from '../util/indexById.js';
import { applyDamage, effectiveStatBlock, heal, isDefeated } from '../entities/Encounter.js';
import { armorClass } from '../entities/Equipment.js';
import { damageCharacter, restoreResource, getHP, HP_RESOURCE_ID } from '../entities/Character.js';
import { npcsOnTile } from '../entities/NPC.js';
import { replaceById } from '../entities/Roster.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').Encounter} Encounter */
/** @typedef {import('../types/npc.js').NPC} NPC */
/** @typedef {import('../types/combat.js').CombatState} CombatState */
/** @typedef {import('../types/combat.js').Participant} Participant */

/**
 * The resolved holder of a participant id: the entity itself, which collection
 * it lives in, and a `store` that writes an updated copy back to that
 * collection and refreshes the panels showing it. The one shape combat code
 * needs to act on "whoever this id is" without repeating the three-way
 * character/encounter/NPC cascade.
 * @typedef {(
 *   { kind: 'character', entity: Character, store: (next: Character) => void }
 *   | { kind: 'encounter', entity: Encounter, store: (next: Encounter) => void }
 *   | { kind: 'npc', entity: NPC, store: (next: NPC) => void }
 * )} Combatant
 */

/**
 * The target shape combat dialogs and the spell resolver consume: enough to
 * pick from a list (name), address the result (id), and roll against (ac).
 * @typedef {{ id: string, name: string, ac: number }} CombatTarget
 */

/**
 * Id-index Maps for the combat collections, memoized per array: every
 * mutation path replaces `state.characters`/`state.encounters`/`state.npcs`
 * immutably (replaceById), so an index keyed on the array object can never
 * serve stale reads — the TileIndex pattern applied to rosters. Lookups
 * during a fight are O(1) instead of a `.find` per participant per click.
 * @type {WeakMap<readonly { id: string }[], Map<string, { id: string }>>}
 */
const indexCache = new WeakMap();

/**
 * @template {{ id: string }} T
 * @param {readonly T[]} items
 * @returns {Map<string, T>}
 */
function cachedIndex(items) {
  let index = indexCache.get(items);
  if (!index) {
    index = indexById(items);
    indexCache.set(items, index);
  }
  return /** @type {Map<string, T>} */ (index);
}

/**
 * Resolve a combat participant id to the entity holding it — a party
 * character, a foe encounter, or an NPC standing on the party's tile, checked
 * in that order — plus a `store` writing an updated copy back to the right
 * collection with the matching panel refreshes. Callers still mark the
 * campaign dirty themselves; `store` only persists and refreshes.
 * @param {AppContext} app
 * @param {string} id
 * @returns {Combatant | null}
 */
export function findCombatant(app, id) {
  const { state } = app;
  const character = /** @type {Character | undefined} */ (cachedIndex(state.characters).get(id));
  if (character) {
    return {
      kind: 'character',
      entity: character,
      store: (next) => {
        state.characters = replaceById(state.characters, next);
        app.actions.refreshSelectedCharacter();
      },
    };
  }
  const encounter = /** @type {Encounter | undefined} */ (cachedIndex(state.encounters).get(id));
  if (encounter) {
    return {
      kind: 'encounter',
      entity: encounter,
      store: (next) => {
        state.encounters = replaceById(state.encounters, next);
        app.actions.syncEncounterMarkers();
        app.views.encounterPanel.update();
        app.views.initiativePanel.update();
      },
    };
  }
  const npc = npcsOnTile(state.npcs, app.partyTracker.getPosition()).find((n) => n.id === id);
  if (npc) {
    return {
      kind: 'npc',
      entity: npc,
      store: (next) => {
        state.npcs = replaceById(state.npcs, next);
      },
    };
  }
  return null;
}

/**
 * Project an entity into the shared target shape: an encounter's effective
 * AC, a character's armor AC, an NPC's raw stat (10 when absent).
 * @param {Character | Encounter | NPC} entity
 * @param {Combatant['kind']} kind
 * @returns {CombatTarget}
 */
export function asTarget(entity, kind) {
  let ac;
  if (kind === 'encounter') {
    ac = effectiveStatBlock(/** @type {Encounter} */ (entity)).AC ?? 10;
  } else if (kind === 'character') {
    ac = armorClass(/** @type {Character} */ (entity));
  } else {
    const npc = /** @type {NPC} */ (entity);
    ac = npc.stats?.AC ?? 10;
  }
  return { id: entity.id, name: entity.name, ac };
}

/**
 * Whether a combatant is out of the fight: a defeated encounter or a
 * character at 0 HP. NPCs carry no HP yet, so they never read as downed.
 * @param {Combatant} found
 */
function isDowned(found) {
  if (found.kind === 'encounter') return isDefeated(found.entity);
  if (found.kind === 'character') {
    const hp = getHP(found.entity);
    return Boolean(hp && hp.current <= 0);
  }
  return false;
}

/**
 * Assemble the combatants an action can target from the running order: the
 * acting participant's foes by default, or its own side (allies, including
 * the actor) for a heal. Downed combatants drop out of a hostile list but
 * stay eligible as allies — a heal's whole point may be the downed one.
 * @param {AppContext} app
 * @param {CombatState} combat
 * @param {Participant} actor
 * @param {{ allies?: boolean }} [options]
 * @returns {CombatTarget[]}
 */
export function combatantsAsTargets(app, combat, actor, { allies = false } = {}) {
  return combat.order
    .filter((p) => (allies ? p.side === actor.side : p.side !== actor.side))
    .flatMap((p) => {
      const found = findCombatant(app, p.id);
      if (!found) return [];
      if (!allies && isDowned(found)) return [];
      return [asTarget(found.entity, found.kind)];
    });
}

/**
 * Log the transition into defeat exactly once: only when the update crosses
 * from standing to defeated, so further damage on a downed encounter stays
 * quiet. Shared by every path that damages an encounter.
 * @param {AppContext} app
 * @param {Encounter} prev
 * @param {Encounter} next
 */
export function logDefeatTransition(app, prev, next) {
  if (!isDefeated(prev) && isDefeated(next)) {
    app.actions.logEvent('combat', `Defeated ${next.name}.`);
  }
}

/**
 * Apply damage or healing to a combatant by id — the one write path behind
 * weapon hits, spell effects, and anything else that lands numbers on a
 * target. Encounters and party characters track HP, with the defeat and
 * drops-to-0 transitions each logged exactly once; an HP-less NPC keeps the
 * caller's log line only. Stores the result and marks the campaign dirty.
 * @param {AppContext} app
 * @param {string} targetId
 * @param {number} amount
 * @param {boolean} isHeal
 */
export function applyToTarget(app, targetId, amount, isHeal) {
  if (amount <= 0) return;
  const found = findCombatant(app, targetId);
  if (!found) return;
  if (found.kind === 'encounter') {
    const next = isHeal ? heal(found.entity, amount) : applyDamage(found.entity, amount);
    if (!isHeal) logDefeatTransition(app, found.entity, next);
    found.store(next);
    // A defeated encounter drops off the map's danger markers; a healed one
    // that comes back up returns. Re-sync so the change shows without waiting
    // for the next navigation or panel refresh.
    app.actions.syncEncounterMarkers?.();
    app.actions.markDirty();
    return;
  }
  if (found.kind === 'character') {
    const next = isHeal
      ? restoreResource(found.entity, HP_RESOURCE_ID, amount)
      : damageCharacter(found.entity, amount);
    // Log the drop to 0 exactly once — further damage on a downed character
    // shouldn't repeat it.
    if (!isHeal && (getHP(found.entity)?.current ?? 0) > 0 && (getHP(next)?.current ?? 0) <= 0) {
      app.actions.logEvent('combat', `${next.name} drops to 0 HP.`);
    }
    found.store(next);
    app.actions.markDirty();
  }
}
