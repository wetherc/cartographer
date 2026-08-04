import {
  encounterFields,
  encounterFieldsChange,
  readEncounterFields,
} from '../app/encounterFields.js';
import { npcFields, readNPCFields } from '../app/npcFields.js';
import { refilterSpellsOnChange } from '../app/casterFields.js';
import { gearOptions } from '../app/gearFields.js';
import { buildSpecForm } from './SpecForm.js';

/** @typedef {import('../types/creature.js').CreatureTemplate} CreatureTemplate */

/**
 * The creature template create or edit form, inline in the Library rail like
 * the item and spell forms. A template holds a blueprint, not a position or
 * a live HP total, so the placement fields stay out.
 *
 * The form renders one of the two authoring field specs. A hostile template
 * gets the foe spec, with level, tier, and the stat re-stamping that comes
 * with it. Every other template gets the people spec, with role, notes, and
 * a disposition select. The campaign dialogs render these same specs, so
 * this form and the dialogs cannot drift apart.
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
  // template already carries. This is the same list the campaign dialogs use.
  const gear = gearOptions(template);
  if (hostile) {
    return buildSpecForm({
      fields: encounterFields(template, gear),
      // A new template re-stamps the stat defaults as level or tier change,
      // until a stat is hand-edited. An edit keeps the stored block.
      onChange: encounterFieldsChange({ restampStats: !template }),
      // The foe spec carries no disposition field, so the stored value is
      // stamped here.
      assemble: (values) => {
        // The read-back types `stats` optional, because a surface can leave
        // the block out. This form always shows it.
        const { stats, ...fields } = readEncounterFields(values, gear);
        return {
          ...fields,
          stats: stats ?? {},
          disposition: /** @type {'hostile'} */ ('hostile'),
        };
      },
      submitLabel,
      onSubmit,
      onCancel,
    });
  }
  return buildSpecForm({
    fields: npcFields(template, gear),
    // Refilter the spell picker for the chosen caster class and level.
    onChange: refilterSpellsOnChange,
    assemble: (values) => readNPCFields(values, gear),
    submitLabel,
    onSubmit,
    onCancel,
  });
}
