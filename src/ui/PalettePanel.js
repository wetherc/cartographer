import { icon } from './icons.js';
import { textButton } from './buttons.js';
import { allowsPaletteType } from '../map/NodeKinds.js';
import { isOverlayType } from '../map/TilePalette.js';
import { wireDisclosure } from './Disclosure.js';

/** @typedef {import('../map/TilePalette.js').TilePalette} TilePalette */
/** @typedef {import('../map/TilePalette.js').PaletteEntry} PaletteEntry */
/** @typedef {null | 'erase' | 'erase-path' | 'region' | PaletteEntry} Brush */

/**
 * Mount the tile palette: a picker of paint brushes for Build mode. The active
 * brush determines what clicking a tile does — an Inspect brush (null) selects
 * a tile for the inspector, an Erase brush removes a tile, a Region brush
 * drag-selects a block of tiles to link to a child node, and any tile swatch
 * paints that image. Selecting a brush invokes onBrushChange; the active brush
 * is highlighted. Swatches are also drag sources so a tile can be dragged onto
 * the grid, in addition to click-to-paint. Hovering a swatch shows its label in
 * the supplied tooltip (swatches are image-only, so the name has no other
 * visible surface). A scale row (1x/2x/3x) sizes painted tile art: at 2x/3x a
 * paint places one tile whose image is drawn stretched across a 2x2/3x3 block
 * — a purely visual footprint for landmarks (an academy, a keep), no region
 * link involved. Roads and erasing ignore it.
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

  const root = document.createElement('div');
  root.className = 'palette';
  container.appendChild(root);

  /** @type {HTMLElement[]} */
  const selectables = [];
  /** @type {{ el: HTMLElement, type: string }[]} swatches, tagged with their palette type for kind-filtering */
  const swatchEntries = [];
  const inspectBtnRef = { el: /** @type {HTMLElement | null} */ (null) };

  /**
   * @param {HTMLElement} el
   * @param {Brush} value
   */
  function bindSelect(el, value) {
    selectables.push(el);
    el.addEventListener('click', () => select(value, el));
  }

  /**
   * @param {Brush} value
   * @param {HTMLElement} el
   */
  function select(value, el) {
    brush = value;
    for (const s of selectables) s.classList.toggle('palette__item--active', s === el);
    onBrushChange(brush);
  }

  // Tools row: Inspect (default) and Erase.
  const tools = document.createElement('div');
  tools.className = 'palette__tools';

  /**
   * @param {string} label
   * @param {import('./icons.js').IconName} glyph
   * @param {Brush} value
   * @param {string} [variant]
   */
  function toolButton(label, glyph, value, variant) {
    const el = textButton(label, () => select(value, el), {
      icon: glyph,
      variant,
      className: 'palette__item',
    });
    selectables.push(el);
    return el;
  }

  // Inspect is the starting brush, so it carries the active styling from mount.
  const inspectBtn = toolButton('Inspect', 'edit', null);
  inspectBtn.classList.add('palette__item--active');
  inspectBtnRef.el = inspectBtn;

  const regionBtn = toolButton('Region', 'map', 'region');
  const erasePathBtn = toolButton('Erase path', 'remove', 'erase-path');
  const eraseBtn = toolButton('Erase tile', 'remove', 'erase', 'danger');

  // Grid order (row-major): Inspect, Region, Erase path, Erase tile.
  tools.append(inspectBtn, regionBtn, erasePathBtn, eraseBtn);
  root.appendChild(tools);

  // Scale row: how large the next painted tile's art draws (1x1 up to 3x3).
  const scaleRow = document.createElement('div');
  scaleRow.className = 'palette__scale';
  const scaleLabel = document.createElement('span');
  scaleLabel.className = 'palette__scale-label';
  scaleLabel.textContent = 'Size';
  scaleRow.appendChild(scaleLabel);
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

  // Swatches, grouped into collapsible sections so terrain, overlays (roads,
  // rivers, coasts), buildings, and interior pieces aren't commingled in one
  // grid. Terrain starts open (the most common brush); the rest start collapsed.
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

  const sectionsEl = document.createElement('div');
  sectionsEl.className = 'palette__sections';
  /** @type {Map<string, { wrap: HTMLElement, grid: HTMLElement, swatches: HTMLElement[] }>} */
  const sections = new Map();
  for (const label of ['Terrain', 'Overlays', 'Buildings', 'Interior']) {
    const wrap = document.createElement('div');
    wrap.className = 'palette__section';

    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'disclosure section-label';
    const title = document.createElement('span');
    title.textContent = label;
    head.append(title, icon('chevron', { className: 'disclosure__chevron' }));

    const grid = document.createElement('div');
    grid.className = 'palette__grid';

    wireDisclosure(head, grid, { expanded: label === 'Terrain' });
    wrap.append(head, grid);
    sectionsEl.appendChild(wrap);
    sections.set(label, { wrap, grid, swatches: [] });
  }

  for (const entry of palette.listAll()) {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'palette__swatch palette__item';
    swatch.setAttribute('aria-label', entry.label);
    swatch.draggable = true;

    const img = document.createElement('img');
    img.src = `/${entry.imageRef}`;
    img.alt = '';
    swatch.appendChild(img);

    if (tooltip) {
      swatch.addEventListener('pointermove', (event) => {
        tooltip.show({ title: entry.label, notes: '' }, event.clientX, event.clientY);
      });
      swatch.addEventListener('pointerleave', () => tooltip.hide());
    } else {
      // No tooltip supplied: fall back to the native one.
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
   * Filter the swatch grid to the terrain a node kind can use (interiors show
   * only interior/custom pieces, regions everything else). If the active brush
   * is now hidden, fall back to Inspect so a stale hidden brush can't paint.
   * @param {string} kind
   */
  function setKind(kind) {
    for (const { el, type } of swatchEntries) {
      el.hidden = !allowsPaletteType(kind, type);
    }
    // A section with nothing visible for this kind hides wholesale (Interior
    // on outdoor nodes; Terrain/Roads/Buildings inside), so no empty
    // disclosure headers linger.
    for (const { wrap, swatches } of sections.values()) {
      wrap.hidden = swatches.every((el) => el.hidden);
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
