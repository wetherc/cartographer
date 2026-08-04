/**
 * The NPC's authoring fields, described once. The campaign dialog (`npcForm`)
 * and the NPC template form in the Library rail render this same list, one
 * through `promptModal` and one through `buildSpecForm`, and read it back
 * through `readNPCFields`. The dialog adds the placement fields; a template
 * holds no placement, because that belongs to a spawned NPC.
 */

import { normalizeStatBlock, STAT_KEYS } from '../entities/Modifiers.js';
import { DEFAULT_CREATURE_HP, dispositionOptions } from '../entities/Creature.js';
import { clampInt } from '../util/num.js';
import { casterFields, readCasterOptions } from './casterFields.js';
import { readGear } from './gearFields.js';
import { readStats, statFields } from './statFields.js';

/** @typedef {import('../types/modal.js').ModalField} ModalField */
/** @typedef {import('../types/creature.js').Disposition} Disposition */
/** @typedef {import('./gearFields.js').GearOptions} GearOptions */

/**
 * The seed an NPC form fills itself from: the NPC being edited, the template
 * being edited, the template a new NPC starts from, or null.
 * @typedef {{
 *   name?: string,
 *   role?: string,
 *   disposition?: Disposition,
 *   notes?: string,
 *   stats?: Record<string, number>,
 *   maxHP?: number,
 *   weapon?: import('../types/entities.js').EnemyWeapon | null,
 *   armor?: import('../types/entities.js').EnemyArmor | null,
 *   class?: string,
 *   casterLevel?: number,
 *   level?: number,
 *   spellbook?: import('../types/entities.js').Spellbook,
 * } | null} NPCSeed
 */

/**
 * The NPC fields: identity, disposition, notes, hit points, gear, one number
 * field per stat, and the optional caster section. The stats are real stats,
 * so an NPC's modifiers (initiative, and future checks) derive from them
 * rather than from a flat default. The last stat is AC, which the block
 * derives from DEX until the GM types a number over it. A caster class gives
 * the NPC spell slots and a spellbook, so it can cast in an encounter it
 * joins.
 *
 * An NPC has no level and no tier, so it gets no default loadout the way a
 * foe does. A new NPC starts unarmed and unarmored, and the GM arms the ones
 * that need arming.
 * @param {NPCSeed} seed
 * @param {GearOptions} gear the merged weapon and armor choices
 * @returns {ModalField[]}
 */
export function npcFields(seed, gear) {
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
    {
      name: 'maxHP',
      label: 'Max HP',
      type: 'number',
      value: seed?.maxHP ?? DEFAULT_CREATURE_HP,
      min: 1,
    },
    {
      name: 'weapon',
      label: 'Weapon',
      type: 'select',
      newRow: true,
      value: gear.currentWeapon?.name ?? '',
      options: gear.weaponOptions,
    },
    {
      name: 'armor',
      label: 'Armor',
      type: 'select',
      value: gear.currentArmor?.name ?? '',
      options: gear.armorOptions,
    },
    ...statFields(STAT_KEYS, normalizeStatBlock(seed?.stats ?? {})),
    ...casterFields(seed),
  ];
}

/**
 * Read the NPC fields back out of a submitted form. The caster keys are
 * present only for a caster class, so a plain NPC stores none of them. The
 * gear cascade is the one the encounter form uses, with no fallback: an NPC
 * has no tier-default loadout, so an empty picker means unarmed.
 * @param {Record<string, string>} values
 * @param {GearOptions} gear the same options the fields were built from
 * @returns {{
 *   name: string,
 *   role: string,
 *   disposition: Disposition,
 *   notes: string,
 *   stats: Record<string, number>,
 *   maxHP: number,
 *   weapon: import('../types/entities.js').EnemyWeapon | null,
 *   armor: import('../types/entities.js').EnemyArmor | null,
 *   class?: string,
 *   casterLevel?: number,
 *   spellbook?: import('../types/entities.js').Spellbook,
 * }}
 */
export function readNPCFields(values, gear) {
  return {
    name: values.name.trim(),
    role: values.role.trim(),
    disposition: /** @type {Disposition} */ (values.disposition),
    notes: values.notes.trim(),
    stats: readStats(STAT_KEYS, values),
    maxHP: clampInt(values.maxHP, 1, Infinity, DEFAULT_CREATURE_HP),
    ...readGear(values.weapon, values.armor, gear),
    ...readCasterOptions(values),
  };
}
