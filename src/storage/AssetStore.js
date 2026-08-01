/**
 * The image payloads of a stored campaign, kept in their own localStorage
 * key.
 *
 * `Assets.js` hoists every inline `data:` URL into one content-keyed
 * `assets` table, so a save holds each distinct image once. This is not
 * enough on its own. The table travels inside the save string, the undo
 * ring stores one whole save string per step, and a full origin makes the
 * *campaign* write fail. One handout photo can then cost the GM their map.
 * Splitting the table out of the stored string makes structure and blobs
 * fail independently, and keeps a history snapshot from carrying a picture
 * it did not change.
 *
 * Only the localStorage path splits the table out. An exported file still
 * carries its own table, because `downloadState` serializes the whole save.
 * A shared campaign stays one self-contained document.
 */

import { referencedAssetKeys } from './Assets.js';

/** @typedef {import('../types/storage.js').RawSave} RawSave */

/** The localStorage key the payload table lives under. */
export const ASSETS_KEY = 'campaign-builder:assets';

/**
 * The stored value, only when it is a plain record of strings. Otherwise the
 * function returns an empty table. The code reads the table back into image
 * `src` attributes, so a non-string entry is unusable, not merely odd.
 * @param {unknown} value
 * @returns {Record<string, string>}
 */
function assetRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  /** @type {Record<string, string>} */
  const table = {};
  for (const [key, payload] of Object.entries(value)) {
    if (typeof payload === 'string') table[key] = payload;
  }
  return table;
}

/**
 * Split a hoisted save into the state to store and the payload table to
 * store beside it. The function is pure. It never touches the state passed
 * in. A save with no table comes back unchanged, paired with an empty table.
 * @param {RawSave} state
 * @returns {{ state: RawSave, assets: Record<string, string> }}
 */
export function detachAssets(state) {
  if (!('assets' in state)) return { state, assets: {} };
  const next = { ...state };
  delete next.assets;
  return { state: next, assets: assetRecord(state.assets) };
}

/**
 * The table with every entry removed that no given string references. The
 * function is pure, so the retention rule can be tested without a storage
 * stub.
 * @param {Record<string, string>} table
 * @param {Iterable<string>} strings every stored string that can reference a key
 * @returns {Record<string, string>}
 */
export function pruneAssets(table, strings) {
  /** @type {Set<string>} */
  const live = new Set();
  for (const text of strings) for (const key of referencedAssetKeys(text)) live.add(key);
  /** @type {Record<string, string>} */
  const kept = {};
  for (const [key, payload] of Object.entries(table)) {
    if (live.has(key)) kept[key] = payload;
  }
  return kept;
}

/**
 * The stored payload table, or an empty one when nothing is stored or the
 * stored value cannot be read. This function never throws an error. A
 * corrupt table costs the GM their images. An error here also costs them
 * the campaign.
 * @param {string} [key]
 * @returns {Record<string, string>}
 */
export function loadAssetTable(key = ASSETS_KEY) {
  const json = localStorage.getItem(key);
  if (!json) return {};
  try {
    return assetRecord(JSON.parse(json));
  } catch {
    return {};
  }
}

/**
 * Every stored string that can reference a payload: all of localStorage,
 * except the table itself and whatever the save being written replaces.
 * The function does not read only the campaign and history keys. The ring
 * stores one key per snapshot, and this module does not need to know that
 * naming. Reading extra strings only keeps a payload longer than needed.
 * @param {Set<string>} skip keys whose stored value does not count
 * @returns {string[]}
 */
function otherStoredStrings(skip) {
  /** @type {string[]} */
  const values = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const stored = localStorage.key(i);
    if (stored === null || skip.has(stored)) continue;
    values.push(localStorage.getItem(stored) ?? '');
  }
  return values;
}

/**
 * Merge a save's payloads into the stored table, remove any payload nothing
 * references, and write the table back. The function reports whether the
 * write succeeded instead of throwing an error, because the caller writes
 * the campaign either way. This is the reason for the split: a GM who
 * cannot store a picture still keeps their map.
 *
 * Retention spans every stored string, not just the save being written, so
 * the undo ring's snapshots keep their images resolvable. The function
 * removes a payload only when the last state that references it has fallen
 * out of the ring. It skips the scan entirely when there is nothing to
 * keep, which is true for every campaign that has never held an image.
 * @param {Record<string, string>} assets this save's payloads
 * @param {string} json this save, whose references are not stored yet
 * @param {string[]} [superseded] keys `json` is about to overwrite, so the value
 *   still stored under them is already history and must not pin a payload
 * @param {string} [key]
 * @returns {boolean}
 */
export function persistAssets(assets, json, superseded = [], key = ASSETS_KEY) {
  const stored = localStorage.getItem(key);
  if (!stored && !Object.keys(assets).length) return true;
  const merged = { ...loadAssetTable(key), ...assets };
  const skip = new Set([key, ...superseded]);
  const kept = pruneAssets(merged, [json, ...otherStoredStrings(skip)]);
  if (!Object.keys(kept).length) {
    localStorage.removeItem(key);
    return true;
  }
  try {
    localStorage.setItem(key, JSON.stringify(kept));
    return true;
  } catch {
    return false;
  }
}
