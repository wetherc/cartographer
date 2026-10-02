/**
 * Remember which panels and groups the GM folded, per browser. The record is
 * a set of string keys under one localStorage key. Storage can be missing or
 * can throw (a private window, blocked site data), so every read and write
 * falls back: a failed read gives the defaults, and a failed write changes
 * only the set in memory.
 *
 * Reads take a storage handle, and writes take a writer function. In the
 * browser the writer is `writeStored` from `storage/Footprint.js`, so the
 * footprint ledger records the new length of the key. A direct `setItem`
 * would leave the ledger wrong by the size of the record.
 */

/**
 * Read the folded keys, or `defaults` when nothing is stored or the read
 * fails.
 * @param {Pick<Storage, 'getItem'> | null | undefined} storage
 * @param {string} key
 * @param {Iterable<string>} defaults
 * @returns {Set<string>}
 */
export function readFolds(storage, key, defaults) {
  try {
    const raw = storage?.getItem(key);
    const list = raw ? JSON.parse(raw) : null;
    if (Array.isArray(list)) return new Set(list.filter((k) => typeof k === 'string'));
  } catch {
    // Fall through to the defaults.
  }
  return new Set(defaults);
}

/**
 * Fold or open `name` in `folds`, then store the set through `write`.
 * Returns the new state: true when `name` is folded.
 * @param {((key: string, value: string) => void) | null | undefined} write
 * @param {string} key
 * @param {Set<string>} folds
 * @param {string} name
 * @returns {boolean}
 */
export function toggleFold(write, key, folds, name) {
  const folded = !folds.has(name);
  if (folded) folds.add(name);
  else folds.delete(name);
  try {
    write?.(key, JSON.stringify([...folds]));
  } catch {
    // The set in memory still changes.
  }
  return folded;
}

/**
 * The browser's localStorage, or null where reading it throws.
 * @returns {Storage | null}
 */
export function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
