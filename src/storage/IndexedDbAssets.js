/**
 * The IndexedDB `AssetBackend`: one database with one object store, whose
 * keys are asset keys and whose values are payload strings. This is thin
 * glue over the browser API, so the browser check in `docs/testing.md`
 * covers it, and the unit tests of `AssetMirror.js` use the memory backend.
 *
 * `openIndexedDbAssets` resolves to null instead of rejecting when the
 * database does not open: no `indexedDB` global, an open error (an older
 * Firefox private window), or no answer within `OPEN_TIMEOUT_MS`. The
 * caller then keeps the payloads in localStorage. A browser that never
 * answers the open otherwise stops the app at boot.
 */

/** @typedef {import('../types/storage.js').AssetBackend} AssetBackend */
/** @typedef {import('../types/storage.js').AssetTable} AssetTable */

/** The database name. */
export const ASSET_DB_NAME = 'campaign-builder';

/** The object store that keeps the payloads. */
export const ASSET_STORE = 'assets';

/** How long the boot waits for the database to open. */
export const OPEN_TIMEOUT_MS = 3000;

/**
 * Settle a promise when a transaction commits, and reject it when the
 * transaction fails or aborts. `complete` fires only after the commit, so
 * another tab that reads the store afterward sees the change.
 * @param {IDBTransaction} tx
 * @param {() => void} done
 * @param {(error: unknown) => void} fail
 */
function onCommit(tx, done, fail) {
  tx.oncomplete = () => done();
  tx.onerror = () => fail(tx.error);
  tx.onabort = () => fail(tx.error);
}

/**
 * Ask the browser once per session to keep the origin's storage when disk
 * space runs low. Firefox shows a permission prompt for it, so the first
 * stored image asks, not the boot. A refusal changes nothing else.
 */
let persistAsked = false;
function askToPersist() {
  if (persistAsked) return;
  persistAsked = true;
  const storage = globalThis.navigator?.storage;
  if (!storage?.persist) return;
  void storage
    .persisted()
    .then((already) => already || storage.persist())
    .catch(() => {});
}

/**
 * @param {IDBDatabase} db
 * @returns {AssetBackend}
 */
function backendOver(db) {
  /** @param {IDBTransactionMode} mode */
  const store = (mode) => db.transaction(ASSET_STORE, mode);
  return {
    getAll: () =>
      new Promise((resolve, reject) => {
        const tx = store('readonly');
        const keys = tx.objectStore(ASSET_STORE).getAllKeys();
        const values = tx.objectStore(ASSET_STORE).getAll();
        onCommit(
          tx,
          () => {
            /** @type {AssetTable} */
            const table = {};
            keys.result.forEach((key, i) => {
              if (typeof key === 'string' && typeof values.result[i] === 'string')
                table[key] = values.result[i];
            });
            resolve(table);
          },
          reject,
        );
      }),
    getMany: (keys) =>
      new Promise((resolve, reject) => {
        const tx = store('readonly');
        const requests = keys.map((key) => tx.objectStore(ASSET_STORE).get(key));
        onCommit(
          tx,
          () => {
            /** @type {AssetTable} */
            const found = {};
            requests.forEach((request, i) => {
              if (typeof request.result === 'string') found[keys[i]] = request.result;
            });
            resolve(found);
          },
          reject,
        );
      }),
    putMany: (entries) =>
      new Promise((resolve, reject) => {
        const tx = store('readwrite');
        for (const [key, payload] of entries) tx.objectStore(ASSET_STORE).put(payload, key);
        onCommit(
          tx,
          () => {
            if (entries.length) askToPersist();
            resolve();
          },
          reject,
        );
      }),
    deleteMany: (keys) =>
      new Promise((resolve, reject) => {
        const tx = store('readwrite');
        for (const key of keys) tx.objectStore(ASSET_STORE).delete(key);
        onCommit(tx, resolve, reject);
      }),
  };
}

/**
 * Open the asset database, or resolve to null when it does not open.
 * @param {IDBFactory | undefined} [factory]
 * @param {number} [timeoutMs]
 * @returns {Promise<AssetBackend | null>}
 */
export function openIndexedDbAssets(factory = globalThis.indexedDB, timeoutMs = OPEN_TIMEOUT_MS) {
  if (!factory) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    /** @param {AssetBackend | null} result */
    const settle = (result) => {
      if (settled) return false;
      settled = true;
      clearTimeout(timer);
      resolve(result);
      return true;
    };
    const timer = setTimeout(() => settle(null), timeoutMs);
    /** @type {IDBOpenDBRequest} */
    let request;
    try {
      request = factory.open(ASSET_DB_NAME, 1);
    } catch {
      settle(null);
      return;
    }
    request.onupgradeneeded = () => {
      request.result.createObjectStore(ASSET_STORE);
    };
    request.onsuccess = () => {
      const db = request.result;
      // A later version of the app that upgrades the database waits on
      // every open connection. Closing this one lets that upgrade run.
      db.onversionchange = () => db.close();
      if (!settle(backendOver(db))) db.close();
    };
    request.onerror = () => settle(null);
    request.onblocked = () => settle(null);
  });
}
