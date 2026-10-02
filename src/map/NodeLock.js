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
 * The lock fields of the node dialog: a state select and the key item.
 * @param {NodeLock | undefined} lock
 * @returns {import('../types/modal.js').ModalField[]}
 */
export function lockFields(lock) {
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
