import { creatureFields, creatureFieldsChange, readCreatureFields } from '../app/creatureFields.js';
import { gearOptions } from '../app/gearFields.js';
import { buildSpecForm } from './SpecForm.js';

/** @typedef {import('../types/creature.js').CreatureTemplate} CreatureTemplate */

/**
 * The creature template create or edit form, inline in the Library rail like
 * the item and spell forms. A template holds a blueprint, not a position or
 * a live HP total, so the placement fields stay out.
 *
 * The form renders the one creature authoring spec. The campaign dialog
 * renders the same spec, so this form and the dialog cannot drift apart. A
 * new template on the Foes subtab seeds as a level-1 hostile, and one on the
 * People subtab seeds as an unleveled neutral, but the disposition select
 * can take either anywhere.
 *
 * Submit calls `onSubmit` with the assembled template minus its id. The
 * caller owns identity and the merge key. An edit of a built-in default
 * stores a custom override.
 * @param {{
 *   template?: CreatureTemplate | null,
 *   hostile: boolean,
 *   submitLabel: string,
 *   onSubmit: (fields: Omit<CreatureTemplate, 'id'>) => void,
 *   onCancel?: (() => void) | null,
 * }} options
 * @returns {HTMLElement}
 */
export function buildCreatureTemplateForm({
  template = null,
  hostile,
  submitLabel,
  onSubmit,
  onCancel = null,
}) {
  // The gear pickers offer the merged library, plus a hand-tuned entry the
  // template already carries. This is the same list the campaign dialog uses.
  const gear = gearOptions(template);
  /** @type {import('../app/creatureFields.js').CreatureSeed} */
  const seed =
    template ?? (hostile ? { disposition: 'hostile', level: 1 } : { disposition: 'neutral' });
  return buildSpecForm({
    fields: creatureFields(seed, gear),
    // A new template re-stamps the stat defaults as level or tier change,
    // until a stat is hand-edited. An edit keeps the stored block.
    onChange: creatureFieldsChange({ restampStats: !template }),
    assemble: (values) => {
      // The read-back types `stats` optional, because a surface can leave
      // the block out. This form always shows it.
      const { stats, ...fields } = readCreatureFields(values, gear);
      return { ...fields, stats: stats ?? {} };
    },
    submitLabel,
    onSubmit,
    onCancel,
  });
}
