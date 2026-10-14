import { getTile } from '../map/TileGrid.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/mapEnv.js').MapEnv} MapEnv */
/** @typedef {import('../types/entities.js').EncounterLocation} EncounterLocation */

/**
 * Build the functions that select a Build-mode tile and bring a location into
 * view. They read env.mapCanvas and env.inspector when they run, so the map
 * wiring can create them before either view mounts.
 * @param {AppContext} app
 * @param {MapEnv} env
 * @param {{ select: (id: string) => void }} buildTabs the Build rail's tab strip
 */
export function createMapSelection(app, env, buildTabs) {
  const { grid, navigator } = app;

  /** Remove any Build-mode tile selection and its inspector and canvas
   * highlight. */
  function clearSelection() {
    env.selectedTileId = null;
    env.mapCanvas.setSelectedTile(null);
    env.inspector.setTile(null);
  }

  /**
   * Select a tile within the current node and point the inspector at it.
   * Bring the Tile tab forward so the inspector is visible.
   * @param {string} tileId
   */
  function selectTile(tileId) {
    env.selectedTileId = tileId;
    env.mapCanvas.setSelectedTile(tileId);
    env.inspector.setTile(getTile(navigator.getCurrentNode(), tileId) ?? null, true);
    buildTabs.select('build-tab-tile');
  }

  /**
   * Bring a staged location into view. Navigate to its node if the GM looks
   * elsewhere, center the canvas on its tile, and select the tile so it
   * shows highlighted. Unlike selectTile, this does not change the Build
   * rail's active tab. This is how a click on an encounter in the Build list
   * lands on the encounter.
   * @param {EncounterLocation} location
   */
  function focusLocation(location) {
    if (navigator.getCurrentNode().id !== location.nodeId) {
      if (!grid.getNode(location.nodeId)) return;
      env.goToNode(location.nodeId);
    }
    env.selectedTileId = location.tileId;
    env.mapCanvas.setSelectedTile(location.tileId);
    env.inspector.setTile(getTile(navigator.getCurrentNode(), location.tileId) ?? null, true);
    env.mapCanvas.centerOnTile(location.tileId);
  }

  /**
   * Bring a position into view without changing the Build-mode tile
   * selection. Navigate to its node when the view looks elsewhere, then
   * center the canvas on the tile at the current zoom. This is how selecting
   * a character in the roster follows the character around a split party.
   * @param {EncounterLocation} location
   */
  function centerOnLocation(location) {
    if (navigator.getCurrentNode().id !== location.nodeId) {
      if (!grid.getNode(location.nodeId)) return;
      env.goToNode(location.nodeId);
    }
    env.mapCanvas.centerOnTile(location.tileId);
  }

  return { clearSelection, selectTile, focusLocation, centerOnLocation };
}
