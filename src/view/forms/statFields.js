/**
 * The stat-block field group shared by the authoring surfaces. The creature
 * dialog and the template form both render STAT_KEYS (abilities plus AC).
 * Both use the same `stat-<KEY>` naming and the same clamped read-back, so
 * the two surfaces cannot drift apart.
 */

import { clampInt } from '../../util/num.js';
import { effectiveStatBlock } from '../../entities/Creature.js';
import { readGear } from './gearFields.js';

/** @typedef {import('../../types/modal.js').ModalField} ModalField */

/**
 * One number modal field per stat key, named `stat-<KEY>` and pre-filled
 * from the given block. A missing stat defaults to the neutral value 10.
 * @param {string[]} keys
 * @param {Record<string, number>} [stats]
 * @returns {ModalField[]}
 */
export function statFields(keys, stats = {}) {
  return keys.map((key) => ({
    name: `stat-${key}`,
    label: key === 'AC' ? BASE_AC_LABEL : key,
    type: /** @type {'number'} */ ('number'),
    value: stats[key] ?? 10,
    min: 1,
  }));
}

/**
 * Read the stat fields back out of the submitted modal values. The function
 * clamps each value to a positive integer. A blank or invalid value reads as 10.
 * @param {string[]} keys
 * @param {Record<string, string>} values
 * @returns {Record<string, number>}
 */
export function readStats(keys, values) {
  return Object.fromEntries(
    keys.map((key) => [key, clampInt(values[`stat-${key}`], 1, Infinity, 10)]),
  );
}

/** The caption of the AC field. The authored AC is the AC without armor. */
export const BASE_AC_LABEL = 'Base AC (no armor)';

/**
 * The caption of the AC field for a creature that wears `armor`. Worn armor
 * replaces part of the authored AC (see `effectiveStatBlock`), so with armor
 * picked the caption also names the AC that combat uses. With no armor the
 * caption is the plain `BASE_AC_LABEL`.
 * @param {Record<string, number>} stats the typed scores and AC
 * @param {import('../../types/entities.js').CreatureArmor | null | undefined} armor
 * @returns {string}
 */
export function acFieldLabel(stats, armor) {
  if (!armor) return BASE_AC_LABEL;
  const inUse = effectiveStatBlock(
    /** @type {import('../../types/creature.js').Creature} */ ({ stats, armor }),
  ).AC;
  return `${BASE_AC_LABEL}, AC in use ${inUse}`;
}

/**
 * The AC field caption for the armor, AC, and DEX values of a creature form
 * (see `acFieldLabel`). A blank or unreadable AC or DEX reads as 10.
 * @param {(name: string) => string} get a form field getter
 * @param {import('./gearFields.js').GearOptions} gear the form's gear choices
 * @returns {string}
 */
export function acLabelFromForm(get, gear) {
  const { armor } = readGear('', get('armor') ?? '', gear);
  const score = (/** @type {string} */ key) => clampInt(get(`stat-${key}`), 1, Infinity, 10);
  return acFieldLabel({ AC: score('AC'), DEX: score('DEX') }, armor);
}
