/**
 * Pure helpers for managing rosters (characters, encounters): deriving a
 * unique id from a display name and replacing/removing entries by id.
 * Shared by the character and encounter CRUD UIs so id-collision and
 * list-update rules live in one tested place.
 */

/**
 * Derive a kebab-case id from a display name, suffixing `-2`, `-3`, ... until
 * it collides with none of the existing ids. Names with no usable characters
 * fall back to "entry".
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
 * Remove the entry with the given id, if present.
 * @template {{ id: string }} T
 * @param {T[]} list
 * @param {string} id
 * @returns {T[]}
 */
export function removeById(list, id) {
  return list.filter((entry) => entry.id !== id);
}
