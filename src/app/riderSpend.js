import { spendRiders } from '../entities/Riders.js';
import { findCombatant } from './combatants.js';
import { dropOnce, spentOnce } from '../entities/ChipSlants.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * Remove the one-roll rider chips that a roll used up, such as Guidance
 * after an ability check, from the character or creature that rolled.
 * Without this write, one Guidance adds 1d4 to every check for a minute.
 * A roll that used up nothing, or an id that resolves to nothing, writes
 * nothing.
 * @param {AppContext} app
 * @param {string} id the roller
 * @param {{ spent?: string[] } | null | undefined} rider the roll's rider result
 */
export function spendRollRiders(app, id, rider) {
  if (!rider?.spent?.length) return;
  const found = findCombatant(app, id);
  if (!found) return;
  const conditions = spendRiders(found.entity.conditions, rider.spent);
  if (conditions === found.entity.conditions) return;
  if (found.kind === 'character') found.store({ ...found.entity, conditions });
  else found.store({ ...found.entity, conditions });
  app.actions.markDirty();
}

/**
 * Remove the one-shot chips that an attack roll used up on both sides:
 * Guiding Bolt's advantage on the target, and Vicious Mockery's disadvantage
 * on the attacker. Without this write, one Guiding Bolt gives advantage to
 * every attack against its target until the chip times out.
 * @param {AppContext} app
 * @param {string} rollerId
 * @param {string} targetId
 * @param {Parameters<typeof spentOnce>[0]} query the chip lists that the roll read
 */
export function spendOnceChips(app, rollerId, targetId, query) {
  const spent = spentOnce(query);
  for (const [id, names] of /** @type {const} */ ([
    [rollerId, spent.roller],
    [targetId, spent.target],
  ])) {
    const found = names.length > 0 ? findCombatant(app, id) : null;
    if (!found) continue;
    const conditions = dropOnce(found.entity.conditions, names);
    if (conditions === found.entity.conditions) continue;
    if (found.kind === 'character') found.store({ ...found.entity, conditions });
    else found.store({ ...found.entity, conditions });
    app.actions.markDirty();
    app.actions.logEvent('combat', `${found.label}'s ${names.join(' and ')} ends.`);
  }
}
