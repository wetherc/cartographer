/**
 * Pure helpers for a locked map. The lock sits on the child node, not on a
 * tile, because one link is often a block of many tiles that all name the
 * same child. `requires` names the item that opens it, and `open` turns
 * true once the GM unlocks it.
 */

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/map.js').NodeLock} NodeLock */
/** @typedef {import('../types/entities.js').Character} Character */

/**
 * A lock from a save or a dialog, or null for no lock. A blank or missing
 * `requires` reads as null, a lock that no item opens.
 * @param {unknown} value
 * @returns {NodeLock | null}
 */
export function readLock(value) {
  if (!value || typeof value !== 'object') return null;
  const { requires, open } = /** @type {Record<string, unknown>} */ (value);
  const key = typeof requires === 'string' ? requires.trim() : '';
  return { requires: key || null, open: open === true };
}

/**
 * True when a node has a lock that is not open yet.
 * @param {MapNode | null | undefined} node
 */
export function isLocked(node) {
  return !!node?.lock && !node.lock.open;
}

/**
 * The first character that carries the item a lock requires, matched by
 * item name without regard to case, or null.
 * @param {Character[]} characters
 * @param {NodeLock} lock
 * @returns {Character | null}
 */
export function keyHolder(characters, lock) {
  const want = lock.requires?.toLowerCase();
  if (!want) return null;
  return (
    characters.find((c) => (c.inventory ?? []).some((i) => i.name.trim().toLowerCase() === want)) ??
    null
  );
}

/**
 * The GM message for a locked node, such as "Locked. Requires the warding
 * key; Aldric carries it."
 * @param {NodeLock} lock
 * @param {Character | null} holder
 */
export function lockMessage(lock, holder) {
  if (!lock.requires) return 'Locked.';
  const who = holder ? `${holder.name} carries it.` : 'Nobody in the party carries it.';
  return `Locked. Requires the ${lock.requires}; ${who}`;
}

/**
 * The node with its lock open. A node with no lock comes back unchanged.
 * @param {MapNode} node
 * @returns {MapNode}
 */
export function unlockNode(node) {
  return node.lock ? { ...node, lock: { ...node.lock, open: true } } : node;
}

/**
 * The item names a key field offers: every library item and every item a
 * character carries, without duplicates in any case, sorted by name.
 * @param {Character[]} characters
 * @param {string[]} libraryNames
 * @returns {string[]}
 */
export function keyItemNames(characters, libraryNames) {
  const byKey = new Map();
  const add = (/** @type {unknown} */ name) => {
    const text = typeof name === 'string' ? name.trim() : '';
    if (text && !byKey.has(text.toLowerCase())) byKey.set(text.toLowerCase(), text);
  };
  libraryNames.forEach(add);
  for (const c of characters) for (const item of c.inventory ?? []) add(item.name);
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

/**
 * The warning for a lock whose key item matches no known item name, or null
 * when the lock has no key or a known item opens it. The lock still saves,
 * so the GM can name an item that does not exist yet.
 * @param {NodeLock | null} lock
 * @param {string[]} names from `keyItemNames`
 * @returns {string | null}
 */
export function unknownKeyWarning(lock, names) {
  const want = lock?.requires?.toLowerCase();
  if (!want || names.some((n) => n.toLowerCase() === want)) return null;
  return `No item in the library or in an inventory is named "${lock?.requires}", so no item opens this lock yet.`;
}

/**
 * The text the Build tile inspector shows for a locked map, such as "Locked
 * (needs Silver Key)", or null when the map has no closed lock.
 * @param {MapNode | null | undefined} node
 * @returns {string | null}
 */
export function lockBadge(node) {
  if (!isLocked(node)) return null;
  const key = node?.lock?.requires;
  return key ? `Locked (needs ${key})` : 'Locked';
}

/**
 * The name a Build-mode region plate shows for a child map. A locked map
 * gets a lock glyph before its name, so the GM sees on the parent map which
 * way in stops the party.
 * @param {MapNode | null | undefined} node
 * @returns {string | undefined}
 */
export function plateName(node) {
  if (!node) return undefined;
  return isLocked(node) ? `\u{1F512} ${node.name}` : node.name;
}

/**
 * The lock fields of the node dialog: a state select and the key item. The
 * key field offers `names` as suggestions.
 * @param {NodeLock | undefined} lock
 * @param {string[]} [names] item names from `keyItemNames`
 * @returns {import('../types/modal.js').ModalField[]}
 */
export function lockFields(lock, names = []) {
  return [
    {
      name: 'lockState',
      label: 'Lock (stops the party at the way in)',
      type: 'select',
      value: lock ? (lock.open ? 'open' : 'locked') : '',
      options: [
        { value: '', label: 'No lock' },
        { value: 'locked', label: 'Locked' },
        { value: 'open', label: 'Unlocked' },
      ],
    },
    {
      name: 'lockRequires',
      label: 'Key item (name)',
      value: lock?.requires ?? '',
      suggestions: names,
      // A key item means nothing without a lock. The node dialog enables
      // the field when Lock changes to Locked or Unlocked.
      disabled: !lock,
    },
  ];
}

/**
 * The lock from the node dialog values, or null for no lock.
 * @param {Record<string, string>} values
 * @returns {NodeLock | null}
 */
export function readLockFields(values) {
  if (values.lockState !== 'locked' && values.lockState !== 'open') return null;
  return readLock({ requires: values.lockRequires, open: values.lockState === 'open' });
}
