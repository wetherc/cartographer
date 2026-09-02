import { slugId } from '../entities/Roster.js';

/** @typedef {import('../types/library.js').LibrarySource} LibrarySource */

/**
 * The id rules for the name-keyed library lists (creature templates, spells,
 * and feats). Ids are internal: only the name key merges. Campaign state
 * stores these ids directly, because characters, bestiary templates, and NPC
 * templates all hold spell ids. Every function here is pure.
 */

/**
 * The id that a stored name-keyed entry must carry. A custom entry keeps its
 * id across a rename. Otherwise every reference to it is dropped as unknown.
 * A renamed default or override instead takes a fresh id. Its old id still
 * belongs to the built-in entry, which resurfaces once the override no longer
 * matches it.
 * A name that matches another merged entry takes that entry's id, because
 * the stored result overrides it. An override and the default it hides must
 * share one id. Otherwise the id index, which keeps the last entry, leaves
 * one of them unreachable. Only a name that matches nothing gets a fresh
 * slug. This slug must avoid every id in the list, including the ids of
 * defaults that an override currently hides, since those ids resurface as
 * soon as the override is renamed.
 * @param {{
 *   found?: { entry: { id: string }, source: LibrarySource } | null,
 *   target?: { entry: { id: string } } | null,
 *   renamed: boolean,
 *   newKey: string,
 *   takenIds: () => string[],
 * }} args `found` is the merged entry under edit (null for a new entry).
 *   `target` is the merged entry that the submitted name matches (null when
 *   the name is new). `renamed` is true when the name key changed.
 * @returns {string}
 */
export function storedEntryId({ found, target, renamed, newKey, takenIds }) {
  if (found && (!renamed || found.source === 'custom')) return found.entry.id;
  if (target) return target.entry.id;
  return slugId(newKey, takenIds());
}

/**
 * True when an edit renames an existing entry onto a name that another entry
 * already holds. Such a rename cannot be stored. A custom entry keeps its id,
 * so the store would replace the other entry by name and drop that entry's id
 * from the index. Every spellbook holding the dropped id would then lose the
 * spell with no message. A renamed default or override would replace the
 * other entry the same way. The caller refuses the edit and tells the GM.
 * A new entry (no `found`) whose name matches an existing one is not a
 * conflict: it stores as an override of that entry, which is how editing a
 * built-in works.
 * @param {{
 *   found?: { entry: { id: string } } | null,
 *   target?: { entry: { id: string } } | null,
 *   renamed: boolean,
 * }} args The same `found`, `target`, and `renamed` that storedEntryId reads.
 * @returns {boolean}
 */
export function renameConflict({ found, target, renamed }) {
  return !!found && renamed && !!target;
}

/**
 * Build the id claimer for one name-keyed list on the way into the library.
 * The claimer decides the id a raw record keeps. An explicit id survives when
 * nothing else owns it. A default owns its id, so a custom entry may carry a
 * default's id only when the two share a name key: that is an override, and
 * the two must share one id. An explicit id that names a different default,
 * or that an earlier custom entry in the same list already claimed, would
 * shadow that entry in the id index, where the last entry wins. Such an id is
 * dropped. An entry without a usable id that shares a name key with a default
 * takes that default's id, so the override and the hidden default stay one
 * entry in the index. Any other entry gets a fresh slug. The slug avoids every
 * default id and every id already claimed in the list.
 * @template {{ id: string, name: string }} T
 * @param {readonly T[]} defaults The list's built-in entries.
 * @param {(entry: { name: string }) => string} keyOf The name merge key.
 * @returns {(explicitId: unknown, name: string, taken: readonly string[]) => string}
 *   `taken` holds the ids that earlier entries in the same list claimed.
 */
export function idClaimer(defaults, keyOf) {
  const defaultKeys = new Map(defaults.map((d) => [d.id, keyOf(d)]));
  const defaultIds = new Map(defaults.map((d) => [keyOf(d), d.id]));
  return (explicitId, name, taken) => {
    const key = keyOf({ name });
    if (typeof explicitId === 'string' && explicitId && !taken.includes(explicitId)) {
      const owner = defaultKeys.get(explicitId);
      if (owner === undefined || owner === key) return explicitId;
    }
    const own = defaultIds.get(key);
    if (own !== undefined && !taken.includes(own)) return own;
    return slugId(name, [...defaultKeys.keys(), ...taken]);
  };
}
