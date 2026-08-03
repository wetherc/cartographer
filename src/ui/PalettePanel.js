import { textButton } from './buttons.js';
import { el } from './dom.js';
import { allowsPaletteType } from '../map/NodeKinds.js';
import { isOverlayType } from '../map/TilePalette.js';
import { buildDisclosure } from './Disclosure.js';

/** @typedef {import('../map/TilePalette.js').TilePalette} TilePalette */
/** @typedef {import('../map/TilePalette.js').PaletteEntry} PaletteEntry */
/** @typedef {null | 'erase' | 'erase-path' | 'region' | PaletteEntry} Brush */

/**
 * Mount the tile palette: a picker of paint brushes for Build mode. The active
 * brush controls what a click on a tile does. An Inspect brush (null) selects
 * a tile for the inspector. An Erase brush removes a tile. A Region brush
 * drag-selects a block of tiles to link to a child node. Any tile swatch
 * paints that image. A brush pick invokes onBrushChange, and the panel
 * highlights the active brush. Swatches are also drag sources, so a GM can
 * drag a tile onto the grid in addition to click-to-paint. A hover over a
 * swatch shows its label in the supplied tooltip, because a swatch is
 * image-only and has no other visible label. A scale row (1x, 2x, 3x) sizes
 * painted tile art. At 2x or 3x, a paint places one tile whose image draws
 * stretched across a 2x2 or 3x3 block. This is a visual footprint only, for
 * landmarks such as an academy or a keep, and involves no region link. Roads
 * and erasing ignore the scale row.
 * @param {HTMLElement} container
 * @param {TilePalette} palette
 * @param {(brush: Brush) => void} onBrushChange
 * @param {ReturnType<typeof import('./TileTooltip.js').mountTileTooltip>} [tooltip]
 * @returns {{ getBrush: () => Brush, getScale: () => number, setKind: (kind: string) => void }}
 */
export function mountPalettePanel(container, palette, onBrushChange, tooltip) {
  /** @type {Brush} */
  let brush = null;
  let scale = 1;

  const root = el('div', 'palette');
  container.appendChild(root);

  /** @type {HTMLElement[]} */
  const selectables = [];
  /** @type {{ el: HTMLElement, type: string }[]} Swatches, tagged with their palette type for kind-filtering. */
  const swatchEntries = [];
  const inspectBtnRef = { el: /** @type {HTMLElement | null} */ (null) };

  /**
   * @param {HTMLElement} node
   * @param {Brush} value
   */
  function bindSelect(node, value) {
    selectables.push(node);
    node.addEventListener('click', () => select(value, node));
  }

  /**
   * @param {Brush} value
   * @param {HTMLElement} node
   */
  function select(value, node) {
    brush = value;
    for (const s of selectables) s.classList.toggle('palette__item--active', s === node);
    onBrushChange(brush);
  }

  // Tools row: Inspect (the default) and Erase.
  const tools = el('div', 'palette__tools');

  /**
   * @param {string} label
   * @param {import('./icons.js').IconName} glyph
   * @param {Brush} value
   * @param {string} [variant]
   */
  function toolButton(label, glyph, value, variant) {
    const node = textButton(label, () => select(value, node), {
      icon: glyph,
      variant,
      className: 'palette__item',
    });
    selectables.push(node);
    return node;
  }

  // Inspect is the starting brush. It carries the active styling from mount.
  const inspectBtn = toolButton('Inspect', 'edit', null);
  inspectBtn.classList.add('palette__item--active');
  inspectBtnRef.el = inspectBtn;

  const regionBtn = toolButton('Region', 'map', 'region');
  const erasePathBtn = toolButton('Erase path', 'remove', 'erase-path');
  const eraseBtn = toolButton('Erase tile', 'remove', 'erase', 'danger');

  // Grid order (row-major): Inspect, Region, Erase path, Erase tile.
  tools.append(inspectBtn, regionBtn, erasePathBtn, eraseBtn);
  root.appendChild(tools);

  // Scale row: how large the next painted tile's art draws, from 1x1 to 3x3.
  const scaleRow = el(
    'div',
    'palette__scale u-row u-g2',
    el('span', 'palette__scale-label u-muted', 'Size'),
  );
  /** @type {HTMLButtonElement[]} */
  const scaleButtons = [];
  for (const n of [1, 2, 3]) {
    const btn = textButton(
      `${n}x`,
      () => {
        scale = n;
        for (const b of scaleButtons) {
          const active = b === btn;
          b.classList.toggle('palette__item--active', active);
          b.setAttribute('aria-pressed', String(active));
        }
      },
      { ariaLabel: `Paint tile art at ${n}x${n} size`, className: 'palette__item' },
    );
    btn.setAttribute('aria-pressed', String(n === scale));
    btn.classList.toggle('palette__item--active', n === scale);
    scaleButtons.push(btn);
    scaleRow.appendChild(btn);
  }
  root.appendChild(scaleRow);

  // Swatches group into collapsible sections, so terrain, overlays (roads,
  // rivers, coasts), buildings, and interior pieces do not mix in one grid.
  // Terrain starts open, because it is the most common brush. The rest start
  // collapsed.
  const TERRAIN_TYPES = new Set([
    'grass',
    'forest',
    'mountain',
    'water',
    'desert',
    'swamp',
    'snow',
    'hills',
    'farmland',
    'custom',
  ]);
  /** @param {PaletteEntry} entry */
  const sectionFor = (entry) =>
    TERRAIN_TYPES.has(entry.type)
      ? 'Terrain'
      : isOverlayType(entry.type)
        ? 'Overlays'
        : entry.type === 'interior'
          ? 'Interior'
          : 'Buildings';

  const sectionsEl = el('div', 'palette__sections');
  /** @type {Map<string, { wrap: HTMLElement, grid: HTMLElement, swatches: HTMLElement[] }>} */
  const sections = new Map();
  for (const label of ['Terrain', 'Overlays', 'Buildings', 'Interior']) {
    const grid = el('div', 'palette__grid');
    const { head } = buildDisclosure({ label, body: grid, expanded: label === 'Terrain' });
    const wrap = el('div', 'palette__section', head, grid);

    sectionsEl.appendChild(wrap);
    sections.set(label, { wrap, grid, swatches: [] });
  }

  for (const entry of palette.listAll()) {
    const img = el('img');
    img.src = `/${entry.imageRef}`;
    img.alt = '';

    const swatch = el('button', 'palette__swatch palette__item', img);
    swatch.type = 'button';
    swatch.setAttribute('aria-label', entry.label);
    swatch.draggable = true;

    if (tooltip) {
      swatch.addEventListener('pointermove', (event) => {
        tooltip.show({ title: entry.label, notes: '' }, event.clientX, event.clientY);
      });
      swatch.addEventListener('pointerleave', () => tooltip.hide());
    } else {
      // No tooltip supplied. Fall back to the native one.
      swatch.title = entry.label;
    }

    swatch.addEventListener('dragstart', (event) => {
      event.dataTransfer?.setData('text/tile-id', entry.id);
      tooltip?.hide();
    });

    bindSelect(swatch, entry);
    swatchEntries.push({ el: swatch, type: entry.type });
    const section = /** @type {NonNullable<ReturnType<typeof sections.get>>} */ (
      sections.get(sectionFor(entry))
    );
    section.swatches.push(swatch);
    section.grid.appendChild(swatch);
  }
  root.appendChild(sectionsEl);

  /**
   * Filter the swatch grid to the terrain a node kind can use. An interior
   * shows only interior or custom pieces. A region shows everything else. If
   * this hides the active brush, fall back to Inspect, so a hidden brush
   * cannot paint.
   * @param {string} kind
   */
  function setKind(kind) {
    for (const { el: swatch, type } of swatchEntries) {
      swatch.hidden = !allowsPaletteType(kind, type);
    }
    // A section with nothing visible for this kind hides in full, for example
    // Interior on outdoor nodes, or Terrain, Roads, and Buildings inside. This
    // leaves no empty disclosure headers.
    for (const { wrap, swatches } of sections.values()) {
      wrap.hidden = swatches.every((swatch) => swatch.hidden);
    }
    if (
      brush &&
      brush !== 'erase' &&
      brush !== 'erase-path' &&
      brush !== 'region' &&
      !allowsPaletteType(kind, brush.type)
    ) {
      if (inspectBtnRef.el) select(null, inspectBtnRef.el);
    }
  }

  return { getBrush: () => brush, getScale: () => scale, setKind };
}
