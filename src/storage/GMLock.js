/**
 * This module gives cross-tab exclusivity through heartbeat locks in
 * localStorage. The GM view is the original case, and the names in this
 * module come from it.
 *
 * Role is per-tab, but only one tab can hold the GM role at a time. The GM
 * tab claims a heartbeat-refreshed lock. While that lock is live, every other
 * tab of the same origin runs in the Player view.
 *
 * The TTL lets a crashed GM tab's lock expire instead of leaving the campaign
 * permanently locked. A clean close releases the lock. Player tabs use the
 * same mechanism under a per-character key, so two tabs cannot play the same
 * character.
 *
 * This module separates pure decision logic (claim, hold, expiry) from thin
 * localStorage wrappers, the same pattern as SaveManager. `createHeartbeatLock`,
 * at the bottom of the file, is the stateful driver that both callers use for
 * one tab.
 */

import { removeStored, writeStored } from './Footprint.js';

/** @typedef {{ id: string, at: number }} GMLockRecord */

export const GM_LOCK_KEY = 'campaign-builder:gm-lock';

/** How long a lock stays valid after its last heartbeat. After this time,
 * other tabs treat the lock as abandoned by a crashed or frozen GM tab. */
export const GM_LOCK_TTL = 15000;

/** How often the tab that holds the lock refreshes its heartbeat. This
 * interval stays well under the TTL, so one missed beat never expires a
 * healthy lock. */
export const GM_LOCK_HEARTBEAT = 5000;

/**
 * Report whether a lock record is live: present, well-formed, and
 * heartbeaten within the TTL. This function is pure.
 * @param {GMLockRecord | null} record
 * @param {number} now
 * @param {number} [ttl]
 * @returns {boolean}
 */
export function isLockActive(record, now, ttl = GM_LOCK_TTL) {
  return record !== null && typeof record.at === 'number' && now - record.at < ttl;
}

/**
 * Report whether a live lock belongs to another tab. This function is pure.
 * @param {GMLockRecord | null} record
 * @param {string} id this tab's id
 * @param {number} now
 * @param {number} [ttl]
 * @returns {boolean}
 */
export function isHeldByOther(record, id, now, ttl = GM_LOCK_TTL) {
  return isLockActive(record, now, ttl) && record !== null && record.id !== id;
}

/**
 * Try to claim or refresh the lock. The attempt succeeds when the lock is
 * free, expired, or already held by this tab, and returns the record to
 * store. A null result means another tab holds the lock. This function is
 * pure: the caller must persist the result.
 * @param {GMLockRecord | null} record the currently stored lock
 * @param {string} id this tab's id
 * @param {number} now
 * @param {number} [ttl]
 * @returns {GMLockRecord | null}
 */
export function claimLock(record, id, now, ttl = GM_LOCK_TTL) {
  return isHeldByOther(record, id, now, ttl) ? null : { id, at: now };
}

/**
 * Read the stored lock. Return null for a missing or corrupt entry.
 * @param {string} [key]
 * @returns {GMLockRecord | null}
 */
export function loadLock(key = GM_LOCK_KEY) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? 'null');
    return parsed && typeof parsed.id === 'string' && typeof parsed.at === 'number' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Persist a claimed lock record.
 * @param {GMLockRecord} record
 * @param {string} [key]
 */
export function saveLock(record, key = GM_LOCK_KEY) {
  writeStored(key, JSON.stringify(record));
}

/**
 * Release the lock only if this tab still holds it. Do not remove a lock
 * that another tab has since claimed.
 * @param {string} id this tab's id
 * @param {string} [key]
 */
export function releaseLock(id, key = GM_LOCK_KEY) {
  if (loadLock(key)?.id === id) removeStored(key);
}

/**
 * @typedef {object} HeartbeatLock
 * @property {(key: string) => boolean} claim take or refresh the lock under
 *   `key`, releasing whatever this tab held before. A false result means
 *   another tab holds the lock and this tab holds nothing.
 * @property {() => void} release give up whatever this tab holds, if anything.
 * @property {() => string | null} heldKey the key this tab currently holds.
 * @property {string} tabId this tab's lock id, for tests and diagnostics.
 */

/**
 * This function builds one tab's side of a heartbeat lock. It claims a key,
 * refreshes the record on an interval so other tabs can see it is alive, and
 * releases the key when the tab closes.
 *
 * The key is an argument, not a fixed value, because one lock instance can
 * move between keys. For example, a player tab that switches character
 * releases the old character's lock and claims the new one.
 *
 * `onYield` runs when another tab takes over the key this tab holds. This
 * happens when this tab was frozen or in the background long enough for its
 * record to expire. By the time `onYield` runs, the heartbeat has already
 * stopped and the lock is no longer held, so the callback only needs to undo
 * whatever the lock was guarding.
 *
 * @param {object} options
 * @param {() => void} options.onYield
 * @param {() => number} [options.now] injectable clock, for tests
 * @param {number} [options.ttl]
 * @param {number} [options.heartbeat] milliseconds between record refreshes
 * @returns {HeartbeatLock}
 */
export function createHeartbeatLock({
  onYield,
  now = Date.now,
  ttl = GM_LOCK_TTL,
  heartbeat = GM_LOCK_HEARTBEAT,
}) {
  const tabId = `${now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  /** @type {string | null} */
  let held = null;
  /** @type {ReturnType<typeof setInterval> | null} */
  let timer = null;

  function stopBeating() {
    if (timer !== null) clearInterval(timer);
    timer = null;
  }

  /** @param {string} key */
  function claim(key) {
    if (held !== null && held !== key) release();
    const next = claimLock(loadLock(key), tabId, now(), ttl);
    if (!next) return false;
    held = key;
    saveLock(next, key);
    if (timer === null) {
      timer = setInterval(() => {
        if (held !== null) saveLock({ id: tabId, at: now() }, held);
      }, heartbeat);
    }
    return true;
  }

  function release() {
    stopBeating();
    if (held !== null) releaseLock(tabId, held);
    held = null;
  }

  // A takeover reaches this tab as a storage event on the key it holds. This
  // tab yields instead of continuing, because other tabs now follow the
  // other tab's writes.
  window.addEventListener('storage', (event) => {
    if (held === null || event.key !== held) return;
    if (!isHeldByOther(loadLock(held), tabId, now(), ttl)) return;
    stopBeating();
    held = null;
    onYield();
  });

  // Release the lock when the tab closes, so a follower can take over
  // without waiting for the TTL to expire. pagehide also covers tab discard
  // and navigation.
  window.addEventListener('pagehide', release);

  return { claim, release, heldKey: () => held, tabId };
}
