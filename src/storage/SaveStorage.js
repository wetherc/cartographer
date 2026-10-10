/**
 * The localStorage side of the campaign save: the save key and the save
 * mark, the quota checks, the write of a packed campaign with its image
 * payloads, and the `storage` event that reports a save from another tab.
 * `SaveManager.js` turns a campaign into a string and back.
 */

import { deserialize, packState } from './SaveManager.js';
import { detachAssets, persistAssets, storeAssets } from './AssetStore.js';
import { mirrorActive, pruneMirror, stageAssets, storedAssetTable } from './AssetMirror.js';
import { recordExternalWrite, removeStored, storageFootprint, writeStored } from './Footprint.js';
import { createSaveFollower } from './SaveFollower.js';

/** @typedef {import('../types/storage.js').CampaignState} CampaignState */
/**
 * The outcome of `trySaveToLocalStorage`. `pending` is present only when
 * the save waits on an image put and wrote nothing.
 * @typedef {{ ok: boolean, assetsOk: boolean, nearQuota: boolean, bytes: number, footprint: number, json: string, pending?: Promise<boolean> }} SaveResult
 */

const DEFAULT_STORAGE_KEY = 'campaign-builder:save';

/** The localStorage key the campaign save lives under. Cross-tab sync uses this key. */
export const STORAGE_KEY = DEFAULT_STORAGE_KEY;

/**
 * The localStorage key that ends every save bundle. `HistoryLog.js` removes
 * it before the campaign write, and writes a fresh value here after the
 * campaign key and the undo history, so a follower tab that acts on this
 * key reads a history that matches the campaign. See `SaveFollower.js`.
 *
 * A tab that knows the mark of the save it holds compares marks instead of
 * whole save strings. A mark that is missing tells it nothing, and it then
 * compares the strings. The removal before the write covers the time
 * between the campaign write and the new mark, when the old mark still
 * names a save that is gone.
 */
export const SAVE_MARK_KEY = 'campaign-builder:save-mark';

/** A per-tab counter, so two marks from one tab in one millisecond differ. */
let markSeq = 0;

/**
 * Write a new save mark, and return it. A failed write removes the old
 * mark and returns null. A follower that sees no mark adopts on its
 * fallback timer. An old mark left in place would tell another tab that
 * nothing moved, and its autosave would write over this save.
 * @returns {string | null}
 */
export function writeSaveMark() {
  const mark = `${Date.now()}:${(markSeq += 1)}:${Math.random().toString(36).slice(2, 8)}`;
  try {
    writeStored(SAVE_MARK_KEY, mark);
    return mark;
  } catch {
    clearSaveMark();
    return null;
  }
}

/** Remove the save mark. `HistoryLog.js` calls this before a campaign write. */
export function clearSaveMark() {
  removeStored(SAVE_MARK_KEY);
}

/**
 * The save mark stored now, or null when none is stored.
 * @returns {string | null}
 */
export function readSaveMark() {
  return localStorage.getItem(SAVE_MARK_KEY);
}

/**
 * Warn when stored data approaches the localStorage origin quota of about 5
 * MB. This leaves headroom for the history log, which shares the same
 * quota, and for the image table when IndexedDB is not in use.
 * localStorage stores UTF-16 code units, so the byte cost of a string is
 * twice its length.
 */
export const QUOTA_WARN_BYTES = 3 * 1024 * 1024;

/**
 * The approximate localStorage byte cost of a serialized save (UTF-16 uses
 * two bytes per code unit). The function is pure.
 * @param {string} json
 * @returns {number}
 */
export function saveByteSize(json) {
  return json.length * 2;
}

/**
 * True when storage use of this size is close enough to the origin quota to
 * warn the GM before writes start to fail. The function is pure.
 * @param {number} bytes
 * @param {number} [limit]
 * @returns {boolean}
 */
export function isNearQuota(bytes, limit = QUOTA_WARN_BYTES) {
  return bytes >= limit;
}

export { footprintBytes } from './Footprint.js';

/**
 * What this origin currently spends of its localStorage quota: every key,
 * not just the campaign save. The save, the undo ring, the custom library,
 * and the lock and preference flags all share this quota, so one save's
 * size does not show how close a write is to failing. The number comes
 * from the ledger in `Footprint.js`, so it does not read every stored
 * value again after each save.
 * @returns {number}
 */
export function localStorageFootprint() {
  return storageFootprint();
}

/**
 * Store a campaign, reporting the outcome instead of throwing an error.
 * localStorage writes fail with a QuotaExceededError once data: URL images
 * push the origin past its quota, and a silent failure lets the GM believe
 * the campaign saved. `nearQuota` flags a write that succeeded but
 * leaves the origin close to the limit. It is judged on the whole
 * footprint, not on `bytes`, because the undo ring alone costs several
 * times what one save does. The function measures the footprint after the
 * write, which gives an exact number. A measurement before the write cannot
 * know the new save's size net of the old one it replaces, and the warning
 * concerns the next write either way.
 *
 * Image payloads are stored before the campaign, so structure and blobs
 * fail independently. `assetsOk` false leaves the GM a saved map with a
 * missing picture. One blob stored inside the campaign string costs the GM
 * both the map and the picture. The payloads go first because the reverse
 * order can store structure that references nothing, and a follower tab
 * that adopts that campaign looks up a key that is not stored yet. `bytes`
 * measures the payload-free save. Only `footprint` speaks to the quota,
 * and it counts every localStorage key.
 *
 * The payloads go to IndexedDB when `AssetMirror.js` has a backend, and to
 * their own localStorage key (`AssetStore.js`) otherwise. An IndexedDB put
 * is asynchronous. When the save adds a payload that is not committed yet,
 * this function writes nothing and returns `pending`, the promise of that
 * put. The caller saves again once it settles, and that save finds the
 * payload committed and writes the campaign. A put that fails makes the
 * next save write the campaign with `assetsOk` false. A page that closes
 * while a put is pending keeps its previous save.
 *
 * `json` is the string that was written, or that the code attempted to
 * write. `HistoryLog.js` caches the state it just stored against this
 * string, so recording a history step costs a string comparison, not a
 * re-read and re-parse of the save.
 *
 * The payload write adds and never removes. The retention scan that removes
 * unreferenced payloads runs only after the campaign write succeeds. When
 * the campaign write fails, the stored campaign stays in place and every
 * image it references still resolves.
 *
 * `keepPrevious` skips that scan, so every payload that the save being
 * replaced references stays in the table. `HistoryLog.js` sets it when it
 * stores the replaced save string as a snapshot record after this write.
 * Without it, the payload table drops the images of the replaced save
 * before the snapshot key exists to reference them, and an undo restores a
 * campaign with missing pictures.
 *
 * `beforeWrite` runs right before the first campaign write, and not for a
 * pending save. `HistoryLog.js` removes the save mark there.
 *
 * `makeRoom` runs when the campaign write fails. It removes data that the
 * caller can spare and returns true when it removed something. The write
 * then runs again with the same string, so a retry does not pack the
 * campaign again. `HistoryLog.saveCampaign` passes a function that drops
 * undo steps, because a campaign that exists only in memory is a worse
 * loss than undo depth. On the localStorage path, a payload write that
 * failed runs again first, so the freed room goes to the images.
 * @param {CampaignState} state
 * @param {string} [key]
 * @param {{ keepPrevious?: boolean, makeRoom?: () => boolean, beforeWrite?: () => void }} [options]
 * @returns {SaveResult}
 */
export function trySaveToLocalStorage(state, key = DEFAULT_STORAGE_KEY, options = {}) {
  const { state: detached, assets } = detachAssets(packState(state));
  const json = JSON.stringify(detached);
  const bytes = saveByteSize(json);
  const mirrored = mirrorActive();
  /** @param {boolean} ok @param {boolean} assetsOk @returns {SaveResult} */
  const result = (ok, assetsOk) => {
    const footprint = localStorageFootprint();
    return { ok, assetsOk, nearQuota: !ok || isNearQuota(footprint), bytes, footprint, json };
  };
  let assetsOk = true;
  if (mirrored) {
    const staged = stageAssets(assets);
    if (staged.pending)
      return { ...result(false, true), nearQuota: false, pending: staged.pending };
    assetsOk = staged.assetsOk;
  } else {
    assetsOk = storeAssets(assets);
  }
  options.beforeWrite?.();
  for (;;) {
    try {
      writeStored(key, json);
      break;
    } catch {
      if (!options.makeRoom?.()) return result(false, assetsOk);
      if (!mirrored && !assetsOk) assetsOk = storeAssets(assets);
    }
  }
  // The replaced save is gone from `key` now. When the caller still needs
  // its images, the scan waits for the next save, which finds the snapshot
  // record that references them.
  if (!options.keepPrevious) {
    if (mirrored) pruneMirror(json);
    else assetsOk = persistAssets(assets, json) && assetsOk;
  }
  return result(true, assetsOk);
}

/**
 * The tests call this function, and no app code does.
 * @param {string} [key]
 * @returns {CampaignState | null}
 */
export function loadFromLocalStorage(key = DEFAULT_STORAGE_KEY) {
  const json = localStorage.getItem(key);
  return json ? deserialize(json, storedAssetTable()) : null;
}

/**
 * Subscribe to campaign saves made in other tabs of the same origin. This
 * is the simplest multi-device setup this app supports: the GM tab drives,
 * and follower tabs react. There is no server and no dependency, only the
 * `storage` event. The browser fires `storage` only in tabs other than the
 * one that made the change, so a driving tab never sees its own saves. The
 * callback runs once per save bundle, after its save mark arrives, as
 * `SaveFollower.js` describes. The function returns an unsubscribe function.
 * @param {() => void} callback run when another tab writes a new save
 * @param {string} [key]
 * @returns {() => void}
 */
export function onExternalSave(callback, key = DEFAULT_STORAGE_KEY) {
  const follow = createSaveFollower({
    saveKey: key,
    markKey: SAVE_MARK_KEY,
    onSave: callback,
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (handle) => clearTimeout(/** @type {ReturnType<typeof setTimeout>} */ (handle)),
  });
  const handler = (/** @type {StorageEvent} */ event) => {
    // Every write another tab makes passes through here, not only a save, so
    // the footprint ledger follows the other tab's history and sidecar keys.
    recordExternalWrite(event);
    follow(event);
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
