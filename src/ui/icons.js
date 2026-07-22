/**
 * Inline SVG icon set. Zero dependencies: each icon is a small 24x24
 * stroke-based path drawn in `currentColor`, so it inherits the button/text
 * color it's placed inside and themes automatically with the rest of the UI.
 *
 * Usage: `button.append(icon('plus'))`. Icons are decorative by default
 * (aria-hidden); give the surrounding control its own accessible label.
 */

/** @typedef {'plus'|'minus'|'damage'|'heal'|'remove'|'edit'|'save'|'export'|'import'|'dice'|'add'} IconName */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Path data (the `d` attribute of one or more <path>s) per icon. Kept as raw
 * strings so `icon()` can build detached SVG elements without innerHTML.
 * @type {Record<IconName, string[]>}
 */
const PATHS = {
  plus: ['M12 5v14', 'M5 12h14'],
  minus: ['M5 12h14'],
  add: ['M12 5v14', 'M5 12h14'],
  remove: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],
  damage: ['M14.5 3.5l6 6-9 9-3 1 1-3z', 'M4 20l4-4'],
  heal: ['M12 6v12', 'M6 12h12'],
  edit: ['M4 20h4l10-10-4-4L4 16z', 'M13.5 6.5l4 4'],
  save: ['M5 3h11l3 3v15H5z', 'M8 3v6h7V3', 'M8 21v-7h8v7'],
  export: ['M12 3v12', 'M8 11l4 4 4-4', 'M5 21h14'],
  import: ['M12 15V3', 'M8 7l4-4 4 4', 'M5 21h14'],
  dice: ['M4 4h16v16H4z', 'M9 9h.01', 'M15 9h.01', 'M9 15h.01', 'M15 15h.01', 'M12 12h.01'],
};

/**
 * Build a detached SVG icon element.
 * @param {IconName} name
 * @param {{ size?: number, className?: string }} [options]
 * @returns {SVGSVGElement}
 */
export function icon(name, options = {}) {
  const size = options.size ?? 18;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon');
  if (options.className) svg.classList.add(options.className);

  for (const d of PATHS[name] ?? []) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}
