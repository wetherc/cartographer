/**
 * The edits that a player tab sends to the GM tab instead of a whole save.
 *
 * A bound player tab changes the campaign too: a dice roll logs to the
 * travelogue, a sheet action spends a slot, and a token move shifts the
 * party and reveals fog. When that tab writes the whole campaign, and the
 * GM tab changes the campaign in the same few seconds, one tab reloads onto
 * the other's save and its own change is lost. A patch avoids this. The
 * player tab writes only the ops of its own edit under its own key, and the
 * GM tab applies those ops to its live state and saves the result. Every
 * change then reaches storage through one writer.
 *
 * A patch is a `StateDiff` op list, so it pairs entities by id and changes
 * only the fields the player touched. When both tabs change the same field,
 * the patch wins, because the GM tab applies it after its own edit.
 *
 * Each tab writes under its own key, so two player tabs cannot overwrite
 * each other's pending patch. The GM tab removes a key once it has read the
 * patch. The browser delivers the value in the `storage` event itself, so a
 * patch that replaced the key before the removal still arrives.
 */

import { removeStored, writeStored } from './Footprint.js';

/** @typedef {import('../types/storage.js').DiffOp} DiffOp */

/** The prefix of every patch key. The rest of the key is the writing tab's id. */
export const PATCH_KEY_PREFIX = 'campaign-builder:patch:';

/**
 * The count of patches this tab has written. It goes into each patch, so two
 * patches with the same ops still differ, and the browser fires a `storage`
 * event only for a value that differs from the stored one.
 */
let written = 0;

/**
 * @param {DiffOp[]} ops
 * @param {number} n
 * @returns {string}
 */
export function encodePatch(ops, n) {
  return JSON.stringify({ n, ops });
}

/**
 * The ops of a stored patch, or null when the text is not a patch.
 * @param {string} raw
 * @returns {DiffOp[] | null}
 */
export function decodePatch(raw) {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value?.ops) ? value.ops : null;
  } catch {
    return null;
  }
}

/**
 * Write a patch under this tab's key. A full origin returns false instead of
 * throwing, so the caller keeps its edit unsent and dirty.
 * @param {string} tabId
 * @param {DiffOp[]} ops
 * @returns {boolean}
 */
export function writePatch(tabId, ops) {
  written += 1;
  try {
    writeStored(PATCH_KEY_PREFIX + tabId, encodePatch(ops, written));
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove a patch that the GM tab has read.
 * @param {string} key
 */
export function clearPatch(key) {
  removeStored(key);
}

/**
 * Subscribe to patches that other tabs write. The browser fires `storage`
 * only in the tabs that did not write, so a tab never reads its own patch.
 * The function returns an unsubscribe function.
 * @param {(ops: DiffOp[], key: string) => void} callback
 * @returns {() => void}
 */
export function onPlayerPatch(callback) {
  const handler = (/** @type {StorageEvent} */ event) => {
    if (!event.key?.startsWith(PATCH_KEY_PREFIX) || event.newValue === null) return;
    const ops = decodePatch(event.newValue);
    if (ops) callback(ops, event.key);
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
