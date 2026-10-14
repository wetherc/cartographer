/**
 * The image payloads of a stored campaign, kept in an `AssetBackend`
 * (IndexedDB in the browser), with an in-memory copy of every payload the
 * backend has committed.
 *
 * Images are the only stored data with no bound that the app sets. One
 * compressed handout is about 59,000 characters, so twenty of them fill
 * half of the roughly 5 MB that localStorage gives an origin. IndexedDB
 * takes a share of the disk instead. The campaign string, the undo log, and
 * the save mark stay in localStorage, because cross-tab sync runs on its
 * `storage` event.
 *
 * The copy keeps every reader synchronous. `main.js` fills it with one
 * `getAll()` before the campaign loads, and after that `deserialize`, the
 * undo log, and the retention scan read it like the localStorage table.
 * Only the writes are asynchronous. A save that adds a payload does not
 * write the campaign until the backend commits the payload
 * (`stageAssets`). Otherwise another tab can adopt the campaign, look up
 * the new key, and miss it.
 *
 * Until `openAssetMirror` or `useAssetBackend` installs a backend, this
 * module does nothing, and `AssetStore.js` keeps the payloads in
 * localStorage. That is also the fallback when IndexedDB is missing or does
 * not open.
 */

import { ASSET_PREFIX, referencedAssetKeys, restoreAssets } from './Assets.js';
import {
  ASSETS_KEY,
  loadAssetTable,
  otherStoredStrings,
  pruneAssets,
  storedKeyNames,
} from './AssetStore.js';
import { removeStored } from './Footprint.js';

/** @typedef {import('../types/storage.js').AssetBackend} AssetBackend */
/** @typedef {import('../types/storage.js').AssetTable} AssetTable */

/** The backend in use, or null while the payloads stay in localStorage. @type {AssetBackend | null} */
let backend = null;

/**
 * Every payload the backend has committed, as far as this tab knows. A key
 * enters only after its put commits, so a save that finds its key here can
 * write the campaign at once.
 * @type {AssetTable}
 */
let committed = {};

/** The puts in flight, by key. @type {Map<string, { payload: string, done: Promise<boolean> }>} */
const inflight = new Map();

/**
 * The payloads whose last put failed, by key. The next save writes its
 * campaign without them and reports `assetsOk: false`, and the save after
 * that tries the put again. Without this record, a backend that refuses
 * every put keeps the campaign unsaved.
 * @type {Map<string, string>}
 */
const failed = new Map();

/** A count that changes whenever `committed` gains or loses a key. */
let version = 0;

/**
 * What the last retention scan saw: the sorted keys the save referenced,
 * the names of every localStorage key, and `version`. A scan with the same
 * three cannot remove anything, as `AssetStore.persistAssets` explains.
 * @type {{ refs: string, keys: Set<string>, version: number } | null}
 */
let lastScan = null;

/**
 * Make `target` the backend in use, with `table` as the payloads it contains
 * now. `main.js` calls `openAssetMirror` instead. A test passes a memory
 * backend, and `null` returns to localStorage.
 * @param {AssetBackend | null} target
 * @param {AssetTable} [table] what the backend contains now
 */
export function useAssetBackend(target, table = {}) {
  backend = target;
  committed = { ...table };
  inflight.clear();
  failed.clear();
  version += 1;
  lastScan = null;
}

/** True when a backend keeps the payloads, and not localStorage. */
export function mirrorActive() {
  return backend !== null;
}

/**
 * The payload table that a load reads: the committed copy, or the
 * localStorage table when no backend is in use. A caller reads it at once
 * and does not keep it, because a commit adds to the same object.
 * @returns {AssetTable}
 */
export function storedAssetTable() {
  return backend ? committed : loadAssetTable();
}

/**
 * Put `entries` in the backend. A committed payload joins `committed`, and a
 * refused one joins `failed`. The promise never rejects.
 * @param {AssetBackend} target
 * @param {[string, string][]} entries
 * @returns {Promise<boolean>}
 */
function commit(target, entries) {
  /** @param {(key: string, payload: string) => void} settle */
  const finish = (settle) => {
    for (const [key, payload] of entries) {
      if (inflight.get(key)?.done === done) inflight.delete(key);
      // A backend replaced while the put ran keeps its own tables.
      if (backend === target) settle(key, payload);
    }
  };
  /** @type {Promise<void>} */
  let put;
  try {
    put = target.putMany(entries);
  } catch (error) {
    put = Promise.reject(error);
  }
  const done = put.then(
    () => {
      finish((key, payload) => {
        committed[key] = payload;
      });
      version += 1;
      return true;
    },
    () => {
      finish((key, payload) => failed.set(key, payload));
      return false;
    },
  );
  for (const [key, payload] of entries) inflight.set(key, { payload, done });
  return done;
}

/**
 * Make sure every payload of a save is committed before the save writes a
 * campaign that references it. `pending` is null when every payload is
 * committed already, and the caller writes the campaign now. Otherwise it
 * is the promise of the puts, and the caller writes the campaign after it
 * settles, by saving again. `assetsOk` is false when a payload failed its
 * last put. The campaign is then written without it, and the next save
 * tries the put again.
 * @param {AssetTable} assets the payloads the save references
 * @returns {{ pending: Promise<boolean> | null, assetsOk: boolean }}
 */
export function stageAssets(assets) {
  if (!backend) return { pending: null, assetsOk: true };
  /** @type {[string, string][]} */
  const fresh = [];
  /** @type {Promise<boolean>[]} */
  const waits = [];
  let assetsOk = true;
  for (const [key, payload] of Object.entries(assets)) {
    if (committed[key] === payload) continue;
    const flight = inflight.get(key);
    if (flight?.payload === payload) {
      waits.push(flight.done);
    } else if (failed.get(key) === payload) {
      failed.delete(key);
      assetsOk = false;
    } else {
      fresh.push([key, payload]);
    }
  }
  if (fresh.length) waits.push(commit(backend, fresh));
  if (!waits.length) return { pending: null, assetsOk };
  return { pending: Promise.all(waits).then((all) => all.every(Boolean)), assetsOk };
}

/**
 * Remove every committed payload that no stored string references, from the
 * copy at once and from the backend in the background. The rule is the
 * retention rule of `AssetStore.persistAssets`: the save just written and
 * every other localStorage string count, so the undo log keeps its images.
 * A delete that fails leaves a payload that nothing references, and the
 * scan after the next boot removes it. A later put of the same key runs
 * after the delete, because the backend runs its transactions in order.
 * @param {string} json the save just written
 */
export function pruneMirror(json) {
  if (!backend) return;
  const keys = Object.keys(committed);
  if (!keys.length) return;
  const refs = [...referencedAssetKeys(json)].sort().join('\n');
  const names = storedKeyNames();
  const scan = lastScan;
  if (
    scan &&
    scan.version === version &&
    scan.refs === refs &&
    [...scan.keys].every((name) => names.has(name))
  )
    return;
  const kept = pruneAssets(committed, [json, ...otherStoredStrings(new Set([ASSETS_KEY]))]);
  const doomed = keys.filter((key) => !(key in kept));
  if (doomed.length) {
    for (const key of doomed) delete committed[key];
    version += 1;
    try {
      backend.deleteMany(doomed).catch(() => {});
    } catch {
      // The payloads stay in the backend until a later scan removes them.
    }
  }
  lastScan = { refs, keys: names, version };
}

/**
 * The keys that a stored save string references and the copy does not
 * hold. Another tab commits a payload before it writes the campaign that
 * references it, so a key here was committed after this tab read the
 * backend. The match can include a literal `asset:` in a handout's text,
 * which `fetchAssets` then does not find.
 * @param {string | null} text
 * @returns {string[]}
 */
export function missingAssetKeys(text) {
  if (!backend || !text?.includes(ASSET_PREFIX)) return [];
  return [...referencedAssetKeys(text)].filter((key) => !(key in committed));
}

/**
 * Read these keys from the backend into the copy, and return how many
 * payloads arrived. A read that fails returns 0, and the image stays a
 * placeholder until the next load.
 * @param {string[]} keys
 * @returns {Promise<number>}
 */
export async function fetchAssets(keys) {
  const target = backend;
  if (!target || !keys.length) return 0;
  /** @type {AssetTable} */
  let found;
  try {
    found = await target.getMany(keys);
  } catch {
    return 0;
  }
  if (backend !== target) return 0;
  let added = 0;
  for (const [key, payload] of Object.entries(found)) {
    if (committed[key] === payload) continue;
    committed[key] = payload;
    added += 1;
  }
  if (added) version += 1;
  return added;
}

/**
 * Open the backend, read every payload into the copy, and move the payloads
 * of the localStorage table into the backend. The function resolves to
 * true when the backend is in use, and to false when the payloads stay in
 * localStorage: `open` gave no backend, or the first read or the move
 * failed.
 *
 * The localStorage table is read before the backend. Two tabs can boot at
 * once, and each removes the table only after its own put commits. A tab
 * that finds no table then reads the backend after the other tab's put, so
 * it sees the moved payloads. A tab that finds the table puts its payloads
 * again, which changes nothing. The table is removed only when it is still
 * the string this tab read, so a payload that a tab on the fallback path
 * added meanwhile stays for the next boot.
 * @param {() => Promise<AssetBackend | null>} open
 * @returns {Promise<boolean>}
 */
export async function openAssetMirror(open) {
  try {
    const legacyRaw = localStorage.getItem(ASSETS_KEY);
    const legacy = legacyRaw === null ? {} : loadAssetTable();
    const target = await open();
    if (!target) return false;
    const table = await target.getAll();
    const moved = Object.entries(legacy).filter(([key]) => !(key in table));
    if (moved.length) await target.putMany(moved);
    for (const [key, payload] of moved) table[key] = payload;
    if (legacyRaw !== null && localStorage.getItem(ASSETS_KEY) === legacyRaw) {
      removeStored(ASSETS_KEY);
    }
    useAssetBackend(target, table);
    return true;
  } catch {
    return false;
  }
}

/**
 * A live state with every `asset:` key that the copy now contains replaced by
 * its payload, the step a load runs. A tab calls this after `fetchAssets`
 * adds an image that its live state still names by key. `restoreAssets`
 * returns every node and handout that it does not change as the same
 * object.
 * @template {object} T
 * @param {T} state
 * @returns {T}
 */
export function withStoredAssets(state) {
  return /** @type {T} */ (restoreAssets({ ...state, assets: storedAssetTable() }));
}
