/**
 * The stat-block field group shared by the authoring surfaces. The creature
 * dialog and the template form both render STAT_KEYS (abilities plus AC).
 * Both use the same `stat-<KEY>` naming and the same clamped read-back, so
 * the two surfaces cannot drift apart.
 */

import { clampInt } from '../util/num.js';

/** @typedef {import('../types/modal.js').ModalField} ModalField */

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
    label: key,
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
