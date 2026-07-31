import { el } from './dom.js';
import { icon } from './icons.js';
import { chip, textButton } from './buttons.js';
import { hpBand } from '../view/ViewRole.js';
import { combatantCard } from './CombatantCard.js';
import { combatActionBar } from './CombatActionBar.js';
import { entryItem } from './TravelogPanel.js';

/** @typedef {import('../combat/CombatView.js').CombatView} CombatView */
/** @typedef {import('../combat/CombatView.js').CombatantRow} CombatantRow */
/** @typedef {import('../types/entities.js').InventoryItem} InventoryItem */
/** @typedef {import('../types/entities.js').EnemyWeapon} EnemyWeapon */
/** @typedef {import('../types/spell.js').Spell} Spell */

/**
 * The combat screen: a turn ribbon over the active combatant's column and the
 * board. The screen owns no combat state: `getView` hands it the
 * already-resolved view, or null when no fight is running, in which case it
 * empties (the mode switch has hidden the screen by then anyway). Which
 * combatant the left column details is the host's transient choice
 * (`getInspectedId`), defaulting to whoever's turn it is; clicking a ribbon
 * chip inspects without advancing the turn.
 *
 * The board's cards double as the target picker: clicking one reports through
 * `onSelectTarget` and the host's `getSelectedTargetId` says which is held.
 * The selection feeds the action bar under the active combatant (the current
 * turn's weapons and spells, offered only when the viewer may act that turn),
 * whose picks report through `onWeaponAttack`/`onCastSpell`.
 *
 * Turn flow and HP edits report back through the callbacks; the host routes
 * them to the same actions the sidebar panel uses.
 *
 * `diceDock` is an empty slot under the active column, where the host parks the
 * app's dice-tray card while the mode is active. The right column is the
 * fight's log (`getLogEntries`, already filtered by the host), given the width
 * its lines need. A visually hidden live region announces
 * each turn, and both the ribbon and the board are one tab stop each: arrow
 * keys move between the chips and between the cards.
 * @param {HTMLElement} container
 * @param {{
 *   getView: () => CombatView | null,
 *   isGM: () => boolean,
 *   onNext: () => void,
 *   onEnd: () => void,
 *   getInspectedId: () => string | null,
 *   onInspect: (id: string) => void,
 *   getSelectedTargetId: () => string | null,
 *   onSelectTarget: (id: string) => void,
 *   getActions: () => { weapons: (InventoryItem | EnemyWeapon)[], spells: Spell[] },
 *   onWeaponAttack: (weapon: InventoryItem | EnemyWeapon) => void,
 *   onCastSpell: (spell: Spell) => void,
 *   onApplyHP: (id: string, amount: number, isHeal: boolean) => void,
 *   getConcentration: (id: string) => { spellName: string } | null,
 *   onDropConcentration: (id: string) => void,
 *   getLogEntries: () => import('../types/log.js').LogEntry[],
 * }} callbacks
 * @returns {{ update: () => void, diceDock: HTMLElement }}
 */
export function mountCombatScreen(container, callbacks) {
  const active = el('aside', 'combat-screen__active');
  const board = el('div', 'combat-board');
  const ribbon = el('div', 'combat-ribbon');
  const logList = el('ul', 'combat-log__list travelog__list u-col u-g1');
  const logEmpty = el('p', 'u-muted', 'Nothing logged yet.');
  const diceDock = el('div', 'combat-screen__dice-dock');
  // The left rail: the active combatant over the borrowed dice tray, so the
  // numbers a turn needs and the dice it rolls sit under one hand.
  const left = el('div', 'combat-screen__left', active, diceDock);
  const side = el(
    'aside',
    'combat-screen__log',
    el('section', 'combat-log', el('h3', 'combat-board__heading', 'Combat log'), logEmpty, logList),
  );
  // Turn changes are spoken, not only ringed: polite, so a screen reader
  // finishes what it was saying first. Lives outside the cleared regions.
  const announcer = el('div', 'sr-only');
  announcer.setAttribute('aria-live', 'polite');
  const root = el(
    'div',
    'combat-screen__layout',
    ribbon,
    el('div', 'combat-screen__columns', left, board, side),
    announcer,
  );
  container.appendChild(root);

  // The damage/heal amount survives re-renders (every HP edit is one), so the
  // GM can land the same number on several combatants without retyping it.
  let hpAmount = 1;

  /** The last turn spoken, as `round:id`, so a refresh that moves nothing
   * (an HP edit, a condition tick) stays silent. */
  let announcedTurn = /** @type {string | null} */ (null);

  function render() {
    // A rebuild replaces whatever held focus, so note where the keyboard was
    // (a ribbon chip, a board card) and put it back on the matching element.
    const focused = /** @type {HTMLElement | null} */ (document.activeElement);
    const refocus =
      focused && root.contains(focused) && focused.dataset.combatantId
        ? {
            chip: focused.classList.contains('combat-ribbon__chip'),
            id: focused.dataset.combatantId,
          }
        : null;
    active.innerHTML = '';
    board.innerHTML = '';
    ribbon.innerHTML = '';
    const view = callbacks.getView();
    if (!view) {
      logList.innerHTML = '';
      announcedTurn = null;
      return;
    }
    const gm = callbacks.isGM();
    const viewer = { gm };
    renderRibbon(view, gm);
    renderActive(view, gm);
    const party = view.rows.filter((row) => row.side === 'party');
    const foes = view.rows.filter((row) => row.side === 'foe');
    const selectedId = callbacks.getSelectedTargetId();
    board.append(
      group('Party', party, viewer, selectedId),
      group('Foes', foes, viewer, selectedId),
    );
    roveGroup(board, '.combatant-card--selectable', selectedId);
    renderLog();
    announceTurn(view);
    if (refocus) {
      const scope = refocus.chip ? ribbon : board;
      /** @type {HTMLElement | null} */
      const again = scope.querySelector(`[data-combatant-id="${CSS.escape(refocus.id)}"]`);
      again?.focus();
    }
  }

  /** The fight's log entries, newest on top, rebuilt whole (a fight logs tens
   * of lines, nothing worth diffing). */
  function renderLog() {
    logList.innerHTML = '';
    const entries = callbacks.getLogEntries();
    for (const entry of entries) logList.prepend(entryItem(entry));
    logEmpty.hidden = entries.length > 0;
    logList.hidden = entries.length === 0;
  }

  /**
   * Speak the turn when it actually moved: round and name, keyed so HP edits
   * and other refreshes repeat nothing.
   * @param {CombatView} view
   */
  function announceTurn(view) {
    const row = view.rows[view.turnIndex];
    if (!row) return;
    const key = `${view.round}:${row.id}`;
    if (key === announcedTurn) return;
    announcedTurn = key;
    announcer.textContent = `Round ${view.round}: ${row.name ?? 'Unknown combatant'}'s turn.`;
  }

  /**
   * Make a set of buttons one tab stop: the anchor (or the first) holds
   * tabindex 0, the rest -1. Re-run per render, since the buttons are rebuilt;
   * the arrow-key movement is wired once at mount (`wireRoving`).
   * @param {HTMLElement} scope
   * @param {string} selector
   * @param {string | null} anchorId the combatant whose button starts focusable
   */
  function roveGroup(scope, selector, anchorId) {
    const buttons = /** @type {HTMLElement[]} */ ([...scope.querySelectorAll(selector)]);
    const anchor = buttons.findIndex((b) => b.dataset.combatantId === anchorId);
    buttons.forEach((b, i) => {
      b.tabIndex = i === (anchor === -1 ? 0 : anchor) ? 0 : -1;
    });
  }

  /**
   * The arrow-key half of the roving tab stop, attached once to a persistent
   * container: the buttons inside are queried per keypress, since every render
   * replaces them. Wraps at the ends.
   * @param {HTMLElement} scope
   * @param {string} selector
   */
  function wireRoving(scope, selector) {
    scope.addEventListener('keydown', (event) => {
      const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      const step = keys[/** @type {keyof typeof keys} */ (event.key)];
      if (!step) return;
      const buttons = /** @type {HTMLElement[]} */ ([...scope.querySelectorAll(selector)]);
      const from = buttons.indexOf(/** @type {HTMLElement} */ (event.target));
      if (from === -1) return;
      event.preventDefault();
      const to = buttons[(from + step + buttons.length) % buttons.length];
      buttons.forEach((b) => {
        b.tabIndex = b === to ? 0 : -1;
      });
      to.focus();
    });
  }
  wireRoving(ribbon, '.combat-ribbon__chip');
  wireRoving(board, '.combatant-card--selectable');

  /**
   * The turn ribbon, across the top of the screen: one chip per participant in
   * order, the current turn ringed and marked `aria-current`, with the round
   * counter and the GM's turn controls beside it.
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
      button.dataset.combatantId = row.id;
      button.addEventListener('click', () => {
        callbacks.onInspect(row.id);
        render();
      });
      chips.appendChild(button);
    });
    // One tab stop: the current turn's chip anchors it, arrows walk the rest.
    roveGroup(ribbon, '.combat-ribbon__chip', view.rows[view.turnIndex]?.id ?? null);
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

    // The action bar belongs to the turn, not the inspection: it shows only
    // while the column is on the current combatant and the viewer may act for
    // them, so inspecting a foe never offers its weapons to a player.
    if (current && row.mayAct) {
      const selected = view.rows.find((r) => r.id === callbacks.getSelectedTargetId());
      const bar = combatActionBar(callbacks.getActions(), {
        onWeaponAttack: callbacks.onWeaponAttack,
        onCastSpell: callbacks.onCastSpell,
      });
      if (bar) {
        if (selected && selected.id !== row.id) {
          active.appendChild(
            el(
              'div',
              'combat-screen__targeting',
              `Targeting ${selected.name ?? 'Unknown combatant'}`,
            ),
          );
        }
        active.appendChild(bar);
      }
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
   * @param {string | null} selectedId
   */
  function group(label, rows, viewer, selectedId) {
    return el(
      'section',
      'combat-board__group',
      el('h3', 'combat-board__heading', label),
      rows.length === 0
        ? el('p', 'combat-board__empty u-muted', 'Nobody on this side.')
        : el(
            'div',
            'combat-board__cards',
            ...rows.map((row) =>
              combatantCard(row, viewer, {
                selected: row.id === selectedId,
                onSelect: (id) => {
                  callbacks.onSelectTarget(id);
                  render();
                },
              }),
            ),
          ),
    );
  }

  render();
  return { update: render, diceDock };
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
