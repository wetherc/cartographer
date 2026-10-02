import { clientRectToBuffer } from '../map/MapGeometry.js';
import { revealAll } from '../map/FogOfWar.js';
import { miniMapView } from '../map/MiniMap.js';
import { mustGetElement } from '../ui/dom.js';
import { mountMapControls } from '../ui/MapControls.js';
import { mountMiniMap } from '../ui/MiniMap.js';
import { confirmModal } from '../ui/Modal.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/entities.js').EncounterLocation} EncounterLocation */

/**
 * Mount the HTML chrome over the map canvas: the mini-map of the parent map
 * and the zoom and fog toolbar. Both boxes report their rectangles to the
 * canvas as occluders. Call this after env.mapCanvas and env.regionTree are
 * set.
 * @param {AppContext} app
 * @param {import('./mapWiring.js').MapEnv} env
 * @param {{
 *   canvasEl: HTMLCanvasElement,
 *   followedView: () => EncounterLocation,
 *   centerOnLocation: (location: EncounterLocation) => void,
 *   setFogTool: (tool: 'reveal' | 'hide' | null) => void,
 *   entryThrough: () => string | null,
 * }} hooks
 */
export function mountMapChrome(app, env, hooks) {
  const { grid, navigator, toasts, state } = app;
  const { canvasEl, followedView, setFogTool } = hooks;
  const mapCanvas = env.mapCanvas;
  const viewport = mustGetElement('map-viewport');

  // The mini-map follows the same position as the Center button: the party,
  // or a bound player's own character while the party is split. Build mode
  // lifts the fog, as the main map does.
  const miniMap = mountMiniMap(viewport, {
    revealAll: () => state.mode === 'build',
    getView: () => {
      const node = navigator.getCurrentNode();
      return miniMapView(node, grid.getParent(node), followedView(), hooks.entryThrough());
    },
  });

  /** @type {ReturnType<typeof mountMapControls> | null} */
  let mapControls = null;

  // A click on the mini-map or the zoom toolbar never reaches the canvas, so
  // the edge exit bands move off the part of the canvas they cover. The
  // observers fire when either shows, hides, or changes size. A canvas
  // resize changes the buffer scale, so the resize handler calls this too.
  // In Play mode the mini-map floats over the map: a fit keeps no column for
  // it, and the coordinate digits under it hide. In Build mode it takes
  // pointer events over cells the GM paints, so the fit keeps room for it
  // and a fitted map starts clear of it.
  const syncMapOccluders = () => {
    const canvasRect = canvasEl.getBoundingClientRect();
    const boxes = [miniMap.element, mapControls?.element].filter(
      (box) => box && !box.hidden && box.offsetParent !== null,
    );
    mapCanvas.setOccluders(
      boxes.map((box) => ({
        ...clientRectToBuffer(
          /** @type {HTMLElement} */ (box).getBoundingClientRect(),
          canvasRect,
          canvasEl.width,
          canvasEl.height,
        ),
        float: box === miniMap.element && state.mode !== 'build',
      })),
    );
  };
  const occluderObserver = new ResizeObserver(syncMapOccluders);
  occluderObserver.observe(miniMap.element);

  mapControls = mountMapControls(viewport, {
    onZoomIn: () => mapCanvas.zoomBy(1.25),
    onZoomOut: () => mapCanvas.zoomBy(1 / 1.25),
    onFit: () => mapCanvas.fit({ whole: true }),
    onCenter: () => hooks.centerOnLocation(followedView()),
    getZoom: () => mapCanvas.scale,
    // GM fog controls, hidden from the player role by CSS. Brushes stroke fog
    // on or off. Reveal-all lights the whole current node.
    fog: {
      getTool: () => env.fogTool,
      // The pressed state of the brush button flips, but a screen reader only
      // hears a state change on the button itself. The pickup is said out
      // loud, the same way the Escape drop is, so the user knows the left
      // button and Enter now paint fog instead of moving the party.
      onToolChange: (tool) => {
        setFogTool(tool);
        if (env.fogTool === 'reveal') {
          toasts.show(
            'Reveal fog brush picked up. A click or Enter on a tile reveals it. Escape puts the brush down.',
          );
        } else if (env.fogTool === 'hide') {
          toasts.show(
            'Hide fog brush picked up. A click or Enter on a tile hides it. Escape puts the brush down.',
          );
        }
      },
      // Players see the result at once on their own tab, and the button
      // sits beside the brushes, so a stray click asks first.
      onRevealAll: async () => {
        const shown = navigator.getCurrentNode();
        const ok = await confirmModal(
          `Reveal all of "${shown.name}" to the players? Undo can hide it again.`,
          { title: 'Reveal whole area', confirmLabel: 'Reveal' },
        );
        if (!ok || navigator.getCurrentNode().id !== shown.id) return;
        const node = revealAll(navigator.getCurrentNode());
        grid.updateNode(node);
        mapCanvas.refreshNode(node);
        env.regionTree.update();
        env.refreshMapDescription();
        app.actions.markDirty();
        toasts.show(`Revealed all of "${node.name}".`);
      },
    },
    miniMap: { isOpen: miniMap.isOpen, isAvailable: miniMap.isAvailable, onToggle: miniMap.toggle },
  });
  occluderObserver.observe(mapControls.element);

  return { miniMap, mapControls, syncMapOccluders };
}
