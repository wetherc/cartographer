/**
 * This module stores image payloads by content, so a save does not repeat
 * them. The code is pure and stays separate from `SaveManager.js`. It is the
 * one place that knows how a payload is hashed and how a hoisted reference is
 * written.
 *
 * A tile's art ref is either a short built-in path or a full `data:` URL.
 * `MapRenderer.imageSrcForRef` tells the two apart. A handout's image is
 * always a `data:` URL. If the payload stays inline, one imported tile drawn
 * across a region stores its full base64 payload once per cell, and each undo
 * snapshot repeats that cost. Hoisting the payloads into one table keyed by
 * content stores each distinct image once per save.
 *
 * The module rebuilds the table from the refs present at each serialize. A
 * payload with no reference left is never written back.
 */

import { safeImageRef } from './ImageRefs.js';

/** @typedef {import('../types/storage.js').RawSave} RawSave */

/**
 * Prefix that marks a ref as a lookup into the asset table, not an image
 * source. Only `hoistAssets` writes this prefix. On load, the code honors it
 * only when the table holds the key. A built-in ref can look similar (it
 * lives under `assets/tiles/...`, one character away) and must stay unchanged.
 */
export const ASSET_PREFIX = 'asset:';

/**
 * Every asset reference in a serialized save, matched against the raw text
 * and not by walking parsed state. A tile's ref lives inside an encoded
 * node's `refs` palette (`TileCodec.js`). A state walk cannot see it without
 * decoding first, and the undo log keeps strings anyway. The pattern must
 * match `assetKey`'s base36 output and `createHoister`'s `~n` collision
 * suffix, both defined directly above this function.
 *
 * The match can over-match: a literal `asset:` in a handout's body text pins
 * a key no table holds, which costs nothing. The match must never
 * under-match, because that removes a live payload.
 * @param {string} text
 * @returns {Set<string>}
 */
export function referencedAssetKeys(text) {
  /** @type {Set<string>} */
  const keys = new Set();
  const pattern = new RegExp(`${ASSET_PREFIX}([0-9a-z]+(?:~[0-9]+)?)`, 'g');
  for (const match of text.matchAll(pattern)) keys.add(match[1]);
  return keys;
}

/** True when a ref holds an inline image payload and not a path. */
function isPayload(/** @type {unknown} */ ref) {
  return typeof ref === 'string' && ref.startsWith('data:');
}

/**
 * A short content-derived key for a payload: FNV-1a 32-bit, base36. The hash
 * is not cryptographic and does not prevent collisions. When two different
 * payloads land on one key, `hoistAssets` compares the stored payload and
 * probes a suffix. A collision costs a longer key and never the wrong image.
 * The function is pure.
 * @param {string} payload
 * @returns {string}
 */
export function assetKey(payload) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    // FNV-1a's 16777619 multiply, kept in 32 bits so it does not overflow a double.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/**
 * The `assetKey` of each payload the last hoist met. A save hoists every
 * payload again, and hashing eight photos of 250,000 characters each costs
 * about 4 ms per save. Each hoist starts a new map from the payloads it
 * meets, so a payload that leaves the campaign leaves the cache at the next
 * save.
 * @type {Map<string, string>}
 */
let hashCache = new Map();

/**
 * `assetKey` through `hashCache`, and a function that makes the payloads
 * this hoist met the new cache.
 * @returns {{ hash: (payload: string) => string, commit: () => void }}
 */
function cachedAssetKey() {
  /** @type {Map<string, string>} */
  const met = new Map();
  return {
    hash(payload) {
      const key = hashCache.get(payload) ?? assetKey(payload);
      met.set(payload, key);
      return key;
    },
    commit() {
      hashCache = met;
    },
  };
}

/**
 * Collects payloads into one table and returns the ref to store in their
 * place. It reuses a key whose stored payload is identical (deduplication)
 * and probes a suffixed key when the payload differs (a collision).
 * @param {(payload: string) => string} hash
 */
function createHoister(hash) {
  /** @type {Record<string, string>} */
  const assets = {};
  /** @type {Map<string, string>} */
  const keyByPayload = new Map();
  return {
    assets,
    /**
     * @param {string} payload
     * @returns {string}
     */
    refFor(payload) {
      const seen = keyByPayload.get(payload);
      if (seen) return ASSET_PREFIX + seen;
      const base = hash(payload);
      let key = base;
      for (let n = 1; assets[key] !== undefined; n += 1) key = `${base}~${n}`;
      assets[key] = payload;
      keyByPayload.set(payload, key);
      return ASSET_PREFIX + key;
    },
  };
}

/**
 * True when any tile of a node holds an inline image payload in its
 * `imageRef` or its `overlayRef`, the refs that `hoistAssets` moves into
 * the table.
 * @param {Record<string, any>} node
 * @returns {boolean}
 */
export function nodeHoldsPayload(node) {
  if (!Array.isArray(node.tiles)) return false;
  return node.tiles.some((/** @type {any} */ tile) => {
    if (!tile || typeof tile !== 'object') return false;
    const { overlayRef } = tile;
    return (
      isPayload(tile.imageRef) ||
      isPayload(overlayRef) ||
      (Array.isArray(overlayRef) && overlayRef.some(isPayload))
    );
  });
}

/**
 * Map every image ref of a tile through `convert`. The function returns the
 * same tile object when nothing changed, so an image-free save allocates
 * nothing. `overlayRef` is a single ref or a draw-ordered stack, per
 * `TileGrid.overlayList`.
 * @param {Record<string, any>} tile
 * @param {(ref: string) => string} convert
 * @returns {Record<string, any>}
 */
function mapTileRefs(tile, convert) {
  const imageRef = typeof tile.imageRef === 'string' ? convert(tile.imageRef) : tile.imageRef;
  let overlayRef = tile.overlayRef;
  if (typeof overlayRef === 'string') overlayRef = convert(overlayRef);
  else if (Array.isArray(overlayRef))
    overlayRef = overlayRef.map((ref) => (typeof ref === 'string' ? convert(ref) : ref));
  if (imageRef === tile.imageRef && refsEqual(overlayRef, tile.overlayRef)) return tile;
  // Assign the fields rather than spread them in. A tile with no `overlayRef`
  // must not gain an explicit undefined one. The packed tiles here omit their
  // default-valued fields, and the round trip must preserve that.
  const next = { ...tile };
  if ('imageRef' in tile) next.imageRef = imageRef;
  if ('overlayRef' in tile) next.overlayRef = overlayRef;
  return next;
}

/**
 * True when a mapped overlay value is the one that went in. The function
 * compares a stack element by element, so an untouched array is not mistaken
 * for a change.
 * @param {unknown} next
 * @param {unknown} previous
 * @returns {boolean}
 */
function refsEqual(next, previous) {
  if (next === previous) return true;
  if (!Array.isArray(next) || !Array.isArray(previous)) return false;
  return next.length === previous.length && next.every((ref, i) => ref === previous[i]);
}

/**
 * Nodes that a previous `hoistAssets` pass walked and left unchanged. A node
 * is an immutable value, so a node that held no inline payload once holds
 * none forever, and a later save can skip its tiles without looking at
 * them. The undo log's `historyForm` hoists the live state, so the same
 * node object arrives here on every save until the node changes. The save
 * path hoists only the nodes that `nodeHoldsPayload` flags, and those always
 * change. Only the hoist keeps this set. The restore runs once per load, and its
 * nodes are fresh objects each time.
 * @type {WeakSet<object>}
 */
const payloadFree = new WeakSet();

/**
 * Walk every image-bearing field of a save and map each ref through
 * `convert`. The sites are listed once here. A future payload field needs
 * only one added line, not a second traversal.
 * @param {RawSave} state
 * @param {(ref: string) => string} convert
 * @param {WeakSet<object>} [unchanged] nodes a previous pass left as they were
 * @returns {RawSave}
 */
function mapStateRefs(state, convert, unchanged) {
  const next = { ...state };
  let anyChange = false;
  if (Array.isArray(state.nodes)) {
    next.nodes = state.nodes.map((node) => {
      if (unchanged?.has(node)) return node;
      if (!node || typeof node !== 'object' || !Array.isArray(node.tiles)) return node;
      // Return the same node object when no tile changed. The serialize path
      // caches the tile encode on the node's identity, and a fresh copy of an
      // unchanged node would defeat that cache on every save.
      let changed = false;
      const tiles = node.tiles.map((/** @type {any} */ tile) => {
        const mapped = tile && typeof tile === 'object' ? mapTileRefs(tile, convert) : tile;
        if (mapped !== tile) changed = true;
        return mapped;
      });
      if (changed) anyChange = true;
      if (!changed) unchanged?.add(node);
      return changed ? { ...node, tiles } : node;
    });
  }
  if (Array.isArray(state.handouts)) {
    next.handouts = state.handouts.map((handout) => {
      if (!handout || typeof handout !== 'object' || typeof handout.image !== 'string')
        return handout;
      const image = convert(handout.image);
      if (image !== handout.image) anyChange = true;
      return image === handout.image ? handout : { ...handout, image };
    });
  }
  // The same state object when no ref changed, so a load with nothing to
  // restore or blank allocates no copy of the node list.
  return anyChange ? next : state;
}

/**
 * The save with every inline image payload replaced by a reference into a
 * new `assets` table. The function never touches the state passed in, and
 * its result depends on that state alone, because the hash cache changes
 * only how often a payload is hashed. A save with no payloads comes back with no `assets` field, so
 * an image-free campaign serializes exactly as it did before this table
 * existed.
 * @param {RawSave} state
 * @param {(payload: string) => string} [hash] injected for collision tests; the
 *   default is `assetKey` through the payload cache
 * @returns {RawSave}
 */
export function hoistAssets(state, hash) {
  const cache = cachedAssetKey();
  const hoister = createHoister(hash ?? cache.hash);
  const next = mapStateRefs(
    state,
    (ref) => (isPayload(ref) ? hoister.refFor(ref) : ref),
    payloadFree,
  );
  if (!hash) cache.commit();
  if (!Object.keys(hoister.assets).length) {
    // Never carry a stale table forward. The table is derived from the refs
    // present, so the code rebuilds it and drops any entry with no reference.
    if ('assets' in next) delete next.assets;
    return next;
  }
  next.assets = hoister.assets;
  return next;
}

/**
 * The inverse of `hoistAssets`: every reference into the `assets` table
 * replaced by its payload, with the table itself removed. The function is
 * pure.
 *
 * A reference the table cannot resolve is left **unchanged**, not blanked.
 * The prefix is one character from the built-in tile path root. Treating an
 * unresolvable match as unrecoverable destroys a legitimate ref. Left
 * alone, the worst case is the gray placeholder the renderer already draws
 * for a ref that will not load.
 *
 * This is also where every ref of a loaded save passes through
 * `ImageRefs.js`. A ref that is not an inline image, an `asset:` key, or a
 * relative path on this origin is blanked here, before anything can hand it to an
 * image element. A save with no table still takes this walk.
 *
 * `untouched` skips the nodes it already contains, and the walk adds each
 * node that it leaves unchanged, so a caller can tell which decoded nodes
 * came through with every ref as stored.
 * @param {RawSave} state
 * @param {WeakSet<object>} [untouched]
 * @returns {RawSave}
 */
export function restoreAssets(state, untouched) {
  const raw = state.assets;
  const table = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
  const mapped = mapStateRefs(
    state,
    (ref) => {
      if (!table || !ref.startsWith(ASSET_PREFIX)) return safeImageRef(ref);
      const payload = table[ref.slice(ASSET_PREFIX.length)];
      return safeImageRef(typeof payload === 'string' ? payload : ref);
    },
    untouched,
  );
  if (!('assets' in mapped)) return mapped;
  const next = { ...mapped };
  delete next.assets;
  return next;
}
