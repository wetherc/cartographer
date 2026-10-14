/**
 * The write that kills a combatant outright, with no damage roll behind it
 * (Power Word Kill). A character dies through its death-save tracker, the
 * same as a character dead of exhaustion, and keeps the HP the GM tracks. A
 * creature dies at 0 HP, which is the only way a creature leaves a fight.
 */

import { isDefeated, slay } from '../entities/Creature.js';
import { isDead, killOutright } from '../entities/DeathSaves.js';
import { findCombatant } from './combatants.js';
import { logDefeatTransition, storeCharacterChips, storeCreature } from './combatantWrites.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * Kill the combatant with this id, and log it. A combatant that is already
 * dead, or that left the campaign, is left alone. A character's death also
 * ends the spell it held, through the same store that a helpless chip uses.
 * @param {AppContext} app
 * @param {string} id
 * @returns {boolean} whether a combatant died
 */
export function slayCombatant(app, id) {
  const found = findCombatant(app, id);
  if (!found) return false;
  if (found.kind === 'character') {
    if (isDead(found.entity)) return false;
    app.actions.logEvent('combat', `${found.label} dies.`);
    storeCharacterChips(app, found, killOutright(found.entity));
    return true;
  }
  if (isDefeated(found.entity)) return false;
  const dead = slay(found.entity);
  logDefeatTransition(app, found.entity, dead);
  storeCreature(app, found.entity, dead, found.store);
  app.actions.markDirty();
  return true;
}
