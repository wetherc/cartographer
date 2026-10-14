import { removeItem } from '../entities/CharacterInventory.js';
import { ammunitionOf, ammunitionStack } from '../entities/WeaponProperties.js';
import { findCombatant, logName, updateCombatant } from './combatants.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * Take one piece of ammunition from the attacker's matching stack, for a shot
 * from a weapon with the Ammunition property. A character with no matching
 * stack gets a toast, and the shot still rolls, because the GM can rule that
 * the party carries ammunition the sheet does not list. The last piece of a
 * stack also gets a toast. A creature carries no inventory, so its shots
 * spend nothing.
 * @param {AppContext} app
 * @param {{ id: string }} attacker
 * @param {import('../types/entities.js').InventoryItem | import('../types/entities.js').CreatureWeapon} weapon
 */
export function spendAmmunition(app, attacker, weapon) {
  const kind = ammunitionOf(weapon);
  if (!kind) return;
  const found = findCombatant(app, attacker.id);
  if (!found || found.kind !== 'character') return;
  const name = logName(app, found.entity);
  const stack = ammunitionStack(found.entity, weapon);
  if (!stack) {
    app.toasts.show(`${name} has no ${kind.noun} in the inventory for ${weapon.name}.`);
    return;
  }
  updateCombatant(found, (character) =>
    removeItem(/** @type {import('../types/entities.js').Character} */ (character), stack.id, 1),
  );
  app.actions.markDirty();
  if (stack.quantity === 1) app.toasts.show(`${name} fires the last of the ${stack.name}.`);
}
