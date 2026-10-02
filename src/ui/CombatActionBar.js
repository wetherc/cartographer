import { classNames, el } from './dom.js';
import { bareButton, sectionLabel, textButton } from './buttons.js';
import { formatDamage } from '../entities/Equipment.js';
import { groupSpellsByLevel } from '../entities/SpellView.js';
import { ACTION_COSTS, COST_LABELS } from '../combat/ActionBudget.js';
import { attackNote, costNote, spellNote } from '../combat/SpentCost.js';
import { setTip } from './Tooltip.js';

/** @typedef {import('../types/combat.js').ActionBudget} ActionBudget */
/** @typedef {import('../types/combat.js').ActionCost} ActionCost */
/** @typedef {import('../combat/TurnActions.js').TurnAction} TurnAction */
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
 *
 * `offhand` is the second swing of two-weapon fighting, in its own group. The
 * host decides when the swing is available, so the group is absent unless the
 * turn can take it.
 *
 * `held` lists the ids of the spells whose repeat the caster keeps open. A
 * held spell button dims on the cost of its repeat (see `spellNote`).
 *
 * `turn` lists the turn actions that are not a swing or a cast, such as Dash
 * and Hide (see `combat/TurnActions.js`). Each entry names its group, and the
 * bar draws one row per group in list order, so a class feature adds its
 * own row by adding entries. With `onToggleBudget`, each pip is a toggle
 * button: the GM presses it to mark a cost used on something the app does
 * not model, or to free a cost spent by mistake.
 * @param {{
 *   weapons: (InventoryItem | EnemyWeapon)[],
 *   spells: Spell[],
 *   offhand?: (InventoryItem | EnemyWeapon)[],
 *   turn?: TurnAction[],
 *   held?: string[],
 * }} actions
 * @param {{
 *   onWeaponAttack: (weapon: InventoryItem | EnemyWeapon) => void,
 *   onCastSpell: (spell: Spell) => void,
 *   onOffhandAttack?: (weapon: InventoryItem | EnemyWeapon) => void,
 *   onTurnAction?: (action: TurnAction) => void,
 *   onToggleBudget?: (cost: ActionCost) => void,
 * }} callbacks
 * @param {{ used: ActionBudget, attacksLeft: number } | null} [budget]
 * @returns {HTMLElement | null}
 */
export function combatActionBar(actions, callbacks, budget = null) {
  const held = new Set(actions.held ?? []);
  const turn = callbacks.onTurnAction ? (actions.turn ?? []) : [];
  if (actions.weapons.length === 0 && actions.spells.length === 0 && turn.length === 0) {
    return null;
  }
  const groups = el('div', 'combat-action-bar__groups');
  const bar = el(
    'div',
    'combat-action-bar',
    sectionLabel('Actions', { tag: 'h3', className: 'combat-action-bar__heading' }),
    groups,
  );
  if (budget) bar.insertBefore(budgetRow(budget, callbacks.onToggleBudget), groups);
  /**
   * Dim a button whose cost the turn already spent, and name the reason in
   * its tooltip and accessible name. With no budget, nothing is dimmed.
   * @param {HTMLButtonElement} button
   * @param {(b: { used: ActionBudget, attacksLeft: number }) => string | null} noteOf
   */
  const mark = (button, noteOf) => {
    const note = budget && noteOf(budget);
    if (!note) return button;
    button.classList.add('combat-action-bar__button--spent');
    setTip(button, `${note}. ${button.dataset.tip ?? ''}`.trim());
    button.setAttribute(
      'aria-label',
      `${button.getAttribute('aria-label')}, ${note.toLowerCase()}`,
    );
    return button;
  };

  if (actions.weapons.length > 0) {
    groups.appendChild(
      group(
        'Weapons',
        actions.weapons.map((weapon) =>
          mark(
            textButton(weapon.name, () => callbacks.onWeaponAttack(weapon), {
              icon: 'sword',
              className: 'combat-action-bar__attack',
              ariaLabel: `Attack with ${weapon.name}`,
              title: `Roll an attack with ${weapon.name} (${formatDamage(weapon.damage ?? [])})`,
            }),
            (b) => attackNote(b.attacksLeft),
          ),
        ),
      ),
    );
  }

  const offhand = actions.offhand ?? [];
  if (offhand.length > 0 && callbacks.onOffhandAttack) {
    const onOffhand = callbacks.onOffhandAttack;
    groups.appendChild(
      group(
        'Off-hand (bonus action)',
        offhand.map((weapon) =>
          mark(
            textButton(weapon.name, () => onOffhand(weapon), {
              icon: 'sword',
              className: 'combat-action-bar__attack',
              ariaLabel: `Attack with ${weapon.name} in the off hand`,
              title: `Roll an off-hand attack with ${weapon.name}. It adds no ability bonus to damage without the Two-Weapon Fighting style`,
            }),
            (b) => costNote(b.used, 'bonus'),
          ),
        ),
      ),
    );
  }

  for (const level of groupSpellsByLevel(actions.spells)) {
    groups.appendChild(
      group(
        level.label,
        level.spells.map((spell) =>
          mark(
            textButton(spell.name, () => callbacks.onCastSpell(spell), {
              icon: 'sparkles',
              className: 'combat-action-bar__cast',
              ariaLabel: `Cast ${spell.name}`,
              title: `Cast ${spell.name} (${spell.level === 0 ? 'cantrip' : `level ${spell.level}`})`,
            }),
            (b) => spellNote(b.used, spell, held.has(spell.id)),
          ),
        ),
      ),
    );
  }

  const onTurn = callbacks.onTurnAction;
  if (onTurn) {
    for (const [label, entries] of groupBy(turn, (a) => a.group)) {
      groups.appendChild(
        group(
          label,
          entries.map((action) =>
            mark(
              textButton(action.name, () => onTurn(action), {
                className: 'combat-action-bar__turn',
                ariaLabel:
                  action.ariaLabel ??
                  (action.cost === 'action' || action.cost === null
                    ? `Take the ${action.name} action`
                    : `Take the ${action.name} action as a ${COST_LABELS[action.cost].toLowerCase()}`),
                title: action.title,
              }),
              (b) => costNote(b.used, action.cost),
            ),
          ),
        ),
      );
    }
  }

  return bar;
}

/**
 * The entries of a list in groups, keyed by `key`, in order of first
 * appearance.
 * @template T
 * @param {T[]} list
 * @param {(item: T) => string} key
 * @returns {Map<string, T[]>}
 */
function groupBy(list, key) {
  /** @type {Map<string, T[]>} */
  const groups = new Map();
  for (const item of list) {
    const k = key(item);
    groups.set(k, [...(groups.get(k) ?? []), item]);
  }
  return groups;
}

/**
 * What the turn has left, as one pip per cost plus the swing count. A spent pip
 * is struck through and dimmed, so the row reads at a glance without color
 * alone carrying the difference. The state is also spelled out for a screen
 * reader, which cannot see either. With `onToggle`, each pip is a button
 * whose pressed state means used.
 * @param {{ used: ActionBudget, attacksLeft: number }} budget
 * @param {(cost: ActionCost) => void} [onToggle]
 * @returns {HTMLElement}
 */
function budgetRow(budget, onToggle) {
  /** @type {HTMLElement[]} */
  const pips = ACTION_COSTS.map((cost) => {
    const spent = budget.used[cost];
    const className = classNames([
      'combat-action-bar__pip',
      spent && 'combat-action-bar__pip--spent',
    ]);
    const label = COST_LABELS[cost];
    if (onToggle) {
      const pip = bareButton([label], () => onToggle(cost), {
        className: `${className} combat-action-bar__pip--toggle`,
        title: spent
          ? `${label} spent. Press to mark it free again`
          : `${label} free. Press to mark it spent`,
      });
      pip.setAttribute('aria-pressed', String(spent));
      pip.setAttribute('aria-label', `${label} spent`);
      return pip;
    }
    const pip = el('span', className, label);
    pip.appendChild(el('span', 'sr-only', spent ? ': spent' : ': available'));
    return pip;
  });
  // An Action Surge taken before the action leaves a second action behind
  // the free Action pip, which the pip alone cannot show.
  if (budget.used.spare) {
    pips.push(el('span', 'combat-action-bar__pip', '+1 action (Action Surge)'));
  }
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
