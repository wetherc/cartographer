/**
 * The element-construction primitives every widget in `ui/` builds from.
 *
 * `el` exists because the imperative shape (create an element, assign a
 * class, append it) costs three or four lines per element. This scaffolding
 * buries the DOM tree that a panel actually describes. Written
 * declaratively, the nesting in the source matches the nesting on the page,
 * so a panel reads as a tree.
 *
 * The signature stops at a class name and children on purpose. A control
 * that needs listeners, a `value`, or several attributes keeps a named
 * variable and sets them explicitly. Folding those into an options bag trades
 * this readability for a second, wordier way to write the same thing.
 */

/**
 * Anything `el` accepts as a child. This function drops nullish and `false`
 * children, so you can write a conditional child inline as `cond && node`.
 * @typedef {Node | string | null | undefined | false} Child
 */

/**
 * Build a detached element with a class and children in one expression. A
 * string child becomes a text node, so the common caption-plus-control shape
 * needs no separate `textContent` line.
 *
 * The tag is constrained to a known HTML tag, so the return type is the
 * precise element type, not a bare `HTMLElement`. This lets a caller set
 * `input.value` or `button.type` without a cast.
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {string} [className] when omitted or empty, the element stays unclassed
 * @param {...Child} children
 * @returns {HTMLElementTagNameMap[K]}
 */
export function el(tag, className = '', ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  append(node, children);
  return node;
}

/**
 * Append children to an element, and drop the nullish ones. This function is
 * split out from `el`, so a caller that already holds an element, for
 * example one built with listeners attached, or a mount point from
 * `mustGetElement`, can fill it the same way.
 * @param {ParentNode} node
 * @param {Child[]} children
 */
export function append(node, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child);
  }
}

/**
 * Join the truthy parts of a class list. This lets a builder combine its own
 * base class with a caller-supplied class. Neither side needs to check
 * whether the other is present.
 * @param {(string | undefined | false)[]} parts
 * @returns {string}
 */
export function classNames(parts) {
  return parts.filter(Boolean).join(' ');
}

/**
 * Set several attributes at once. Use this only for elements built outside
 * `el` whose attribute list is long enough to bury the shape, chiefly the
 * SVG icons.
 * @param {Element} node
 * @param {Record<string, string>} attrs
 * @returns {Element}
 */
export function setAttrs(node, attrs) {
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  return node;
}

/**
 * Fetch a required mount-point element. This fails loudly at startup if the
 * markup and the wiring in main.js ever drift apart.
 * @param {string} id
 * @returns {HTMLElement}
 */
export function mustGetElement(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Required element #${id} is missing from index.html`);
  return element;
}
