import { el } from './dom.js';
import { textButton } from './buttons.js';
import { formatDamage } from '../entities/Equipment.js';
import { groupSpellsByLevel } from '../entities/SpellView.js';

/** @typedef {import('../types/entities.js').InventoryItem} InventoryItem */
/** @typedef {import('../types/entities.js').EnemyWeapon} EnemyWeapon */
/** @typedef {import('../types/spell.js').Spell} Spell */

/**
 * This bar shows the active combatant's actions under an Actions heading.
 * Weapon buttons open an attack roll. Spell buttons open the cast dialog and
 * group by spell level, under the same headings as the spellbook (Cantrips,
 * Level 2). Without this grouping, a caster with many spells shows one long
 * list of buttons with no way to tell a cantrip from a third-level spell.
 *
 * The bar draws whatever lists it receives and makes no decisions of its own.
 * The host decides who can act and what they hold. The bar returns null when
 * it has nothing to offer, and the column skips it.
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
 * One labeled row of action buttons, indented under the Actions heading.
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
