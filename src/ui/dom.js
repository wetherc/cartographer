/**
 * The element-construction primitives every widget in `ui/` builds from.
 *
 * `el` exists because the imperative shape — create, assign a class, append —
 * costs three or four lines per element, which buries the DOM tree a panel is
 * actually describing under its own scaffolding. Written declaratively the
 * nesting in the source matches the nesting on the page, so a panel reads as a
 * tree.
 *
 * The signature stops at a class name and children on purpose. A control that
 * needs listeners, a `value`, or several attributes keeps a named variable and
 * sets them explicitly; folding those into an options bag would trade the
 * readability this is here to buy for a second, wordier way to write the same
 * thing.
 */

/**
 * Anything `el` accepts as a child. Nullish and `false` children are dropped,
 * so a conditional child can be written inline as `cond && node`.
 * @typedef {Node | string | null | undefined | false} Child
 */

/**
 * Build a detached element with a class and children in one expression. A
 * string child becomes a text node, so the common caption-plus-control shape
 * needs no separate `textContent` line.
 *
 * The tag is constrained to a known HTML tag so the return type is the precise
 * element type rather than a bare `HTMLElement`; that is what lets a caller go
 * on to set `input.value` or `button.type` without a cast.
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {string} [className] omitted or empty leaves the element unclassed
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
 * Append children to an element, dropping the nullish ones. Split out from
 * `el` so a caller that already holds an element — one built with listeners
 * attached, or a mount point from `mustGetElement` — fills it the same way.
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
 * Join the truthy parts of a class list. Lets a builder compose its own base
 * class with a caller-supplied one without either side minding whether the
 * other is present.
 * @param {(string | undefined | false)[]} parts
 * @returns {string}
 */
export function classNames(parts) {
  return parts.filter(Boolean).join(' ');
}

/**
 * Set several attributes at once. Only for elements built outside `el` whose
 * attribute list is long enough to bury the shape — the SVG icons, chiefly.
 * @param {Element} node
 * @param {Record<string, string>} attrs
 * @returns {Element}
 */
export function setAttrs(node, attrs) {
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  return node;
}

/**
 * Fetch a required mount-point element, failing loudly at startup if the
 * markup and the wiring in main.js ever drift apart.
 * @param {string} id
 * @returns {HTMLElement}
 */
export function mustGetElement(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Required element #${id} is missing from index.html`);
  return element;
}
