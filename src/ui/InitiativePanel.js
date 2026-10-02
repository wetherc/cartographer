import { currentParticipant } from '../combat/Initiative.js';
import { textButton } from './buttons.js';
import { el } from './dom.js';

/** @typedef {import('../types/combat.js').CombatState} CombatState */
/** @typedef {import('../types/combat.js').Participant} Participant */
/** @typedef {import('../types/combat.js').ParticipantView} ParticipantView */

/**
 * One line of status for a running fight: the round and whose turn it
 * is. The name resolves through `describe`, not the order, so a
 * mid-fight rename shows on the next render, and an id nothing holds any
 * more still reads as a turn.
 * @param {CombatState} state
 * @param {(participant: Participant) => ParticipantView | null} describe
 * @returns {string}
 */
export function initiativeStatus(state, describe) {
  const active = currentParticipant(state);
  const name = (active && describe(active)?.name) ?? 'Unknown combatant';
  return `Round ${state.round}, ${name}'s turn`;
}

/**
 * Mount the sidebar's combat card. The fight itself runs on the
 * full-width combat screen. This card is the pointer to it: the round
 * and whose turn it is, plus the button into combat mode. A tab sitting
 * in Play, for example a player display or the GM checking the map
 * mid-fight, can see a fight is on and jump to it. The card owns no
 * combat state. It reads through `getState` and stays empty while
 * nothing is running, since the container is hidden then anyway.
 * @param {HTMLElement} container
 * @param {{
 *   getState: () => CombatState | null,
 *   describe: (participant: Participant) => ParticipantView | null,
 *   onOpen: () => void,
 * }} callbacks
 * @returns {{ update: () => void }}
 */
export function mountInitiativePanel(container, callbacks) {
  const root = el('div', 'initiative-panel');
  container.appendChild(root);

  function render() {
    root.innerHTML = '';
    const state = callbacks.getState();
    if (!state) return;
    root.append(
      el('div', 'initiative-panel__status', initiativeStatus(state, callbacks.describe)),
      textButton('Open combat', callbacks.onOpen, { icon: 'sword', variant: 'primary' }),
    );
  }

  render();
  return { update: render };
}
