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
  createHeartbeatLock,
} from '../src/storage/GMLock.js';
import { installLocalStorage, installWindow } from './helpers/env.js';

test('claimLock succeeds on a free, own, or expired lock and refreshes the timestamp', () => {
  assert.deepEqual(claimLock(null, 'a', 100), { id: 'a', at: 100 });
  assert.deepEqual(claimLock({ id: 'a', at: 100 }, 'a', 200), { id: 'a', at: 200 });
  assert.deepEqual(claimLock({ id: 'b', at: 0 }, 'a', GM_LOCK_TTL + 1), {
    id: 'a',
    at: GM_LOCK_TTL + 1,
  });
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

test('a heartbeat lock claims, reports, and releases its key', () => {
  installWindow();
  const lock = createHeartbeatLock({ onYield: () => assert.fail('no takeover happened') });
  assert.equal(lock.claim('k'), true);
  assert.equal(lock.heldKey(), 'k');
  assert.equal(loadLock('k')?.id, lock.tabId);
  lock.release();
  assert.equal(lock.heldKey(), null);
  assert.equal(loadLock('k'), null);
});

test('a claim refused by another tab leaves this tab holding nothing', () => {
  installWindow();
  const lock = createHeartbeatLock({ onYield: () => assert.fail('no takeover happened') });
  saveLock({ id: 'other', at: Date.now() }, 'k');
  assert.equal(lock.claim('k'), false);
  assert.equal(lock.heldKey(), null);
  assert.deepEqual(loadLock('k')?.id, 'other', 'the other tab keeps its lock');
});

test('claiming a second key releases the first, and a refusal releases it too', () => {
  installWindow();
  const lock = createHeartbeatLock({ onYield: () => assert.fail('no takeover happened') });
  lock.claim('one');
  assert.equal(lock.claim('two'), true);
  assert.equal(loadLock('one'), null, 'the first key is freed for other tabs');
  assert.equal(lock.heldKey(), 'two');
  saveLock({ id: 'other', at: Date.now() }, 'three');
  assert.equal(lock.claim('three'), false);
  assert.equal(loadLock('two'), null);
  assert.equal(lock.heldKey(), null);
  lock.release();
});

test('the heartbeat refreshes the stored record while the lock is held', async () => {
  installWindow();
  let clock = 1000;
  const lock = createHeartbeatLock({
    onYield: () => assert.fail('no takeover happened'),
    now: () => clock,
    heartbeat: 2,
  });
  lock.claim('k');
  assert.equal(loadLock('k')?.at, 1000);
  clock = 2000;
  await new Promise((resolve) => {
    setTimeout(resolve, 20);
  });
  assert.equal(loadLock('k')?.at, 2000);
  lock.release();
  clock = 3000;
  await new Promise((resolve) => {
    setTimeout(resolve, 20);
  });
  assert.equal(loadLock('k'), null, 'releasing stops the heartbeat');
});

test('a takeover of the held key yields without clobbering the new holder', () => {
  const fire = installWindow();
  let yielded = 0;
  const lock = createHeartbeatLock({ onYield: () => (yielded += 1) });
  lock.claim('k');
  // Another tab's write plus the storage event it raises in this tab.
  saveLock({ id: 'other', at: Date.now() }, 'k');
  fire('storage', { key: 'k' });
  assert.equal(yielded, 1);
  assert.equal(lock.heldKey(), null);
  // Whatever the yield handler does may call release; the other tab's lock must
  // survive it.
  lock.release();
  assert.equal(loadLock('k')?.id, 'other');
});

test('a storage event for another key, or one this tab still holds, does not yield', () => {
  const fire = installWindow();
  let yielded = 0;
  const lock = createHeartbeatLock({ onYield: () => (yielded += 1) });
  lock.claim('k');
  fire('storage', { key: 'other-key' });
  fire('storage', { key: 'k' });
  assert.equal(yielded, 0);
  assert.equal(lock.heldKey(), 'k');
  lock.release();
});

test('pagehide releases the lock so a follower need not wait out the TTL', () => {
  const fire = installWindow();
  const lock = createHeartbeatLock({ onYield: () => assert.fail('no takeover happened') });
  lock.claim('k');
  fire('pagehide', {});
  assert.equal(lock.heldKey(), null);
  assert.equal(loadLock('k'), null);
});
