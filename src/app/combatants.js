import { indexById } from '../util/indexById.js';
import { memoizeByIdentity } from '../util/memoize.js';
import { applyDamage, effectiveStatBlock, heal, isDefeated } from '../entities/Encounter.js';
import { armorClass } from '../entities/Equipment.js';
import { damageCharacter, restoreResource, getHP, HP_RESOURCE_ID } from '../entities/Character.js';
import { isOnTile } from '../entities/NPC.js';
import { addCondition } from '../entities/Conditions.js';
import { saveBonus } from '../entities/Checks.js';
import { checkOnDamage, drop as dropConcentration } from '../entities/Concentration.js';
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
 * pick from a list (name), address the result (id), and roll against (ac). A
 * save spell's targets additionally carry `saveBonus` where the target's own
 * save is known, which is a party character (see `targetSaveBonus`).
 * @typedef {{ id: string, name: string, ac: number, saveBonus?: number }} CombatTarget
 */

/**
 * Id-index Maps for the combat collections, memoized per array: every
 * mutation path replaces `state.characters`/`state.encounters`/`state.npcs`
 * immutably (replaceById), so an index keyed on the array object can never
 * serve stale reads — the TileIndex pattern applied to rosters. Lookups
 * during a fight are O(1) instead of a `.find` per participant per click.
 * @type {(items: readonly { id: string }[]) => Map<string, { id: string }>}
 */
const memoizedIndex = memoizeByIdentity(indexById);

/**
 * @template {{ id: string }} T
 * @param {readonly T[]} items
 * @returns {Map<string, T>}
 */
function cachedIndex(items) {
  return /** @type {Map<string, T>} */ (memoizedIndex(items));
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
        commitEncounters(app, { dirty: false });
      },
    };
  }
  // Resolved through the same memoized index as the other two branches, then
  // gated on the tile, rather than re-filtering the whole roster per lookup:
  // combatantsAsTargets calls this once per participant.
  const npc = /** @type {NPC | undefined} */ (cachedIndex(state.npcs).get(id));
  if (npc && isOnTile(npc, app.partyTracker.getPosition())) {
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
 * Refresh everything that shows an encounter, after a write to
 * `state.encounters`. The map markers come first because that call also
 * rebuilds the Build-rail authoring list, which shows the same node scope;
 * then the Play panel, then the initiative panel, since authoring, moving,
 * spawning, or defeating an encounter on the party's tile can start or end a
 * fight. Pass `panel: false` from a list-panel handler, which re-renders its
 * own rows once the handler resolves, and `dirty: false` when the caller marks
 * the campaign dirty itself.
 * @param {AppContext} app
 * @param {{ panel?: boolean, dirty?: boolean }} [options]
 */
export function commitEncounters(app, { panel = true, dirty = true } = {}) {
  app.actions.syncEncounterMarkers();
  if (panel) app.views.encounterPanel.update();
  app.views.initiativePanel.update();
  if (dirty) app.actions.markDirty();
}

/**
 * The NPC equivalent: markers (which rebuild the Build-rail NPC list) plus the
 * Story panel, both of which can show the same NPC, so a write from either
 * side has to reach the other. No initiative refresh: an NPC edit leaves the
 * running order alone, and a delete does not prune it, so a deleted NPC's
 * participant renders as an unknown combatant until the fight's next refresh.
 * @param {AppContext} app
 */
export function commitNPCs(app) {
  app.actions.syncNPCMarkers();
  app.views.npcPanel.update();
  app.actions.markDirty();
}

/**
 * Which side a resolved combatant fights on: the party's characters and its
 * friendly or neutral NPCs against the encounters and the hostile NPCs.
 * @param {Combatant} found
 * @returns {'party' | 'foe'}
 */
function sideOf(found) {
  if (found.kind === 'encounter') return 'foe';
  if (found.kind === 'npc') return found.entity.disposition === 'hostile' ? 'foe' : 'party';
  return 'party';
}

/**
 * How to present a participant: the name and side of whatever entity holds its
 * id, read fresh. Null when nothing holds it any more — an entity deleted
 * mid-fight, or an NPC who has walked off the party's tile. The initiative
 * order stores neither field precisely so that a rename or a disposition
 * change during a fight shows up here on the next render.
 * @param {AppContext} app
 * @param {string} id
 * @returns {import('../types/combat.js').ParticipantView | null}
 */
export function describeCombatant(app, id) {
  const found = findCombatant(app, id);
  return found ? { name: found.entity.name, side: sideOf(found) } : null;
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
 * The save bonus a target rolls with, when the app can work it out: a party
 * character's ability modifier plus proficiency, from its own stats and
 * proficiency lists. Undefined for an encounter or an NPC, neither of which
 * records saving throws, leaving those to the GM's hand-entered number.
 * @param {AppContext} app
 * @param {string} id
 * @param {string} ability
 * @returns {number | undefined}
 */
export function targetSaveBonus(app, id, ability) {
  const found = findCombatant(app, id);
  return found?.kind === 'character' ? saveBonus(found.entity, ability) : undefined;
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
 * Sides are resolved per participant rather than read off the order, so an
 * NPC who turns hostile mid-fight is targetable as one. An actor whose own
 * entity is gone can target nothing.
 * @param {AppContext} app
 * @param {CombatState} combat
 * @param {Participant} actor
 * @param {{ allies?: boolean }} [options]
 * @returns {CombatTarget[]}
 */
export function combatantsAsTargets(app, combat, actor, { allies = false } = {}) {
  const actorSide = describeCombatant(app, actor.id)?.side;
  if (!actorSide) return [];
  return combat.order.flatMap((p) => {
    const found = findCombatant(app, p.id);
    if (!found) return [];
    const sameSide = sideOf(found) === actorSide;
    if (sameSide !== allies) return [];
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
 * Impose a condition on a combatant by id, the write path behind a spell whose
 * failed save carries a rider. Characters and encounters both track conditions,
 * so both get the chip; an NPC has no conditions field, and the caller's log
 * line is all the record there is. `rounds` is the counter the round tick
 * decrements, or null for a condition the GM clears by hand. Returns whether
 * the chip landed, so the caller can say when it did not.
 * @param {AppContext} app
 * @param {string} targetId
 * @param {string} name
 * @param {number | null} rounds
 * @returns {boolean}
 */
export function applyConditionToTarget(app, targetId, name, rounds) {
  const found = findCombatant(app, targetId);
  if (!found || found.kind === 'npc') return false;
  const conditions = addCondition(found.entity.conditions, name, rounds);
  // The two branches are the same write; they are split because each `store`
  // accepts only its own entity type, and one call cannot satisfy both.
  if (found.kind === 'character') found.store({ ...found.entity, conditions });
  else found.store({ ...found.entity, conditions });
  app.actions.markDirty();
  return true;
}

/**
 * Apply damage or healing to a combatant by id — the one write path behind
 * weapon hits, spell effects, and anything else that lands numbers on a
 * target. Encounters and party characters track HP, with the defeat and
 * drops-to-0 transitions each logged exactly once; an HP-less NPC keeps the
 * caller's log line only. Stores the result and marks the campaign dirty.
 *
 * Damage to a concentrating character also calls for the save that holds the
 * spell, which happens here because this is the path every hit arrives by,
 * weapon and spell alike.
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
    // `store` re-syncs the map markers itself, which is what a defeated
    // encounter dropping off the danger layer (or a healed one returning)
    // needs; doing it again here only re-filtered the encounter list and
    // rebuilt the Build rail a second time per hit.
    found.store(next);
    app.actions.markDirty();
    return;
  }
  if (found.kind === 'character') {
    let next = isHeal
      ? restoreResource(found.entity, HP_RESOURCE_ID, amount)
      : damageCharacter(found.entity, amount);
    // Log the drop to 0 exactly once — further damage on a downed character
    // shouldn't repeat it.
    const downed =
      !isHeal && (getHP(found.entity)?.current ?? 0) > 0 && (getHP(next)?.current ?? 0) <= 0;
    if (downed) app.actions.logEvent('combat', `${next.name} drops to 0 HP.`);
    if (!isHeal) next = breakConcentration(app, next, amount, downed);
    found.store(next);
    app.actions.markDirty();
  }
}

/**
 * The concentration consequence of damage, folded into the same write: a
 * character knocked to 0 HP loses the spell outright, and one still standing
 * makes the CON save for it, which the log records DC and roll included. Returns
 * the character to store; one that was holding nothing comes back untouched.
 * @param {AppContext} app
 * @param {Character} character already damaged
 * @param {number} damage
 * @param {boolean} downed whether this damage dropped them to 0 HP
 * @returns {Character}
 */
function breakConcentration(app, character, damage, downed) {
  const held = character.concentration;
  if (!held) return character;
  if (downed) {
    app.actions.logEvent(
      'combat',
      `${character.name} falls and loses concentration on ${held.spellName}.`,
    );
    return dropConcentration(character);
  }
  const check = checkOnDamage(character, damage);
  if (!check.save) return character;
  const verdict = check.dropped ? 'loses' : 'holds';
  app.actions.logEvent(
    'combat',
    `${character.name} ${verdict} concentration on ${held.spellName} ` +
      `(CON save ${check.save.total} vs DC ${check.save.dc}).`,
  );
  return check.character;
}
