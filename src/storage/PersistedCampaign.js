/**
 * The last persisted campaign, cached in memory for the diff of the undo
 * log. `HistoryLog.js` writes every save and every undo or redo step
 * through `writeCampaign`, so the cache follows each write of this tab.
 *
 * A diff needs the previous state as a value, and parsing the stored save
 * on every push costs a whole campaign's parse. This module keeps the last
 * persisted state in memory, stamped with the raw string it came from and
 * the save mark stored with it. In the normal case, this costs one read of
 * the short save mark, and the whole save string is read only when the mark
 * is missing or differs.
 * The stamp also guards the diff. A tab that declines the cross-tab reload
 * prompt keeps editing against a save that another tab has since replaced.
 * A new mark or a new raw string catches this case. A plain cache would diff
 * against a state that is no longer stored.
 */

import {
  STORAGE_KEY,
  deserialize,
  clearSaveMark,
  readSaveMark,
  trySaveToLocalStorage,
  writeSaveMark,
} from './SaveManager.js';
import { storedAssetTable } from './AssetMirror.js';

/** @typedef {import('../types/storage.js').CampaignState} CampaignState */

/**
 * The last persisted campaign as a value. This module stamps it with the raw
 * string it was parsed from, so a save from another tab invalidates the
 * cache. `mark` is the save mark that was stored with that string, or null
 * when it is not known. While the stored mark equals it, the stored string
 * is still `raw`, and a read skips the whole save string.
 * @type {{ raw: string, state: CampaignState, mark: string | null } | null}
 */
let cached = null;

/**
 * Write a campaign with `trySaveToLocalStorage`, and cache it on success.
 * The save mark goes right before the campaign write, so for the time
 * between this write and the new mark no tab reads the old mark as proof
 * that nothing moved. A save that waits on an image put writes nothing and
 * keeps the mark.
 * @param {CampaignState} state
 * @param {Parameters<typeof trySaveToLocalStorage>[2]} [options]
 * @returns {ReturnType<typeof trySaveToLocalStorage>}
 */
export function writeCampaign(state, options) {
  const save = trySaveToLocalStorage(state, STORAGE_KEY, {
    ...options,
    beforeWrite: clearSaveMark,
  });
  if (save.ok) cached = { raw: save.json, state, mark: null };
  return save;
}

/**
 * Write a new save mark after a step that stored a campaign, and remember
 * it beside the cache.
 * @returns {string | null}
 */
export function markSave() {
  const mark = writeSaveMark();
  if (cached) cached.mark = mark;
  return mark;
}

/**
 * The persisted campaign as a value, or null when nothing is stored. This
 * function reuses the cache when the stored save mark is the cached one, or
 * when the stored string still matches the string the cache was built from.
 * Otherwise it parses the save and caches the result. An unreadable save throws, as `deserialize` does.
 *
 * The startup path loads through this function instead of
 * `loadFromLocalStorage`, so the cache is warm from the first save on. The
 * first save of a session otherwise parsed the stored string a second time
 * and diffed two states that shared no object, which at a large world cost
 * more than a hundred milliseconds. Because `toTileGrid` keeps the parsed
 * node objects, the live nodes are the cached ones, and the first diff runs
 * by identity like every later one.
 * @returns {CampaignState | null}
 */
export function loadPersistedCampaign() {
  // The mark is read before the save string. A save that lands between the
  // two reads removed that mark first, so it can never match this cache.
  const mark = readSaveMark();
  if (cached && mark !== null && cached.mark === mark) return cached.state;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return null;
  if (cached && cached.raw === raw) {
    cached.mark = mark;
    return cached.state;
  }
  // The cached state is the one this tab holds, so every stored node that
  // encodes unchanged comes back as the node the tab already has.
  const state = deserialize(raw, storedAssetTable(), cached?.state.nodes);
  cached = { raw, state, mark };
  return state;
}

/**
 * The save string and save mark of the cached state, or null when nothing
 * is cached. At boot this is the save the page loaded. A tab that records
 * the save it last matched takes the string from here, so the tab and this
 * cache share one string, where a second `getItem` call makes a second copy
 * of the whole save.
 * @returns {{ raw: string, mark: string | null } | null}
 */
export function persistedSave() {
  return cached ? { raw: cached.raw, mark: cached.mark } : null;
}

/**
 * Make `state` the base of the next diff, stamped with the save string
 * stored now. A tab calls this after it adopts another tab's save, when its
 * live state is the stored campaign. The full load path leaves the cache on
 * freshly parsed objects, while the live state keeps the objects that
 * `Reconcile.reconcile` put back, and a delta adoption leaves the cache on
 * the save before. Either way the next save of the tab would diff two
 * states that share no object, which at 200 extra regions costs more than a
 * hundred milliseconds.
 * @param {CampaignState} state
 * @returns {{ raw: string | null, mark: string | null }} the stored save
 *   string and save mark
 */
export function adoptPersisted(state) {
  const mark = readSaveMark();
  const raw = localStorage.getItem(STORAGE_KEY);
  cached = raw === null ? null : { raw, state, mark };
  return { raw, mark };
}

/**
 * `loadPersistedCampaign`, with an unreadable save read as nothing stored.
 * A history step must not throw over a save it cannot read.
 * @returns {CampaignState | null}
 */
export function lastPersisted() {
  try {
    return loadPersistedCampaign();
  } catch {
    return null;
  }
}
