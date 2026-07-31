import { el } from './dom.js';
import { combatantCard } from './CombatantCard.js';

/** @typedef {import('../combat/CombatView.js').CombatView} CombatView */

/**
 * The combat screen's board: the fight's participants as cards in two
 * labelled groups, Party and Foes, drawn from the view `buildCombatView`
 * assembles. The screen owns no combat state: `getView` hands it the
 * already-resolved view, or null when no fight is running, in which case the
 * board empties (the mode switch has hidden the screen by then anyway).
 *
 * This is the read-only heart of the screen; the turn ribbon, the active
 * combatant's column, and the action bar mount around it separately.
 * @param {HTMLElement} container
 * @param {{ getView: () => CombatView | null, isGM: () => boolean }} callbacks
 * @returns {{ update: () => void }}
 */
export function mountCombatScreen(container, callbacks) {
  const board = el('div', 'combat-board');
  container.appendChild(board);

  function render() {
    board.innerHTML = '';
    const view = callbacks.getView();
    if (!view) return;
    const viewer = { gm: callbacks.isGM() };
    const party = view.rows.filter((row) => row.side === 'party');
    const foes = view.rows.filter((row) => row.side === 'foe');
    board.append(group('Party', party, viewer), group('Foes', foes, viewer));
  }

  /**
   * @param {string} label
   * @param {import('../combat/CombatView.js').CombatantRow[]} rows
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
