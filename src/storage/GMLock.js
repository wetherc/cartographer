/**
 * Cross-tab exclusivity through heartbeat locks in localStorage. The GM view is
 * the original case, which the names come from. Role is per-tab, but only one tab
 * at a time may hold GM, so the GM tab claims a heartbeat-refreshed lock and
 * every other tab of the same origin is forced into the Player view while that
 * lock is live. The TTL lets a crashed GM tab's lock expire rather than wedging
 * the campaign; a clean close releases it. Player tabs use the same machinery
 * under a per-character key so two tabs cannot play one character.
 *
 * Pure decision logic (claim/hold/expiry) is separated from thin localStorage
 * wrappers, matching SaveManager. `createHeartbeatLock` at the bottom is the
 * stateful tab-side driver both callers use.
 */

/** @typedef {{ id: string, at: number }} GMLockRecord */

export const GM_LOCK_KEY = 'campaign-builder:gm-lock';

/** How long a lock outlives its last heartbeat before other tabs treat it as
 * abandoned (a crashed or frozen GM tab). */
export const GM_LOCK_TTL = 15000;

/** How often the holding tab refreshes its heartbeat; well under the TTL so a
 * single missed beat never expires a healthy lock. */
export const GM_LOCK_HEARTBEAT = 5000;

/**
 * Whether a lock record is live: present, well-formed, and heartbeaten within
 * the TTL. Pure.
 * @param {GMLockRecord | null} record
 * @param {number} now
 * @param {number} [ttl]
 * @returns {boolean}
 */
export function isLockActive(record, now, ttl = GM_LOCK_TTL) {
  return record !== null && typeof record.at === 'number' && now - record.at < ttl;
}

/**
 * Whether a live lock belongs to some other tab. Pure.
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
 * Attempt to claim (or refresh) the lock: succeeds when it is free, expired,
 * or already ours, returning the record to store; null means another tab holds
 * it. Pure — the caller persists the result.
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
 * Read the stored lock, tolerating a missing or corrupt entry.
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
  localStorage.setItem(key, JSON.stringify(record));
}

/**
 * Release the lock, but only if this tab still holds it — never clobber a
 * lock another tab has since claimed.
 * @param {string} id this tab's id
 * @param {string} [key]
 */
export function releaseLock(id, key = GM_LOCK_KEY) {
  if (loadLock(key)?.id === id) localStorage.removeItem(key);
}

/**
 * @typedef {object} HeartbeatLock
 * @property {(key: string) => boolean} claim take (or refresh) the lock under
 *   `key`, releasing whatever this tab held before. False means another tab
 *   holds it and this tab holds nothing.
 * @property {() => void} release give up whatever this tab holds, if anything.
 * @property {() => string | null} heldKey the key this tab currently holds.
 * @property {string} tabId this tab's lock id, for tests and diagnostics.
 */

/**
 * One tab's side of a heartbeat lock. It claims a key, refreshes the record on
 * an interval so other tabs can see it is alive, and releases it when the tab
 * goes away. The key is an argument rather than fixed, because one lock instance
 * moves between keys. A player tab that switches which character it plays
 * releases the old character's lock and claims the new one.
 *
 * `onYield` runs when another tab takes over the key this tab holds, which
 * happens if this tab was frozen or backgrounded long enough for its record to
 * expire. The heartbeat has already stopped and the lock is no longer held by
 * the time it runs, so the callback only has to undo whatever the lock was
 * guarding.
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

  // A takeover reaches this tab as a storage event on the key it holds. Yield
  // rather than keep running, since the other tab is now the one whose writes
  // other tabs will follow.
  window.addEventListener('storage', (event) => {
    if (held === null || event.key !== held) return;
    if (!isHeldByOther(loadLock(held), tabId, now(), ttl)) return;
    stopBeating();
    held = null;
    onYield();
  });

  // Release on the way out so a follower can take over without waiting out the
  // TTL. pagehide also covers tab discard and navigation.
  window.addEventListener('pagehide', release);

  return { claim, release, heldKey: () => held, tabId };
}
