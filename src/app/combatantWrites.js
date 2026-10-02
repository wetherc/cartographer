import { applyDamage, heal, isDefeated } from '../entities/Creature.js';
import {
  addCondition,
  createCondition,
  endedLine,
  outlasts,
  sameSlot,
} from '../entities/Conditions.js';
import { removeImposed, repeatSaves } from '../entities/ImposedConditions.js';
import { featRiders } from '../entities/FeatChoices.js';
import { despawnSummons } from '../entities/Summons.js';
import { healCharacter, hitCharacter } from '../entities/CharacterHit.js';
import { dropIfHelpless } from '../entities/Concentration.js';
import { settleConcentration } from '../entities/CreatureHit.js';
import { immunityTo } from '../entities/ChipMods.js';
import { isImmuneToCondition } from '../entities/CreatureType.js';
import { healingBlockedBy } from '../entities/HealTarget.js';
import { damageLine, healLine } from '../combat/HPLines.js';
import { hitEventLine } from '../combat/HitEventLines.js';
import { settleChips } from './lethargy.js';
import { combatantSaveBonus, commitCreatures, findCombatant, hpOf, logName } from './combatants.js';

/**
 * The write paths that change a combatant: damage and healing, condition
 * chips, the end of a spell's effects, and the repeated saves at the end of a
 * turn. Each one resolves the id through `findCombatant`, stores through the
 * combatant's store function, and writes its own log lines.
 */

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/creature.js').Creature} Creature */
/** @typedef {import('./combatants.js').Combatant} Combatant */

/**
 * Log the transition into defeat exactly once, only when the update crosses
 * from standing to defeated. Further damage on a downed creature stays
 * quiet. Every path that damages a creature shares this function.
 * @param {AppContext} app
 * @param {Creature} prev
 * @param {Creature} next
 */
export function logDefeatTransition(app, prev, next) {
  if (!isDefeated(prev) && isDefeated(next)) {
    app.actions.logEvent('combat', `Defeated ${logName(app, next)}.`);
  }
}

/**
 * Impose a condition on a combatant by id. This is the write path behind a
 * spell that puts a chip on a creature, whether from a failed save or from a
 * buff. Both kinds track conditions, so a character and a creature both take
 * the chip. `rounds` is the counter the round tick decrements, or null for a
 * condition the GM clears by hand. The function returns whether the chip
 * landed, so the caller can report when it did not.
 *
 * `source` names the cast behind the chip. This lets the effect end when the
 * cast ends, and lets the target retry the save where the spell allows it. A
 * hand-added chip has no source. `rider` is what the chip adds to the
 * target's later rolls, which the roll sites read back off the chip.
 * `more` contains the turn boundary that ends the chip and the damage it deals
 * on later turns.
 *
 * A chip in the same place from another cast that lasts longer, or a
 * stronger chip of the same spell, stays in place (see `Conditions.outlasts`
 * and `Conditions.sameSlot`). The target is still under the condition, so
 * the function reports that the chip landed.
 *
 * A creature whose `conditionImmunities` list names the condition, or a
 * target with a chip that makes it immune to the condition (Heroism's
 * Frightened), keeps its chips, and the log says why. A new chip that grants
 * an immunity ends the conditions it names, and a chip that changes HP
 * settles them (see `HPBuffs.settleHPBuffs`). The function reports true in
 * both cases, because the log already names the result.
 * @param {AppContext} app
 * @param {string} targetId
 * @param {string} name
 * @param {number | null} rounds
 * @param {import('../types/entities.js').ConditionSource} [source]
 * @param {import('../types/entities.js').RollRider | null} [rider]
 * @param {Pick<import('../entities/Conditions.js').ConditionExtras, 'expires' | 'ongoing' | 'mods'>} [more]
 * @returns {boolean}
 */
export function applyConditionToTarget(
  app,
  targetId,
  name,
  rounds,
  source = undefined,
  rider = null,
  more = {},
) {
  const found = findCombatant(app, targetId);
  if (!found) return false;
  const extras = { source, ...(rider ? { rider } : {}), ...more };
  const chip = createCondition(name, rounds, extras);
  const held = found.entity.conditions.find((c) => sameSlot(c, chip));
  // A creature's own immunity list keeps the chip off, the same way an
  // immunity chip does.
  if (isImmuneToCondition(found.entity, name)) {
    app.actions.logEvent('combat', `${found.label} is immune to ${name}.`);
    return true;
  }
  const guard = immunityTo(found.entity.conditions, name);
  if (guard) {
    app.actions.logEvent('combat', `${found.label} is immune to ${name} (${guard.name}).`);
    return true;
  }
  if (outlasts(held, chip)) return true;
  const ended = (more.mods?.immune ?? []).flatMap((n) =>
    found.entity.conditions.filter((c) => c.name.toLowerCase() === n.toLowerCase()),
  );
  const kept = found.entity.conditions.filter((c) => !ended.includes(c));
  const conditions = addCondition(kept, name, rounds, extras);
  for (const c of ended) {
    app.actions.logEvent('combat', `${endedLine(found.label, c.name)}.`);
  }
  if (found.kind === 'character') {
    storeCharacterChips(app, found, settleChips(app, found.entity, conditions));
    return true;
  }
  storeCreature(app, found.entity, settleChips(app, found.entity, conditions), found.store);
  app.actions.markDirty();
  return true;
}

/**
 * Store a party character whose chips just changed. A chip that leaves it
 * unable to act, such as Paralyzed from Hold Person, also ends the spell it
 * was concentrating on, and the targets of that spell go free.
 * @param {AppContext} app
 * @param {Extract<Combatant, { kind: 'character' }>} found the character's roster entry
 * @param {Character} character the character with its new chips
 */
export function storeCharacterChips(app, found, character) {
  const { character: next, ended } = dropIfHelpless(character);
  found.store(next);
  app.actions.markDirty();
  if (!ended) return;
  app.actions.logEvent('combat', `${found.label} loses concentration on ${ended.spellName}.`);
  // The sweep rewrites `state.characters`, so it runs after the store.
  endSpellEffects(app, next.id, ended.spellId);
}

/**
 * Store a creature after a write, with what the write did to the spell the
 * creature holds open (see `CreatureHit.settleConcentration`). The log
 * names a lost spell, and its targets go free once the creature is stored.
 * The caller marks the campaign dirty.
 * @param {AppContext} app
 * @param {Creature} prev the creature before the write
 * @param {Creature} next the creature after the write
 * @param {(next: Creature) => void} store
 */
export function storeCreature(app, prev, next, store) {
  const settled = settleConcentration(prev, next);
  logHitEvents(app, logName(app, settled.creature), settled.events);
  store(settled.creature);
  if (settled.ended) endSpellEffects(app, settled.creature.id, settled.ended);
}

/**
 * Write a new condition list back to whatever holds the combatant. The two
 * branches do the same write. They are split because each store function
 * accepts only its own entity type.
 * @param {AppContext} app
 * @param {Combatant} found
 * @param {import('../types/entities.js').Condition[]} conditions
 */
function storeConditions(app, found, conditions) {
  if (found.kind === 'character') found.store(settleChips(app, found.entity, conditions));
  else found.store(settleChips(app, found.entity, conditions));
}

/**
 * End everything one cast is holding: the conditions on every target, and the
 * creatures it summoned. A dropped spell, a spell lost to damage, a spell
 * displaced by another, or a spell whose duration ran out must all do this.
 * Every chip and every creature stamped with that caster and that spell goes,
 * and the log names each one. A target walking free, or a summon vanishing, is
 * a change the table cannot see from the caster's side alone.
 *
 * This is a wiring function, not a pure one, because only this layer can see
 * every collection a target can live in. Both collections are swept for chips,
 * since a spell can land on a character or on any creature in the fight. Only
 * creatures despawn, because nothing summons a party character.
 * @param {AppContext} app
 * @param {string} casterId
 * @param {string} spellId
 */
export function endSpellEffects(app, casterId, spellId) {
  const { state } = app;
  /** @type {{ name: string, condition: string, repeat: boolean }[]} */
  const freed = [];
  /** @type {string[]} */
  const notes = [];
  /**
   * @template {Character | Creature} T
   * @param {T} entity
   * @returns {T}
   */
  const sweep = (entity) => {
    const { conditions, removed } = removeImposed(entity.conditions, casterId, spellId);
    if (removed.length === 0) return entity;
    for (const c of removed) {
      freed.push({
        name: logName(app, entity),
        condition: c.name,
        repeat: !!c.source?.repeat,
      });
    }
    // A chip that raised the HP maximum (Aid) takes the raise with it, and a
    // Haste chip leaves lethargy behind.
    return settleChips(app, entity, conditions, notes);
  };
  /**
   * swept reassigns a collection only when a chip actually came off it. The
   * roster indexes are keyed on the array's identity. Handing back a fresh
   * array with the same entities throws those caches away for nothing.
   * @template {Character | Creature} T
   * @param {readonly T[]} list
   * @returns {T[] | null}
   */
  const swept = (list) => {
    const next = list.map(sweep);
    return next.some((entity, i) => entity !== list[i]) ? next : null;
  };
  const characters = swept(state.characters);
  const creatures = swept(state.creatures);
  // The despawn reads the swept list, so a summon holding a chip from this
  // same spell leaves once instead of being written twice. It runs before the
  // guard below, because a summoning spell that imposed no chip is the normal
  // case and would otherwise never clear its creatures.
  const { creatures: standing, despawned } = despawnSummons(
    creatures ?? state.creatures,
    casterId,
    spellId,
  );
  if (freed.length === 0 && despawned.length === 0) return;
  // Every write lands before anything is logged or refreshed. A panel that
  // re-renders off one of them reads the other as swept too.
  if (characters) state.characters = characters;
  if (creatures || despawned.length > 0) state.creatures = /** @type {Creature[]} */ (standing);
  // The order is written before the panels refresh, so the initiative ribbon
  // never renders a row for a creature that is already gone.
  for (const creature of despawned) app.actions.removeCombatant(creature.id);
  if (characters) app.actions.refreshSelectedCharacter();
  if (creatures || despawned.length > 0) commitCreatures(app, { dirty: false });
  app.actions.markDirty();
  // The chip a caster keeps for a repeat is not a condition it was under, so
  // its line names the spell that ends.
  for (const { name, condition, repeat } of freed) {
    app.actions.logEvent(
      'combat',
      repeat ? `${name}'s ${condition} ends.` : `${endedLine(name, condition)}.`,
    );
  }
  for (const line of notes) app.actions.logEvent('combat', line);
  for (const creature of despawned) {
    app.actions.logEvent(
      'combat',
      `${logName(app, creature)} vanishes as ${spellNameOf(creature)} ends.`,
    );
  }
}

/**
 * The spell name to print for a vanishing summon. The stamp carries it, and a
 * creature reaching the despawn without one cannot happen, so the fallback is
 * only there to keep the log line readable.
 * @param {Creature} creature
 * @returns {string}
 */
function spellNameOf(creature) {
  return creature.summonedBy?.spellName ?? 'the spell';
}

/**
 * Roll the repeated saves a combatant is owed as its turn ends, for
 * conditions whose spell allows one, and remove whatever it shakes loose. A
 * combatant of either kind rolls its live bonus, so a save granted or a stat
 * raised since the cast counts. The bonus the cast recorded is the fallback for
 * a chip whose source names no ability.
 * Each roll is logged with its DC, so a table can see why an effect held.
 * The results come back, so the caller can deal the damage that a failed
 * retry leaves.
 * @param {AppContext} app
 * @param {string} combatantId the participant whose turn just ended
 * @param {{ rng?: import('../types/dice.js').RandomFn }} [options]
 * @returns {ReturnType<typeof repeatSaves>['results']}
 */
export function retryImposedSaves(app, combatantId, { rng = Math.random } = {}) {
  const found = findCombatant(app, combatantId);
  if (!found) return [];
  const { conditions, results } = repeatSaves(found.entity.conditions, {
    rng,
    bonusOf: (source) =>
      source.saveAbility ? combatantSaveBonus(found, source.saveAbility) : (source.saveBonus ?? 0),
    riders: featRiders(/** @type {import('../types/entities.js').Character} */ (found.entity)),
  });
  if (results.length === 0) return results;
  if (conditions !== found.entity.conditions) {
    storeConditions(app, found, conditions);
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
        ? `${found.label} shakes off ${condition.name} (${roll}).`
        : `${found.label} is still ${condition.name} (${roll}).`,
    );
  }
  return results;
}

/**
 * Apply damage or healing to a combatant by id. This is the one write path
 * behind weapon hits, spell effects, and anything else that lands numbers on
 * a target. Both kinds track HP. The defeat and drops-to-0 transitions
 * each log exactly once. This function stores the result and marks the
 * campaign dirty.
 *
 * Damage to a concentrating character also triggers the save that holds the
 * spell, and damage to a character at 0 HP costs it a death save. Both happen
 * here because every hit, weapon and spell alike, arrives through this path.
 *
 * `opts.crit` says the damage came from a critical hit, which counts as two
 * failed death saves instead of one. A caller that cannot crit leaves it off.
 *
 * `opts.manual` says the GM typed the amount into the combat screen. That
 * path has no roll to log, so this function writes the line itself: the
 * name, the amount, and the HP that results. An attack or a cast writes its
 * own line with the roll in it, and leaves this option off.
 *
 * `opts.revives` says the heal comes from a spell that raises the dead. A
 * character heal then goes through `CharacterHit.healCharacter` with that
 * flag. The caller has already checked the target with
 * `HealTarget.healBlocked`.
 * @param {AppContext} app
 * @param {string} targetId
 * @param {number} amount
 * @param {boolean} isHeal
 * @param {{ crit?: boolean, manual?: boolean, revives?: boolean }} [opts]
 */
export function applyToTarget(app, targetId, amount, isHeal, opts = {}) {
  if (amount <= 0) return;
  const found = findCombatant(app, targetId);
  if (!found) return;
  // A chip that stops healing (Chill Touch) keeps every heal off, and the log
  // names the chip. Temporary HP takes another path, so it still lands.
  const chilled = isHeal ? healingBlockedBy(found.entity.conditions) : undefined;
  if (chilled) {
    app.actions.logEvent('combat', `${found.label} cannot regain hit points (${chilled.name}).`);
    return;
  }
  // The damage write of each kind takes off a chip that damage ends (Sleep).
  // The log names the chip here, ahead of the lines the hit writes.
  if (!isHeal) {
    for (const c of found.entity.conditions) {
      if (!c.source?.endsOnDamage) continue;
      app.actions.logEvent('combat', `${endedLine(found.label, c.name)} (${c.source.spellName}).`);
    }
  }
  /** @param {Character | Creature} next */
  const logManual = (next) => {
    if (!opts.manual) return;
    /** @param {ReturnType<typeof hpOf>} hp */
    const line = (hp) =>
      isHeal ? healLine(found.label, amount, hp) : damageLine(found.label, amount, hp);
    const hp = hpOf(found.kind, next);
    // A Player tab shows a creature's HP only as a band, so the readout of a
    // creature's HP is GM-only.
    app.actions.logEvent(
      'combat',
      line(hp),
      found.kind === 'creature' ? { player: line(null) } : {},
    );
  };
  if (found.kind === 'creature') {
    // A creature follows one rule: 0 HP takes it out of the fight, with no
    // death saves and no dying tracker.
    const next = isHeal ? heal(found.entity, amount) : applyDamage(found.entity, amount);
    logManual(next);
    if (!isHeal) logDefeatTransition(app, found.entity, next);
    // store re-syncs the map markers itself. A defeated hostile must drop
    // off the danger layer, and a healed one must return to it. Doing this
    // again here only rebuilds the lists and the Build rail a second time
    // per hit. The damage can also break the spell the creature holds.
    storeCreature(app, found.entity, next, found.store);
    app.actions.markDirty();
    return;
  }
  if (found.kind === 'character') {
    const result = isHeal
      ? healCharacter(found.entity, amount, { revives: opts.revives ?? false })
      : hitCharacter(found.entity, amount, { crit: opts.crit ?? false });
    // The amount line comes first, so the drop and the death-save lines that
    // follow read as its consequences. A heal with no effect writes only the
    // line that says why.
    if (result.character !== found.entity) logManual(result.character);
    logHitEvents(app, found.label, result.events);
    found.store(result.character);
    app.actions.markDirty();
    // Do this after the store, never before. The sweep rewrites
    // `state.characters`. Storing the damaged character here first puts
    // the pre-sweep copy back.
    if (result.ended) endSpellEffects(app, result.character.id, result.ended);
  }
}

/**
 * Log what a hit or a heal did to a combatant, in the order it
 * happened (see `CharacterHit.HitEvent`).
 * @param {AppContext} app
 * @param {string} name
 * @param {import('../entities/CharacterHit.js').HitEvent[]} events
 */
function logHitEvents(app, name, events) {
  for (const event of events) {
    const line = hitEventLine(name, event);
    app.actions.logEvent('combat', line);
    if (event.kind === 'failures' && event.dead) app.actions.logEvent('combat', `${name} dies.`);
  }
}
