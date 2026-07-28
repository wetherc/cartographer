import { formatModifier } from '../entities/Modifiers.js';
import { textButton } from './buttons.js';
import { el } from './dom.js';
import { numberField } from './formFields.js';
import { openDialog } from './Modal.js';

/** @typedef {import('../types/combat.js').Participant} Participant */
/** @typedef {import('../types/combat.js').ParticipantView} ParticipantView */

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
 * Like the initiative panel, a row's name and side come from `describe`
 * rather than the participant, which carries only the numbers.
 * @param {Participant[]} roster
 * @param {{
 *   describe?: (participant: Participant) => ParticipantView | null,
 *   rollInitiative?: (participant: Participant) => number,
 *   onRolled?: (results: { name: string, value: number }[]) => void,
 * }} [callbacks]
 * @returns {Promise<Participant[] | null>}
 */
export function combatSetupModal(roster, callbacks = {}) {
  /** @type {Map<string, HTMLInputElement>} */
  const inputs = new Map();

  /**
   * The setup rows show a name and a side and nothing else, so the fallback for
   * an unresolvable id needs only those two fields.
   * @param {Participant} participant
   * @returns {Pick<ParticipantView, 'name' | 'side'>}
   */
  const describe = (participant) =>
    callbacks.describe?.(participant) ?? { name: 'Unknown combatant', side: 'party' };

  return openDialog({
    title: 'Set up combat',
    form: true,
    build: (close) => {
      /** @type {Node[]} */
      const body = [];
      for (const participant of roster) {
        const view = describe(participant);
        const modifier = el(
          'span',
          'initiative-panel__modifier u-muted',
          formatModifier(participant.modifier ?? 0),
        );
        modifier.title = 'DEX modifier, added to the initiative roll';

        const input = numberField(participant.initiative, {
          className: 'initiative-panel__init',
          ariaLabel: `Initiative for ${view.name}`,
        });
        inputs.set(participant.id, input);

        body.push(
          el(
            'div',
            `initiative-panel__row initiative-panel__row--${view.side}`,
            el('span', 'initiative-panel__name', view.name),
            modifier,
            input,
          ),
        );
      }

      /** @type {HTMLElement[]} */
      const actions = [];

      const rollInitiative = callbacks.rollInitiative;
      if (rollInitiative) {
        const rollAll = textButton(
          'Roll initiative',
          () => {
            /** @type {{ name: string, value: number }[]} */
            const results = [];
            for (const participant of roster) {
              const input = inputs.get(participant.id);
              if (!input) continue;
              const value = rollInitiative(participant);
              input.value = String(value);
              results.push({ name: describe(participant).name, value });
            }
            if (results.length > 0) callbacks.onRolled?.(results);
          },
          { icon: 'dice' },
        );
        actions.push(rollAll);
      }

      const cancel = textButton('Cancel', () => close('cancel'));

      // The submit button carries a value so an Escape dismissal (returnValue
      // stays empty) reads as a cancel rather than starting the fight.
      const start = textButton('Start combat', undefined, {
        icon: 'sword',
        variant: 'primary',
        type: 'submit',
        value: 'start',
      });

      actions.push(cancel, start);
      return { body, actions, initialFocus: start };
    },
    result: (returnValue) =>
      returnValue === 'start'
        ? roster.map((p) => ({ ...p, initiative: Number(inputs.get(p.id)?.value) || 0 }))
        : null,
  });
}
