/**
 * An `AssetBackend` that keeps its payloads in a `Map`. The unit tests of
 * `AssetMirror.js` use it in place of IndexedDB, and a test can make one
 * call fail by replacing that method on the returned object.
 *
 * Each method copies what it receives and what it returns, as IndexedDB
 * does, so a caller that changes a table after a call does not change the
 * store.
 */

/** @typedef {import('../types/storage.js').AssetBackend} AssetBackend */
/** @typedef {import('../types/storage.js').AssetTable} AssetTable */

/**
 * @param {AssetTable} [initial]
 * @returns {AssetBackend & { store: Map<string, string> }}
 */
export function createMemoryBackend(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    async getAll() {
      return Object.fromEntries(store);
    },
    async getMany(keys) {
      /** @type {AssetTable} */
      const found = {};
      for (const key of keys) {
        const payload = store.get(key);
        if (payload !== undefined) found[key] = payload;
      }
      return found;
    },
    async putMany(entries) {
      for (const [key, payload] of entries) store.set(key, payload);
    },
    async deleteMany(keys) {
      for (const key of keys) store.delete(key);
    },
  };
}
