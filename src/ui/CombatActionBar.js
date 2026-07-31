import { el } from './dom.js';
import { textButton } from './buttons.js';
import { formatDamage } from '../entities/Equipment.js';
import { groupSpellsByLevel } from '../entities/SpellView.js';

/** @typedef {import('../types/entities.js').InventoryItem} InventoryItem */
/** @typedef {import('../types/entities.js').EnemyWeapon} EnemyWeapon */
/** @typedef {import('../types/spell.js').Spell} Spell */

/**
 * The active combatant's actions, under an Actions heading: the weapons that
 * open an attack roll, then the spells that open the cast dialog, grouped by
 * spell level under the same headings the spellbook uses ("Cantrips", "Level
 * 2"). A caster with a dozen spells was otherwise one long run of buttons with
 * no way to tell a cantrip from a third-level slot without reading each title.
 *
 * The bar renders whatever lists it is handed and decides nothing itself (who
 * may act, and what they hold, is the host's call), so it comes back null when
 * there is nothing to offer and the column skips it.
 * @param {{ weapons: (InventoryItem | EnemyWeapon)[], spells: Spell[] }} actions
 * @param {{
 *   onWeaponAttack: (weapon: InventoryItem | EnemyWeapon) => void,
 *   onCastSpell: (spell: Spell) => void,
 * }} callbacks
 * @returns {HTMLElement | null}
 */
export function combatActionBar(actions, callbacks) {
  if (actions.weapons.length === 0 && actions.spells.length === 0) return null;
  const groups = el('div', 'combat-action-bar__groups');
  const bar = el(
    'div',
    'combat-action-bar',
    el('h3', 'section-label combat-action-bar__heading', 'Actions'),
    groups,
  );

  if (actions.weapons.length > 0) {
    groups.appendChild(
      group(
        'Weapons',
        actions.weapons.map((weapon) =>
          textButton(weapon.name, () => callbacks.onWeaponAttack(weapon), {
            icon: 'sword',
            className: 'combat-action-bar__attack',
            ariaLabel: `Attack with ${weapon.name}`,
            title: `Roll an attack with ${weapon.name} (${formatDamage(weapon.damage ?? [])})`,
          }),
        ),
      ),
    );
  }

  for (const level of groupSpellsByLevel(actions.spells)) {
    groups.appendChild(
      group(
        level.label,
        level.spells.map((spell) =>
          textButton(spell.name, () => callbacks.onCastSpell(spell), {
            icon: 'sparkles',
            className: 'combat-action-bar__cast',
            ariaLabel: `Cast ${spell.name}`,
            title: `Cast ${spell.name} (${spell.level === 0 ? 'cantrip' : `level ${spell.level}`})`,
          }),
        ),
      ),
    );
  }

  return bar;
}

/**
 * One labelled run of action buttons, indented under the Actions heading.
 * @param {string} label
 * @param {HTMLElement[]} buttons
 */
function group(label, buttons) {
  return el(
    'div',
    'combat-action-bar__group',
    el('h4', 'combat-action-bar__group-label', label),
    el('div', 'combat-action-bar__buttons u-row u-wrap u-g1', ...buttons),
  );
}
