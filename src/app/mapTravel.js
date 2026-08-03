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
 * This module builds Play-mode movement and discovery for the map view. It
 * handles cell clicks such as party moves, region zoom-ins, and split-party
 * character moves, sidebar teleports, POI discovery, NPC introductions, and
 * the hover tooltip. The code stays separate from mapWiring, so the wiring
 * module only mounts views and keeps them in sync. Handlers read the shared
 * MapEnv late, after wiring assigns the mounted views.
 * @param {AppContext} app
 * @param {MapEnv} env
 */
export function createMapTravel(app, env) {
  const { grid, navigator, partyTracker, state } = app;

  /** Landing where a placed NPC stands is the introduction. Mark the NPC
   * met, so it starts to appear in the players' Story sidebar, and log the
   * meeting. Only the GM's tab moves the party, so only the GM's tab
   * changes the roster. */
  function meetNPCsHere() {
    if (!isGM(state.role)) return;
    const { npcs, met } = meetNPCs(state.npcs, partyTracker.getPosition());
    if (met.length === 0) return;
    state.npcs = npcs;
    for (const npc of met) app.actions.logEvent('travel', `The party meets ${npc.name}.`);
  }

  /** The party can change nodes. Re-filter every location-scoped panel. */
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
   * Offer to teleport the party to a discovered node. A click on the node
   * the party already occupies just brings the view back to it. Otherwise, a
   * confirm dialog gates the move. The party lands on the node's first
   * revealed tile. A discovered node with tiles always has one. A tile-less
   * node falls back to the grid center.
   * @param {string} nodeId
   */
  async function teleportToNode(nodeId) {
    const node = grid.getNode(nodeId);
    if (!node) return;
    // Teleporting the party is the GM's decision. When a player selects a
    // node, the view brings it into view without moving anyone.
    if (!isGM(state.role) || partyTracker.getPosition().nodeId === nodeId) {
      env.goToNode(nodeId);
      return;
    }
    const ok = await confirmModal(`Would you like to teleport to "${node.name}"?`, {
      confirmLabel: 'Teleport',
    });
    if (!ok) return;
    // Resolve the landing spot against the node's real tiles. This makes
    // sure that a teleport into a sparse or walled node, for example a
    // generated dungeon, never strands the party on a wall or an empty
    // cell.
    const target = resolveEntryTile(
      node,
      node.tiles.find((t) => t.revealed)?.id ??
        tileIdAt(Math.floor(node.width / 2), Math.floor(node.height / 2)),
    );
    // No revealed tile means the party has never set foot here. This
    // teleport is then the region's discovery. The code checks this before
    // moveTo reveals fog.
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
   * The ways out of the node in view, for the canvas arrows, the exit
   * buttons, and the click path. The list is empty in Build mode. Authoring
   * a map is not traveling it, and the arrows are one more thing drawn
   * over the tiles the GM paints.
   * @returns {import('../types/map.js').MapExit[]}
   */
  function currentExits() {
    if (state.mode !== 'play') return [];
    const node = navigator.getCurrentNode();
    return findExits(node, grid.getParent(node));
  }

  /**
   * Leave the node in view through one of its exits. The character lands
   * beside the tile in the parent node that the child was entered from
   * (EntryPoint.computeParentReturnTile). This function mirrors the zoom-in
   * branch of onCellClick. It moves whoever a click moves: the whole party
   * for the GM, one character while the split-party toggle is on, and no
   * one from a spectator tab. A spectator tab only follows the camera out.
   * @param {import('../types/map.js').MapExit} exit
   */
  function exitToParent(exit) {
    const child = navigator.getCurrentNode();
    const parent = grid.getParent(child);
    // The list was computed for a node the view has since left, or for a
    // parent since deleted. There is nothing to travel to.
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
    // Whoever this tab moves must stand in the node being left. A GM
    // looking into a child node where the party stands elsewhere gets the
    // camera out of it. The party is not dragged from wherever it actually
    // stands.
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
      // Read the parent node back out of the grid. The character's step
      // reveals fog around the landing point. The copy above predates any
      // other write.
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
      // Re-read the roster. The move above replaced the character object.
      const moved = state.characters.find((c) => c.id === subject.id) ?? subject;
      app.actions.maybeTriggerEncounter(
        characterPosition(moved, partyTracker.getPosition()),
        subject.name,
      );
    } else app.actions.maybeTriggerEncounter();
  }

  /**
   * Mark a discoverable POI discovered once the party reaches it. Save the
   * flag and log the find. A non-discoverable or already-found tile does
   * nothing. Read the node fresh from the navigator, because the party's
   * move just rewrote the node in the grid.
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
   * Which single character this tab's clicks move, or null when the clicks
   * move the whole party instead. Individual movement exists only while the
   * GM's split-party toggle is on. The GM moves whoever is selected in the
   * roster. A bound player tab moves its own character. A spectator tab,
   * with no binding, moves no one.
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
   * Move one character across the node on screen. The character takes its
   * own location on the clicked tile, and rejoins the party when the click
   * lands on the party's tile. The character's step reveals fog around it.
   * An encounter on that tile alerts under the character's name.
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

  // This handler runs only outside authoring mode, for Play-mode navigation
  // and moves. Empty cells do nothing. Who moves depends on the tab and on
  // the split-party toggle. With splitting off, the GM's clicks move the
  // whole party and recall any individually placed character, and a
  // player's clicks move no one. With splitting on, each tab moves one
  // character: the GM's roster selection, or a bound player's own
  // character. A spectator tab moves no one either way, but region tiles
  // still navigate the view.
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
          // Check this before the move reveals entry fog. An all-fogged
          // child has never been visited, so stepping in now is its
          // discovery.
          const firstVisit = !child.tiles.some((t) => t.revealed);
          // Zooming into a region moves whoever the click moves into it.
          // Unless the character already stands in this child, drop the
          // character at the edge it approached from and reveal fog around
          // it. This makes sure that the child does not draw as a blank fog
          // field with no marker on it.
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
        // Re-read the node. The move above wrote a new, fog-revealed node
        // into the grid, so the `child` variable captured earlier is stale
        // and still fogged.
        env.mapCanvas.setNode(navigator.getCurrentNode());
        env.breadcrumb.update(navigator.getBreadcrumb());
        env.worldTree.update();
        // Entering a node for the first time discovers it.
        env.regionTree.update();
        env.syncPartyMarker();
        // The child node has its own ways out. This code path swaps the node
        // itself instead of going through resyncMapViews, so it must draw
        // the ways out explicitly. Before this fix, walking into a region
        // left its return arrows undrawn until something else re-synced.
        env.syncExits();
        refreshLocationPanels();
        if (subject) {
          // Re-read the roster. The move above replaced the character object.
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
    // onto. It leads out only once whoever the click moves stands on it.
    // Otherwise the party can never stand in a doorway, and a stray click
    // at the far end of a dungeon level takes the party out of it. The
    // exit buttons travel through the same door in one press for anyone who
    // needs that.
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

  // Play-mode read side of the Build-mode tile inspector. Hovering over a
  // revealed tile with metadata shows what the GM authored there. Build mode
  // already shows the same data through the inspector, so hover stays quiet
  // there.
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
    // The POI outline and the NPC circle draw only within detection range of
    // the party or a character token. The tooltip follows the same rule, so
    // hovering a far tile, with the pointer or with the keyboard cursor, does
    // not name what the map keeps unmarked.
    const inRange = env.mapCanvas.markerVisible(tile.id);
    const npcNames = inRange
      ? state.npcs
          .filter(
            (n) => n.location && n.location.nodeId === nodeId && n.location.tileId === tile.id,
          )
          .map((n) => n.name)
      : [];
    const poiType = inRange ? tile.metadata.poiType : null;
    // Notes are the GM's secret. Players see the POI type and who stands
    // here.
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
