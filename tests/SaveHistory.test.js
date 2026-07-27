import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  pushSnapshot,
  clearHistory,
  serialize,
  snapshotRawHistory,
  snapshotPersistedSave,
  undoHistory,
} from '../src/storage/SaveManager.js';

/** Minimal in-memory localStorage so the ring-buffer wrappers run under Node. */
function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
  return store;
}

/**
 * The stored ring, oldest first, read the way the storage layout defines it:
 * an index of sequence numbers plus one key per snapshot. Deliberately a test
 * helper rather than an export — nothing in the app reads the whole ring at
 * once, and an export that did would materialize every snapshot in memory.
 * @param {string} [key]
 * @returns {string[]}
 */
function storedHistory(key = 'campaign-builder:history') {
  const index = localStorage.getItem(key);
  if (!index) return [];
  const seqs = JSON.parse(index);
  return seqs.map((seq) => localStorage.getItem(`${key}:${seq}`)).filter((s) => s !== null);
}

test('pushSnapshot appends newest-last and caps at the limit', () => {
  assert.deepEqual(pushSnapshot([], 'a', 3), ['a']);
  assert.deepEqual(pushSnapshot(['a', 'b'], 'c', 3), ['a', 'b', 'c']);
  // Oldest entries drop once the limit is exceeded.
  assert.deepEqual(pushSnapshot(['a', 'b', 'c'], 'd', 3), ['b', 'c', 'd']);
});

test('pushSnapshot returns a new array without mutating the input', () => {
  const history = ['a'];
  const next = pushSnapshot(history, 'b', 5);
  assert.deepEqual(history, ['a']);
  assert.deepEqual(next, ['a', 'b']);
});

beforeEach(installLocalStorage);

test('a missing, corrupt, or legacy-format index reads as an empty history', () => {
  assert.equal(undoHistory(), null);
  localStorage.setItem('campaign-builder:history', 'not json');
  assert.equal(undoHistory(), null);
  localStorage.setItem('campaign-builder:history', '{"not":"array"}');
  assert.equal(undoHistory(), null);
  // The pre-index format stored the snapshots themselves as an array of
  // strings under this key; it reads as empty rather than as garbage seqs.
  localStorage.setItem('campaign-builder:history', '["{\\"nodes\\":[]}"]');
  assert.equal(undoHistory(), null);
  // An unreadable index is also not treated as a ring to append to.
  localStorage.setItem('campaign-builder:history', 'not json');
  snapshotRawHistory('{"nodes":[1]}');
  assert.deepEqual(storedHistory(), ['{"nodes":[1]}']);
});

test('a serialized state pushed onto the ring undoes back to itself', () => {
  const state = {
    nodes: [],
    party: null,
    characters: [],
    encounters: [],
    travelog: [],
    quests: [],
    clock: null,
    npcs: [],
    handouts: [],
    bestiary: [],
    splitParty: false,
    combat: null,
  };
  snapshotRawHistory(serialize(state));
  assert.equal(storedHistory().length, 1);
  const restored = undoHistory();
  assert.deepEqual(restored, state);
  assert.equal(storedHistory().length, 0);
  // Nothing left to undo.
  assert.equal(undoHistory(), null);
});

test('snapshotRawHistory stores the raw string and skips a duplicate of the newest', () => {
  snapshotRawHistory('{"nodes":[1]}');
  snapshotRawHistory('{"nodes":[1]}'); // unchanged save pushed again
  assert.deepEqual(storedHistory(), ['{"nodes":[1]}']);
  snapshotRawHistory('{"nodes":[2]}');
  snapshotRawHistory('{"nodes":[1]}'); // same as an older entry, not the newest
  assert.equal(storedHistory().length, 3);
});

test('snapshotPersistedSave pushes the persisted save string untouched', () => {
  snapshotPersistedSave(); // nothing saved yet: no-op
  assert.deepEqual(storedHistory(), []);
  localStorage.setItem('campaign-builder:save', '{"nodes":[],"party":null}');
  snapshotPersistedSave();
  assert.deepEqual(storedHistory(), ['{"nodes":[],"party":null}']);
});

test('snapshotRawHistory enforces the ring limit and removes evicted entries', () => {
  const store = installLocalStorage();
  for (let i = 0; i < 25; i++)
    snapshotRawHistory(`{"quests":[${i}]}`, 'campaign-builder:history', 10);
  const history = storedHistory();
  assert.equal(history.length, 10);
  assert.equal(history[history.length - 1], '{"quests":[24]}');
  // Evicted snapshots are gone from storage, not just from the index.
  assert.equal(store.size, 11, '10 entries plus the index');
});

test('snapshotRawHistory falls back to a single-snapshot ring when the quota blows', () => {
  const store = installLocalStorage();
  snapshotRawHistory('{"note":"first"}');
  // A second stored snapshot no longer fits; the retry after clearing must land.
  const realSetItem = localStorage.setItem;
  localStorage.setItem = (k, v) => {
    if (/:\d+$/.test(k) && [...store.keys()].some((key) => /:\d+$/.test(key) && key !== k)) {
      throw new Error('QuotaExceededError');
    }
    realSetItem(k, v);
  };
  snapshotRawHistory('{"note":"second"}');
  assert.deepEqual(storedHistory(), ['{"note":"second"}'], 'ring shortened to the newest snapshot');
});

test('snapshotRawHistory drops the ring entirely when even one snapshot cannot be stored', () => {
  const store = installLocalStorage();
  snapshotRawHistory('{"note":"first"}');
  assert.equal(storedHistory().length, 1);
  localStorage.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  snapshotRawHistory('{"note":"second"}');
  localStorage.setItem = (k, v) => store.set(k, String(v));
  assert.deepEqual(storedHistory(), [], 'unstorable history removed rather than left stale');
  assert.equal(store.size, 0, 'no orphaned snapshot keys remain');
});

test('undoHistory skips and cleans an entry whose snapshot key is missing', () => {
  snapshotRawHistory('{"nodes":[],"party":null}');
  snapshotRawHistory('{"nodes":[],"party":{"nodeId":"n"}}');
  localStorage.removeItem('campaign-builder:history:1'); // newest snapshot lost
  const restored = undoHistory();
  assert.deepEqual(restored?.party, null, 'falls through to the older snapshot');
  assert.equal(storedHistory().length, 0);
});

test('clearHistory removes the index and every snapshot entry', () => {
  const store = installLocalStorage();
  snapshotRawHistory('{"a":1}');
  snapshotRawHistory('{"a":2}');
  assert.equal(store.size, 3);
  clearHistory();
  assert.equal(store.size, 0);
});
