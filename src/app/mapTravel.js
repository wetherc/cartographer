import { updateTileMetadata } from '../map/TileGrid.js';
import { tileIdAt } from '../map/MapGeometry.js';
import {
  computeParentReturnTile,
  computeRegionEntryTile,
  resolveEntryTile,
} from '../map/EntryPoint.js';
import { exitForTile, findExits } from '../map/MapExits.js';
import { revealAround } from '../map/FogOfWar.js';
import { characterPosition, moveCharacter, recallAll } from '../party/CharacterTokens.js';
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
    // A move can carry the party off a running fight's tile, which ends it.
    app.actions.syncCombatLocation();
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
        tileIdAt(Math.floor(node.width / 2), Math.floor(node.height / 2)),
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
   * The ways out of the node in view, for the canvas arrows, the exit buttons,
   * and the click path. Empty in Build mode: authoring a map is not travelling
   * it, and the arrows would be one more thing drawn over the tiles being painted.
   * @returns {import('../types/map.js').MapExit[]}
   */
  function currentExits() {
    if (state.mode !== 'play') return [];
    const node = navigator.getCurrentNode();
    return findExits(node, node.parentId ? (grid.getNode(node.parentId) ?? null) : null);
  }

  /**
   * Leave the node in view through one of its exits, landing beside the tile in
   * the parent that the child was entered from (EntryPoint.computeParentReturnTile).
   * The mirror of the zoom-in branch of onCellClick, and it moves whoever a click
   * moves: the whole party for the GM, one character while the split-party toggle
   * is on, and no one from a spectator tab, which only follows the camera out.
   * @param {import('../types/map.js').MapExit} exit
   */
  function exitToParent(exit) {
    const child = navigator.getCurrentNode();
    const parent = child.parentId ? grid.getNode(child.parentId) : null;
    // A list computed for a node the view has since left, or a parent deleted
    // underneath it: nothing to travel to.
    if (!parent || parent.id !== exit.targetNodeId) return;
    const gm = isGM(state.role);
    const subject = clickSubject();
    if (!gm && !subject) {
      env.goToNode(parent.id);
      return;
    }
    const from = subject
      ? characterPosition(subject, partyTracker.getPosition())
      : partyTracker.getPosition();
    // Whoever this tab moves has to be standing in the node being left: a GM
    // looking into a child the party is elsewhere in gets the camera out of it,
    // not a party dragged from wherever they actually are.
    if (from.nodeId !== child.id) {
      env.goToNode(parent.id);
      return;
    }
    const landing = computeParentReturnTile(parent, child, exit, from);
    if (subject) {
      state.characters = moveCharacter(state.characters, subject.id, {
        nodeId: parent.id,
        tileId: landing,
      });
      // Read the parent back out of the grid: their step reveals fog around
      // where they came out, and the copy above predates any other write.
      const fresh = grid.getNode(parent.id) ?? parent;
      grid.updateNode(revealAround(fresh, landing, partyTracker.revealRadius));
    } else {
      partyTracker.moveTo(parent.id, landing); // reveals fog around the landing itself
      state.characters = recallAll(state.characters);
    }
    env.goToNode(parent.id);
    app.actions.logEvent(
      'travel',
      subject
        ? `${subject.name} returns to ${parent.name}.`
        : `The party returns to ${parent.name}.`,
    );
    app.actions.markDirty();
    refreshLocationPanels();
    if (subject) {
      // Re-read the roster: the move above replaced the character object.
      const moved = state.characters.find((c) => c.id === subject.id) ?? subject;
      app.actions.maybeTriggerEncounter(
        characterPosition(moved, partyTracker.getPosition()),
        subject.name,
      );
    } else app.actions.maybeTriggerEncounter();
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
   * Which single character this tab's clicks move, or null when they move the
   * whole party instead. Individual movement exists only while the GM's
   * split-party toggle is on: the GM moves whoever is selected in the roster,
   * a bound player tab moves its own character, and a spectator tab (no
   * binding) moves no one.
   * @returns {import('../types/entities.js').Character | null}
   */
  function clickSubject() {
    if (!state.splitParty) return null;
    const id = isGM(state.role)
      ? app.actions.getSelectedCharacterId()
      : app.actions.getBoundCharacterId();
    return state.characters.find((c) => c.id === id) ?? null;
  }

  /**
   * Move one character across the node on screen: they take their own location
   * on the clicked tile (rejoining the party when the click lands on the
   * party's tile), their step reveals fog around them, and an encounter on that
   * tile alerts under their name.
   * @param {import('../types/map.js').Tile} tile
   * @param {import('../types/entities.js').Character} character
   */
  function moveOneCharacter(tile, character) {
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
  // Empty cells are inert. Who moves depends on the tab and on the split-party
  // toggle: with splitting off the GM's clicks move the whole party (recalling
  // any individually placed character) and a player's clicks move no one; with
  // it on, each tab moves one character — the GM's roster selection, or a bound
  // player's own character. A spectator tab moves no one either way (region
  // tiles still navigate the view).
  /** @type {(x: number, y: number, tile: import('../types/map.js').Tile | null) => void} */
  const onCellClick = (x, y, tile) => {
    if (!tile) return;
    const gm = isGM(state.role);
    const subject = clickSubject();
    if (tile.childNodeId) {
      const parent = navigator.getCurrentNode();
      if (navigator.zoomIn(tile.id)) {
        const child = navigator.getCurrentNode();
        if (gm || subject) {
          // Checked before the move reveals entry fog: an all-fogged child has
          // never been visited, so stepping in now is its discovery.
          const firstVisit = !child.tiles.some((t) => t.revealed);
          // Zooming into a region moves whoever the click moves into it. Unless
          // they already stand in this child, drop them at the edge they
          // approached from and reveal fog around it, so the child doesn't
          // render as a blank fog field with no marker on it.
          if (subject) {
            const at = characterPosition(subject, partyTracker.getPosition());
            if (at.nodeId !== child.id) {
              const entry = computeRegionEntryTile(parent, child, tile.childNodeId, at);
              state.characters = moveCharacter(state.characters, subject.id, {
                nodeId: child.id,
                tileId: entry,
              });
              grid.updateNode(
                revealAround(navigator.getCurrentNode(), entry, partyTracker.revealRadius),
              );
            }
          } else if (partyTracker.getPosition().nodeId !== child.id) {
            partyTracker.moveTo(
              child.id,
              computeRegionEntryTile(parent, child, tile.childNodeId, partyTracker.getPosition()),
            );
            state.characters = recallAll(state.characters);
          }
          app.actions.logEvent(
            'travel',
            subject
              ? `${subject.name} ${firstVisit ? 'discovers' : 'enters'} ${child.name}.`
              : firstVisit
                ? `Discovered ${child.name}.`
                : `Entered ${child.name}.`,
          );
          app.actions.markDirty(); // position and fog changed
        }
        // Re-read the node: the move above wrote a new, fog-revealed node into
        // the grid, so the `child` captured earlier is stale and still fogged.
        env.mapCanvas.setNode(navigator.getCurrentNode());
        env.breadcrumb.update(navigator.getBreadcrumb());
        env.worldTree.update();
        // Entering a node for the first time discovers it.
        env.regionTree.update();
        env.syncPartyMarker();
        // The child has its own ways out, and this path swaps the node itself
        // rather than going through resyncMapViews, so it owes them explicitly:
        // walking into a region used to leave its return arrows undrawn until
        // something else re-synced.
        env.syncExits();
        refreshLocationPanels();
        if (subject) {
          // Re-read the roster: the move above replaced the character object.
          const moved = state.characters.find((c) => c.id === subject.id) ?? subject;
          app.actions.maybeTriggerEncounter(
            characterPosition(moved, partyTracker.getPosition()),
            subject.name,
          );
        } else if (gm) app.actions.maybeTriggerEncounter();
      }
      return;
    }
    // A door or stairway out of an interior is also an ordinary tile to walk
    // onto, so it only leads out once whoever the click moves is standing on it:
    // otherwise the party could never stand in a doorway, and a stray click at
    // the far end of a dungeon level would take them out of it. The exit buttons
    // travel through the same door in one press for anyone who needs that.
    const exit = exitForTile(currentExits(), tile.id);
    if (exit) {
      const at = subject
        ? characterPosition(subject, partyTracker.getPosition())
        : partyTracker.getPosition();
      if (at.nodeId === navigator.getCurrentNode().id && at.tileId === tile.id) {
        exitToParent(exit);
        return;
      }
    }
    if (subject) {
      moveOneCharacter(tile, subject);
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
    // A spectator tab, or a player tab with no character of its own to move.
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
    clickSubject,
    currentExits,
    exitToParent,
    moveOneCharacter,
    onCellClick,
    onCellHover,
  };
}
