import { bareButton } from './buttons.js';
import { el } from './dom.js';
import { icon } from './icons.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */

/**
 * Mount a breadcrumb trail. Call update(nodes) when the current node of the
 * navigator changes. A click on a crumb, except the last, runs onSelect.
 * A map icon marks the first crumb as the location. A chevron between crumbs
 * shows that each node contains the next node.
 * @param {HTMLElement} container
 * @param {(nodeId: string) => void} onSelect
 * @returns {{ update: (nodes: MapNode[]) => void }}
 */
export function mountBreadcrumb(container, onSelect) {
  const root = el('nav', 'breadcrumb u-row u-wrap u-g1');
  root.setAttribute('aria-label', 'Map location');
  container.appendChild(root);

  /** @param {MapNode[]} nodes */
  function update(nodes) {
    root.innerHTML = '';

    const anchor = icon('map', { className: 'breadcrumb__anchor' });
    root.appendChild(anchor);

    nodes.forEach((node, i) => {
      const isLast = i === nodes.length - 1;

      if (i > 0) {
        const sep = icon('chevron', { size: 14, className: 'breadcrumb__separator' });
        root.appendChild(sep);
      }

      /** @type {HTMLElement} */
      let crumb;
      if (!isLast) {
        crumb = bareButton([node.name], () => onSelect(node.id), {
          className: 'breadcrumb__crumb',
        });
      } else {
        crumb = el('span', 'breadcrumb__crumb', node.name);
        crumb.setAttribute('aria-current', 'location');
      }
      root.appendChild(crumb);
    });
  }

  return { update };
}
