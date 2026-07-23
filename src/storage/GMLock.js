/**
 * Cross-tab GM exclusivity. Role is per-tab, but only one tab at a time may
 * hold the GM view: the GM tab claims a heartbeat-refreshed lock in
 * localStorage, and every other tab of the same origin is forced into the
 * Player view while that lock is live. The TTL lets a crashed GM tab's lock
 * expire rather than wedging the campaign; a clean close releases it.
 *
 * Pure decision logic (claim/hold/expiry) is separated from thin localStorage
 * wrappers, matching SaveManager.
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
