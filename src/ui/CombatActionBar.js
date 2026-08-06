import { classNames, el } from './dom.js';
import { sectionLabel, textButton } from './buttons.js';
import { formatDamage } from '../entities/Equipment.js';
import { groupSpellsByLevel } from '../entities/SpellView.js';
import { ACTION_COSTS, COST_LABELS } from '../combat/ActionBudget.js';

/** @typedef {import('../types/combat.js').ActionBudget} ActionBudget */
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
 *
 * A budget adds the pip row under the heading: what the turn has spent of its
 * action, bonus action, and reaction, and how many weapon swings are left. The
 * pips report, they do not gate. Every button stays live, because the dialog
 * behind it is where a spend is refused and where the GM waives the refusal.
 * @param {{ weapons: (InventoryItem | EnemyWeapon)[], spells: Spell[] }} actions
 * @param {{
 *   onWeaponAttack: (weapon: InventoryItem | EnemyWeapon) => void,
 *   onCastSpell: (spell: Spell) => void,
 * }} callbacks
 * @param {{ used: ActionBudget, attacksLeft: number } | null} [budget]
 * @returns {HTMLElement | null}
 */
export function combatActionBar(actions, callbacks, budget = null) {
  if (actions.weapons.length === 0 && actions.spells.length === 0) return null;
  const groups = el('div', 'combat-action-bar__groups');
  const bar = el(
    'div',
    'combat-action-bar',
    sectionLabel('Actions', { tag: 'h3', className: 'combat-action-bar__heading' }),
    groups,
  );
  if (budget) bar.insertBefore(budgetRow(budget), groups);

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
 * What the turn has left, as one pip per cost plus the swing count. A spent pip
 * is struck through and dimmed, so the row reads at a glance without color
 * alone carrying the difference. The state is also spelled out for a screen
 * reader, which cannot see either.
 * @param {{ used: ActionBudget, attacksLeft: number }} budget
 * @returns {HTMLElement}
 */
function budgetRow(budget) {
  const pips = ACTION_COSTS.map((cost) => {
    const spent = budget.used[cost];
    const pip = el(
      'span',
      classNames(['combat-action-bar__pip', spent && 'combat-action-bar__pip--spent']),
      COST_LABELS[cost],
    );
    pip.appendChild(el('span', 'sr-only', spent ? ': used' : ': available'));
    return pip;
  });
  // The count shows only where it says something the pips do not: a second
  // swing this turn, from Extra Attack.
  if (budget.attacksLeft > 1) {
    pips.push(el('span', 'combat-action-bar__pip', `${budget.attacksLeft} attacks left`));
  }
  return el('div', 'combat-action-bar__budget u-row u-wrap u-g1', ...pips);
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
