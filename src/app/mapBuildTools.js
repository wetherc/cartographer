import {
  renderNodeToCanvas,
  downloadCanvasPNG,
  exportFilename,
  exportTileSize,
  EXPORT_TILE_SIZE,
} from '../map/MapExport.js';
import { findRegionGroups } from '../map/RegionGroups.js';
import { mustGetElement } from '../ui/dom.js';
import { setTip } from '../ui/Tooltip.js';
import { icon } from '../ui/icons.js';
import { mountBuildEmptyMap } from '../ui/BuildEmptyMap.js';
import { isBlankMap, PAINT_TAB } from '../view/BuildTool.js';
import { removeStored, tryWriteStored } from '../storage/Footprint.js';

/** localStorage key of an unticked Place labels box. Absent means ticked. */
const HIDE_PLACE_LABELS_KEY = 'campaign-builder:hide-place-labels';

/**
 * Wire the Build map tools: the header Undo stroke and Redo stroke buttons,
 * a fog-free PNG export of the current node, and the card over a map with
 * no tiles. Only the GM in Build mode sees them. A player never sees these
 * tools.
 *
 * Each stroke button is disabled while its ring is empty, and its tooltip
 * names the edit it would change, such as "Undo the world generation on
 * Nordale Heights". A whole generated world is one entry, so the GM sees
 * what one click takes back before the click.
 * @param {import('../types/app.js').AppContext} app
 * @param {import('./mapWiring.js').MapEnv} env
 * @param {{
 *   undoStroke: () => Promise<void>,
 *   redoStroke: () => Promise<void>,
 *   onStrokeHistoryChange: (fn: (status: import('./strokeHistory.js').StrokeStatus) => void) => void,
 * }} strokes the stroke history of the map authoring
 * @param {{ select: (tabId: string) => void }} buildTabs the Build rail tab strip
 * @returns {{ syncEmptyMap: () => void }} call after each draw of the map
 */
export function wireMapBuildTools(app, env, strokes, buildTabs) {
  const { grid, navigator, toasts } = app;
  const undoBtn = /** @type {HTMLButtonElement} */ (mustGetElement('header-stroke-undo-btn'));
  const redoBtn = /** @type {HTMLButtonElement} */ (mustGetElement('header-stroke-redo-btn'));
  // Between 900 px and 85rem the header shows only these icons (styles/shell.css).
  undoBtn.prepend(icon('undo', { size: 16 }));
  redoBtn.prepend(icon('redo', { size: 16 }));
  undoBtn.addEventListener('click', () => void strokes.undoStroke());
  redoBtn.addEventListener('click', () => void strokes.redoStroke());
  strokes.onStrokeHistoryChange(({ undo, redo }) => {
    undoBtn.disabled = !undo;
    redoBtn.disabled = !redo;
    setTip(undoBtn, undo ? `Undo the ${undo} (Ctrl/Cmd+Z)` : 'Nothing to undo on the map');
    setTip(redoBtn, redo ? `Redo the ${redo} (Ctrl/Cmd+Shift+Z)` : 'Nothing to redo on the map');
  });
  // Place labels hides every region name in Build mode, per browser. The
  // map reads the box through getNodeName in mapWiring.js.
  const labelsBox = /** @type {HTMLInputElement} */ (mustGetElement('place-labels-toggle'));
  try {
    labelsBox.checked = localStorage.getItem(HIDE_PLACE_LABELS_KEY) !== '1';
  } catch {
    // Blocked storage leaves the box ticked.
  }
  labelsBox.addEventListener('change', () => {
    if (labelsBox.checked) removeStored(HIDE_PLACE_LABELS_KEY);
    else tryWriteStored(HIDE_PLACE_LABELS_KEY, '1');
    env.mapCanvas.render();
  });
  mustGetElement('export-png-btn').addEventListener('click', async () => {
    const node = navigator.getCurrentNode();
    // An empty map exports a blank image, so the GM hears why instead.
    if (isBlankMap(node)) {
      toasts.show(`"${node.name}" has no tiles yet, so there is nothing to export.`);
      return;
    }
    // Browsers cap the area and the sides of a canvas. The render scales the
    // tiles down to fit, and refuses a node that cannot fit at any readable
    // size. The toast below names the size it settled on.
    const tileSize = exportTileSize(node);
    const canvas = await renderNodeToCanvas(node, {
      tileSize: EXPORT_TILE_SIZE,
      regionGroups: findRegionGroups(node),
      getNodeName: (id) => grid.getNode(id)?.name,
      imageCache: env.mapCanvas.imageCache,
    });
    if (!canvas) {
      toasts.show(`"${node.name}" is too large to export as PNG.`);
      return;
    }
    downloadCanvasPNG(canvas, exportFilename(node.name));
    toasts.show(
      tileSize < EXPORT_TILE_SIZE
        ? `Exported "${node.name}" as PNG at ${tileSize} pixels per tile. A larger image is past the limit of the browser.`
        : `Exported "${node.name}" as PNG.`,
    );
  });

  // A map with no tiles shows a card over the canvas. In Build mode it has
  // the two ways to fill the map, and in Play mode it names the empty map. "Paint tiles" opens the Paint tab and focuses the palette.
  const shownNode = () => env.mapCanvas.node ?? navigator.getCurrentNode();
  const emptyMap = mountBuildEmptyMap(mustGetElement('map-viewport'), {
    isBlank: () => isBlankMap(shownNode()),
    getName: () => shownNode().name,
    onPaint: () => {
      buildTabs.select(PAINT_TAB);
      const palette = mustGetElement('palette-container');
      /** @type {HTMLElement | null} */ (
        palette.querySelector('.palette__swatch[tabindex="0"]') ??
          palette.querySelector('.palette__swatch')
      )?.focus();
    },
    onGenerate: () => mustGetElement('generate-btn').click(),
    onBuild: () => app.actions.setMode('build'),
  });
  return { syncEmptyMap: emptyMap.sync };
}
