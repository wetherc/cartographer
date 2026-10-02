import { grantTempHP } from '../entities/HPBuffs.js';
import { findCombatant } from './combatants.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * Grant temporary HP to a combatant by id, store it, and log it. Temporary
 * HP never add up, so a grant no larger than what the combatant has changes
 * nothing, and the log says so. `from` names the chip the grant comes from
 * (False Life, Heroism), so the HP end with that chip (see
 * `HPBuffs.settleHPBuffs`).
 * @param {AppContext} app
 * @param {string} id
 * @param {number} amount
 * @param {string} from the chip name
 * @param {{ detail?: string, quiet?: boolean }} [opts] `detail` is the roll
 *   behind the amount, for the log. `quiet` leaves out the line for a grant
 *   that changes nothing, which the grant at the start of every turn uses.
 * @returns {boolean} whether the grant changed the combatant
 */
export function grantTempTo(app, id, amount, from, { detail = '', quiet = false } = {}) {
  const found = findCombatant(app, id);
  if (!found || amount <= 0) return false;
  const name = found.label;
  const had = found.entity.bonusHP ?? 0;
  if (amount <= had) {
    if (quiet) return false;
    app.actions.logEvent('combat', `${name} keeps ${had} temporary HP (${from} gives ${amount}).`);
    return false;
  }
  const store = /** @type {(next: any) => void} */ (found.store);
  store(grantTempHP(found.entity, amount, from));
  app.actions.markDirty();
  const roll = detail ? ` (${detail})` : '';
  app.actions.logEvent('combat', `${name} gains ${amount} temporary HP from ${from}${roll}.`);
  return true;
}
