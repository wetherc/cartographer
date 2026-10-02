import { overlayList } from './TileGrid.js';
import { withNodeTiles } from './TileIndex.js';
import { parseCoords } from './MapGeometry.js';
import { BIOME_TERRAIN } from './GeneratorTerrain.js';
import { regionFor } from './GeneratorWorld.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('./TilePalette.js').TilePalette} TilePalette */

/**
 * The ground that a region block on a parent map gets for each climate
 * archetype. A repainted tile picks one entry at random. Each mix passes the
 * test of `GeneratorWorld.regionFor` for its archetype with a wide margin,
 * so a repainted block reads as that archetype: highlands are three
 * quarters hills and mountains, and wetlands are half swamp.
 * @type {Record<string, string[]>}
 */
export const REGION_GROUND = {
  wilderness: ['grass', 'grass', 'forest'],
  highlands: ['hills', 'hills', 'mountain', 'grass'],
  frontier: ['snow', 'snow', 'snow', 'forest'],
  desert: ['desert', 'desert', 'desert', 'grass'],
  wetlands: ['swamp', 'swamp', 'grass', 'forest'],
};

/**
 * The terrain class of each built-in ground image, for example `hills` for
 * every hills variant and `mountain` for a volcanic one.
 * @param {TilePalette} palette
 * @returns {Map<string, string>}
 */
function groundClasses(palette) {
  /** @type {Map<string, string>} */
  const classes = new Map();
  for (const entry of palette.entries.values()) {
    classes.set(entry.imageRef, BIOME_TERRAIN[entry.type] ?? entry.type);
  }
  return classes;
}

/**
 * Repaint the block of tiles on a parent map that links to a child, after
 * the child is regenerated as the climate archetype `archetype`. Each block
 * tile gets the base art of a random entry of `REGION_GROUND[archetype]`,
 * and keeps its overlays, such as a river, its link, its notes, and its fog
 * state. A tile with coast art, a water tile, a point of interest, and a
 * tile with a span keep their art. A tile that links to another node is not
 * in the block. The function returns `node` itself when the archetype has
 * no ground mix (a town, an island, or an interior), and when the block
 * already reads as `archetype`, so a repeat regeneration does not reshuffle
 * the art. The caller records `node` before the change, so undo restores
 * the old tiles.
 * @param {MapNode} node parent node
 * @param {string} childId
 * @param {string} archetype
 * @param {TilePalette} palette
 * @param {() => number} rng
 * @returns {MapNode}
 */
export function repaintRegionBlock(node, childId, archetype, palette, rng) {
  const ground = REGION_GROUND[archetype];
  if (!ground) return node;
  const classes = groundClasses(palette);
  const coast = new Set(palette.listVariants('coast').map((e) => e.imageRef));
  const block = node.tiles.filter((t) => t.childNodeId === childId);
  const types = block.map((t) => classes.get(t.imageRef) ?? 'custom');
  if (!block.length || regionFor(types).archetype === archetype) return node;
  let changed = false;
  const tiles = node.tiles.map((t) => {
    if (t.childNodeId !== childId || t.metadata.poiType || t.span) return t;
    if (classes.get(t.imageRef) === 'water') return t;
    if (overlayList(t).some((ref) => coast.has(ref))) return t;
    changed = true;
    const type = ground[Math.floor(rng() * ground.length)];
    const at = parseCoords(t.id);
    const art = at ? palette.variantAt(type, at.x, at.y, rng) : palette.pickVariant(type, rng);
    return { ...t, imageRef: art.imageRef };
  });
  return changed ? withNodeTiles(node, tiles) : node;
}
