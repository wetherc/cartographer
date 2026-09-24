import { CONCENTRATING } from './Conditions.js';
import { canAct } from './ConditionEffects.js';
import { resolveSave } from './Checks.js';
import { spendRiders } from './Riders.js';
import { creatureSaveBonus } from './CreatureChecks.js';
import { isDefeated } from './Creature.js';
import { CONCENTRATION_ABILITY, concentrationDC, drop } from './Concentration.js';

/** @typedef {import('../types/creature.js').Creature} Creature */
/** @typedef {import('./CharacterHit.js').HitEvent} HitEvent */
/** @typedef {import('../dice/DiceRoller.js').RandomFn} RandomFn */

/**
 * What one write to a creature does to the spell it holds open. The caller
 * passes the creature before and after the write, from any path that changes
 * a creature: a weapon hit, a spell, the HP stepper on a panel, a new chip, or
 * the sixth level of exhaustion. The rules follow `CharacterHit.hitCharacter`:
 *
 * - A drop to 0 HP ends concentration with no roll (`fell`).
 * - Damage on a creature still standing calls for a CON save against
 *   `concentrationDC`, with the creature's own save bonus (`concentration`).
 * - A chip that stops the creature acting ends it.
 * - The GM removing the `Concentrating` chip by hand ends it.
 *
 * The result names the ended spell, so the caller can free its targets once
 * the creature is stored.
 * @param {Creature} prev the creature before the write
 * @param {Creature} next the creature after the write
 * @param {{ rng?: RandomFn }} [opts]
 * @returns {{ creature: Creature, events: HitEvent[], ended: string | null }}
 */
export function settleConcentration(prev, next, opts = {}) {
  const held = next.concentration;
  if (!held) return { creature: next, events: [], ended: null };
  const ended = held.spellId;
  if (isDefeated(next)) {
    return { creature: drop(next), events: [{ kind: 'fell', spellName: held.spellName }], ended };
  }
  /** @type {HitEvent[]} */
  const events = [];
  let creature = next;
  const damage = prev.currentHP - next.currentHP;
  if (damage > 0) {
    const save = resolveSave(
      creatureSaveBonus(next, CONCENTRATION_ABILITY),
      concentrationDC(damage),
      { conditions: next.conditions, ...opts },
    );
    // A one-roll rider such as Resistance is used up by this save.
    const conditions = spendRiders(next.conditions, save.rider?.spent);
    if (conditions !== next.conditions) creature = { ...next, conditions };
    events.push({
      kind: 'concentration',
      spellName: held.spellName,
      kept: save.success,
      total: save.total,
      dc: save.dc,
    });
    if (!save.success) return { creature: drop(creature), events, ended };
  }
  const chipped = creature.conditions.some(
    (c) => c.name.toLowerCase() === CONCENTRATING.toLowerCase(),
  );
  if (!chipped || !canAct(creature.conditions)) return { creature: drop(creature), events, ended };
  return { creature, events, ended: null };
}
