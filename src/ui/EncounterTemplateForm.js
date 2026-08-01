import {
  encounterFields,
  encounterFieldsChange,
  readEncounterFields,
} from '../app/encounterFields.js';
import { gearOptions } from '../app/gearFields.js';
import { buildSpecForm } from './SpecForm.js';

/** @typedef {import('../types/entities.js').EncounterTemplate} EncounterTemplate */

/**
 * The bestiary template create or edit form, inline in the Library rail like
 * the item and spell forms. It renders the encounter field spec, the same one
 * the campaign encounter dialog renders, minus the placement fields: a
 * template holds a blueprint, not a position or a live HP total. The stat
 * re-stamping and the spell refilter come with the spec, so this form and the
 * dialog cannot drift apart. Submitting calls `onSubmit` with the assembled
 * template minus its id. The caller owns identity and the merge key. Editing a
 * built-in default stores a custom override.
 * @param {{
 *   template?: EncounterTemplate | null,
 *   submitLabel: string,
 *   onSubmit: (fields: Omit<EncounterTemplate, 'id'>) => void,
 *   onCancel?: (() => void) | null,
 * }} options
 * @returns {HTMLElement}
 */
export function buildEncounterTemplateForm({
  template = null,
  submitLabel,
  onSubmit,
  onCancel = null,
}) {
  const gear = gearOptions(template);
  return buildSpecForm({
    fields: encounterFields(template, gear),
    // A new template re-stamps the stat defaults as level or tier change,
    // until a stat is hand-edited. An edit keeps the stored block.
    onChange: encounterFieldsChange({ restampStats: !template }),
    assemble: (values) =>
      /** @type {Omit<EncounterTemplate, 'id'>} */ (readEncounterFields(values, gear)),
    submitLabel,
    onSubmit,
    onCancel,
  });
}
