/**
 * The stat-block field group shared by the modal authoring dialogs: the
 * encounter dialog renders STAT_KEYS (abilities plus AC), the NPC dialog
 * ABILITY_SCORES — same `stat-<KEY>` naming and the same clamped read-back
 * either way, so the two dialogs can't drift.
 */

import { clampInt } from '../util/num.js';

/** @typedef {import('../ui/Modal.js').ModalField} ModalField */

/**
 * One number modal field per stat key, named `stat-<KEY>` and pre-filled from
 * the given block (missing stats default to the neutral 10).
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
 * Read the stat fields back out of submitted modal values, clamping each to a
 * positive integer (blank or garbage reads as 10).
 * @param {string[]} keys
 * @param {Record<string, string>} values
 * @returns {Record<string, number>}
 */
export function readStats(keys, values) {
  return Object.fromEntries(
    keys.map((key) => [key, clampInt(values[`stat-${key}`], 1, Infinity, 10)]),
  );
}
