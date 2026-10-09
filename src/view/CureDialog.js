import { EXHAUSTION } from '../entities/HealCure.js';

/** @typedef {import('../types/modal.js').ModalField} ModalField */

/**
 * How the log and the dialog name what a heal ends. Exhaustion comes off one
 * level at a time, so it reads as a level.
 * @param {string} name
 * @returns {string}
 */
export function cureLabel(name) {
  return name === EXHAUSTION ? 'one level of exhaustion' : name;
}

/**
 * The dialog that asks which condition a heal ends, when the target has more
 * than one of the names the spell may end. The first choice is picked when
 * the dialog opens, and the answer comes back under `cure`.
 * @param {string} spellName
 * @param {string} targetName
 * @param {string[]} choices
 * @returns {{ title: string, fields: ModalField[], options: { submitLabel: string } }}
 */
export function cureDialog(spellName, targetName, choices) {
  return {
    title: `${spellName} on ${targetName}`,
    fields: [
      {
        name: 'cure',
        label: 'Condition to end',
        type: 'select',
        full: true,
        value: choices[0],
        options: choices.map((c) => ({ value: c, label: cureLabel(c) })),
      },
    ],
    options: { submitLabel: 'End it' },
  };
}
