import { dispositionOptions } from '../entities/NPC.js';
import { ABILITY_SCORES } from '../entities/Character.js';
import {
  labeled,
  fieldRow,
  textField,
  textareaField,
  select,
  statInputRows,
  formActions,
} from './formFields.js';

/** @typedef {import('../types/library.js').NPCTemplate} NPCTemplate */

/**
 * The NPC template create/edit form, inline in the Library rail like the item
 * and spell forms: the NPC's fields minus placement, which belongs to a
 * spawned NPC rather than its blueprint. Submitting calls `onSubmit` with the
 * assembled template; editing a built-in default stores a custom override.
 * @param {{
 *   template?: NPCTemplate | null,
 *   submitLabel: string,
 *   onSubmit: (template: NPCTemplate) => void,
 *   onCancel?: (() => void) | null,
 * }} options
 * @returns {HTMLElement}
 */
export function buildNPCTemplateForm({ template = null, submitLabel, onSubmit, onCancel = null }) {
  const form = document.createElement('div');
  form.className = 'inventory-panel__form';

  const nameInput = textField(template?.name ?? '', 'NPC name');
  nameInput.classList.add('inventory-panel__name-input');

  const roleInput = textField(template?.role ?? '', 'Role / faction');
  const dispositionSelect = select(dispositionOptions(), template?.disposition ?? 'neutral');
  const notesInput = textareaField(template?.notes ?? '', { placeholder: 'Notes', rows: 3 });

  // One number field per ability score, so an NPC's modifiers derive from real
  // stats rather than a flat default.
  const statBlock = statInputRows(ABILITY_SCORES, template?.stats ?? {});

  const actionsRow = formActions({
    submitLabel,
    onSubmit: () => {
      const name = nameInput.value.trim();
      if (!name) return;
      onSubmit({
        name,
        role: roleInput.value.trim(),
        disposition: /** @type {import('../types/npc.js').Disposition} */ (dispositionSelect.value),
        notes: notesInput.value.trim(),
        stats: statBlock.read(),
      });
    },
    onCancel,
  });

  form.append(
    nameInput,
    fieldRow(labeled('Role / faction', roleInput), labeled('Disposition', dispositionSelect)),
    labeled('Notes', notesInput),
    ...statBlock.rows,
    actionsRow,
  );

  return form;
}
