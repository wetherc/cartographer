import { formatModifier } from '../entities/Modifiers.js';
import { icon } from './icons.js';

/** @typedef {import('../types/combat.js').Participant} Participant */

/**
 * Show the combat setup dialog: one row per potential combatant with an
 * editable initiative value, an optional "Roll initiative" button that fills
 * every row from `rollInitiative` (d20 + DEX modifier in the app, an injected
 * roll in tests), and a Start combat submit. Rolled values stay editable, so a
 * result can still be overridden by hand before starting.
 *
 * This is the GM's entry into combat — the initiative panel itself only shows
 * a running fight — so the caller gates who can open it. Resolves to the
 * participants with their final initiative values on Start, or null if
 * cancelled.
 * @param {Participant[]} roster
 * @param {{
 *   rollInitiative?: (participant: Participant) => number,
 *   onRolled?: (results: { name: string, value: number }[]) => void,
 * }} [callbacks]
 * @returns {Promise<Participant[] | null>}
 */
export function combatSetupModal(roster, callbacks = {}) {
  return new Promise((resolve) => {
    const opener = /** @type {HTMLElement | null} */ (document.activeElement);
    const dialog = document.createElement('dialog');
    dialog.className = 'modal';

    const form = document.createElement('form');
    form.method = 'dialog';
    form.className = 'modal__form';

    const heading = document.createElement('h2');
    heading.className = 'modal__title';
    heading.textContent = 'Set up combat';
    form.appendChild(heading);

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
      form.appendChild(row);
    }

    const actions = document.createElement('div');
    actions.className = 'modal__actions';

    const rollInitiative = callbacks.rollInitiative;
    if (rollInitiative) {
      const rollAll = document.createElement('button');
      rollAll.type = 'button';
      rollAll.className = 'btn';
      rollAll.append(icon('dice'), document.createTextNode('Roll initiative'));
      rollAll.addEventListener('click', () => {
        /** @type {{ name: string, value: number }[]} */
        const results = [];
        for (const participant of roster) {
          const input = inputs.get(participant.id);
          if (!input) continue;
          const value = rollInitiative(participant);
          input.value = String(value);
          results.push({ name: participant.name, value });
        }
        if (results.length > 0) callbacks.onRolled?.(results);
      });
      actions.appendChild(rollAll);
    }

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => dialog.close('cancel'));

    // The submit button carries a value so an Escape dismissal (returnValue
    // stays empty) reads as a cancel rather than starting the fight.
    const start = document.createElement('button');
    start.type = 'submit';
    start.value = 'start';
    start.className = 'btn btn--primary';
    start.append(icon('sword'), document.createTextNode('Start combat'));

    actions.append(cancel, start);
    form.appendChild(actions);
    dialog.appendChild(form);
    document.body.appendChild(dialog);

    dialog.addEventListener('close', () => {
      const result =
        dialog.returnValue === 'start'
          ? roster.map((p) => ({ ...p, initiative: Number(inputs.get(p.id)?.value) || 0 }))
          : null;
      dialog.remove();
      opener?.focus?.();
      resolve(result);
    });

    dialog.showModal();
    start.focus();
  });
}
