import { dispositionOptions } from '../entities/NPC.js';
import { ABILITY_SCORES } from '../entities/Character.js';
import {
  labeled,
  fieldRow,
  textField,
  textareaField,
  select,
  statInputRows,
  buildInlineForm,
} from './formFields.js';

/** @typedef {import('../types/library.js').NPCTemplate} NPCTemplate */

/**
 * The NPC template create/edit form, inline in the Library rail like the item
 * and spell forms. The form holds the NPC's fields minus placement, which
 * belongs to a spawned NPC, not to its template. Submit calls `onSubmit` with
 * the assembled template. An edit of a built-in default stores a custom
 * override.
 * @param {{
 *   template?: NPCTemplate | null,
 *   submitLabel: string,
 *   onSubmit: (template: NPCTemplate) => void,
 *   onCancel?: (() => void) | null,
 * }} options
 * @returns {HTMLElement}
 */
export function buildNPCTemplateForm({ template = null, submitLabel, onSubmit, onCancel = null }) {
  const nameInput = textField(template?.name ?? '', 'NPC name');

  const roleInput = textField(template?.role ?? '', 'Role / faction');
  const dispositionSelect = select(dispositionOptions(), template?.disposition ?? 'neutral');
  const notesInput = textareaField(template?.notes ?? '', { placeholder: 'Notes', rows: 3 });

  // One number field per ability score. An NPC's modifiers derive from these
  // real stats, not from a flat default.
  const statBlock = statInputRows(ABILITY_SCORES, template?.stats ?? {});

  return buildInlineForm({
    nameInput,
    rows: [
      fieldRow(labeled('Role / faction', roleInput), labeled('Disposition', dispositionSelect)),
      labeled('Notes', notesInput),
      ...statBlock.rows,
    ],
    assemble: () => ({
      name: nameInput.value.trim(),
      role: roleInput.value.trim(),
      disposition: /** @type {import('../types/npc.js').Disposition} */ (dispositionSelect.value),
      notes: notesInput.value.trim(),
      stats: statBlock.read(),
    }),
    submitLabel,
    onSubmit,
    onCancel,
  });
}
