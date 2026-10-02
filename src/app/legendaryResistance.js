import { confirmModal } from '../ui/Modal.js';
import { findCombatant } from './combatants.js';
import {
  canResist,
  resistancesLeft,
  resistedOutcome,
  spendResistance,
} from '../combat/LegendaryResistance.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * The uses of Legendary Resistance a combatant has left, or 0 for anything
 * that is not a creature with the trait.
 * @param {AppContext} app
 * @param {string | undefined} id
 * @returns {number}
 */
function leftFor(app, id) {
  const found = id ? findCombatant(app, id) : null;
  return found?.kind === 'creature' ? resistancesLeft(found.entity) : 0;
}

/**
 * Ask the GM whether a creature that failed a save uses Legendary
 * Resistance. A yes spends one use, logs it, and returns true, so the caller
 * treats the save as a success. A combatant with no use left returns false
 * without asking.
 * @param {AppContext} app
 * @param {string} id
 * @param {string} message what the creature failed, ahead of the question
 * @param {{ ask?: import('./shieldWard.js').WardAsk }} [opts]
 * @returns {Promise<boolean>}
 */
export async function offerResistance(app, id, message, { ask = confirmModal } = {}) {
  const left = leftFor(app, id);
  if (left <= 0) return false;
  const yes = await ask(`${message} Use legendary resistance? ${left} left today.`, {
    title: 'Legendary resistance',
    confirmLabel: 'Succeed instead',
    cancelLabel: 'Let it fail',
  });
  // The dialog stands open across an await, so the creature is read again.
  const found = findCombatant(app, id);
  if (!yes || found?.kind !== 'creature' || resistancesLeft(found.entity) <= 0) return false;
  const spent = spendResistance(found.entity);
  found.store(spent);
  app.actions.markDirty();
  app.actions.logEvent(
    'combat',
    `${found.label} uses legendary resistance and succeeds instead (${resistancesLeft(spent)} left today).`,
  );
  return true;
}

/**
 * Offer Legendary Resistance to each target that failed the save of a save
 * spell, in target order, before `applyOutcomes` writes the outcomes. A yes
 * turns that outcome into a success (see `resistedOutcome`). The return is
 * null when no target can resist, so the caller applies the result without
 * waiting.
 * @template {{ outcomes: object[] }} R
 * @param {AppContext} app
 * @param {import('../types/spell.js').Spell} spell
 * @param {R} result
 * @param {{ ask?: import('./shieldWard.js').WardAsk }} [opts]
 * @returns {Promise<R> | null}
 */
export function resistSpellSaves(app, spell, result, opts = {}) {
  const effect = spell.effect;
  if (effect.kind !== 'save') return null;
  const outcomes = /** @type {any[]} */ (result.outcomes);
  /** @param {any} o */
  const resistable = (o) => canResist(o) && leftFor(app, o.target.id) > 0;
  if (!outcomes.some(resistable)) return null;
  return (async () => {
    const next = [];
    for (const o of outcomes) {
      const name = findCombatant(app, o.target.id)?.label ?? o.target.name;
      const message = `${name} fails the ${effect.saveAbility} save against ${spell.name} (DC ${o.dc}).`;
      const turned = resistable(o) && (await offerResistance(app, o.target.id, message, opts));
      next.push(turned ? resistedOutcome(effect, o) : o);
    }
    return { ...result, outcomes: next };
  })();
}
