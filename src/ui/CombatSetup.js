import { formatModifier } from '../entities/Modifiers.js';
import { textButton } from './buttons.js';
import { el } from './dom.js';
import { numberField } from './formFields.js';
import { openDialog } from './Modal.js';

/** @typedef {import('../types/combat.js').Participant} Participant */
/** @typedef {import('../types/combat.js').ParticipantView} ParticipantView */

/**
 * Show the combat setup dialog. It lists one row per potential combatant with
 * an editable initiative value. An optional Roll initiative button fills
 * every row from `rollInitiative` (a d20 roll plus DEX modifier in the app,
 * or an injected roll in tests). A Start combat button submits the form.
 * Rolled values stay editable, so the GM can override a result by hand
 * before starting.
 *
 * This is the GM's entry into combat. The initiative panel itself only shows
 * a running fight, so the caller must gate who can open this dialog. On
 * Start, this function resolves to the participants with their final
 * initiative values. On cancel, it resolves to null.
 *
 * As in the initiative panel, a row's name and side come from `describe`,
 * not from the participant, because the participant carries only the
 * numbers.
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
   * The setup rows show only a name and a side. The fallback for an
   * unresolvable id needs only those two fields.
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
            `initiative-panel__row u-row u-g2 initiative-panel__row--${view.side}`,
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

      // The submit button carries a value. This makes an Escape dismissal,
      // where returnValue stays empty, read as a cancel, not as starting the
      // fight.
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
