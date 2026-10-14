import { setTip } from './Tooltip.js';
import { labeled, fieldRow, textField } from './formFields.js';

/** @typedef {import('../types/spell.js').Spell} Spell */

/**
 * The spell form's controls for a heal that ends conditions: the chips it
 * always ends (Heal), and the chips of which it ends one (Lesser
 * Restoration). Each field takes chip names separated by commas.
 * `ui/SpellForm.js` places the row, calls `sync` when the effect kind
 * changes, and reads the values back with `read`. `entities/HealCure.js`
 * cleans the names.
 * @param {Spell | null} spell the spell being edited, or null for a new one
 */
export function buildCureControls(spell) {
  const heal = spell?.effect.kind === 'heal' ? spell.effect : null;
  const removes = textField((heal?.removes ?? []).join(', '), { placeholder: 'Blinded, Deafened' });
  setTip(removes, 'The chips this heal ends on each target. Exhaustion ends one level');
  const oneOf = textField((heal?.removesOneOf ?? []).join(', '), {
    placeholder: 'Blinded, Poisoned',
  });
  setTip(oneOf, 'The chips of which this heal ends one. The caster picks when two apply');
  const row = fieldRow(labeled('Ends', removes), labeled('Ends one of', oneOf));

  /** @param {string} kind */
  function sync(kind) {
    row.hidden = kind !== 'heal';
  }

  /** The control values, for `SpellDraft.assembleSpell`. */
  function read() {
    return { removes: removes.value, removesOneOf: oneOf.value };
  }

  return { row, sync, read };
}
