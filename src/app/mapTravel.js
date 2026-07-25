import { updateTileMetadata } from '../map/TileGrid.js';
import { computeRegionEntryTile, resolveEntryTile } from '../map/EntryPoint.js';
import { revealAround } from '../map/FogOfWar.js';
import { moveCharacter, recallAll } from '../party/CharacterTokens.js';
import { confirmModal } from '../ui/Modal.js';
import { meetNPCs } from '../entities/NPC.js';
import { isGM } from '../view/ViewRole.js';
import { capitalize } from '../util/text.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('./mapWiring.js').MapEnv} MapEnv */

/**
 * Play-mode movement and discovery for the map view: cell clicks (party moves,
 * region zoom-ins, split-party character moves), sidebar teleports, POI
 * discovery, NPC introductions, and the hover tooltip. Split out of mapWiring
 * so the wiring module stays the mount-and-sync layer; handlers read the
 * shared MapEnv late, after wiring assigns the mounted views.
 * @param {AppContext} app
 * @param {MapEnv} env
 */
export function createMapTravel(app, env) {
  const { grid, navigator, partyTracker, state } = app;

  /** Landing where a placed NPC stands is the introduction: mark it met so it
   * starts appearing in the players' Story sidebar, and log the meeting. Only
   * the GM's tab moves the party, so only it mutates the roster. */
  function meetNPCsHere() {
    if (!isGM(state.role)) return;
    const { npcs, met } = meetNPCs(state.npcs, partyTracker.getPosition());
    if (met.length === 0) return;
    state.npcs = npcs;
    for (const npc of met) app.actions.logEvent('travel', `The party meets ${npc.name}.`);
  }

  /** The party may have changed nodes; re-filter every location-scoped panel. */
  function refreshLocationPanels() {
    meetNPCsHere();
    app.views.encounterPanel.update();
    app.views.initiativePanel.update();
    app.views.npcPanel.update();
    app.views.handoutPanel.update();
  }

  /**
   * Offer to teleport the party to a discovered node. Clicking the node the
   * party already occupies just brings the view back to it; otherwise a confirm
   * dialog gates the move. The party lands on the node's first revealed tile
   * (there is always one for a discovered node with tiles), falling back to the
   * grid centre for a tile-less node.
   * @param {string} nodeId
   */
  async function teleportToNode(nodeId) {
    const node = grid.getNode(nodeId);
    if (!node) return;
    // Teleporting the party is the GM's call; a player selecting a node just
    // brings it into view without moving anyone.
    if (!isGM(state.role) || partyTracker.getPosition().nodeId === nodeId) {
      env.goToNode(nodeId);
      return;
    }
    const ok = await confirmModal(`Would you like to teleport to "${node.name}"?`, {
      confirmLabel: 'Teleport',
    });
    if (!ok) return;
    // Resolve the landing spot against the node's real tiles, so a teleport into
    // a sparse or walled node (e.g. a generated dungeon) never strands the party
    // on a wall or an empty cell.
    const target = resolveEntryTile(
      node,
      node.tiles.find((t) => t.revealed)?.id ??
        `${Math.floor(node.width / 2)},${Math.floor(node.height / 2)}`,
    );
    // No revealed tile yet means the party has never set foot here, so this
    // teleport is the region's discovery (checked before moveTo reveals fog).
    const firstVisit = !node.tiles.some((t) => t.revealed);
    partyTracker.moveTo(nodeId, target);
    state.characters = recallAll(state.characters); // the whole party teleports
    env.goToNode(nodeId);
    app.actions.logEvent(
      'travel',
      firstVisit ? `Discovered ${node.name}.` : `Traveled to ${node.name}.`,
    );
    refreshLocationPanels();
    app.actions.maybeTriggerEncounter();
  }

  /**
   * Mark a discoverable POI discovered once the party reaches it, persisting the
   * flag and logging the find. A non-discoverable or already-found tile is a
   * no-op. Read the node fresh from the navigator since the party's move just
   * rewrote it in the grid.
   * @param {import('../types/map.js').Tile} tile
   */
  function discoverTile(tile) {
    if (!tile.metadata.discoverable || tile.metadata.discovered) return;
    const node = navigator.getCurrentNode();
    grid.updateNode(updateTileMetadata(node, tile.id, { discovered: true }));
    const what = tile.metadata.poiType ?? 'a hidden location';
    app.actions.logEvent(
      'travel',
      `Discovered ${what}${tile.metadata.notes ? `: ${tile.metadata.notes}` : ''}.`,
    );
  }

  /**
   * A bound player tab moving its own character: the character takes their own
   * location on the current node's tile (rejoining the party when the click
   * lands on the party's tile), their step reveals fog around them, and an
   * encounter on that tile alerts under the character's name. A spectator tab
   * (no binding) moves no one.
   * @param {import('../types/map.js').Tile} tile
   */
  function moveBoundCharacter(tile) {
    // Individual movement exists only while the GM's split-party toggle is on;
    // otherwise the party moves simultaneously, by GM clicks alone.
    if (!state.splitParty) return;
    const boundId = app.actions.getBoundCharacterId();
    const character = state.characters.find((c) => c.id === boundId);
    if (!character) return;
    const nodeId = navigator.getCurrentNode().id;
    const party = partyTracker.getPosition();
    const rejoined = party.nodeId === nodeId && party.tileId === tile.id;
    state.characters = moveCharacter(
      state.characters,
      character.id,
      rejoined ? null : { nodeId, tileId: tile.id },
    );
    grid.updateNode(revealAround(navigator.getCurrentNode(), tile.id, partyTracker.revealRadius));
    discoverTile(tile);
    env.mapCanvas.refreshNode(navigator.getCurrentNode());
    env.syncPartyMarker();
    env.regionTree.update();
    app.actions.markDirty();
    app.actions.maybeTriggerEncounter({ nodeId, tileId: tile.id }, character.name);
  }

  // Fires only outside authoring mode: Play-mode navigation and moves.
  // Empty cells are inert. Who moves depends on the tab: the GM's clicks
  // move the whole party (recalling any individually placed character), a
  // bound player tab's clicks move only that player's own character, and a
  // spectator tab moves no one (region tiles still navigate the view).
  /** @type {(x: number, y: number, tile: import('../types/map.js').Tile | null) => void} */
  const onCellClick = (x, y, tile) => {
    if (!tile) return;
    const gm = isGM(state.role);
    if (tile.childNodeId) {
      const parent = navigator.getCurrentNode();
      if (navigator.zoomIn(tile.id)) {
        const child = navigator.getCurrentNode();
        if (gm) {
          // Checked before moveTo reveals entry fog: an all-fogged child has
          // never been visited, so stepping in now is its discovery.
          const firstVisit = !child.tiles.some((t) => t.revealed);
          // Zooming into a region moves the party into it. Unless the party
          // has already been placed in this child before, drop them at the
          // edge they approached from and reveal fog around it, so the child
          // doesn't render as a blank fog field with no party marker.
          if (partyTracker.getPosition().nodeId !== child.id) {
            partyTracker.moveTo(
              child.id,
              computeRegionEntryTile(parent, child, tile.childNodeId, partyTracker.getPosition()),
            );
            state.characters = recallAll(state.characters);
          }
          app.actions.logEvent(
            'travel',
            firstVisit ? `Discovered ${child.name}.` : `Entered ${child.name}.`,
          );
          app.actions.markDirty(); // party position and fog changed
        }
        // Re-read the node: moveTo wrote a new, fog-revealed node into the grid,
        // so the `child` captured above is stale and still fully fogged.
        env.mapCanvas.setNode(navigator.getCurrentNode());
        env.breadcrumb.update(navigator.getBreadcrumb());
        env.worldTree.update();
        // Entering a node for the first time discovers it.
        env.regionTree.update();
        env.syncPartyMarker();
        refreshLocationPanels();
        if (gm) app.actions.maybeTriggerEncounter();
      }
      return;
    }
    if (gm) {
      partyTracker.moveTo(navigator.getCurrentNode().id, tile.id);
      state.characters = recallAll(state.characters);
      discoverTile(tile);
      env.mapCanvas.refreshNode(navigator.getCurrentNode());
      env.syncPartyMarker();
      app.actions.markDirty(); // party position and fog changed
      refreshLocationPanels();
      app.actions.maybeTriggerEncounter();
      return;
    }
    moveBoundCharacter(tile);
  };

  // Play-mode read side of the Build-mode tile inspector: hovering a revealed
  // tile with metadata shows what the GM authored there. Build mode already
  // surfaces the same data through the inspector, so hover stays quiet there.
  /** @type {(tile: import('../types/map.js').Tile | null, clientX: number, clientY: number) => void} */
  const onCellHover = (tile, clientX, clientY) => {
    if (
      state.mode !== 'play' ||
      !tile ||
      !tile.revealed ||
      (tile.metadata.discoverable && !tile.metadata.discovered)
    ) {
      env.tileTooltip.hide();
      return;
    }
    const nodeId = navigator.getCurrentNode().id;
    const npcNames = state.npcs
      .filter((n) => n.location && n.location.nodeId === nodeId && n.location.tileId === tile.id)
      .map((n) => n.name);
    const poiType = tile.metadata.poiType;
    // Notes are the GM's secret; players see the POI type and who stands
    // here (the marker is already visible once the tile is revealed).
    const gm = isGM(state.role);
    const visible = poiType || npcNames.length > 0 || (gm && tile.metadata.notes);
    if (!visible) {
      env.tileTooltip.hide();
      return;
    }
    env.tileTooltip.show(
      {
        title: poiType ? capitalize(poiType) : '',
        npcs: npcNames.join(', '),
        notes: gm ? tile.metadata.notes : '',
      },
      clientX,
      clientY,
    );
  };

  return {
    teleportToNode,
    meetNPCsHere,
    refreshLocationPanels,
    discoverTile,
    moveBoundCharacter,
    onCellClick,
    onCellHover,
  };
}
