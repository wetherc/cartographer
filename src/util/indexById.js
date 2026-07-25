/**
 * Build a Map from an id-keyed collection so repeated lookups by id are O(1)
 * instead of a linear `.find` per access. Pure. Later ids win on collision,
 * matching the last-write-wins behavior of the array scans it replaces.
 * @template {{ id: string }} T
 * @param {readonly T[]} items
 * @returns {Map<string, T>}
 */
export function indexById(items) {
  const map = new Map();
  for (const item of items) map.set(item.id, item);
  return map;
}

/**
 * Build a Map keyed by an arbitrary derived key rather than a fixed `id`
 * field, for collections keyed on something other than `id` (e.g. names).
 * Pure. Later entries win on collision.
 * @template T
 * @param {readonly T[]} items
 * @param {(item: T) => string} keyOf
 * @returns {Map<string, T>}
 */
export function indexBy(items, keyOf) {
  const map = new Map();
  for (const item of items) map.set(keyOf(item), item);
  return map;
}
