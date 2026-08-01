import { npcFields, readNPCFields } from '../app/npcFields.js';
import { refilterSpellsOnChange } from '../app/casterFields.js';
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
  return buildSpecForm({
    fields: npcFields(template),
    // Refilter the spell picker for the chosen caster class and level.
    onChange: refilterSpellsOnChange,
    assemble: (values) => readNPCFields(values),
    submitLabel,
    onSubmit,
    onCancel,
  });
}
