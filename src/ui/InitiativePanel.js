import { currentParticipant } from '../combat/Initiative.js';
import { formatModifier } from '../entities/Modifiers.js';
import { icon } from './icons.js';

/** @typedef {import('../types/combat.js').Participant} Participant */
/** @typedef {import('../types/combat.js').CombatState} CombatState */

/**
 * Mount the initiative tracker. Two states: a setup list (one row per potential
 * combatant with an editable initiative value and a Start button) when no combat
 * is running, and the running order (round counter, current-turn highlight, Next
 * turn / End combat) once started. The panel owns no combat state — it reads it
 * via `getState`, the candidate roster via `getRoster`, and reports actions back.
 * @param {HTMLElement} container
 * With `rollInitiative`, the setup list gains a "Roll initiative" button that
 * fills every combatant's value from the callback (d20 + DEX modifier in the
 * app, an injected roll in tests); values stay editable, so a rolled result
 * can still be overridden by hand before Start.
 * @param {{
 *   getState: () => CombatState | null,
 *   getRoster: () => Participant[],
 *   onStart: (participants: Participant[]) => void,
 *   onNext: () => void,
 *   onEnd: () => void,
 *   rollInitiative?: (participant: Participant) => number,
 * }} callbacks
 * @returns {{ update: () => void }}
 */
export function mountInitiativePanel(container, callbacks) {
  const root = document.createElement('div');
  root.className = 'initiative-panel';
  container.appendChild(root);

  function renderSetup() {
    const roster = callbacks.getRoster();
    if (roster.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No combatants here to fight.';
      root.appendChild(empty);
      return;
    }

    /** @type {Map<string, HTMLInputElement>} */
    const inputs = new Map();
    for (const participant of roster) {
      const row = document.createElement('div');
      row.className = `initiative-panel__row initiative-panel__row--${participant.side}`;

      const name = document.createElement('span');
      name.className = 'initiative-panel__name';
      name.textContent = participant.name;

      const modifier = document.createElement('span');
      modifier.className = 'initiative-panel__modifier';
      modifier.textContent = formatModifier(participant.modifier ?? 0);
      modifier.title = 'DEX modifier, added to the initiative roll';

      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'field initiative-panel__init';
      input.value = String(participant.initiative);
      input.setAttribute('aria-label', `Initiative for ${participant.name}`);
      inputs.set(participant.id, input);

      row.append(name, modifier, input);
      root.appendChild(row);
    }

    const actions = document.createElement('div');
    actions.className = 'initiative-panel__actions';

    const rollInitiative = callbacks.rollInitiative;
    if (rollInitiative) {
      const rollAll = document.createElement('button');
      rollAll.type = 'button';
      rollAll.className = 'btn';
      rollAll.append(icon('dice'), document.createTextNode('Roll initiative'));
      rollAll.addEventListener('click', () => {
        for (const participant of roster) {
          const input = inputs.get(participant.id);
          if (input) input.value = String(rollInitiative(participant));
        }
      });
      actions.appendChild(rollAll);
    }

    const start = document.createElement('button');
    start.type = 'button';
    start.className = 'btn btn--primary initiative-panel__start';
    start.append(icon('sword'), document.createTextNode('Start combat'));
    start.addEventListener('click', () => {
      callbacks.onStart(
        roster.map((p) => ({ ...p, initiative: Number(inputs.get(p.id)?.value) || 0 })),
      );
      render();
    });
    actions.appendChild(start);
    root.appendChild(actions);
  }

  /** @param {CombatState} state */
  function renderActive(state) {
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
      root.appendChild(row);
    });

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

  function render() {
    root.innerHTML = '';
    const state = callbacks.getState();
    if (state) renderActive(state);
    else renderSetup();
  }

  render();
  return { update: render };
}
