import { icon } from './icons.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */

/**
 * Mount a breadcrumb trail. Call update(nodes) whenever the navigator's
 * current node changes; clicking a crumb (other than the last) invokes onSelect.
 * A leading map icon anchors it as "location," and a chevron separator reads as
 * "contains" so parent-to-child order is legible at a glance.
 * @param {HTMLElement} container
 * @param {(nodeId: string) => void} onSelect
 * @returns {{ update: (nodes: MapNode[]) => void }}
 */
export function mountBreadcrumb(container, onSelect) {
  const root = document.createElement('nav');
  root.className = 'breadcrumb';
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
        const button = document.createElement('button');
        button.type = 'button';
        button.addEventListener('click', () => onSelect(node.id));
        crumb = button;
      } else {
        crumb = document.createElement('span');
        crumb.setAttribute('aria-current', 'location');
      }
      crumb.className = 'breadcrumb__crumb';
      crumb.textContent = node.name;
      root.appendChild(crumb);
    });
  }

  return { update };
}
