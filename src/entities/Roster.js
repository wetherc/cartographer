/**
 * This module holds pure helpers for roster management (characters,
 * encounters). It derives a unique id from a display name and replaces or
 * removes entries by id. The character and encounter CRUD UIs share these
 * helpers, so id-collision and list-update rules live in one tested place.
 */

/**
 * Derive a kebab-case id from a display name. If the id collides with an
 * existing id, add a suffix (`-2`, `-3`, and so on) until the id matches
 * none of the existing ids. A name with no usable characters falls back to
 * "entry".
 * @param {string} name
 * @param {Iterable<string>} existingIds
 * @returns {string}
 */
export function slugId(name, existingIds) {
  const taken = new Set(existingIds);
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'entry';
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/**
 * Replace the entry whose id matches `item.id`, leaving the rest untouched.
 * Returns the list unchanged (same entries, new array) if no id matches.
 * @template {{ id: string }} T
 * @param {T[]} list
 * @param {T} item
 * @returns {T[]}
 */
export function replaceById(list, item) {
  return list.map((entry) => (entry.id === item.id ? item : entry));
}

/**
 * Replace the entry with the given id by what `update` makes of it. Leave the
 * rest untouched. `replaceById` is the whole-entry form. This function is the
 * patch form, for the common pattern
 * `list.map((x) => (x.id === id ? { ...x, ...change } : x))`.
 * Returns the list unchanged (same entries, new array) if no id matches.
 * @template {{ id: string }} T
 * @param {T[]} list
 * @param {string} id
 * @param {(entry: T) => T} update
 * @returns {T[]}
 */
export function updateById(list, id, update) {
  return list.map((entry) => (entry.id === id ? update(entry) : entry));
}

/**
 * Remove the entry with the given id, if present.
 * @template {{ id: string }} T
 * @param {T[]} list
 * @param {string} id
 * @returns {T[]}
 */
export function removeById(list, id) {
  return list.filter((entry) => entry.id !== id);
}
