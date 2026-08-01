/**
 * The NPC's authoring fields, described once. The campaign dialog (`npcForm`)
 * and the NPC template form in the Library rail render this same list, one
 * through `promptModal` and one through `buildSpecForm`, and read it back
 * through `readNPCFields`. The dialog adds the placement fields; a template
 * holds no placement, because that belongs to a spawned NPC.
 */

import { ABILITY_SCORES } from '../entities/Character.js';
import { dispositionOptions } from '../entities/NPC.js';
import { casterFields, readCasterOptions } from './casterFields.js';
import { readStats, statFields } from './statFields.js';

/** @typedef {import('../types/modal.js').ModalField} ModalField */
/** @typedef {import('../types/npc.js').Disposition} Disposition */

/**
 * The seed an NPC form fills itself from: the NPC being edited, the template
 * being edited, the template a new NPC starts from, or null.
 * @typedef {{
 *   name?: string,
 *   role?: string,
 *   disposition?: Disposition,
 *   notes?: string,
 *   stats?: Record<string, number>,
 *   class?: string,
 *   casterLevel?: number,
 *   level?: number,
 *   spellbook?: import('../types/entities.js').Spellbook,
 * } | null} NPCSeed
 */

/**
 * The NPC fields: identity, disposition, notes, one number field per ability
 * score, and the optional caster section. The ability scores are real stats,
 * so an NPC's modifiers (initiative, and future checks) derive from them
 * rather than from a flat default. A caster class gives the NPC spell slots
 * and a spellbook, so it can cast in an encounter it joins.
 * @param {NPCSeed} seed
 * @returns {ModalField[]}
 */
export function npcFields(seed) {
  return [
    { name: 'name', label: 'Name', value: seed?.name ?? '', placeholder: 'NPC name' },
    {
      name: 'role',
      label: 'Role / faction',
      value: seed?.role ?? '',
      placeholder: 'Role / faction',
    },
    {
      name: 'disposition',
      label: 'Disposition',
      type: 'select',
      value: seed?.disposition ?? 'neutral',
      options: dispositionOptions(),
    },
    {
      name: 'notes',
      label: 'Notes',
      type: 'textarea',
      value: seed?.notes ?? '',
      rows: 3,
      full: true,
    },
    ...statFields(ABILITY_SCORES, seed?.stats ?? {}),
    ...casterFields(seed),
  ];
}

/**
 * Read the NPC fields back out of a submitted form. The caster keys are
 * present only for a caster class, so a plain NPC stores none of them.
 * @param {Record<string, string>} values
 * @returns {{
 *   name: string,
 *   role: string,
 *   disposition: Disposition,
 *   notes: string,
 *   stats: Record<string, number>,
 *   class?: string,
 *   casterLevel?: number,
 *   spellbook?: import('../types/entities.js').Spellbook,
 * }}
 */
export function readNPCFields(values) {
  return {
    name: values.name.trim(),
    role: values.role.trim(),
    disposition: /** @type {Disposition} */ (values.disposition),
    notes: values.notes.trim(),
    stats: readStats(ABILITY_SCORES, values),
    ...readCasterOptions(values),
  };
}
