/**
 * Keep the children of a list element in step with a list of items, by key.
 * A child whose key and signature match an item stays in the document, so a
 * focused control inside it keeps focus and an open disclosure stays open.
 * A child whose signature changed is replaced by a fresh build, and a child
 * with no item is removed. The signature is any string that changes whenever
 * the built element would look or act differently.
 */

/** @type {WeakMap<Element, { key: string, sig: string }>} */
const stamps = new WeakMap();

/**
 * @typedef {{ key: string, sig: string, build: () => HTMLElement }} KeyedItem
 */

/**
 * Patch `parent` so that its children are the elements of `items`, in order.
 * The children of `parent` must all come from an earlier call.
 * @param {HTMLElement} parent
 * @param {KeyedItem[]} items
 */
export function patchChildren(parent, items) {
  /** @type {Map<string, Element>} */
  const kept = new Map();
  for (const child of Array.from(parent.children)) {
    const stamp = stamps.get(child);
    if (stamp) kept.set(`${stamp.key}\n${stamp.sig}`, child);
  }
  items.forEach(({ key, sig, build }, i) => {
    let node = kept.get(`${key}\n${sig}`);
    if (!node) {
      node = build();
      stamps.set(node, { key, sig });
    }
    // Move a node only when it is out of place. A move takes focus away.
    const at = parent.children[i] ?? null;
    if (at !== node) parent.insertBefore(node, at);
  });
  while (parent.children.length > items.length) parent.lastElementChild?.remove();
}
