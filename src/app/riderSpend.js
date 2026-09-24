import { spendRiders } from '../entities/Riders.js';
import { findCombatant } from './combatants.js';

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
