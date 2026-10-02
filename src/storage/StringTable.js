/**
 * The campaign-wide string table of a save. This module is pure.
 *
 * Each encoded node lists its art in a `refs` palette (`TileCodec.js`), and
 * nodes of one campaign use the same few hundred refs again and again. The
 * example campaign has about 3,000 palette strings but only about 120
 * distinct ones. `tabulateStrings` lists each distinct ref once, in a
 * top-level `strings` array, and puts its index in every palette in its
 * place. `restoreStrings` puts the strings back before any other load step
 * runs, so the migrations, the tile decoder, and the asset restore all see
 * nodes whose palettes hold strings.
 *
 * The table exists only in the save string. `encodeNodeTiles` output stays
 * node-local, because the undo log stores encoded nodes and decodes each
 * one alone.
 *
 * The table lists strings in the order of first use, walking the nodes in
 * list order and each palette in order. The same state therefore always
 * gives the same table and the same save string, which the undo log and the
 * cross-tab follower need when they compare raw save strings. A ref that a
 * new node adds goes to the end of the table, because new nodes join the end
 * of the node list. A ref that a paint adds to an earlier node shifts the
 * indices after it. That changes the palettes of later nodes in the save
 * string, but not the parsed state that the undo log diffs.
 *
 * Reading is based on presence. A save with no `strings` array loads as it
 * is, and a number in a palette is an index only when the table is present.
 * An index that names no string stays a number, and the decoder skips it as
 * an unreadable entry.
 */

/** @typedef {Record<string, any>} RawSave */

/**
 * A palette entry with `map` applied to each of its refs: the bare ref, or
 * the base and every overlay ref of a pair.
 * @param {unknown} entry
 * @param {(ref: unknown) => unknown} map
 * @returns {unknown}
 */
function mapEntry(entry, map) {
  if (!Array.isArray(entry)) return map(entry);
  const [base, overlay] = entry;
  return [map(base), Array.isArray(overlay) ? overlay.map(map) : map(overlay)];
}

/**
 * Whether a value is a node record with a palette.
 * @param {unknown} node
 * @returns {node is { refs: unknown[] }}
 */
function hasPalette(node) {
  return (
    node !== null &&
    typeof node === 'object' &&
    Array.isArray(/** @type {Record<string, unknown>} */ (node).refs)
  );
}

/**
 * The last tabulated form of each encoded node, with the indices it used.
 * `packState` returns the cached encode for an unchanged node, so an
 * unchanged node whose strings keep their indices tabulates to the same
 * object as before.
 * @type {WeakMap<object, { indices: number[], node: RawSave }>}
 */
const tabulated = new WeakMap();

/**
 * Whether two index lists of one node are equal. Both come from the same
 * palette, so they always have the same length.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {boolean}
 */
function sameIndices(a, b) {
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * A save whose node palettes name their strings by index into a new
 * `strings` table. A save with no palette string comes back unchanged. The
 * function never changes the save passed in.
 * @param {RawSave} save
 * @returns {RawSave}
 */
export function tabulateStrings(save) {
  const nodes = save.nodes;
  if (!Array.isArray(nodes)) return save;
  /** @type {string[]} */
  const strings = [];
  /** @type {Map<string, number>} */
  const index = new Map();
  const next = nodes.map((node) => {
    if (!hasPalette(node)) return node;
    /** @type {number[]} */
    const indices = [];
    const refs = node.refs.map((entry) =>
      mapEntry(entry, (ref) => {
        if (typeof ref !== 'string') return ref;
        let at = index.get(ref);
        if (at === undefined) {
          at = strings.length;
          strings.push(ref);
          index.set(ref, at);
        }
        indices.push(at);
        return at;
      }),
    );
    if (indices.length === 0) return node;
    const cached = tabulated.get(node);
    if (cached && sameIndices(cached.indices, indices)) return cached.node;
    const out = { ...node, refs };
    tabulated.set(node, { indices, node: out });
    return out;
  });
  if (strings.length === 0) return save;
  return { ...save, nodes: next, strings };
}

/**
 * The inverse of `tabulateStrings`: every palette index replaced by its
 * string, and the table removed. A save with no `strings` list comes back
 * unchanged.
 * @param {RawSave} save
 * @returns {RawSave}
 */
export function restoreStrings(save) {
  const table = save.strings;
  if (!Array.isArray(table)) return save;
  const read = (/** @type {unknown} */ ref) =>
    typeof ref === 'number' && typeof table[ref] === 'string' ? table[ref] : ref;
  const next = { ...save };
  delete next.strings;
  if (Array.isArray(save.nodes)) {
    next.nodes = save.nodes.map((node) =>
      hasPalette(node) ? { ...node, refs: node.refs.map((entry) => mapEntry(entry, read)) } : node,
    );
  }
  return next;
}
