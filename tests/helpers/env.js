/**
 * Browser globals the storage modules reach for, reimplemented in memory so
 * they run under `node --test`. These are stubs rather than fakes: they carry
 * the whole surface the app touches and nothing else.
 */

/**
 * Install an in-memory `localStorage`. The returned Map is the backing store,
 * so a test can inspect or seed keys without going through the accessors.
 *
 * `length` and `key` are part of the stub even though most callers only read
 * and write named keys, because the quota walk and the retention scan iterate
 * the whole origin.
 * @returns {Map<string, string>}
 */
export function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = /** @type {any} */ ({
    get length() {
      return store.size;
    },
    key: (i) => [...store.keys()][i] ?? null,
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  });
  return store;
}

/**
 * Install enough of `window` for a module to register listeners, and hand back
 * a way to fire one. Handlers are held per event name, so delivering a
 * `storage` event looks the way another tab's write does.
 * @returns {(type: string, event: any) => void}
 */
export function installWindow() {
  /** @type {Map<string, Set<(event: any) => void>>} */
  const handlers = new Map();
  globalThis.window = /** @type {any} */ ({
    addEventListener: (type, handler) => {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type)?.add(handler);
    },
    removeEventListener: (type, handler) => handlers.get(type)?.delete(handler),
  });
  return (type, event) => handlers.get(type)?.forEach((handler) => handler(event));
}
