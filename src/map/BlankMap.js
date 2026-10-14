/** @type {WeakMap<object, boolean>} blank state by node object */
const blankCache = new WeakMap();

/**
 * True when no cell of the node has tile art yet. A new map starts this way.
 * The answer is cached on the node object, because the map asks once per
 * drawn frame and a paint stroke makes a new node.
 * @param {{ tiles: ({ imageRef?: string | null } | null)[] }} node
 * @returns {boolean}
 */
export function isBlankMap(node) {
  let blank = blankCache.get(node);
  if (blank === undefined) {
    blank = !node.tiles.some((tile) => tile?.imageRef);
    blankCache.set(node, blank);
  }
  return blank;
}
