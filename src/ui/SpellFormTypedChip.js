import { setTip } from './Tooltip.js';
import { el } from './dom.js';
import { labeled, fieldRow, checkbox, select, textField } from './formFields.js';
import { CREATURE_TYPES } from '../entities/CreatureType.js';
import { CHIP_UNTILS, UNTIL_LABELS } from '../entities/SpellFields.js';
import { capitalize } from '../util/text.js';
import { buildChipModControls } from './SpellFormChipMods.js';

/** @typedef {import('../types/spell.js').SpellOnHitTyped} SpellOnHitTyped */

/**
 * The spell form's controls for the second chip that an attack spell's hit
 * leaves only on a target of some creature types, as Chill Touch does on an
 * undead target. The rows name the types, the chip, the turn boundary that
 * ends it, and its mods: the slant and resist rows of any chip, and the boxes
 * for stopped healing and for disadvantage on attacks against the caster.
 * `ui/SpellFormOnHit.js` places the rows and reads the values back with
 * `read`. `entities/SpellFields.js` drops a chip with no name or no type.
 * @param {SpellOnHitTyped | null} stored the typed chip of the spell being
 *   edited, or null for none
 */
export function buildTypedChipControls(stored) {
  const mods = stored?.mods ?? {};
  const adds = checkbox('Extra chip on some creature types', !!stored);
  setTip(adds.label, 'Chill Touch: an undead target also attacks the caster at disadvantage');
  const typeBoxes = CREATURE_TYPES.map((t) => checkbox(capitalize(t), !!stored?.types.includes(t)));
  const typesField = labeled(
    'Extra chip on',
    el('div', 'u-row u-wrap u-g2', ...typeBoxes.map((b) => b.label)),
  );
  setTip(typesField, 'Only a target of a ticked type takes the extra chip');
  const name = textField(stored?.condition ?? '', { placeholder: 'Chill Touch (undead)' });
  const nameField = labeled('Extra chip name', name);
  setTip(nameField, 'The extra chip needs a name and at least one ticked type');
  const until = select(
    [
      { value: '', label: 'Spell duration' },
      ...CHIP_UNTILS.map((value) => ({ value, label: capitalize(UNTIL_LABELS[value]) })),
    ],
    stored?.until ?? '',
  );
  const noHealing = checkbox('Stops healing', mods.noHealing === true);
  setTip(noHealing.label, 'The holder regains no hit points while the extra chip lasts');
  const vsSource = checkbox(
    'Attacks the caster at disadvantage',
    mods.disadvantageVsSource === true,
  );
  setTip(
    vsSource.label,
    "The holder's attacks against the caster roll at disadvantage, as with Chill Touch on undead",
  );
  const chip = buildChipModControls(mods);

  // The detail rows sit in one indented group, so their slant and resist
  // rows do not read as a second copy of the hit condition's rows above.
  const rows = {
    adds: fieldRow(adds.label),
    detail: el(
      'div',
      'form__nested u-col u-g2',
      fieldRow(typesField),
      fieldRow(nameField, labeled('Extra chip ends at', until)),
      fieldRow(noHealing.label, vsSource.label),
      chip.rows.slants,
      chip.rows.resist,
    ),
  };

  /**
   * Show the box while the hit condition rows show, and the detail group
   * only once the box is ticked.
   * @param {boolean} shown whether the hit condition rows show
   */
  function sync(shown) {
    rows.adds.hidden = !shown;
    rows.detail.hidden = !shown || !adds.input.checked;
  }

  /** @param {() => void} onChange */
  function listen(onChange) {
    adds.input.addEventListener('change', onChange);
  }

  /** The control values, or null when the box is clear. */
  function read() {
    if (!adds.input.checked) return null;
    return {
      types: CREATURE_TYPES.filter((_, i) => typeBoxes[i].input.checked),
      condition: name.value,
      until: until.value,
      mods: {
        ...chip.read(),
        noHealing: noHealing.input.checked,
        disadvantageVsSource: vsSource.input.checked,
      },
    };
  }

  return { rows, sync, listen, read };
}
