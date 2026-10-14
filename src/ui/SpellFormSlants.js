import { setTip } from './Tooltip.js';
import { labeled, fieldRow, checkbox, select, textField } from './formFields.js';

/** @typedef {import('../types/entities.js').ChipMods} ChipMods */

/** The choices of both slant selects. */
const SLANTS = [
  { value: '', label: 'None' },
  { value: 'advantage', label: 'Advantage' },
  { value: 'disadvantage', label: 'Disadvantage' },
];

/**
 * The spell form's controls for how a chip slants attack rolls: the slant on
 * the holder's own attacks (Vicious Mockery), the slant on attacks against
 * the holder (Faerie Fire, Blur), the creature types that the second slant
 * is limited to (Protection from Evil and Good), and whether the chip ends
 * after one attack roll (Guiding Bolt). `entities/ChipMods.js` decides what
 * the values mean and drops what they leave empty.
 * @param {ChipMods} mods the stored mods of the spell being edited
 */
export function buildSlantControls(mods) {
  const attacks = select(SLANTS, mods.attacks ?? '');
  const against = select(SLANTS, mods.attacksAgainst ?? '');
  const types = textField((mods.attackerTypes ?? []).join(', '), {
    placeholder: 'every attacker',
  });
  const once = checkbox('One attack only', !!mods.once);
  const attacksField = labeled('Holder attacks', attacks);
  setTip(attacksField, "A slant on the holder's own attack rolls, as with Vicious Mockery");
  const againstField = labeled('Attacks against', against);
  setTip(againstField, 'A slant on attack rolls against the holder, as with Faerie Fire and Blur');
  const typesField = labeled('Only by types', types);
  setTip(
    typesField,
    'Creature types, split by commas, whose attacks against the holder take the slant, as with Protection from Evil and Good',
  );
  setTip(once.label, 'The chip ends after the first attack roll it slants, as with Guiding Bolt');
  const row = fieldRow(attacksField, againstField, typesField, labeled('Ends', once.label));

  /** The control values, in the fields of `ChipMods`. */
  function read() {
    return {
      attacks: attacks.value,
      attacksAgainst: against.value,
      attackerTypes: types.value.split(','),
      once: once.input.checked,
    };
  }

  return { row, read };
}
