import { el } from './dom.js';
import { textButton } from './buttons.js';
import { formatDamage } from '../entities/Equipment.js';

/** @typedef {import('../types/entities.js').InventoryItem} InventoryItem */
/** @typedef {import('../types/entities.js').EnemyWeapon} EnemyWeapon */
/** @typedef {import('../types/spell.js').Spell} Spell */

/**
 * The active combatant's actions as one strip of buttons: a weapon each for
 * the attack roll, a spell each for the cast dialog. The bar renders whatever
 * lists it is handed and decides nothing itself (who may act, and what they
 * hold, is the host's call), so it comes back null when there is nothing to
 * offer and the column skips it.
 * @param {{ weapons: (InventoryItem | EnemyWeapon)[], spells: Spell[] }} actions
 * @param {{
 *   onWeaponAttack: (weapon: InventoryItem | EnemyWeapon) => void,
 *   onCastSpell: (spell: Spell) => void,
 * }} callbacks
 * @returns {HTMLElement | null}
 */
export function combatActionBar(actions, callbacks) {
  if (actions.weapons.length === 0 && actions.spells.length === 0) return null;
  return el(
    'div',
    'combat-action-bar u-row u-wrap u-g1',
    ...actions.weapons.map((weapon) =>
      textButton(weapon.name, () => callbacks.onWeaponAttack(weapon), {
        icon: 'sword',
        className: 'combat-action-bar__attack',
        ariaLabel: `Attack with ${weapon.name}`,
        title: `Roll an attack with ${weapon.name} (${formatDamage(weapon.damage ?? [])})`,
      }),
    ),
    ...actions.spells.map((spell) =>
      textButton(spell.name, () => callbacks.onCastSpell(spell), {
        icon: 'sparkles',
        className: 'combat-action-bar__cast',
        ariaLabel: `Cast ${spell.name}`,
        title: `Cast ${spell.name} (${spell.level === 0 ? 'cantrip' : `level ${spell.level}`})`,
      }),
    ),
  );
}
