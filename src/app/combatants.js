import { indexById } from '../util/indexById.js';
import { memoizeByIdentity } from '../util/memoize.js';
import { applyDamage, effectiveStatBlock, heal, isDefeated } from '../entities/Encounter.js';
import { armorClass, equippedWeapons } from '../entities/Equipment.js';
import {
  damageCharacter,
  restoreResource,
  getHP,
  getSpellbook,
  HP_RESOURCE_ID,
} from '../entities/Character.js';
import { isOnTile } from '../entities/NPC.js';
import { addCondition } from '../entities/Conditions.js';
import { removeImposed, repeatSaves } from '../entities/ImposedConditions.js';
import { saveBonus } from '../entities/Checks.js';
import { checkOnDamage, drop as dropConcentration } from '../entities/Concentration.js';
import { dropToDying, recordDamage } from '../entities/DeathSaves.js';
import { replaceById } from '../entities/Roster.js';
import { castableLeveledIds } from '../entities/SpellView.js';
import { resolveSpellIds } from '../library/Library.js';
import { sideOf, isDowned } from '../combat/CombatView.js';
import { spellbookIds } from './casterFields.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').Encounter} Encounter */
/** @typedef {import('../types/npc.js').NPC} NPC */
/** @typedef {import('../types/combat.js').CombatState} CombatState */
/** @typedef {import('../types/combat.js').Participant} Participant */

/**
 * Combatant is the resolved holder for a participant id: the entity, the
 * collection it lives in, and a store function. Store writes an updated copy
 * back to the collection and refreshes the panels that show it. Combat code
 * uses this one shape to act on any participant id, without a separate lookup
 * for characters, encounters, and NPCs.
 * @typedef {(
 *   { kind: 'character', entity: Character, store: (next: Character) => void }
 *   | { kind: 'encounter', entity: Encounter, store: (next: Encounter) => void }
 *   | { kind: 'npc', entity: NPC, store: (next: NPC) => void }
 * )} Combatant
 */

/**
 * CombatTarget is the shape combat dialogs and the spell resolver use. It
 * gives enough data to pick a target from a list (name), address the result
 * (id), and roll against it (ac). Every target carries `conditions`, the
 * chips it holds, because a rider on one of them rides a save it takes and
 * because a chip such as Prone slants the attack roll made against it. A save
 * spell's targets also carry `saveBonus` when the target is a party character
 * with a known save. See `targetSaveBonus`.
 * @typedef {{
 *   id: string,
 *   name: string,
 *   ac: number,
 *   saveBonus?: number,
 *   conditions: import('../types/entities.js').Condition[],
 * }} CombatTarget
 */

/**
 * memoizedIndex builds id-index Maps for the combat collections, cached per
 * array. Every mutation path replaces `state.characters`, `state.encounters`,
 * or `state.npcs` immutably through `replaceById`. An index keyed on the
 * array object can never serve a stale read: this is the TileIndex pattern
 * applied to rosters. Lookups during a fight run at O(1), instead of a
 * `.find` call per participant per click.
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
 * Resolve a combat participant id to the entity that holds it: a party
 * character, a foe encounter, or an NPC on the party's tile, checked in that
 * order. Also return a store function that writes an updated copy back to
 * the right collection and refreshes the matching panels. Callers must mark
 * the campaign dirty themselves. Store only persists and refreshes.
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
        // The combat screen shows the character's HP and conditions. The
        // encounter branch reaches it through commitEncounters instead.
        app.views.combatScreen.update();
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
  // This branch uses the same memoized index as the other two, then checks
  // the tile. combatantsAsTargets calls findCombatant once per participant,
  // so this avoids a full roster scan each time.
  const npc = /** @type {NPC | undefined} */ (cachedIndex(state.npcs).get(id));
  if (npc && isOnTile(npc, app.partyTracker.getPosition())) {
    return {
      kind: 'npc',
      entity: npc,
      store: (next) => {
        state.npcs = replaceById(state.npcs, next);
        app.views.combatScreen.update();
      },
    };
  }
  return null;
}

/**
 * Refresh every view that shows an encounter, after a write to
 * `state.encounters`. Map markers refresh first. That call also rebuilds the
 * Build-rail authoring list, which shows the same node scope. Then the Play
 * panel refreshes, then the initiative panel: authoring, moving, spawning, or
 * defeating an encounter on the party's tile can start or end a fight. Pass
 * `panel: false` from a list-panel handler, which re-renders its own rows
 * once the handler finishes. Pass `dirty: false` when the caller marks the
 * campaign dirty itself.
 * @param {AppContext} app
 * @param {{ panel?: boolean, dirty?: boolean }} [options]
 */
export function commitEncounters(app, { panel = true, dirty = true } = {}) {
  app.actions.syncEncounterMarkers();
  if (panel) app.views.encounterPanel.update();
  // Deleting the last encounter staged on the party's tile ends the fight.
  // Damaging one to defeat does not, because defeated encounters stay staged.
  app.actions.syncCombatLocation();
  app.views.initiativePanel.update();
  if (dirty) app.actions.markDirty();
}

/**
 * commitNPCs is the NPC equivalent of commitEncounters. It refreshes the
 * markers, which rebuild the Build-rail NPC list, and the Story panel. Both
 * views can show the same NPC, so a write from either side must reach the
 * other. This function does not refresh the initiative panel. An NPC edit
 * leaves the running order alone, and a delete does not remove the NPC's
 * participant. A deleted NPC renders as an unknown combatant until the fight
 * next refreshes.
 * @param {AppContext} app
 */
export function commitNPCs(app) {
  app.actions.syncNPCMarkers();
  app.views.npcPanel.update();
  app.actions.markDirty();
}

/**
 * describeCombatant gives the name and side of whatever entity holds a
 * participant id, read fresh each call. It returns null when nothing holds
 * the id any more: an entity deleted mid-fight, or an NPC that walked off
 * the party's tile. The initiative order does not store the name or side.
 * This makes a rename or a disposition change during a fight show up on the
 * next render.
 * @param {AppContext} app
 * @param {string} id
 * @returns {import('../types/combat.js').ParticipantView | null}
 */
export function describeCombatant(app, id) {
  const found = findCombatant(app, id);
  return found ? { name: found.entity.name, side: sideOf(found) } : null;
}

/**
 * Project an entity into the shared CombatTarget shape. Use an encounter's
 * effective AC, a character's armor AC, or an NPC's raw stat (10 when
 * absent). The chips come along, so an attack roll against this target can
 * read them without a second lookup.
 * @param {Character | Encounter | NPC} entity
 * @param {Combatant['kind']} kind
 * @returns {CombatTarget}
 */
export function asTarget(entity, kind) {
  let ac;
  /** @type {import('../types/entities.js').Condition[]} */
  let conditions = [];
  if (kind === 'encounter') {
    const encounter = /** @type {Encounter} */ (entity);
    ac = effectiveStatBlock(encounter).AC ?? 10;
    conditions = encounter.conditions ?? [];
  } else if (kind === 'character') {
    const character = /** @type {Character} */ (entity);
    ac = armorClass(character);
    conditions = character.conditions ?? [];
  } else {
    const npc = /** @type {NPC} */ (entity);
    ac = npc.stats?.AC ?? 10;
    conditions = npc.conditions ?? [];
  }
  return { id: entity.id, name: entity.name, ac, conditions };
}

/**
 * targetSaveBonus gives the save bonus a target rolls with, when the app can
 * work it out. For a party character, this is the ability modifier plus
 * proficiency, from its own stats and proficiency lists. The function
 * returns undefined for an encounter or an NPC. Neither records saving
 * throws, so the GM must enter that number by hand.
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
 * targetConditions gives the chips a combatant is holding, so a rider on one
 * of them can ride the roll a cast makes it take. All three kinds track
 * conditions. An unknown id has none, so it reads as an empty list.
 * @param {AppContext} app
 * @param {string} id
 * @returns {import('../types/entities.js').Condition[]}
 */
export function targetConditions(app, id) {
  const found = findCombatant(app, id);
  return found ? (found.entity.conditions ?? []) : [];
}

/**
 * weaponsOf gives the weapons a combatant can attack with: a party
 * character's equipped weapons, or a foe encounter's assigned weapon. NPCs
 * carry no weapons yet. An id that resolves to nothing has nothing to swing.
 * @param {AppContext} app
 * @param {string} id
 * @returns {(import('../types/entities.js').InventoryItem | import('../types/entities.js').EnemyWeapon)[]}
 */
export function weaponsOf(app, id) {
  const found = findCombatant(app, id);
  if (!found) return [];
  if (found.kind === 'encounter') return found.entity.weapon ? [found.entity.weapon] : [];
  if (found.kind === 'character') return equippedWeapons(found.entity);
  return [];
}

/**
 * spellsOf gives a combatant's castable spells, resolved from the spellbook
 * ids through the merged library's memoized index. A party character lists
 * its cantrips plus what its classes' known-rule makes castable. A prepared
 * caster's unprepared spells stay off the list. A foe encounter or an NPC
 * lists its whole spellbook, because its authoring dialog marks every picked
 * spell as castable. A non-caster's empty spellbook lists nothing.
 * @param {AppContext} app
 * @param {string} id
 * @returns {import('../types/spell.js').Spell[]}
 */
export function spellsOf(app, id) {
  const found = findCombatant(app, id);
  if (!found) return [];
  if (found.kind === 'character') {
    const book = getSpellbook(found.entity);
    return resolveSpellIds([...book.cantrips, ...castableLeveledIds(found.entity)]);
  }
  // A foe's or NPC's spellbook is read structurally. getSpellbook only reads
  // .spellbook, and an encounter or NPC caster also carries that field.
  const book = getSpellbook(/** @type {any} */ (found.entity));
  return resolveSpellIds(spellbookIds(book));
}

/**
 * Assemble the combatants an action can target, from the running order. By
 * default, the action targets the acting participant's foes. For a heal, it
 * targets its own side, including the actor, as allies. Downed combatants
 * drop out of a hostile list but stay eligible as allies, because a heal's
 * whole point can be the downed combatant. This function resolves sides per
 * participant, not from the order, so an NPC that turns hostile mid-fight
 * becomes targetable as one. An actor whose own entity is gone can target
 * nothing.
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
 * Log the transition into defeat exactly once, only when the update crosses
 * from standing to defeated. Further damage on a downed encounter stays
 * quiet. Every path that damages an encounter shares this function.
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
 * Impose a condition on a combatant by id. This is the write path behind a
 * spell that puts a chip on a creature, whether from a failed save or from a
 * buff. All three kinds track conditions, so a character, a foe, and an NPC
 * on the party's tile all take the chip. `rounds` is the counter the round
 * tick decrements, or null for a
 * condition the GM clears by hand. The function returns whether the chip
 * landed, so the caller can report when it did not.
 *
 * `source` names the cast behind the chip. This lets the effect end when the
 * cast ends, and lets the target retry the save where the spell allows it. A
 * hand-added chip has no source. `rider` is what the chip adds to the
 * target's later rolls, which the roll sites read back off the chip.
 * @param {AppContext} app
 * @param {string} targetId
 * @param {string} name
 * @param {number | null} rounds
 * @param {import('../types/entities.js').ConditionSource} [source]
 * @param {import('../types/entities.js').RollRider | null} [rider]
 * @returns {boolean}
 */
export function applyConditionToTarget(
  app,
  targetId,
  name,
  rounds,
  source = undefined,
  rider = null,
) {
  const found = findCombatant(app, targetId);
  if (!found) return false;
  const conditions = addCondition(found.entity.conditions, name, rounds, {
    source,
    ...(rider ? { rider } : {}),
  });
  storeConditions(found, conditions);
  app.actions.markDirty();
  return true;
}

/**
 * Write a new condition list back to whatever holds the combatant. The three
 * branches do the same write. They are split because each store function
 * accepts only its own entity type.
 * @param {Combatant} found
 * @param {import('../types/entities.js').Condition[]} conditions
 */
function storeConditions(found, conditions) {
  if (found.kind === 'character') found.store({ ...found.entity, conditions });
  else if (found.kind === 'encounter') found.store({ ...found.entity, conditions });
  else found.store({ ...found.entity, conditions });
}

/**
 * Take one cast's conditions off every target that holds them. A dropped
 * spell, a spell lost to damage, a spell displaced by another, or a spell
 * whose duration ran out must all do this to the creatures it affected.
 * Every chip stamped with that caster and that spell comes off, and the log
 * names each one. A target walking free is a change the table cannot see
 * from the caster's side alone.
 *
 * This is a wiring function, not a pure one, because only this layer can see
 * every collection a target can live in. All three collections are swept,
 * including the NPC roster, since a spell can land on an NPC in the fight.
 * @param {AppContext} app
 * @param {string} casterId
 * @param {string} spellId
 */
export function endSpellEffects(app, casterId, spellId) {
  const { state } = app;
  /** @type {{ name: string, condition: string }[]} */
  const freed = [];
  /**
   * @template {{ name: string, conditions: import('../types/entities.js').Condition[] }} T
   * @param {T} entity
   * @returns {T}
   */
  const sweep = (entity) => {
    const { conditions, removed } = removeImposed(entity.conditions, casterId, spellId);
    if (removed.length === 0) return entity;
    for (const c of removed) freed.push({ name: entity.name, condition: c.name });
    return { ...entity, conditions };
  };
  /**
   * swept reassigns a collection only when a chip actually came off it. The
   * roster indexes are keyed on the array's identity. Handing back a fresh
   * array with the same entities throws those caches away for nothing.
   * @template {{ name: string, conditions: import('../types/entities.js').Condition[] }} T
   * @param {readonly T[]} list
   * @returns {T[] | null}
   */
  const swept = (list) => {
    const next = list.map(sweep);
    return next.some((entity, i) => entity !== list[i]) ? next : null;
  };
  const characters = swept(state.characters);
  const encounters = swept(state.encounters);
  const npcs = swept(state.npcs);
  if (freed.length === 0) return;
  // Every write lands before anything is logged or refreshed. A panel that
  // re-renders off one of them reads the others as swept too.
  if (characters) state.characters = characters;
  if (encounters) state.encounters = encounters;
  if (npcs) state.npcs = npcs;
  if (characters) app.actions.refreshSelectedCharacter();
  if (encounters) commitEncounters(app, { dirty: false });
  if (npcs) {
    app.views.npcPanel.update();
    app.views.combatScreen.update();
  }
  app.actions.markDirty();
  for (const { name, condition } of freed) {
    app.actions.logEvent('combat', `${name} is no longer ${condition}.`);
  }
}

/**
 * Roll the repeated saves a combatant is owed as its turn ends, for
 * conditions whose spell allows one, and remove whatever it shakes loose. A
 * party character rolls its own live save bonus. A foe or an NPC rolls the
 * number the GM entered when the spell was cast, the only bonus the app has
 * for it.
 * Each roll is logged with its DC, so a table can see why an effect held.
 * @param {AppContext} app
 * @param {string} combatantId the participant whose turn just ended
 */
export function retryImposedSaves(app, combatantId) {
  const found = findCombatant(app, combatantId);
  if (!found) return;
  const character = found.kind === 'character' ? found.entity : null;
  const { conditions, results } = repeatSaves(found.entity.conditions, {
    bonusOf: (source) =>
      character && source.saveAbility
        ? saveBonus(character, source.saveAbility)
        : (source.saveBonus ?? 0),
  });
  if (results.length === 0) return;
  if (conditions !== found.entity.conditions) {
    storeConditions(found, conditions);
    app.actions.markDirty();
  }
  for (const { condition, save, ended } of results) {
    const ability = condition.source?.saveAbility;
    // A rider on the creature changed the number, so the line names it, the
    // same way the attack and the cast logs do.
    const rode = save.rider ? `, ${save.rider.note}` : '';
    const roll = `${ability ? `${ability} save` : 'save'}${rode} ${save.total} vs DC ${save.dc}`;
    app.actions.logEvent(
      'combat',
      ended
        ? `${found.entity.name} shakes off ${condition.name} (${roll}).`
        : `${found.entity.name} is still ${condition.name} (${roll}).`,
    );
  }
}

/**
 * Apply damage or healing to a combatant by id. This is the one write path
 * behind weapon hits, spell effects, and anything else that lands numbers on
 * a target. Encounters and party characters track HP. The defeat and
 * drops-to-0 transitions each log exactly once. An HP-less NPC keeps only
 * the caller's log line. This function stores the result and marks the
 * campaign dirty.
 *
 * Damage to a concentrating character also triggers the save that holds the
 * spell, and damage to a character at 0 HP costs it a death save. Both happen
 * here because every hit, weapon and spell alike, arrives through this path.
 *
 * `opts.crit` says the damage came from a critical hit, which counts as two
 * failed death saves instead of one. A caller that cannot crit leaves it off.
 * @param {AppContext} app
 * @param {string} targetId
 * @param {number} amount
 * @param {boolean} isHeal
 * @param {{ crit?: boolean }} [opts]
 */
export function applyToTarget(app, targetId, amount, isHeal, opts = {}) {
  if (amount <= 0) return;
  const found = findCombatant(app, targetId);
  if (!found) return;
  if (found.kind === 'encounter') {
    const next = isHeal ? heal(found.entity, amount) : applyDamage(found.entity, amount);
    if (!isHeal) logDefeatTransition(app, found.entity, next);
    // store re-syncs the map markers itself. A defeated encounter must drop
    // off the danger layer, and a healed one must return to it. Doing this
    // again here only rebuilds the encounter list and the Build rail a
    // second time per hit.
    found.store(next);
    app.actions.markDirty();
    return;
  }
  if (found.kind === 'character') {
    const wasDown = (getHP(found.entity)?.current ?? 0) <= 0;
    // Read before the write. `restoreResource` ends the tracker itself when it
    // heals a character above 0, so the healed copy no longer says it was
    // dying, and this is the only place left that knows.
    const wasDying = Boolean(found.entity.deathSaves);
    let next = isHeal
      ? restoreResource(found.entity, HP_RESOURCE_ID, amount)
      : damageCharacter(found.entity, amount);
    // Log the drop to 0 exactly once. Further damage on a downed character
    // must not repeat it.
    const downed = !isHeal && !wasDown && (getHP(next)?.current ?? 0) <= 0;
    if (downed) app.actions.logEvent('combat', `${next.name} drops to 0 HP.`);
    next = foldDeathSaves(app, next, {
      isHeal,
      downed,
      wasDown,
      wasDying,
      crit: opts.crit ?? false,
    });
    const broke = isHeal ? null : breakConcentration(app, next, amount, downed);
    if (broke) next = broke.character;
    found.store(next);
    app.actions.markDirty();
    // Do this after the store, never before. The sweep rewrites
    // `state.characters`. Storing the damaged character here first puts
    // the pre-sweep copy back.
    if (broke?.ended) endSpellEffects(app, next.id, broke.ended);
  }
}

/**
 * foldDeathSaves applies the death-save consequence of one hit or one heal,
 * folded into the same write as the HP change. There are three cases.
 *
 * The hit that drops a character to 0 HP starts the tracker and puts the
 * Unconscious chip on. That hit costs no failure itself.
 *
 * A hit on a character who was already at 0 HP is an automatic failure, with
 * no roll. A critical hit counts as two. This also un-stabilizes a stable
 * character, which is the 2014 rule.
 *
 * A heal that brings a dying character above 0 HP has already ended the
 * tracker inside `restoreResource`, which every heal in the app goes through.
 * All that is left here is to say so, and `wasDying` is what the caller read
 * before the write.
 * @param {AppContext} app
 * @param {Character} character already damaged or healed
 * @param {{
 *   isHeal: boolean, downed: boolean, wasDown: boolean, wasDying: boolean, crit: boolean,
 * }} edge
 * @returns {Character}
 */
function foldDeathSaves(app, character, { isHeal, downed, wasDown, wasDying, crit }) {
  if (isHeal) {
    if (wasDying && !character.deathSaves) {
      app.actions.logEvent('combat', `${character.name} regains consciousness.`);
    }
    return character;
  }
  if (downed) return dropToDying(character);
  if (!wasDown || !character.deathSaves) return character;
  const hit = recordDamage(character, { crit });
  if (hit.failures === 0) return character;
  const failures = hit.failures === 2 ? 'two failed death saves' : 'a failed death save';
  app.actions.logEvent('combat', `${character.name} takes ${failures} from the hit.`);
  if (hit.dead) app.actions.logEvent('combat', `${character.name} dies.`);
  return hit.character;
}

/**
 * breakConcentration applies the concentration consequence of damage,
 * folded into the same write. A character knocked to 0 HP loses the spell
 * outright. A character still standing makes the CON save for it, and the
 * log records the DC and the roll. The function returns the character to
 * store, alongside the id of the spell the damage ended. The caller sweeps
 * that spell off its targets once the store lands. A character holding no
 * spell comes back unchanged, with nothing ended.
 * @param {AppContext} app
 * @param {Character} character already damaged
 * @param {number} damage
 * @param {boolean} downed whether this damage dropped the character to 0 HP
 * @returns {{ character: Character, ended: string | null }}
 */
function breakConcentration(app, character, damage, downed) {
  const held = character.concentration;
  if (!held) return { character, ended: null };
  if (downed) {
    app.actions.logEvent(
      'combat',
      `${character.name} falls and loses concentration on ${held.spellName}.`,
    );
    return { character: dropConcentration(character), ended: held.spellId };
  }
  const check = checkOnDamage(character, damage);
  if (!check.save) return { character, ended: null };
  const verdict = check.dropped ? 'loses' : 'holds';
  app.actions.logEvent(
    'combat',
    `${character.name} ${verdict} concentration on ${held.spellName} ` +
      `(CON save ${check.save.total} vs DC ${check.save.dc}).`,
  );
  return { character: check.character, ended: check.dropped ? held.spellId : null };
}
