/**
 * Content-addressed storage for the image payloads a save would otherwise
 * repeat. Pure, and deliberately separate from `SaveManager.js`: this is the one
 * place that knows how a payload is hashed and how a hoisted reference is
 * spelled, so nothing else has to.
 *
 * A tile's art is a ref that is either a short built-in path or an entire
 * `data:` URL (`MapRenderer.imageSrcForRef` is what tells them apart), and a
 * handout's image is a `data:` URL outright. Stored inline, one imported tile
 * painted across a region costs its whole base64 payload once per cell, and the
 * undo ring multiplies that. Hoisting the payloads into one table keyed by their
 * content stores each distinct image once per save instead.
 *
 * The table is rebuilt from the refs actually present on every serialize, so it
 * prunes itself: a payload nothing references any more is simply never written.
 */

/** @typedef {import('../types/storage.js').RawSave} RawSave */

/**
 * Prefix marking a ref as a lookup into the asset table rather than an image
 * source. Only ever written by `hoistAssets`, and only ever honored on load when
 * the table really holds the key — a built-in ref that merely looks like one
 * (they live under `assets/tiles/...`, one character away) must survive
 * untouched.
 */
const ASSET_PREFIX = 'asset:';

/** Whether a ref holds an inline image payload rather than a path. */
function isPayload(/** @type {unknown} */ ref) {
  return typeof ref === 'string' && ref.startsWith('data:');
}

/**
 * A short content-derived key for a payload: FNV-1a 32-bit, base36. Not
 * cryptographic and not collision-free — `hoistAssets` compares the stored
 * payload and probes a suffix when two differing payloads land on one key, so a
 * collision costs a longer key and never the wrong image. Pure.
 * @param {string} payload
 * @returns {string}
 */
export function assetKey(payload) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    // FNV-1a's 16777619 multiply, kept in 32 bits without overflowing a double.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/**
 * Accumulates payloads into one table, handing back the ref to store in their
 * place. Reuses a key whose stored payload is identical (the deduplication) and
 * probes a suffixed key when it is not (the collision).
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
 * Map every image ref of a tile through `convert`, returning the same tile
 * object when nothing changed so an image-free save allocates nothing.
 * `overlayRef` is a single ref or a draw-ordered stack, per `TileGrid.overlayList`.
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
  // Assigned rather than spread in, so a tile that carries no `overlayRef` at all
  // does not gain an explicit undefined one — the packed tiles this runs over
  // omit their default-valued fields, and the round trip has to preserve that.
  const next = { ...tile };
  if ('imageRef' in tile) next.imageRef = imageRef;
  if ('overlayRef' in tile) next.overlayRef = overlayRef;
  return next;
}

/**
 * Whether a mapped overlay value is the one that went in, comparing a stack
 * element-wise so an untouched array is not mistaken for a change.
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
 * Walk every image-bearing field of a save, mapping each ref through `convert`.
 * The sites are stated once here, so a future payload field is one line rather
 * than a second traversal.
 * @param {RawSave} state
 * @param {(ref: string) => string} convert
 * @returns {RawSave}
 */
function mapStateRefs(state, convert) {
  const next = { ...state };
  if (Array.isArray(state.nodes)) {
    next.nodes = state.nodes.map((node) => {
      if (!node || typeof node !== 'object' || !Array.isArray(node.tiles)) return node;
      return {
        ...node,
        tiles: node.tiles.map((/** @type {any} */ tile) =>
          tile && typeof tile === 'object' ? mapTileRefs(tile, convert) : tile,
        ),
      };
    });
  }
  if (Array.isArray(state.handouts)) {
    next.handouts = state.handouts.map((handout) => {
      if (!handout || typeof handout !== 'object' || typeof handout.image !== 'string')
        return handout;
      const image = convert(handout.image);
      return image === handout.image ? handout : { ...handout, image };
    });
  }
  return next;
}

/**
 * The save with every inline image payload replaced by a reference into a new
 * `assets` table. Pure; the state passed in is never touched, and a save with no
 * payloads comes back with no `assets` field at all, so an image-free campaign
 * serializes exactly as it did before this existed.
 * @param {RawSave} state
 * @param {(payload: string) => string} [hash] injected for collision tests
 * @returns {RawSave}
 */
export function hoistAssets(state, hash = assetKey) {
  const hoister = createHoister(hash);
  const next = mapStateRefs(state, (ref) => (isPayload(ref) ? hoister.refFor(ref) : ref));
  if (!Object.keys(hoister.assets).length) {
    // Never carry a stale table forward: it is derived from the refs present, so
    // an entry nothing references is dropped by being rebuilt rather than kept.
    if ('assets' in next) delete next.assets;
    return next;
  }
  next.assets = hoister.assets;
  return next;
}

/**
 * The inverse: every reference into the `assets` table replaced by its payload,
 * and the table itself removed. Pure.
 *
 * A reference the table cannot resolve is left **verbatim** rather than blanked.
 * The prefix is one character from the built-in tile path root, so treating an
 * unresolvable match as unrecoverable would silently destroy a legitimate ref;
 * left alone, the worst case is the gray placeholder the renderer already draws
 * for a ref that will not load.
 * @param {RawSave} state
 * @returns {RawSave}
 */
export function restoreAssets(state) {
  const table = state.assets;
  if (!table || typeof table !== 'object' || Array.isArray(table)) {
    if (!('assets' in state)) return state;
    const next = { ...state };
    delete next.assets;
    return next;
  }
  const next = mapStateRefs(state, (ref) => {
    if (!ref.startsWith(ASSET_PREFIX)) return ref;
    const payload = table[ref.slice(ASSET_PREFIX.length)];
    return typeof payload === 'string' ? payload : ref;
  });
  delete next.assets;
  return next;
}
