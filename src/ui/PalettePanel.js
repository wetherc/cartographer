import { icon } from './icons.js';

/** @typedef {import('../map/TilePalette.js').TilePalette} TilePalette */
/** @typedef {import('../map/TilePalette.js').PaletteEntry} PaletteEntry */
/** @typedef {null | 'erase' | 'region' | PaletteEntry} Brush */

/**
 * Mount the tile palette: a picker of paint brushes for Build mode. The active
 * brush determines what clicking a tile does — an Inspect brush (null) selects
 * a tile for the inspector, an Erase brush removes a tile, a Region brush
 * drag-selects a block of tiles to link to a child node, and any tile swatch
 * paints that image. Selecting a brush invokes onBrushChange; the active brush
 * is highlighted. Swatches are also drag sources so a tile can be dragged onto
 * the grid, in addition to click-to-paint.
 * @param {HTMLElement} container
 * @param {TilePalette} palette
 * @param {(brush: Brush) => void} onBrushChange
 * @returns {{ getBrush: () => Brush }}
 */
export function mountPalettePanel(container, palette, onBrushChange) {
  /** @type {Brush} */
  let brush = null;

  const root = document.createElement('div');
  root.className = 'palette';
  container.appendChild(root);

  /** @type {HTMLElement[]} */
  const selectables = [];

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

  const inspectBtn = document.createElement('button');
  inspectBtn.type = 'button';
  inspectBtn.className = 'btn palette__item palette__item--active';
  inspectBtn.appendChild(icon('edit'));
  inspectBtn.appendChild(document.createTextNode('Inspect'));
  bindSelect(inspectBtn, null);

  const eraseBtn = document.createElement('button');
  eraseBtn.type = 'button';
  eraseBtn.className = 'btn btn--danger palette__item';
  eraseBtn.appendChild(icon('remove'));
  eraseBtn.appendChild(document.createTextNode('Erase'));
  bindSelect(eraseBtn, 'erase');

  const regionBtn = document.createElement('button');
  regionBtn.type = 'button';
  regionBtn.className = 'btn palette__item';
  regionBtn.appendChild(icon('map'));
  regionBtn.appendChild(document.createTextNode('Region'));
  bindSelect(regionBtn, 'region');

  tools.append(inspectBtn, eraseBtn, regionBtn);
  root.appendChild(tools);

  // Swatch grid of every palette entry.
  const grid = document.createElement('div');
  grid.className = 'palette__grid';
  for (const entry of palette.listAll()) {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'palette__swatch palette__item';
    swatch.title = entry.label;
    swatch.setAttribute('aria-label', entry.label);
    swatch.draggable = true;

    const img = document.createElement('img');
    img.src = `/${entry.imageRef}`;
    img.alt = '';
    swatch.appendChild(img);

    swatch.addEventListener('dragstart', (event) => {
      event.dataTransfer?.setData('text/tile-id', entry.id);
    });

    bindSelect(swatch, entry);
    grid.appendChild(swatch);
  }
  root.appendChild(grid);

  return { getBrush: () => brush };
}
