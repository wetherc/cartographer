import { currentParticipant } from '../combat/Initiative.js';
import { isGM } from '../view/ViewRole.js';
import { icon } from './icons.js';

/** @typedef {import('../types/combat.js').CombatState} CombatState */
/** @typedef {import('../types/combat.js').Participant} Participant */
/** @typedef {import('../types/view.js').ViewRole} ViewRole */

/**
 * Mount the initiative tracker for a running fight: the turn order with a
 * round counter and current-turn highlight, plus Next turn / End combat for
 * the GM. There is no setup state here — the GM opens combat through the
 * setup dialog (`ui/CombatSetup.js`), and the panel's container stays hidden
 * until a fight is actually running. The panel owns no combat state — it
 * reads it via `getState` and reports actions back.
 * @param {HTMLElement} container
 * @param {{
 *   getState: () => CombatState | null,
 *   onNext: () => void,
 *   onEnd: () => void,
 *   onEnemyRoll?: (participant: Participant) => void,
 *   getRole?: () => ViewRole,
 * }} callbacks
 * With `onEnemyRoll`, a GM viewer gets a dice button on the active row while a
 * foe holds the turn, to roll on that enemy's behalf (the app rolls the dice
 * tray's current selection and logs it under the enemy's name). Advancing and
 * ending combat are GM actions; a player viewer sees the order read-only.
 * @returns {{ update: () => void }}
 */
export function mountInitiativePanel(container, callbacks) {
  const root = document.createElement('div');
  root.className = 'initiative-panel';
  container.appendChild(root);

  function render() {
    root.innerHTML = '';
    const state = callbacks.getState();
    if (!state) return;
    const gm = !callbacks.getRole || isGM(callbacks.getRole());

    const header = document.createElement('div');
    header.className = 'initiative-panel__header';
    header.textContent = `Round ${state.round}`;
    root.appendChild(header);

    const active = currentParticipant(state);
    state.order.forEach((participant, i) => {
      const row = document.createElement('div');
      row.className = `initiative-panel__row initiative-panel__row--${participant.side}`;
      if (active && i === state.index) row.classList.add('initiative-panel__row--active');

      const name = document.createElement('span');
      name.className = 'initiative-panel__name';
      name.textContent = participant.name;

      const init = document.createElement('span');
      init.className = 'initiative-panel__init-readout';
      init.textContent = String(participant.initiative);

      row.append(name, init);

      // On a foe's turn the GM can roll the dice tray's selection as that
      // enemy, so the travelogue attributes the roll to it.
      if (gm && active && i === state.index && participant.side === 'foe' && callbacks.onEnemyRoll) {
        const rollBtn = document.createElement('button');
        rollBtn.type = 'button';
        rollBtn.className = 'btn btn--icon';
        rollBtn.setAttribute('aria-label', `Roll dice as ${participant.name}`);
        rollBtn.title = `Roll the dice tray's selection as ${participant.name}`;
        rollBtn.appendChild(icon('dice'));
        rollBtn.addEventListener('click', () => callbacks.onEnemyRoll?.(participant));
        row.appendChild(rollBtn);
      }
      root.appendChild(row);
    });

    // Turn flow is the GM's to drive; a player tab just watches the order.
    if (!gm) return;

    const actions = document.createElement('div');
    actions.className = 'initiative-panel__actions';

    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'btn btn--primary';
    next.append(icon('chevron'), document.createTextNode('Next turn'));
    next.addEventListener('click', () => {
      callbacks.onNext();
      render();
    });

    const end = document.createElement('button');
    end.type = 'button';
    end.className = 'btn';
    end.append(icon('flag'), document.createTextNode('End combat'));
    end.addEventListener('click', () => {
      callbacks.onEnd();
      render();
    });

    actions.append(next, end);
    root.appendChild(actions);
  }

  render();
  return { update: render };
}
