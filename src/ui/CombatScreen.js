import { el } from './dom.js';
import { icon } from './icons.js';
import { chip, textButton } from './buttons.js';
import { hpBand } from '../view/ViewRole.js';
import { combatantCard } from './CombatantCard.js';

/** @typedef {import('../combat/CombatView.js').CombatView} CombatView */
/** @typedef {import('../combat/CombatView.js').CombatantRow} CombatantRow */

/**
 * The combat screen: the active combatant's column and the board over a turn
 * ribbon. The screen owns no combat state: `getView` hands it the
 * already-resolved view, or null when no fight is running, in which case it
 * empties (the mode switch has hidden the screen by then anyway). Which
 * combatant the left column details is the host's transient choice
 * (`getInspectedId`), defaulting to whoever's turn it is; clicking a ribbon
 * chip inspects without advancing the turn.
 *
 * Turn flow and HP edits report back through the callbacks; the host routes
 * them to the same actions the sidebar panel uses.
 * @param {HTMLElement} container
 * @param {{
 *   getView: () => CombatView | null,
 *   isGM: () => boolean,
 *   onNext: () => void,
 *   onEnd: () => void,
 *   getInspectedId: () => string | null,
 *   onInspect: (id: string) => void,
 *   onApplyHP: (id: string, amount: number, isHeal: boolean) => void,
 *   getConcentration: (id: string) => { spellName: string } | null,
 *   onDropConcentration: (id: string) => void,
 * }} callbacks
 * @returns {{ update: () => void }}
 */
export function mountCombatScreen(container, callbacks) {
  const active = el('aside', 'combat-screen__active');
  const board = el('div', 'combat-board');
  const ribbon = el('div', 'combat-ribbon');
  const root = el(
    'div',
    'combat-screen__layout',
    el('div', 'combat-screen__columns', active, board),
    ribbon,
  );
  container.appendChild(root);

  // The damage/heal amount survives re-renders (every HP edit is one), so the
  // GM can land the same number on several combatants without retyping it.
  let hpAmount = 1;

  function render() {
    active.innerHTML = '';
    board.innerHTML = '';
    ribbon.innerHTML = '';
    const view = callbacks.getView();
    if (!view) return;
    const gm = callbacks.isGM();
    const viewer = { gm };
    renderRibbon(view, gm);
    renderActive(view, gm);
    const party = view.rows.filter((row) => row.side === 'party');
    const foes = view.rows.filter((row) => row.side === 'foe');
    board.append(group('Party', party, viewer), group('Foes', foes, viewer));
  }

  /**
   * The turn ribbon: one chip per participant in order, the current turn
   * ringed and marked `aria-current`, with the round counter and the GM's
   * turn controls beside it.
   * @param {CombatView} view
   * @param {boolean} gm
   */
  function renderRibbon(view, gm) {
    ribbon.appendChild(el('span', 'combat-ribbon__round', `Round ${view.round}`));
    const chips = el('div', 'combat-ribbon__chips');
    ribbon.appendChild(chips);
    view.rows.forEach((row, i) => {
      const current = i === view.turnIndex;
      const button = el(
        'button',
        [
          'combat-ribbon__chip',
          `combat-ribbon__chip--${row.side}`,
          current ? 'combat-ribbon__chip--current' : '',
          row.defeated ? 'combat-ribbon__chip--defeated' : '',
        ]
          .filter(Boolean)
          .join(' '),
        row.side === 'foe' ? el('span', 'combat-ribbon__foe-mark', icon('sword')) : null,
        el('span', 'combat-ribbon__initials', initialsOf(row.name)),
        el('span', 'combat-ribbon__init', String(row.initiative)),
      );
      button.type = 'button';
      if (current) button.setAttribute('aria-current', 'true');
      const name = row.name ?? 'Unknown combatant';
      button.setAttribute(
        'aria-label',
        `${name}, initiative ${row.initiative}${current ? ', current turn' : ''}` +
          `${row.defeated ? ', defeated' : ''}`,
      );
      button.title = name;
      button.addEventListener('click', () => {
        callbacks.onInspect(row.id);
        render();
      });
      chips.appendChild(button);
    });
    if (!gm) return;
    ribbon.appendChild(
      el(
        'div',
        'combat-ribbon__controls',
        textButton('Next turn', callbacks.onNext, { icon: 'chevron', variant: 'primary' }),
        textButton('End combat', callbacks.onEnd, { icon: 'flag' }),
      ),
    );
  }

  /**
   * The left column: whoever is inspected, or whoever's turn it is. HP is
   * editable by the GM and banded for a player; concentration shows with its
   * Drop control for a viewer who may act for this combatant.
   * @param {CombatView} view
   * @param {boolean} gm
   */
  function renderActive(view, gm) {
    const inspectedId = callbacks.getInspectedId();
    const row =
      view.rows.find((r) => r.id === inspectedId) ?? view.rows[view.turnIndex] ?? view.rows[0];
    if (!row) return;
    const current = view.rows[view.turnIndex]?.id === row.id;

    active.appendChild(
      el(
        'header',
        'combat-screen__active-header',
        el('h2', 'combat-screen__active-name', row.name ?? 'Unknown combatant'),
        el('span', 'u-muted', current ? 'Current turn' : 'Inspecting'),
      ),
    );

    const facts = el('div', 'combat-screen__facts');
    facts.appendChild(fact('Initiative', String(row.initiative)));
    if (row.ac !== null) facts.appendChild(fact('AC', String(row.ac)));
    if (row.hp) {
      facts.appendChild(
        fact('HP', gm ? `${row.hp.current}/${row.hp.max}` : hpBand(row.hp.current, row.hp.max)),
      );
    }
    active.appendChild(facts);

    if (gm && row.hp) active.appendChild(hpControls(row));

    if (row.conditions.length > 0) {
      active.appendChild(
        el(
          'div',
          'combat-screen__active-conditions u-row u-wrap u-g1',
          ...row.conditions.map((c) =>
            chip(c.rounds !== null && c.rounds !== undefined ? `${c.name} (${c.rounds})` : c.name),
          ),
        ),
      );
    }

    const held = callbacks.getConcentration(row.id);
    if (held) {
      const line = el(
        'div',
        'combat-screen__concentration u-row u-wrap u-g1',
        el('span', 'u-muted', `Concentrating on ${held.spellName}`),
      );
      if (row.mayAct) {
        line.appendChild(
          textButton('Drop', () => callbacks.onDropConcentration(row.id), {
            variant: 'danger',
            ariaLabel: `Drop concentration on ${held.spellName}`,
          }),
        );
      }
      active.appendChild(line);
    }
  }

  /**
   * @param {string} label
   * @param {string} value
   */
  function fact(label, value) {
    return el(
      'div',
      'combat-screen__fact',
      el('span', 'section-label', label),
      el('span', 'combat-screen__fact-value', value),
    );
  }

  /**
   * The GM's HP edit: an amount and a damage/heal pair, the Encounters
   * panel's idiom on the inspected combatant.
   * @param {CombatantRow} row
   */
  function hpControls(row) {
    const amount = /** @type {HTMLInputElement} */ (el('input', 'field combat-screen__hp-amount'));
    amount.type = 'number';
    amount.min = '1';
    amount.value = String(hpAmount);
    amount.setAttribute('aria-label', 'Damage or heal amount');
    amount.addEventListener('input', () => {
      const parsed = Number.parseInt(amount.value, 10);
      if (Number.isFinite(parsed) && parsed > 0) hpAmount = parsed;
    });
    const name = row.name ?? 'Unknown combatant';
    return el(
      'div',
      'combat-screen__hp-controls u-row u-g2',
      amount,
      textButton('Damage', () => callbacks.onApplyHP(row.id, hpAmount, false), {
        icon: 'minus',
        variant: 'danger',
        ariaLabel: `Damage ${name}`,
      }),
      textButton('Heal', () => callbacks.onApplyHP(row.id, hpAmount, true), {
        icon: 'heal',
        variant: 'success',
        ariaLabel: `Heal ${name}`,
      }),
    );
  }

  /**
   * @param {string} label
   * @param {CombatantRow[]} rows
   * @param {{ gm: boolean }} viewer
   */
  function group(label, rows, viewer) {
    return el(
      'section',
      'combat-board__group',
      el('h3', 'combat-board__heading', label),
      rows.length === 0
        ? el('p', 'combat-board__empty u-muted', 'Nobody on this side.')
        : el('div', 'combat-board__cards', ...rows.map((row) => combatantCard(row, viewer))),
    );
  }

  render();
  return { update: render };
}

/**
 * A name's initials for the ribbon chip, at most two, or a question mark for
 * an id nothing resolves.
 * @param {string | null} name
 */
export function initialsOf(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}
