import {
  renderNodeToCanvas,
  downloadCanvasPNG,
  exportFilename,
  exportTileSize,
  EXPORT_TILE_SIZE,
} from '../map/MapExport.js';
import { findRegionGroups } from '../map/RegionGroups.js';
import { mustGetElement } from '../ui/dom.js';
import { mountBuildEmptyMap } from '../ui/BuildEmptyMap.js';
import { isBlankMap, PAINT_TAB } from '../view/BuildTool.js';

/**
 * Wire the Build map tools: stroke-level undo, a fog-free PNG export of the
 * current node, and the card over a map with no tiles. Only the GM in Build
 * mode sees them. A player never sees these tools.
 * @param {import('../types/app.js').AppContext} app
 * @param {import('./mapWiring.js').MapEnv} env
 * @param {() => void} undoStroke
 * @param {{ select: (tabId: string) => void }} buildTabs the Build rail tab strip
 * @returns {{ syncEmptyMap: () => void }} call after each draw of the map
 */
export function wireMapBuildTools(app, env, undoStroke, buildTabs) {
  const { grid, navigator, toasts } = app;
  mustGetElement('stroke-undo-btn').addEventListener('click', undoStroke);
  mustGetElement('header-stroke-undo-btn').addEventListener('click', undoStroke);
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
      imageCache: env.mapCanvas.renderer.imageCache,
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
