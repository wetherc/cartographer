import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  HISTORY_KEY,
  historyDepth,
  replaceIsUndoable,
  saveCampaign,
  undoCampaign,
} from '../src/storage/HistoryLog.js';
import { HISTORY_BYTE_CAP } from '../src/storage/HistoryAppend.js';
import { loadFromLocalStorage } from '../src/storage/SaveStorage.js';
import { CURRENT_VERSION } from '../src/storage/Migrations.js';
import { installLocalStorage, installQuotaStorage } from './helpers/env.js';

const SAVE_KEY = 'campaign-builder:save';

/**
 * A campaign named by `name`, whose one quest is padded to `chars`
 * characters, so its save costs a known and large amount of storage.
 * Two names share no quest id, as two imported campaigns do.
 * @param {string} name
 * @param {number} chars
 * @param {string[]} [extra] the titles of more small quests
 * @param {string | null} [image] a handout image
 * @returns {any}
 */
function campaign(name, chars, extra = [], image = null) {
  return {
    version: CURRENT_VERSION,
    nodes: [],
    party: null,
    characters: [],
    travelog: [],
    quests: [
      { id: `${name}-big`, title: name.padEnd(chars, '.') },
      ...extra.map((title, i) => ({ id: `${name}-${i}`, title })),
    ],
    clock: null,
    handouts: image ? [{ id: 'h', title: 'Map', body: '', image }] : [],
    bestiary: [],
    splitParty: false,
    combat: null,
  };
}

/** The name of the persisted campaign. */
function persistedName() {
  const loaded = /** @type {any} */ (loadFromLocalStorage());
  return loaded.quests[0].title.replace(/\.+$/, '');
}

/** The stored index record. */
function storedIndex() {
  return JSON.parse(/** @type {string} */ (localStorage.getItem(HISTORY_KEY)));
}

beforeEach(installLocalStorage);

test('a snapshot larger than the delta cap stays through later edits', () => {
  const big = HISTORY_BYTE_CAP; // characters, so twice the cap in bytes
  saveCampaign(campaign('Old', big));
  saveCampaign(campaign('New', 100));
  saveCampaign(campaign('New', 100, ['a']));
  saveCampaign(campaign('New', 100, ['a', 'b']));
  assert.deepEqual(historyDepth(), { undo: 3, redo: 0 });
  assert.equal(storedIndex().snapshots.length, 1, 'the index names the snapshot record');
  for (let i = 0; i < 3; i += 1) undoCampaign();
  assert.equal(persistedName(), 'Old', 'undo walks back across the replace');
});

test('an older snapshot drops, with every record before it, once it passes the room', () => {
  // Each save is about 1.8 MB. The room for an older snapshot is the quota
  // less the delta cap, the save, and the newest snapshot, about 1.1 MB.
  const size = 900_000;
  saveCampaign(campaign('A', size));
  saveCampaign(campaign('B', size));
  assert.deepEqual(historyDepth(), { undo: 1, redo: 0 });
  saveCampaign(campaign('C', size));
  assert.deepEqual(historyDepth(), { undo: 1, redo: 0 }, 'only the newest snapshot is kept');
  undoCampaign();
  assert.equal(persistedName(), 'B');
});

test('small snapshots share the room and keep every step', () => {
  saveCampaign(campaign('A', 1000));
  saveCampaign(campaign('B', 1000));
  saveCampaign(campaign('C', 1000));
  assert.deepEqual(historyDepth(), { undo: 2, redo: 0 });
  assert.equal(storedIndex().snapshots.length, 2);
});

test('an index without a snapshot list counts every record as a delta', () => {
  saveCampaign(campaign('A', 1000));
  saveCampaign(campaign('B', 1000));
  const index = storedIndex();
  delete index.snapshots;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(index));
  saveCampaign(campaign('B', 1000, ['x']));
  assert.deepEqual(historyDepth(), { undo: 2, redo: 0 });
  assert.deepEqual(storedIndex().snapshots, [], 'the unnamed snapshot stays unnamed');
});

test('an index lists only the snapshots it still names', () => {
  saveCampaign(campaign('A', 1000));
  saveCampaign(campaign('B', 1000));
  const index = storedIndex();
  localStorage.setItem(
    HISTORY_KEY,
    JSON.stringify({ ...index, snapshots: [...index.snapshots, 99] }),
  );
  saveCampaign(campaign('B', 1000, ['x']));
  assert.deepEqual(storedIndex().snapshots, index.snapshots);
});

test('undo and redo across a snapshot keep it named as a snapshot', () => {
  saveCampaign(campaign('A', 1000));
  saveCampaign(campaign('B', 1000));
  undoCampaign();
  const index = storedIndex();
  assert.deepEqual(index.snapshots, index.deltas, 'the swapped record is a snapshot too');
});

test('a record write on a full origin drops the redo tail before any undo step', () => {
  const roomy = installQuotaStorage(1e9);
  saveCampaign(campaign('A', 1000));
  saveCampaign(campaign('B', 50_000));
  undoCampaign();
  // The redo tail now keeps the whole of B. The edit below has room for its
  // save and its record only once that tail is gone.
  const store = installQuotaStorage([...roomy].reduce((n, [k, v]) => n + k.length + v.length, 0));
  for (const [k, v] of roomy) store.set(k, v);
  const result = saveCampaign(campaign('A', 1000, ['edit']));
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.history,
    { ok: true, evictedAll: false },
    'a dropped redo tail is no lost depth',
  );
  assert.deepEqual(historyDepth(), { undo: 1, redo: 0 });
  undoCampaign();
  assert.equal(persistedName(), 'A');
});

test('replaceIsUndoable is true with nothing stored, and for a small campaign', () => {
  assert.equal(replaceIsUndoable(campaign('A', 10)), true);
  saveCampaign(campaign('A', 1000));
  assert.equal(replaceIsUndoable(campaign('B', 1000)), true);
});

test('replaceIsUndoable is false when the snapshot and the new save pass the quota', () => {
  // 1.2M characters is 2.4 MB, and the snapshot costs the same again.
  saveCampaign(campaign('A', 1_200_000));
  assert.equal(replaceIsUndoable(campaign('B', 10)), true);
  assert.equal(replaceIsUndoable(campaign('B', 1_500_000)), false);
});

test('replaceIsUndoable counts the images that the new campaign adds', () => {
  const photo = `data:image/png;base64,${'A'.repeat(500_000)}`;
  saveCampaign(campaign('A', 1_100_000));
  assert.equal(replaceIsUndoable(campaign('B', 1_100_000)), true);
  assert.equal(replaceIsUndoable(campaign('B', 1_100_000, [], photo)), false);
});

test('replaceIsUndoable does not count an image the table already keeps', () => {
  const photo = `data:image/png;base64,${'A'.repeat(500_000)}`;
  saveCampaign(campaign('A', 1_000_000, [], photo));
  assert.equal(replaceIsUndoable(campaign('B', 1_000_000, [], photo)), true);
  assert.ok(localStorage.getItem(SAVE_KEY));
});
