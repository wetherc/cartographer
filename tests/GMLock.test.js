import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  GM_LOCK_TTL,
  GM_LOCK_HEARTBEAT,
  isLockActive,
  isHeldByOther,
  claimLock,
  loadLock,
  saveLock,
  releaseLock,
} from '../src/storage/GMLock.js';

/** Minimal in-memory localStorage so the storage wrappers run under Node. */
function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

test('claimLock succeeds on a free, own, or expired lock and refreshes the timestamp', () => {
  assert.deepEqual(claimLock(null, 'a', 100), { id: 'a', at: 100 });
  assert.deepEqual(claimLock({ id: 'a', at: 100 }, 'a', 200), { id: 'a', at: 200 });
  assert.deepEqual(claimLock({ id: 'b', at: 0 }, 'a', GM_LOCK_TTL + 1), { id: 'a', at: GM_LOCK_TTL + 1 });
});

test('claimLock is refused while another tab holds a live lock', () => {
  assert.equal(claimLock({ id: 'b', at: 100 }, 'a', 100 + GM_LOCK_TTL - 1), null);
});

test('isLockActive treats missing, malformed, and stale records as inactive', () => {
  assert.equal(isLockActive(null, 100), false);
  assert.equal(isLockActive(/** @type {any} */ ({ id: 'a' }), 100), false);
  assert.equal(isLockActive({ id: 'a', at: 0 }, GM_LOCK_TTL), false);
  assert.equal(isLockActive({ id: 'a', at: 0 }, GM_LOCK_TTL - 1), true);
});

test('isHeldByOther is false for our own live lock', () => {
  assert.equal(isHeldByOther({ id: 'a', at: 100 }, 'a', 101), false);
  assert.equal(isHeldByOther({ id: 'b', at: 100 }, 'a', 101), true);
});

test('heartbeat interval leaves ample margin under the TTL', () => {
  assert.ok(GM_LOCK_HEARTBEAT * 2 <= GM_LOCK_TTL);
});

beforeEach(installLocalStorage);

test('loadLock tolerates a missing or corrupt entry', () => {
  assert.equal(loadLock(), null);
  localStorage.setItem('campaign-builder:gm-lock', 'not json');
  assert.equal(loadLock(), null);
  localStorage.setItem('campaign-builder:gm-lock', '{"id":1,"at":"x"}');
  assert.equal(loadLock(), null);
});

test('saveLock then loadLock round-trips, and releaseLock only removes our own', () => {
  saveLock({ id: 'a', at: 5 });
  assert.deepEqual(loadLock(), { id: 'a', at: 5 });
  releaseLock('b');
  assert.deepEqual(loadLock(), { id: 'a', at: 5 }, 'another tab must not clobber the lock');
  releaseLock('a');
  assert.equal(loadLock(), null);
});
