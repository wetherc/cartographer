/**
 * The roll mode control of the weapon attack dialog and the spell cast
 * dialog. Both dialogs offer the same four choices with the same meaning.
 * Auto folds in every slant that conditions and other rules give the roll.
 * Normal, Advantage, and Disadvantage replace those slants for this roll.
 */

/** The mode options, in the order they read best. */
export const ROLL_MODE_OPTIONS = Object.freeze([
  { value: 'auto', label: 'Auto (from conditions)' },
  { value: 'normal', label: 'Normal' },
  { value: 'advantage', label: 'Advantage' },
  { value: 'disadvantage', label: 'Disadvantage' },
]);

/**
 * A select field for the roll mode. It starts on Auto.
 * @param {{ name: string, label: string, full?: boolean }} spec
 * @returns {import('../types/modal.js').ModalField}
 */
export function rollModeField({ name, label, full }) {
  return {
    name,
    label,
    type: 'select',
    value: 'auto',
    options: ROLL_MODE_OPTIONS.map((o) => ({ ...o })),
    ...(full ? { full: true } : {}),
  };
}

/**
 * The mode the GM picked in the dialog, or null under Auto. A missing or
 * unknown value counts as Auto.
 * @param {unknown} value
 * @returns {import('../types/dice.js').RollMode | null}
 */
export function pickedRollMode(value) {
  return value === 'normal' || value === 'advantage' || value === 'disadvantage' ? value : null;
}
