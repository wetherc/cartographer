/**
 * Inline SVG icon set. Zero dependencies: each icon is a small 24x24
 * stroke-based path drawn in `currentColor`, so it inherits the button/text
 * color it's placed inside and themes automatically with the rest of the UI.
 *
 * Usage: `button.append(icon('plus'))`. Icons are decorative by default
 * (aria-hidden); give the surrounding control its own accessible label.
 */

/** @typedef {'plus'|'minus'|'damage'|'heal'|'remove'|'edit'|'save'|'export'|'import'|'dice'|'d20'|'add'|'check'|'chevron'|'map'|'fit'|'sword'|'shield'|'clock'|'flag'|'scroll'|'sparkles'|'eye'|'eye-off'|'lock'} IconName */

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
  // An upright sword (pointed blade, crossguard, grip, pommel): reads as
  // "attack/damage" at a glance where the previous diagonal glyph did not.
  damage: ['M12 2l1.6 12h-3.2z', 'M7 14h10', 'M12 14v6', 'M9.5 20h5'],
  sword: ['M12 2l1.6 12h-3.2z', 'M7 14h10', 'M12 14v6', 'M9.5 20h5'],
  check: ['M5 12l5 5L20 6'],
  shield: ['M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z'],
  clock: ['M12 3a9 9 0 100 18 9 9 0 000-18z', 'M12 7v5l3 2'],
  flag: ['M6 21V4', 'M6 4h11l-2 4 2 4H6'],
  scroll: ['M6 4h10v14a2 2 0 002 2H8a2 2 0 01-2-2z', 'M16 4a2 2 0 012 2v2h-2', 'M9 9h5', 'M9 13h5'],
  sparkles: ['M12 3l1.5 5L19 9.5 13.5 11 12 16l-1.5-5L5 9.5 10.5 8z', 'M18 15l.7 2.3L21 18l-2.3.7L18 21l-.7-2.3L15 18l2.3-.7z'],
  heal: ['M12 6v12', 'M6 12h12'],
  edit: ['M4 20h4l10-10-4-4L4 16z', 'M13.5 6.5l4 4'],
  save: ['M5 3h11l3 3v15H5z', 'M8 3v6h7V3', 'M8 21v-7h8v7'],
  export: ['M12 3v12', 'M8 11l4 4 4-4', 'M5 21h14'],
  import: ['M12 15V3', 'M8 7l4-4 4 4', 'M5 21h14'],
  dice: ['M4 4h16v16H4z', 'M9 9h.01', 'M15 9h.01', 'M9 15h.01', 'M15 15h.01', 'M12 12h.01'],
  d20: [
    'M12 2l8.5 5v10L12 22l-8.5-5V7z',
    'M12 8L6 17h12z',
    'M12 2v6',
    'M3.5 7L6 17',
    'M20.5 7L18 17',
    'M6 17l6 5',
    'M18 17l-6 5',
  ],
  chevron: ['M9 6l6 6-6 6'],
  map: ['M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z', 'M9 4v14', 'M15 6v14'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z', 'M12 15a3 3 0 100-6 3 3 0 000 6z'],
  lock: ['M6 11h12v9H6z', 'M9 11V7a3 3 0 016 0v4'],
  'eye-off': ['M4 4l16 16', 'M9.9 5.2A9.9 9.9 0 0112 5c6.5 0 10 7 10 7a15 15 0 01-3.3 3.9', 'M6.3 6.3A15 15 0 002 12s3.5 7 10 7a9.6 9.6 0 004-.8', 'M9.5 9.5a3 3 0 004.2 4.2'],
  fit: ['M9 4H4v5', 'M15 4h5v5', 'M20 15v5h-5', 'M9 20H4v-5'],
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
