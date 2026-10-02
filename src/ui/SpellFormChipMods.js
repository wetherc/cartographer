import { setTip } from './Tooltip.js';
import { labeled, fieldRow, checkbox, textField } from './formFields.js';
import { buildSlantControls } from './SpellFormSlants.js';

/** @typedef {import('../types/entities.js').ChipMods} ChipMods */

/**
 * The spell form's controls for the damage types a chip resists: a list of
 * types split by commas (a chip that resists fire), and a box for
 * bludgeoning, piercing, and slashing from nonmagical weapons (Stoneskin).
 * `entities/ChipMods.js` drops a name that is not a damage type.
 * @param {ChipMods} mods the stored mods of the chip being edited
 */
export function buildResistControls(mods) {
  const resist = textField((mods.resist ?? []).join(', '), { placeholder: 'none' });
  const resistField = labeled('Resists', resist);
  setTip(resistField, 'Damage types, split by commas, that the holder resists');
  const nonmagical = checkbox('Nonmagical weapons', !!mods.resistNonmagical);
  setTip(
    nonmagical.label,
    'The holder resists bludgeoning, piercing, and slashing from a nonmagical weapon, as with Stoneskin',
  );
  const row = fieldRow(resistField, labeled('Weapons', nonmagical.label));

  /** The control values, in the fields of `ChipMods`. */
  function read() {
    return { resist: resist.value.split(','), resistNonmagical: nonmagical.input.checked };
  }

  return { row, read };
}

/**
 * The slant and resist rows for the chip that a save or a hit leaves
 * (Vicious Mockery, Guiding Bolt). The chip's other stored mods, which these
 * rows do not show, stay as stored, so an edit keeps them.
 * @param {ChipMods} mods the stored mods of the chip being edited
 */
export function buildChipModControls(mods) {
  const slants = buildSlantControls(mods);
  const resist = buildResistControls(mods);

  /** The stored mods with the control values over them. */
  function read() {
    return { ...mods, ...slants.read(), ...resist.read() };
  }

  return { rows: { slants: slants.row, resist: resist.row }, read };
}
