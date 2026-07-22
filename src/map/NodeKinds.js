/** @typedef {import('../types/map.js').NodeKind} NodeKind */

/**
 * The two node kinds. A region is outdoor terrain (world/region/subregion); an
 * interior is the inside of a structure (a shop, an inn, a dungeon level).
 * @type {NodeKind[]}
 */
export const NODE_KINDS = ['region', 'interior'];

/**
 * Curated environment tags per kind, offered when authoring a node. The model
 * stores a free string (environ), so these are suggestions, not a closed set.
 * @type {Record<NodeKind, string[]>}
 */
export const ENVIRONS = {
  region: ['grassland', 'forest', 'mountain', 'desert', 'water', 'coast', 'swamp', 'tundra', 'cave'],
  interior: ['shop', 'inn', 'tavern', 'temple', 'academy', 'castle', 'barracks', 'dungeon', 'guildhall', 'warehouse'],
};

/**
 * The environ suggestions for a kind (empty for an unknown kind).
 * @param {string} kind
 * @returns {string[]}
 */
export function environOptions(kind) {
  return ENVIRONS[/** @type {NodeKind} */ (kind)] ?? [];
}

/**
 * Whether a palette entry of the given type belongs on a node of this kind:
 * interiors get only interior pieces (plus custom art); regions get everything
 * except interior pieces. This filters the Build-mode palette so a GM paints an
 * interior with walls and floors, not grass and mountains, and vice versa.
 * @param {string} kind
 * @param {string} entryType palette entry's `type`
 * @returns {boolean}
 */
export function allowsPaletteType(kind, entryType) {
  if (entryType === 'custom') return true;
  return kind === 'interior' ? entryType === 'interior' : entryType !== 'interior';
}
