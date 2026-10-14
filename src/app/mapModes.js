import { mustGetElement } from '../ui/dom.js';
import { mountPalettePanel } from '../ui/PalettePanel.js';
import { isGM, seesThroughFog } from '../view/ViewRole.js';
import { watchPixelRatio } from '../ui/pixelRatio.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/mapEnv.js').MapEnv} MapEnv */
/** @typedef {import('../types/entities.js').EncounterLocation} EncounterLocation */

/**
 * Register the map-facing effects of a mode switch and a role switch, and
 * keep the canvas buffer matched to its element. Call this after
 * env.mapCanvas, env.tileTooltip, and both trees are set.
 * @param {AppContext} app
 * @param {MapEnv} env
 * @param {{
 *   canvasEl: HTMLCanvasElement,
 *   setFogTool: (tool: 'reveal' | 'hide' | null) => void,
 *   syncMapOccluders: () => void,
 *   followedView: () => EncounterLocation,
 *   resetBuildWarning: () => void,
 * }} hooks
 */
export function wireMapModes(app, env, hooks) {
  const { grid, navigator, state } = app;
  const { canvasEl, setFogTool, syncMapOccluders, followedView } = hooks;
  const { mapCanvas, tileTooltip, worldTree, regionTree } = env;

  // A GM in Play mode sees the art under the fog, dimmed. A player sees solid
  // fog, so the screen the players watch shows nothing ahead.
  const syncFogDim = () => mapCanvas.setFogDim(seesThroughFog(state.mode, state.role));
  syncFogDim();

  // The map-facing effects of a mode switch. sessionControls calls this
  // after it flips the body classes.
  app.actions.onModeChanged = (mode) => {
    mapCanvas.setRevealAll(mode === 'build');
    syncFogDim();
    syncMapOccluders();
    // A Play view frames the revealed tiles, at a zoom that can cut off the
    // rest of the map. Build mode edits the whole map, so it fits it.
    if (mode === 'build') {
      mapCanvas.fit();
      env.palettePanel?.show();
    }
    env.syncBuildTool();
    tileTooltip.hide();
    // The fog brush is a Play-mode tool. Changing modes drops it. Putting it
    // down settles the authoring gesture and the crosshair for the new mode.
    setFogTool(null);
    if (mode !== 'build') env.clearSelection();
    hooks.resetBuildWarning();
    // Build mode offers no ways out, and it drops the party focus of the fit.
    // Play mode draws the exits again.
    env.syncPartyMarker();
    worldTree.update();
    regionTree.update();
    env.refreshMapDescription();
    // Play mode is about the party. Bring it into view, from whatever node
    // Build had open.
    if (mode === 'play') {
      const at = followedView();
      if (navigator.getCurrentNode().id !== at.nodeId && grid.getNode(at.nodeId)) {
        env.goToNode(at.nodeId);
      } else mapCanvas.bringTileIntoView(at.tileId);
    }
  };

  // This handles a role switch in the same way. A player role gets no fog
  // brush and no authoring gesture. An open tooltip can now show too much.
  app.actions.onRoleChanged = (role) => {
    if (role === 'player') setFogTool(null);
    syncFogDim();
    tileTooltip.hide();
    // The sidebar world tree shows everything to the GM, but shows only
    // discovered nodes to a player. The Build-rail tree is empty for a
    // player. A role flip changes the contents of both.
    regionTree.update();
    worldTree.update();
  };

  // Keep the canvas buffer matched to the CSS size of the element, times the
  // device pixel ratio. This lets the map fill the fluid layout column,
  // instead of staying a fixed 720x540 island. Each resize re-frames the node.
  // Combat and Library mode hide the map with display: none, which reports a
  // size of zero. The buffer keeps its size while hidden, so the pan and zoom
  // of the GM come back unchanged when the map shows again.
  const resizeMapToViewport = () => {
    if (canvasEl.clientWidth === 0 || canvasEl.clientHeight === 0) return;
    const dpr = window.devicePixelRatio || 1;
    mapCanvas.resize(
      Math.max(1, Math.round(canvasEl.clientWidth * dpr)),
      Math.max(1, Math.round(canvasEl.clientHeight * dpr)),
    );
    syncMapOccluders();
  };
  new ResizeObserver(resizeMapToViewport).observe(canvasEl);
  // A move to a screen with another pixel ratio keeps the CSS size, so the
  // ResizeObserver stays quiet and the ratio needs its own watch.
  watchPixelRatio(resizeMapToViewport);
}

/**
 * Register showBuild, which mounts the Build rail on the first switch to
 * Build mode. The rail's palette, world tree, and foe and NPC lists contain
 * about half of the page's elements, and only Build mode shows them.
 * sessionControls reports the first switch before onModeChanged. A Player
 * tab cannot enter Build mode, so it never builds them. The tile inspector is
 * small and mounts at startup.
 * @param {AppContext} app
 * @param {MapEnv} env
 */
export function wireBuildRailMount(app, env) {
  const { grid, navigator, palette, state } = app;
  app.actions.showBuild = () => {
    if (!isGM(state.role)) return;
    if (!env.palettePanel) {
      // The tooltip doubles as the palette's hover label, naming each
      // image-only swatch.
      const palettePanel = mountPalettePanel(
        mustGetElement('palette-container'),
        palette,
        (brush) => {
          env.activeBrush = brush;
          env.syncBuildTool();
        },
        env.tileTooltip,
        {
          list: () =>
            grid.getChildren(navigator.currentNodeId).map((n) => ({ id: n.id, name: n.name })),
          create: () => env.nodeActions.addChildNode(navigator.currentNodeId),
        },
      );
      env.palettePanel = palettePanel;
      palettePanel.regionPicker.root.addEventListener('change', env.syncBuildTool);
      env.syncPaletteKind();
    }
    env.worldTree.mount();
    app.views.buildFoes.mount();
    app.views.buildNPCs.mount();
  };
}
