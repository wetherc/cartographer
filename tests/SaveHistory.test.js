import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  pushSnapshot,
  loadHistory,
  snapshotHistory,
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

test('loadHistory tolerates a missing or corrupt entry', () => {
  assert.deepEqual(loadHistory(), []);
  localStorage.setItem('campaign-builder:history', 'not json');
  assert.deepEqual(loadHistory(), []);
  localStorage.setItem('campaign-builder:history', '{"not":"array"}');
  assert.deepEqual(loadHistory(), []);
});

test('snapshotHistory then undoHistory round-trips a state and shrinks the ring', () => {
  const state = { nodes: [], party: null, characters: [], encounters: [], travelog: [], quests: [] };
  snapshotHistory(state);
  assert.equal(loadHistory().length, 1);
  const restored = undoHistory();
  assert.deepEqual(restored, state);
  assert.equal(loadHistory().length, 0);
  // Nothing left to undo.
  assert.equal(undoHistory(), null);
});

test('snapshotHistory enforces the ring limit across successive pushes', () => {
  const mk = (n) => ({ nodes: [], party: null, characters: [], encounters: [], travelog: [], quests: [{ id: String(n), title: String(n), notes: '', status: 'active' }] });
  for (let i = 0; i < 25; i++) snapshotHistory(mk(i), 'campaign-builder:history', 20);
  assert.equal(loadHistory().length, 20);
  // The most recent undo returns the last pushed state.
  assert.equal(undoHistory().quests[0].id, '24');
});
