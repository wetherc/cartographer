import { getTile } from '../map/TileGrid.js';
import { computeCrossingEntryTile, computeParentReturnTile } from '../map/EntryPoint.js';
import {
  entryFor,
  forgetCharacterEntries,
  rememberEntry,
  travelerFor,
} from '../map/EntryMemory.js';
import { revealAround } from '../map/FogOfWar.js';
import { characterPosition, moveCharacter, recallAll } from '../party/CharacterTokens.js';
import { isGM } from '../view/ViewRole.js';
import { passLock } from './lockGuard.js';
import { isLocked } from '../map/NodeLock.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('./mapWiring.js').MapEnv} MapEnv */
/** @typedef {import('../types/map.js').MapExit} MapExit */
/** @typedef {import('../types/map.js').MapNode} MapNode */

/**
 * The travel helpers that the ways out use from mapTravel.js.
 * @typedef {Object} ExitTravelHelpers
 * @property {() => import('../types/entities.js').Character | null} clickSubject
 * @property {(tile: import('../types/map.js').Tile, nodeId?: string) => void} discoverTile
 * @property {(subject: import('../types/entities.js').Character | null) => import('../types/map.js').PartyPosition} positionOf
 * @property {(before: MapNode | undefined, except?: string | null) => void} noteSightings
 * @property {() => void} refreshLocationPanels
 */

/**
 * Build the Play-mode travel through a way out of the node in view: back to
 * the parent node, or across a border into the region beside this one on the
 * same parent map (`RegionCrossing.crossingFor`). The canvas arrows, the
 * exit buttons, and a click on a door all travel through `exitToParent`.
 * @param {AppContext} app
 * @param {MapEnv} env
 * @param {ExitTravelHelpers} travel
 */
export function createExitTravel(app, env, travel) {
  const { grid, navigator, partyTracker, state } = app;

  /**
   * Leave the node in view through one of its exits. The character lands
   * beside the tile in the parent node that the child was entered from
   * (EntryPoint.computeParentReturnTile). This function mirrors the zoom-in
   * branch of mapTravel.travelTo. It moves whoever a click moves: the whole party
   * for the GM, one character while the split-party toggle is on, and no
   * one from a spectator tab. A spectator tab only follows the camera out.
   * An edge exit that crosses a border goes to the region beside this one
   * instead (crossBorder).
   * @param {import('../types/map.js').MapExit} exit
   */
  function exitToParent(exit) {
    if (exit.kind === 'edge' && exit.crossTileId) {
      crossBorder(exit.targetNodeId, exit.crossTileId);
      return;
    }
    const child = navigator.getCurrentNode();
    const parent = grid.getParent(child);
    // The list was computed for a node the view has since left, or for a
    // parent since deleted. There is nothing to travel to.
    if (!parent || parent.id !== exit.targetNodeId) return;
    const gm = isGM(state.role);
    const subject = travel.clickSubject();
    if (!gm && !subject) {
      env.goToNode(parent.id);
      return;
    }
    const from = travel.positionOf(subject);
    // Whoever this tab moves must stand in the node being left. A GM
    // looking into a child node where the party stands elsewhere gets the
    // camera out of it. The party is not dragged from wherever it actually
    // stands.
    if (from.nodeId !== child.id) {
      env.goToNode(parent.id);
      return;
    }
    const parentBefore = grid.getNode(parent.id);
    const through = entryFor(state.entryTiles, travelerFor(subject), child.id);
    const landing = computeParentReturnTile(parent, child, exit, from, through);
    if (subject) {
      state.characters = moveCharacter(state.characters, subject.id, {
        nodeId: parent.id,
        tileId: landing,
      });
      // Read the parent node back out of the grid, so the reveal around the
      // landing point builds on any write made since the lookup above.
      const fresh = grid.getNode(parent.id) ?? parent;
      grid.updateNode(partyTracker.reveal(fresh, [landing]));
    } else {
      partyTracker.moveTo(parent.id, landing); // reveals fog around the landing itself
      state.characters = recallAll(state.characters);
      state.entryTiles = forgetCharacterEntries(state.entryTiles);
    }
    env.goToNode(parent.id);
    app.actions.logEvent(
      'travel',
      subject
        ? `${subject.name} returns to ${parent.name}.`
        : `The party returns to ${parent.name}.`,
    );
    travel.noteSightings(parentBefore);
    app.actions.markDirty();
    travel.refreshLocationPanels();
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
   * A player tab sees the name of the region across the border only after
   * the party has revealed the parent cell it crosses into. Otherwise the
   * exit label names a region that the fog on the parent map still hides.
   * @param {MapExit} exit
   * @param {MapNode | null} parent
   * @returns {MapExit}
   */
  function veilCrossing(exit, parent) {
    if (isGM(state.role) || exit.kind !== 'edge' || !exit.crossTileId || !parent) return exit;
    return getTile(parent, exit.crossTileId)?.revealed ? exit : { ...exit, targetName: '' };
  }

  /**
   * Walk off the node in view into the region across the border. The walk
   * moves whoever the click moves, in the same way as a return to the
   * parent. The exit list can be stale when the GM relinks a cell while the
   * list is on screen, so the walk reads the crossing cell again. When that
   * cell no longer leads to an outdoor sibling, the view moves to the parent
   * and nobody moves. The parent cell that the party crosses into is
   * revealed, so the players' parent map shows where the party went.
   * @param {string} targetNodeId the region the exit crosses into
   * @param {string} crossTileId the parent cell the exit crosses into
   */
  function crossBorder(targetNodeId, crossTileId) {
    const child = navigator.getCurrentNode();
    const parent = grid.getParent(child);
    if (!parent) return;
    const tile = getTile(parent, crossTileId);
    const target = grid.getNode(targetNodeId);
    if (
      !tile ||
      !target ||
      tile.childNodeId !== target.id ||
      target.kind === 'interior' ||
      target.parentId !== parent.id
    ) {
      env.goToNode(parent.id);
      return;
    }
    const gm = isGM(state.role);
    const subject = travel.clickSubject();
    const from = subject
      ? characterPosition(subject, partyTracker.getPosition())
      : partyTracker.getPosition();
    // A tab that moves nobody, or a GM who looks at a region where the party
    // does not stand, only moves the view. A player tab follows into a
    // region that the fog still hides only as far as the parent map.
    if ((!gm && !subject) || from.nodeId !== child.id) {
      env.goToNode(gm || tile.revealed ? target.id : parent.id);
      return;
    }
    // A locked region stops the crossing until the GM unlocks it.
    if (isLocked(target)) {
      void passLock(app, target).then((ok) => {
        if (ok) crossBorder(targetNodeId, crossTileId);
      });
      return;
    }
    // Check this before the move reveals entry fog. An all-fogged region has
    // never been visited, so the crossing is its discovery.
    const firstVisit = !target.tiles.some((t) => t.revealed);
    const targetBefore = grid.getNode(target.id);
    const landing = computeCrossingEntryTile(parent, target, tile.id);
    grid.updateNode(revealAround(parent, tile.id, 0));
    if (subject) {
      state.characters = moveCharacter(state.characters, subject.id, {
        nodeId: target.id,
        tileId: landing,
      });
      const fresh = grid.getNode(target.id) ?? target;
      grid.updateNode(partyTracker.reveal(fresh, [landing]));
    } else {
      partyTracker.moveTo(target.id, landing); // reveals fog around the landing itself
      state.characters = recallAll(state.characters);
      state.entryTiles = forgetCharacterEntries(state.entryTiles);
    }
    travel.discoverTile(tile, parent.id);
    // Remember the crossing cell as the way in, so the exits of the new
    // region and a later return to the parent read the block it belongs to.
    // Read the subject back off the roster, because the move above replaced
    // the character object.
    const moved = subject ? (state.characters.find((c) => c.id === subject.id) ?? subject) : null;
    state.entryTiles = rememberEntry(state.entryTiles, travelerFor(moved), target.id, tile.id);
    env.goToNode(target.id);
    app.actions.logEvent(
      'travel',
      moved
        ? `${moved.name} ${firstVisit ? 'discovers' : 'crosses into'} ${target.name}.`
        : firstVisit
          ? `Discovered ${target.name}.`
          : `The party crosses into ${target.name}.`,
    );
    travel.noteSightings(targetBefore);
    app.actions.markDirty();
    travel.refreshLocationPanels();
    if (moved) {
      app.actions.maybeTriggerEncounter(
        characterPosition(moved, partyTracker.getPosition()),
        moved.name,
      );
    } else app.actions.maybeTriggerEncounter();
  }

  return { exitToParent, veilCrossing };
}
