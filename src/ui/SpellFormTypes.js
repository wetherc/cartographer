import { setTip } from './Tooltip.js';
import { el } from './dom.js';
import { labeled, fieldRow, checkbox, select } from './formFields.js';
import { CONCENTRATING, CONDITIONS } from '../entities/Conditions.js';
import { CREATURE_TYPES } from '../entities/CreatureType.js';
import { capitalize } from '../util/text.js';

/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/spell.js').SpellTypeRules} SpellTypeRules */

/**
 * The spell form's creature-type rules: the types a save or heal spell has
 * no effect on, the only types a save spell affects, the condition whose immunity passes a target over, and the
 * types that save at disadvantage or take the maximum damage. A heal shows
 * only the skipped types. `ui/SpellForm.js` places the rows, calls `sync`
 * when the effect kind changes, and reads the values back with `read`.
 * @param {Spell | null} spell the spell being edited, or null for a new one
 */
export function buildTypeControls(spell) {
  const effect = spell?.effect;
  /** @type {SpellTypeRules} */
  const rules = effect && 'typeRules' in effect ? (effect.typeRules ?? {}) : {};

  /**
   * One checkbox per creature type, ticked for the stored list.
   * @param {string[] | undefined} stored
   */
  const boxes = (stored) =>
    CREATURE_TYPES.map((t) => checkbox(capitalize(t), !!stored?.includes(t)));
  const skip = boxes(rules.skip);
  const only = boxes(rules.only);
  const disadvantage = boxes(rules.disadvantage);
  const maxDamage = boxes(rules.maxDamage);
  /** @param {string} caption @param {ReturnType<typeof boxes>} list @param {string} tip */
  const group = (caption, list, tip) => {
    const field = labeled(caption, el('div', 'u-row u-wrap u-g2', ...list.map((b) => b.label)));
    setTip(field, tip);
    return field;
  };

  const storedImmune = rules.skipImmuneTo?.[0] ?? '';
  const moreImmune = rules.skipImmuneTo?.slice(1) ?? [];
  const immune = select(
    [{ value: '', label: 'None' }, ...CONDITIONS.filter((c) => c !== CONCENTRATING)],
    storedImmune,
  );
  const immuneField = labeled('No effect if immune to', immune);
  setTip(immuneField, 'Sleep passes over a creature immune to being charmed');

  const rows = {
    skip: fieldRow(
      group(
        'No effect on',
        skip,
        'Sleep passes over undead. A heal passes over undead and constructs',
      ),
    ),
    only: fieldRow(
      group('Only affects', only, 'Hold Person and Charm Person affect only humanoids'),
    ),
    immune: fieldRow(immuneField),
    disadvantage: fieldRow(
      group(
        'Save at disadvantage',
        disadvantage,
        'Sunburst: undead and oozes save at disadvantage',
      ),
    ),
    maxDamage: fieldRow(
      group('Maximum damage', maxDamage, 'Blight: plants take the maximum damage'),
    ),
  };

  /** @param {string} kind */
  function sync(kind) {
    const saves = kind === 'save';
    rows.skip.hidden = !saves && kind !== 'heal';
    rows.only.hidden = !saves;
    rows.immune.hidden = !saves;
    rows.disadvantage.hidden = !saves;
    rows.maxDamage.hidden = !saves;
  }

  /** @param {ReturnType<typeof boxes>} list */
  const ticked = (list) => CREATURE_TYPES.filter((_, i) => list[i].input.checked);

  /** The control values, for `SpellDraft.assembleSpell`. */
  function read() {
    return {
      typeRules: {
        skip: ticked(skip),
        only: ticked(only),
        skipImmuneTo: [...(immune.value ? [immune.value] : []), ...moreImmune],
        disadvantage: ticked(disadvantage),
        maxDamage: ticked(maxDamage),
      },
    };
  }

  return { rows, sync, read };
}
