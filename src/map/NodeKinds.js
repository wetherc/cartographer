import { capitalize } from '../util/text.js';

/** @typedef {import('../types/map.js').NodeKind} NodeKind */

/**
 * The two node kinds. A region is outdoor terrain: a world, a region, or a
 * subregion. An interior is the inside of a structure, for example a shop, an inn, or a dungeon level.
 * @type {NodeKind[]}
 */
export const NODE_KINDS = ['region', 'interior'];

/**
 * Curated environment tags per kind, offered when a GM authors a node. The
 * model stores a free string for the environ field, so these are suggestions, not a closed set.
 * @type {Record<NodeKind, string[]>}
 */
export const ENVIRONS = {
  region: [
    'grassland',
    'forest',
    'mountain',
    'desert',
    'water',
    'coast',
    'swamp',
    'tundra',
    'cave',
  ],
  interior: [
    'shop',
    'inn',
    'tavern',
    'temple',
    'academy',
    'castle',
    'barracks',
    'dungeon',
    'guildhall',
    'warehouse',
  ],
};

/**
 * The environ suggestions for a kind. Returns an empty array for an unknown kind.
 * @param {string} kind
 * @returns {string[]}
 */
export function environOptions(kind) {
  return ENVIRONS[/** @type {NodeKind} */ (kind)] ?? [];
}

/**
 * Read a kind back from a dialog or a hand-edited save. Anything that is not
 * one of the two kinds becomes the fallback. A node can then never end up
 * with a kind that the palette filter and the renderer do not know.
 * @param {unknown} raw
 * @param {NodeKind} fallback
 * @returns {NodeKind}
 */
export function coerceNodeKind(raw, fallback) {
  return /** @type {readonly unknown[]} */ (NODE_KINDS).includes(raw)
    ? /** @type {NodeKind} */ (raw)
    : fallback;
}

/**
 * Whether a palette entry of the given type belongs on a node of this kind.
 * Interiors get only interior pieces, furnishings, and custom art. Regions
 * get everything except interior pieces and furnishings. This filters the
 * Build-mode palette, so a GM paints an interior with walls and floors, and
 * a region with grass and mountains.
 * @param {string} kind
 * @param {string} entryType palette entry's `type`
 * @returns {boolean}
 */
export function allowsPaletteType(kind, entryType) {
  if (entryType === 'custom') return true;
  const indoor = entryType === 'interior' || entryType === 'furnishing';
  return kind === 'interior' ? indoor : !indoor;
}

/**
 * The Environment options of the node dialog for a kind: "(none)", the
 * suggestions for that kind, and the current value when it is not one of
 * them, so a custom or other-kind tag on a saved node still shows.
 * @param {string} kind
 * @param {string | null} current
 * @returns {{ value: string, label: string }[]}
 */
export function environFieldOptions(kind, current) {
  const tags = environOptions(kind);
  const all = current && !tags.includes(current) ? [...tags, current] : tags;
  return [{ value: '', label: '(none)' }, ...all.map((e) => ({ value: e, label: capitalize(e) }))];
}
