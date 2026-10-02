/**
 * A ledger of what each localStorage key costs, so the quota check after a
 * save does not read every stored value again.
 *
 * The save, the history deltas, the custom library, and the lock and
 * preference flags share one origin quota of about 5 MB. The image table
 * joins them only when IndexedDB is not in use (`AssetMirror.js`).
 * `trySaveToLocalStorage` measures the whole footprint after every write,
 * and `HistoryLog.trimToCap` measures every delta again in the same save.
 * Near the warning threshold that copied several megabytes of strings per
 * autosave. This module keeps a `Map` from key to stored length instead. It
 * reads the origin once. Every localStorage write in the app goes through
 * `writeStored` and `removeStored`, which record it. That includes the theme
 * flag in `ui/ThemeToggle.js` and the onboarding flag in `app/onboarding.js`.
 * A direct `setItem` that rewrites an existing key with a new length keeps
 * the key count the same, so no backstop below detects it and the footprint
 * stays wrong until the next re-read. A test in `tests/Footprint.test.js`
 * fails when code outside `src/storage/` calls `setItem` or `removeItem` on
 * a storage handle, or calls `localStorage.clear`.
 *
 * Other tabs write the same keys. Their writes reach this tab as `storage`
 * events, and `SaveManager.onExternalSave` passes every such event to
 * `recordExternalWrite`, so the ledger follows them without a re-read. The
 * ledger also re-reads the origin when the key count differs from its own
 * size, and when the `localStorage` object itself is a different one (a test
 * installs a fresh stub per case).
 */

/**
 * The approximate storage limit a browser gives one origin in localStorage,
 * in bytes at two bytes per character. A browser can allow more, so a
 * decision made on this number errs toward caution.
 */
export const QUOTA_BYTES = 5 * 1024 * 1024;

/** @type {Map<string, number> | null} */
let ledger = null;

/** The storage object `ledger` describes, so a replaced stub starts over. */
/** @type {unknown} */
let source = null;

/** A count of every write `recordExternalWrite` has seen from another tab. */
let externalWrites = 0;

/** The count at the last external write to each key. */
/** @type {Map<string, number>} */
const lastExternal = new Map();

/** The count at the last external `clear()`, which touches every key. */
let clearedAt = 0;

/**
 * The byte cost of a set of stored key and value pairs, keys included.
 * localStorage charges for both, in UTF-16 code units. The function is
 * pure, so a unit test can check the quota arithmetic without a storage
 * stub.
 * @param {Iterable<[string, string]>} pairs
 * @returns {number}
 */
export function footprintBytes(pairs) {
  let total = 0;
  for (const [key, value] of pairs) total += (key.length + value.length) * 2;
  return total;
}

/**
 * Read every key of the origin once and rebuild the ledger from it.
 * @returns {Map<string, number>}
 */
function readLedger() {
  /** @type {Map<string, number>} */
  const next = new Map();
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key === null) continue;
    next.set(key, localStorage.getItem(key)?.length ?? 0);
  }
  ledger = next;
  source = localStorage;
  return next;
}

/** True when the ledger describes the storage object in use right now. */
function tracking() {
  return ledger !== null && source === localStorage;
}

/**
 * The ledger, re-read when it is missing, describes another storage object,
 * or disagrees with the origin on how many keys exist.
 * @returns {Map<string, number>}
 */
function currentLedger() {
  if (!tracking() || /** @type {Map<string, number>} */ (ledger).size !== localStorage.length) {
    return readLedger();
  }
  return /** @type {Map<string, number>} */ (ledger);
}

/**
 * `localStorage.setItem`, recorded in the ledger. A quota failure throws
 * through, exactly as the raw call does, and records nothing.
 * @param {string} key
 * @param {string} value
 */
export function writeStored(key, value) {
  localStorage.setItem(key, value);
  if (tracking()) /** @type {Map<string, number>} */ (ledger).set(key, value.length);
}

/**
 * `localStorage.removeItem`, recorded in the ledger.
 * @param {string} key
 */
export function removeStored(key) {
  localStorage.removeItem(key);
  if (tracking()) /** @type {Map<string, number>} */ (ledger).delete(key);
}

/**
 * Record a write made by another tab, from the `storage` event the browser
 * fires for it. A `clear()` arrives with a null key and drops the whole
 * ledger, so the next read rebuilds it.
 * @param {{ key: string | null, newValue: string | null }} event
 */
export function recordExternalWrite(event) {
  externalWrites += 1;
  if (event.key === null) {
    ledger = null;
    clearedAt = externalWrites;
    return;
  }
  lastExternal.set(event.key, externalWrites);
  if (!tracking()) return;
  const map = /** @type {Map<string, number>} */ (ledger);
  if (event.newValue === null) map.delete(event.key);
  else map.set(event.key, event.newValue.length);
}

/**
 * The serial number of the last write another tab made to one key, or to the
 * whole origin with `clear()`. A module that caches a stored value compares
 * this number with the one it read at its own write, so a change from
 * another tab forces a fresh read even when the length stayed the same.
 * @param {string} key
 * @returns {number}
 */
export function externalWriteSerial(key) {
  return Math.max(lastExternal.get(key) ?? 0, clearedAt);
}

/**
 * The stored length of one key, or 0 when the key is absent. A key the
 * ledger does not know means a write happened behind its back, so the
 * ledger is read again before it answers.
 * @param {string} key
 * @returns {number}
 */
export function storedLength(key) {
  const known = currentLedger().get(key);
  if (known !== undefined) return known;
  return readLedger().get(key) ?? 0;
}

/**
 * What this origin currently spends of its localStorage quota: every key,
 * not just the campaign save, in bytes.
 * @returns {number}
 */
export function storageFootprint() {
  return footprintWhere(() => true);
}

/**
 * What the keys that pass `test` spend of the quota, in bytes, keys
 * included. The undo log uses it to tell its own bytes from the rest of the
 * origin.
 * @param {(key: string) => boolean} test
 * @returns {number}
 */
export function footprintWhere(test) {
  let total = 0;
  for (const [key, length] of currentLedger()) {
    if (test(key)) total += (key.length + length) * 2;
  }
  return total;
}
