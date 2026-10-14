/**
 * Grid side length per size preset. Square grids keep the archetype
 * generators simple and give the same result at any size. The "large"
 * preset is big enough to be a real procedurally generated area, not a
 * handful of tiles a GM can place by hand. "Huge" and "vast" suit a whole
 * realm: the climate model scales its features with the map, so a vast map
 * gets more lakes, ranges, and rivers instead of larger ones. The table has
 * its own module because the generators under `MapGenerator.js` also read
 * it, and an import of `MapGenerator.js` from them makes an import cycle.
 * @type {Record<string, number>}
 */
export const GENERATOR_SIZES = { small: 8, medium: 14, large: 22, huge: 32, vast: 48 };
