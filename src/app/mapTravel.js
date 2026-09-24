import { updateTileMetadata } from '../map/TileGrid.js';
import { tileIdAt } from '../map/MapGeometry.js';
import {
  computeParentReturnTile,
  computeRegionEntryTile,
  resolveEntryTile,
} from '../map/EntryPoint.js';
import { exitForTile, findExits } from '../map/MapExits.js';
import {
  entryFor,
  forgetCharacterEntries,
  forgetEntries,
  rememberEntry,
  travelerFor,
} from '../map/EntryMemory.js';
import { revealAround } from '../map/FogOfWar.js';
import { characterPosition, moveCharacter, recallAll } from '../party/CharacterTokens.js';
import { confirmModal } from '../ui/Modal.js';
import { meetCreatures } from '../entities/CreatureMap.js';
import { isGM } from '../view/ViewRole.js';
import { createCellHover } from './mapHover.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('./mapWiring.js').MapEnv} MapEnv */

/**
 * This module builds Play-mode movement and discovery for the map view. It
 * handles cell clicks such as party moves, region zoom-ins, and split-party
 * character moves, sidebar teleports, POI discovery, and NPC introductions.
 * The hover tooltip comes from mapHover.js. The code stays separate from mapWiring, so the wiring
 * module only mounts views and keeps them in sync. Handlers read the shared
 * MapEnv late, after wiring assigns the mounted views.
 * @param {AppContext} app
 * @param {MapEnv} env
 */
export function createMapTravel(app, env) {
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

  /** The party can change nodes. Re-filter every location-scoped panel. */
  function refreshLocationPanels() {
    meetCreaturesHere();
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
    // A teleport arrives through no block of the parent, so any memory of an
    // earlier walk in no longer describes where the party stands. Nobody
    // holds their own location after the recall either.
    state.entryTiles = forgetCharacterEntries(forgetEntries(state.entryTiles, [nodeId]));
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
   * over the tiles the GM paints. The list is told which parent tile this
   * tab's traveler came in through, so a child that two blocks of the parent
   * link to reports the sides of the block that traveler is in.
   * @returns {import('../types/map.js').MapExit[]}
   */
  function currentExits() {
    if (state.mode !== 'play') return [];
    const node = navigator.getCurrentNode();
    const through = entryFor(state.entryTiles, travelerFor(clickSubject()), node.id);
    return findExits(node, grid.getParent(node), through);
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
    const through = entryFor(state.entryTiles, travelerFor(subject), child.id);
    const landing = computeParentReturnTile(parent, child, exit, from, through);
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
      state.entryTiles = forgetCharacterEntries(state.entryTiles);
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

  /**
   * Whether a click on this tile would pull whoever it moves out of another
   * node. This happens when the GM views an ancestor through the breadcrumb
   * while the party stands deeper in. A click on the link of the child
   * where they stand only brings the view in, so it moves nobody.
   * @param {import('../types/map.js').Tile} tile
   */
  function movesFromElsewhere(tile) {
    const subject = clickSubject();
    if (!subject && !isGM(state.role)) return false;
    const at = subject
      ? characterPosition(subject, partyTracker.getPosition())
      : partyTracker.getPosition();
    return at.nodeId !== navigator.getCurrentNode().id && at.nodeId !== tile.childNodeId;
  }

  /**
   * Ask before a click moves someone out of the node they stand in, the way
   * a teleport asks. The node in view or the tile can change while the
   * dialog is open, so the move reads both again and gives up when the
   * view has left the node.
   * @param {import('../types/map.js').Tile} tile
   */
  async function confirmMoveHere(tile) {
    const view = navigator.getCurrentNode();
    const target = (tile.childNodeId && grid.getNode(tile.childNodeId)) || view;
    const who = clickSubject()?.name ?? 'the party';
    const ok = await confirmModal(`Move ${who} to "${target.name}"?`, {
      title: 'Move',
      confirmLabel: 'Move',
    });
    const now = navigator.getCurrentNode();
    const fresh = now.id === view.id ? now.tiles.find((t) => t.id === tile.id) : undefined;
    if (ok && fresh) travelTo(fresh);
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
    // A fogged tile is unknown to the players. A player click on it would
    // name the sub-map behind it, or put a token past walls into the fog
    // and reveal what lies there.
    if (!isGM(state.role) && !tile.revealed) return;
    if (movesFromElsewhere(tile)) {
      void confirmMoveHere(tile);
      return;
    }
    travelTo(tile);
  };

  /**
   * Carry out a click on a tile: zoom into its sub-map, step out through a
   * door, or move whoever the click moves onto it.
   * @param {import('../types/map.js').Tile} tile
   */
  function travelTo(tile) {
    const gm = isGM(state.role);
    const subject = clickSubject();
    if (tile.childNodeId) {
      const parent = navigator.getCurrentNode();
      if (navigator.zoomIn(tile.id)) {
        const child = navigator.getCurrentNode();
        // Whoever the click moves, unless they already stand in this child.
        // A click on the link of a child where they stand only brings the
        // view in. It neither logs an entry nor rewrites the entry memory,
        // because nobody walked through the tile.
        const at = subject
          ? characterPosition(subject, partyTracker.getPosition())
          : partyTracker.getPosition();
        if ((gm || subject) && at.nodeId !== child.id) {
          // Check this before the move reveals entry fog. An all-fogged
          // child has never been visited, so stepping in now is its
          // discovery.
          const firstVisit = !child.tiles.some((t) => t.revealed);
          // Drop whoever moves at the edge they approached from and reveal
          // fog around them. This makes sure that the child does not draw as
          // a blank fog field with no marker on it.
          const entry = computeRegionEntryTile(parent, child, tile.childNodeId, at, tile.id);
          if (subject) {
            state.characters = moveCharacter(state.characters, subject.id, {
              nodeId: child.id,
              tileId: entry,
            });
            grid.updateNode(
              revealAround(navigator.getCurrentNode(), entry, partyTracker.revealRadius),
            );
          } else {
            partyTracker.moveTo(child.id, entry);
            state.characters = recallAll(state.characters);
            state.entryTiles = forgetCharacterEntries(state.entryTiles);
          }
          // A linked tile can be a discoverable point of interest, such as a
          // cave mouth over a dungeon. Walking through it reaches it.
          discoverTile(tile, parent.id);
          // Remember which parent tile this entry was through, so the ways
          // out and the return landing read the block this traveler came in
          // by. The subject is read back off the roster, because the move
          // above replaced them, and the key states whether they hold their
          // own location or stand with the party. Only a tab that moves
          // somebody writes an entry. A spectator tab moves nobody, and its
          // neighbours adopt whatever it saves.
          const traveler = travelerFor(
            subject ? (state.characters.find((c) => c.id === subject.id) ?? subject) : null,
          );
          state.entryTiles = rememberEntry(state.entryTiles, traveler, child.id, tile.id);
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
  }

  return {
    teleportToNode,
    meetCreaturesHere,
    refreshLocationPanels,
    discoverTile,
    clickSubject,
    currentExits,
    exitToParent,
    moveOneCharacter,
    onCellClick,
    movesFromElsewhere,
    onCellHover: createCellHover(app, env),
  };
}
