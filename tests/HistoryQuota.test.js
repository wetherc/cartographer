import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  HISTORY_KEY,
  historyDepth,
  saveCampaign,
  undoCampaign,
} from '../src/storage/HistoryLog.js';
import { loadFromLocalStorage, trySaveToLocalStorage } from '../src/storage/SaveStorage.js';
import { ASSETS_KEY } from '../src/storage/AssetStore.js';
import { CURRENT_VERSION } from '../src/storage/Migrations.js';
import { installLocalStorage, installQuotaStorage } from './helpers/env.js';

const SAVE_KEY = 'campaign-builder:save';

/**
 * A campaign whose quests are the given titles. Each title is padded, so a
 * quest costs a known and large amount of storage.
 * @param {string[]} titles
 * @returns {any}
 */
function state(titles) {
  return {
    version: CURRENT_VERSION,
    nodes: [],
    party: null,
    characters: [],
    travelog: [],
    quests: titles.map((title, i) => ({ id: `q${i}`, title: title.padEnd(400, '.') })),
    clock: null,
    handouts: [],
    bestiary: [],
    splitParty: false,
    combat: null,
  };
}

/** The quest titles of the persisted campaign, unpadded. */
function persistedTitles() {
  const loaded = /** @type {any} */ (loadFromLocalStorage());
  return loaded.quests.map((/** @type {any} */ q) => q.title.replace(/\.+$/, ''));
}

/** The stored history keys, index included. */
function historyKeys(/** @type {Map<string, string>} */ store) {
  return [...store.keys()].filter((key) => key.startsWith(HISTORY_KEY));
}

/** The characters every key of the store uses. */
function used(/** @type {Map<string, string>} */ store) {
  return [...store].reduce((sum, [k, v]) => sum + k.length + v.length, 0);
}

/**
 * Save growing campaigns of the given quest counts into a roomy origin, then
 * shrink the quota to what they use plus `slack` characters.
 * @param {number | number[]} counts a list of quest counts, or n for 1..n
 * @param {number} slack
 * @param {() => void} [then] run in the roomy origin after the saves
 */
function fillThenShrink(counts, slack, then) {
  const roomy = installQuotaStorage(1e9);
  const list = Array.isArray(counts) ? counts : Array.from({ length: counts }, (_, i) => i + 1);
  for (const n of list) {
    saveCampaign(state(Array.from({ length: n }, (_, i) => `T${i}`)));
  }
  then?.();
  const store = installQuotaStorage(used(roomy) + slack);
  for (const [k, v] of roomy) store.set(k, v);
  return store;
}

beforeEach(installLocalStorage);

test('a campaign write on a full origin drops the oldest undo steps and lands', () => {
  const store = fillThenShrink(4, 0);
  assert.deepEqual(historyDepth(), { undo: 3, redo: 0 });
  const result = saveCampaign(state(['T0', 'T1', 'T2', 'T3', 'T4']));
  assert.equal(result.ok, true, 'the campaign is stored');
  assert.deepEqual(result.history, { ok: true, evictedAll: true }, 'the lost depth is reported');
  assert.deepEqual(persistedTitles(), ['T0', 'T1', 'T2', 'T3', 'T4']);
  const depth = historyDepth().undo;
  assert.ok(depth >= 1 && depth < 4, `some steps remain: ${depth}`);
  assert.ok(historyKeys(store).length > 0);
  undoCampaign();
  assert.deepEqual(persistedTitles(), ['T0', 'T1', 'T2', 'T3'], 'the newest step still undoes');
});

test('the redo tail goes before any undo step', () => {
  // The last step adds three quests, so its record frees room for the save
  // below and for that save's own record.
  fillThenShrink([1, 2, 3, 6], 0, undoCampaign);
  assert.deepEqual(historyDepth(), { undo: 2, redo: 1 });
  const result = saveCampaign(state(['T0', 'T1', 'T2', 'X']));
  assert.equal(result.ok, true);
  assert.deepEqual(result.history, { ok: true, evictedAll: true });
  assert.deepEqual(historyDepth(), { undo: 3, redo: 0 }, 'every undo step is kept');
});

test('a write that fails with no history left reports the log as cleared', () => {
  const store = fillThenShrink(3, 0);
  const huge = state(Array.from({ length: 40 }, (_, i) => `H${i}`));
  const result = saveCampaign(huge);
  assert.equal(result.ok, false);
  assert.deepEqual(result.history, { ok: false, evictedAll: true });
  assert.deepEqual(historyKeys(store), [], 'the history is gone');
  assert.deepEqual(persistedTitles(), ['T0', 'T1', 'T2'], 'the stored campaign is untouched');
});

test('a failed write with no history to drop reports no history loss', () => {
  installQuotaStorage(1e9);
  saveCampaign(state(['T0']));
  const store = installQuotaStorage(0);
  const result = saveCampaign(state(['T0', 'T1']));
  assert.equal(result.ok, false);
  assert.deepEqual(result.history, { ok: true, evictedAll: false });
  assert.equal(store.size, 0);
});

test('an index that cannot be rewritten while making room clears the log', () => {
  const store = fillThenShrink(4, 0);
  const setItem = localStorage.setItem;
  localStorage.setItem = (key, value) => {
    if (key === HISTORY_KEY) throw new Error('QuotaExceededError');
    setItem(key, value);
  };
  const result = saveCampaign(state(['T0', 'T1', 'T2', 'T3', 'T4']));
  localStorage.setItem = setItem;
  assert.equal(result.ok, true);
  assert.equal(result.history.evictedAll, true);
  assert.deepEqual(historyKeys(store), [], 'no record is left that the index does not name');
});

test('a stray history key with no index is removed to make room', () => {
  installQuotaStorage(1e9);
  saveCampaign(state(['T0']));
  const saved = /** @type {string} */ (localStorage.getItem(SAVE_KEY));
  const stray = `${HISTORY_KEY}:d9`;
  const store = installQuotaStorage(SAVE_KEY.length + saved.length + stray.length + 420);
  store.set(SAVE_KEY, saved);
  store.set(stray, 'x'.repeat(400));
  const result = saveCampaign(state(['T0', 'T1']));
  assert.equal(result.ok, true);
  assert.equal(store.has(stray), false);
  assert.equal(result.history.evictedAll, true);
});

test('images that failed on a full origin are stored again after room is made', () => {
  const store = installQuotaStorage(1e9);
  let refuse = true;
  const setItem = localStorage.setItem;
  localStorage.setItem = (key, value) => {
    if (refuse && (key === ASSETS_KEY || key === SAVE_KEY)) throw new Error('QuotaExceededError');
    setItem(key, value);
  };
  const withImage = {
    ...state(['T0']),
    handouts: [{ id: 'h', title: 'Map', body: '', image: 'data:image/png;base64,AAAA' }],
  };
  let calls = 0;
  const result = trySaveToLocalStorage(withImage, SAVE_KEY, {
    makeRoom: () => {
      calls += 1;
      refuse = false;
      return true;
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  assert.equal(result.assetsOk, true);
  assert.ok(store.has(ASSETS_KEY));
});
