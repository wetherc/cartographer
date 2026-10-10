import { updateTileMetadata } from '../map/TileGrid.js';
import { followParty, meetCreatures } from '../entities/CreatureMap.js';
import { isGM } from '../view/ViewRole.js';
import { tileAt } from '../map/TileIndex.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * Build what happens when the party or a character arrives on a tile:
 * companions follow, placed creatures are met, the location panels re-filter,
 * and points of interest along the walk are discovered. `createMapTravel`
 * and the exit and teleport modules call these after each move.
 * @param {AppContext} app
 */
export function createArrival(app) {
  const { grid, navigator, partyTracker, state } = app;

  /** Landing where a placed creature stands is the introduction. Mark the
   * creature met, and log the meeting once per creature: "encounters" for a
   * hostile one, "meets" for the rest. A met non-hostile creature starts to
   * appear in the players' Story sidebar. Only the GM's tab moves the
   * party, so only the GM's tab changes the roster. */
  function meetCreaturesHere() {
    if (!isGM(state.role)) return;
    const { creatures, met } = meetCreatures(state.creatures, partyTracker.getPosition());
    if (met.length === 0) return;
    state.creatures = creatures;
    for (const c of met) {
      const verb = c.disposition === 'hostile' ? 'encounters' : 'meets';
      app.actions.logEvent(
        c.disposition === 'hostile' ? 'combat' : 'travel',
        `The party ${verb} ${c.name}.`,
      );
    }
  }

  /** Move each companion NPC onto the party tile. Only the GM tab writes
   * the roster, the same as a meeting. */
  function bringCompanions() {
    if (!isGM(state.role)) return;
    const creatures = followParty(state.creatures, partyTracker.getPosition());
    if (creatures === state.creatures) return;
    state.creatures = creatures;
    app.actions.syncCreatureMarkers();
    app.actions.markDirty();
  }

  /** The party can change nodes. Re-filter every location-scoped panel. */
  function refreshLocationPanels() {
    bringCompanions();
    meetCreaturesHere();
    // A move can carry the party off a running fight's tile, which ends it.
    app.actions.syncCombatLocation();
    app.views.encounterPanel.update();
    app.views.initiativePanel.update();
    app.views.npcPanel.update();
    app.views.handoutPanel.update();
  }

  /**
   * Mark a discoverable POI discovered once the party reaches it. Save the
   * flag and log the find. A non-discoverable or already-found tile does
   * nothing. Read the node fresh from the grid, because the party's move
   * just rewrote the node there.
   * @param {import('../types/map.js').Tile} tile
   * @param {string} [nodeId] the node that contains the tile; the node in
   *   view by default. A zoom-in passes the parent, because the view is
   *   already on the child.
   */
  function discoverTile(tile, nodeId = navigator.getCurrentNode().id) {
    if (!tile.metadata.discoverable || tile.metadata.discovered) return;
    const node = grid.getNode(nodeId);
    if (!node) return;
    grid.updateNode(updateTileMetadata(node, tile.id, { discovered: true }));
    // The line leaves out the GM notes, because player tabs can open the
    // travelogue.
    const what = tile.metadata.poiType ?? 'a hidden location';
    app.actions.logEvent('travel', `Discovered ${what}.`);
  }

  /**
   * Discover each point of interest a walk steps onto, in walk order, and
   * then the tile it ends on. The first tile of the path is where the walk
   * starts, so it does not count.
   * @param {readonly string[]} path the tiles walked through, start first
   * @param {import('../types/map.js').Tile} tile the tile the walk ends on
   * @param {string} [nodeId] the node of the walk; the node in view by default
   */
  function discoverAlong(path, tile, nodeId = navigator.getCurrentNode().id) {
    const node = grid.getNode(nodeId);
    for (const id of path.slice(1)) {
      const step = node && id !== tile.id ? tileAt(node, id) : undefined;
      if (step) discoverTile(step, nodeId);
    }
    discoverTile(tile, nodeId);
  }

  return { meetCreaturesHere, refreshLocationPanels, discoverTile, discoverAlong };
}
