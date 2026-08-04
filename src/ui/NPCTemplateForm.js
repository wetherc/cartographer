import { npcFields, readNPCFields } from '../app/npcFields.js';
import { refilterSpellsOnChange } from '../app/casterFields.js';
import { gearOptions } from '../app/gearFields.js';
import { buildSpecForm } from './SpecForm.js';

/** @typedef {import('../types/library.js').NPCTemplate} NPCTemplate */

/**
 * The NPC template create/edit form, inline in the Library rail like the item
 * and spell forms. It renders the NPC field spec, the same one the campaign
 * NPC dialog renders, minus the placement fields, which belong to a spawned
 * NPC and not to its template. Submit calls `onSubmit` with the assembled
 * template. An edit of a built-in default stores a custom override.
 * @param {{
 *   template?: NPCTemplate | null,
 *   submitLabel: string,
 *   onSubmit: (template: NPCTemplate) => void,
 *   onCancel?: (() => void) | null,
 * }} options
 * @returns {HTMLElement}
 */
export function buildNPCTemplateForm({ template = null, submitLabel, onSubmit, onCancel = null }) {
  // The gear pickers offer the merged library, plus a hand-tuned entry the
  // template already carries. This is the same list the encounter forms use.
  const gear = gearOptions(template);
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
