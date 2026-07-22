/** @typedef {import('../types/map.js').MapNode} MapNode */

/**
 * Mount a breadcrumb trail. Call update(nodes) whenever the navigator's
 * current node changes; clicking a crumb (other than the last) invokes onSelect.
 * @param {HTMLElement} container
 * @param {(nodeId: string) => void} onSelect
 * @returns {{ update: (nodes: MapNode[]) => void }}
 */
export function mountBreadcrumb(container, onSelect) {
  const root = document.createElement('nav');
  root.className = 'breadcrumb';
  container.appendChild(root);

  /** @param {MapNode[]} nodes */
  function update(nodes) {
    root.innerHTML = '';
    nodes.forEach((node, i) => {
      const isLast = i === nodes.length - 1;

      const crumb = document.createElement(isLast ? 'span' : 'button');
      crumb.className = 'breadcrumb__crumb';
      crumb.textContent = node.name;
      if (!isLast) {
        crumb.type = 'button';
        crumb.addEventListener('click', () => onSelect(node.id));
      } else {
        crumb.setAttribute('aria-current', 'location');
      }
      root.appendChild(crumb);

      if (!isLast) {
        const sep = document.createElement('span');
        sep.className = 'breadcrumb__separator';
        sep.textContent = '/';
        sep.setAttribute('aria-hidden', 'true');
        root.appendChild(sep);
      }
    });
  }

  return { update };
}
