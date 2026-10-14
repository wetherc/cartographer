import { chipTiming } from '../entities/TurnEffects.js';
import { currentParticipant } from '../combat/Initiative.js';
import { findCombatant } from './combatants.js';
import { applyConditionToTarget } from './combatantWrites.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/spell.js').ChipUntil} ChipUntil */
/** @typedef {import('../types/entities.js').DamagePart} DamagePart */

/*
 * The chip helpers that the outcome writers of a cast share:
 * `spellOutcomes.js` for save, heal, and buff spells, and
 * `spellAttackOutcomes.js` for attack spells.
 */

/**
 * The source that a cast stamps on each chip it writes. It names the caster
 * as well as its id, so the tooltip of a chip can tell two casts of one
 * spell apart.
 * @param {AppContext} app
 * @param {Spell} spell
 * @param {string} casterId
 * @returns {import('../types/entities.js').ConditionSource}
 */
export function castSource(app, spell, casterId) {
  const casterName = findCombatant(app, casterId)?.label;
  return {
    spellId: spell.id,
    spellName: spell.name,
    casterId,
    ...(casterName ? { casterName } : {}),
  };
}

/**
 * The timing of a chip that ends at a turn boundary, read against the
 * running fight (see `TurnEffects.chipTiming`).
 * @param {AppContext} app
 * @param {ChipUntil} until
 * @param {string} casterId
 * @param {string} targetId
 * @returns {ReturnType<typeof chipTiming>}
 */
export function timingFor(app, until, casterId, targetId) {
  const combat = app.state.combat;
  return chipTiming(until, {
    casterId,
    targetId,
    actingId: combat ? (currentParticipant(combat)?.id ?? null) : null,
    inOrder: (id) => !!combat?.order.some((p) => p.id === id),
  });
}

/**
 * Leave a spell's later-turn damage on a target, on a chip named after the
 * spell. The chip ends at the boundary the spell names, which is the end of
 * the target's next turn unless it names another.
 * @param {AppContext} app
 * @param {Spell} spell
 * @param {string} casterId
 * @param {string} targetId
 * @param {DamagePart[]} damage the scaled dice
 * @param {ChipUntil | undefined} until
 */
export function leaveOngoing(app, spell, casterId, targetId, damage, until) {
  const timing = timingFor(app, until ?? 'target-end', casterId, targetId);
  applyConditionToTarget(
    app,
    targetId,
    spell.name,
    timing.rounds,
    castSource(app, spell, casterId),
    null,
    { ...(timing.expires ? { expires: timing.expires } : {}), ongoing: { damage } },
  );
}

/**
 * Whether a target is a creature, whose save bonus a Player tab does not see.
 * A party character's bonuses are on its sheet.
 * @param {AppContext} app
 * @param {string} id
 * @returns {boolean}
 */
export function isFoe(app, id) {
  return findCombatant(app, id)?.kind === 'creature';
}
