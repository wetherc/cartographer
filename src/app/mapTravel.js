import { updateTileMetadata } from '../map/TileGrid.js';
import { parseCoords } from '../map/MapGeometry.js';
import { computeRegionEntryTile } from '../map/EntryPoint.js';
import { EXIT_REACH_SIGHTS, exitForTile, exitsInReach, findExits } from '../map/MapExits.js';
import {
  entryFor,
  forgetCharacterEntries,
  rememberEntry,
  travelerFor,
} from '../map/EntryMemory.js';
import { findPath } from '../map/MapPath.js';
import { isBlocked } from '../map/TileKinds.js';
import { describeTile } from '../map/TileCoords.js';
import { characterPosition, moveCharacter, recallAll } from '../party/CharacterTokens.js';
import { followParty, meetCreatures } from '../entities/CreatureMap.js';
import { isGM } from '../view/ViewRole.js';
import { createCellHover } from './mapHover.js';
import { createWalkGate } from './mapNightWalk.js';
import { createExitTravel } from './mapExitTravel.js';
import { createSightingLog } from './mapSightings.js';
import { createTeleport } from './mapTeleport.js';
import { passLock } from './lockGuard.js';
import { isLocked } from '../map/NodeLock.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('./mapWiring.js').MapEnv} MapEnv */

/**
 * This module builds Play-mode movement and discovery for the map view. It
 * handles cell clicks such as party moves, region zoom-ins, and split-party
 * character moves, sidebar teleports, POI discovery, and NPC introductions.
 * The hover tooltip comes from mapHover.js. The wiring module only mounts
 * views and syncs them. Handlers read the shared MapEnv late, after wiring
 * assigns the mounted views.
 * @param {AppContext} app
 * @param {MapEnv} env
 * @param {import('./mapNightWalk.js').WalkDialogs} [dialogs] stand-ins for the move
 *   dialogs, for a test
 */
export function createMapTravel(app, env, dialogs) {
  const { grid, navigator, partyTracker, state } = app;
  const noteSightings = createSightingLog(app);
  const { exitToParent, veilCrossing } = createExitTravel(app, env, {
    clickSubject,
    discoverTile,
    noteSightings,
    positionOf,
    refreshLocationPanels,
  });
  const teleportToNode = createTeleport(app, env, { noteSightings, refreshLocationPanels });

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
   * The ways out of the node in view, for the canvas arrows, the exit
   * buttons, and the click path. The list is empty in Build mode. Authoring
   * a map is not traveling it, and the arrows are one more thing drawn
   * over the tiles the GM paints. The list is told which parent tile this
   * tab's traveler came in through, so a child that two blocks of the parent
   * link to reports the sides of the block that traveler is in. The
   * traveler's cell decides where each edge leads: back to the parent, or
   * across a border into the region beside this one. A spectator tab reads
   * the party's cell.
   * @returns {import('../types/map.js').MapExit[]}
   */
  function currentExits() {
    if (state.mode !== 'play') return [];
    const node = navigator.getCurrentNode();
    const parent = grid.getParent(node);
    const through = entryThrough();
    return findExits(node, parent, through, {
      at: travelerCell(),
      nodeById: (id) => grid.getNode(id),
    }).map((exit) => veilCrossing(exit, parent));
  }

  /**
   * The exits from currentExits that the arrows and the exit buttons show.
   * An edge shows while the traveler stands within EXIT_REACH_SIGHTS sight
   * radii of it, measured with the sight of the current watch.
   * @param {import('../types/map.js').MapExit[]} exits
   * @returns {import('../types/map.js').MapExit[]}
   */
  function shownExits(exits) {
    const node = navigator.getCurrentNode();
    const reach = EXIT_REACH_SIGHTS * partyTracker.sightFor(node);
    return exitsInReach(node, exits, travelerCell(), reach);
  }

  /**
   * The cell of this tab's traveler in the node in view, or null when the
   * traveler stands in another node.
   * @returns {{ x: number, y: number } | null}
   */
  function travelerCell() {
    const here = moverPosition() ?? partyTracker.getPosition();
    return here.nodeId === navigator.getCurrentNode().id ? parseCoords(here.tileId) : null;
  }

  /**
   * The parent tile this tab's traveler entered the node in view through,
   * or null when no entry is remembered. The exits and the mini-map both use
   * it to pick the block of a child that two blocks of the parent link to.
   * @returns {string | null}
   */
  function entryThrough() {
    const nodeId = navigator.getCurrentNode().id;
    return entryFor(state.entryTiles, travelerFor(clickSubject()), nodeId);
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
   * @param {readonly string[]} [path] the tiles the character walked through
   */
  function moveOneCharacter(tile, character, path = []) {
    const nodeId = navigator.getCurrentNode().id;
    const party = partyTracker.getPosition();
    const rejoined = party.nodeId === nodeId && party.tileId === tile.id;
    state.characters = moveCharacter(
      state.characters,
      character.id,
      rejoined ? null : { nodeId, tileId: tile.id },
    );
    const before = navigator.getCurrentNode();
    grid.updateNode(partyTracker.reveal(before, [...path, tile.id]));
    noteSightings(before);
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
    const at = moverPosition();
    if (!at) return false;
    return at.nodeId !== navigator.getCurrentNode().id && at.nodeId !== tile.childNodeId;
  }

  /**
   * Where whoever this tab's clicks move stands, or null for a tab that
   * moves nobody.
   * @returns {import('../types/map.js').PartyPosition | null}
   */
  function moverPosition() {
    const subject = clickSubject();
    if (!subject && !isGM(state.role)) return null;
    return positionOf(subject);
  }

  /**
   * Where a character stands, or where the party stands for no character.
   * @param {import('../types/entities.js').Character | null} subject
   * @returns {import('../types/map.js').PartyPosition}
   */
  function positionOf(subject) {
    return subject
      ? characterPosition(subject, partyTracker.getPosition())
      : partyTracker.getPosition();
  }

  /**
   * The walk from whoever the click moves to the tile, in the node in view
   * (`MapPath.findPath`). Null means that walls, obstacles, or deep water
   * cut the tile off. Without this check, one click takes the party through
   * a town wall or across a lake. A player's walk goes through revealed
   * tiles only, so a move cannot tell the player whether a way through the
   * fog exists. A mover in another node is not walking here, so the walk is
   * undefined.
   * @param {import('../types/map.js').Tile} tile
   * @returns {string[] | null | undefined}
   */
  function walkPath(tile) {
    const at = moverPosition();
    const node = navigator.getCurrentNode();
    if (!at || at.nodeId !== node.id) return undefined;
    return findPath(node, at.tileId, tile.id, { revealedOnly: !isGM(state.role) });
  }

  const { spendWalk, walkTo, confirmMoveHere } = createWalkGate(
    app,
    { clickSubject, walkPath, travelTo, walkParty },
    dialogs,
  );

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
    // Nobody stands on a wall or an obstacle, so not even the GM can force
    // a move onto one.
    if (isBlocked(tile)) {
      if (moverPosition()) {
        app.toasts.show(`A wall or an obstacle fills ${describeTile(tile.id)}.`);
      }
      return;
    }
    if (movesFromElsewhere(tile)) {
      void confirmMoveHere(tile);
      return;
    }
    const path = walkPath(tile);
    // The GM can force a move that no walk makes, and a player cannot.
    if (path === null) {
      if (isGM(state.role)) void confirmMoveHere(tile, 'forced');
      else app.toasts.show('Walls, obstacles, or deep water block every path to that tile.');
      return;
    }
    if (path && tile.childNodeId && !tile.revealed) {
      void confirmMoveHere(tile, 'fogged');
      return;
    }
    walkTo(tile, path);
  };

  /**
   * Carry out a click on a tile: zoom into its sub-map, step out through a
   * door, or move whoever the click moves onto it. The fog clears along the
   * walk, and a walk of the whole party spends game time.
   * @param {import('../types/map.js').Tile} tile
   * @param {string[] | null} [path] the walk from `walkPath`: null for a
   *   forced move, and undefined when the mover is not in the node in view
   */
  function travelTo(tile, path) {
    const gm = isGM(state.role);
    const subject = clickSubject();
    if (tile.childNodeId) {
      // A locked child stops a move into it. The GM view of a child where
      // the mover already stands, or a GM click that moves nobody, only
      // zooms in, so the lock does not apply.
      const locked = grid.getNode(tile.childNodeId);
      if ((gm || subject) && positionOf(subject).nodeId !== locked?.id && isLocked(locked)) {
        const from = navigator.getCurrentNode().id;
        const lockNode = /** @type {import('../types/map.js').MapNode} */ (locked);
        void passLock(app, lockNode, { confirm: dialogs?.confirmModal }).then((ok) => {
          if (ok) travelTo(tile, path);
          else if (gm && !subject) stopShort(from, path);
        });
        return;
      }
      const parent = navigator.getCurrentNode();
      if (navigator.zoomIn(tile.id)) {
        const child = navigator.getCurrentNode();
        // Whoever the click moves, unless they already stand in this child.
        // A click on the link of a child where they stand only brings the
        // view in. It neither logs an entry nor rewrites the entry memory,
        // because nobody walked through the tile.
        const at = positionOf(subject);
        if ((gm || subject) && at.nodeId !== child.id) {
          // An all-fogged child has never been visited, so stepping in now
          // is its discovery. Check this before the move reveals entry fog.
          const firstVisit = !child.tiles.some((t) => t.revealed);
          // Drop whoever moves at the edge they approached from and reveal
          // fog around them, so the child does not draw as blank fog.
          const entry = computeRegionEntryTile(parent, child, tile.childNodeId, at, tile.id);
          // A walk up to the link tile clears the fog of the parent on the
          // way, and the whole party spends the time of it.
          if (path) {
            const walked = grid.getNode(parent.id) ?? parent;
            grid.updateNode(partyTracker.reveal(walked, path));
            noteSightings(walked, child.id);
          }
          if (path !== undefined && !subject) spendWalk(tile, path, parent);
          const childBefore = navigator.getCurrentNode();
          if (subject) {
            state.characters = moveCharacter(state.characters, subject.id, {
              nodeId: child.id,
              tileId: entry,
            });
            grid.updateNode(partyTracker.reveal(childBefore, [entry]));
          } else {
            partyTracker.moveTo(child.id, entry);
            state.characters = recallAll(state.characters);
            state.entryTiles = forgetCharacterEntries(state.entryTiles);
          }
          // A linked tile can be a discoverable point of interest, such as a
          // cave mouth over a dungeon.
          discoverTile(tile, parent.id);
          // Remember which parent tile this entry was through, so the ways
          // out and the return landing read the block this traveler came in
          // by. Read the subject back off the roster, because the move above
          // replaced them, and the key states whether they have their own
          // location or stand with the party. A spectator tab moves nobody,
          // so it writes no entry.
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
          noteSightings(childBefore);
          app.actions.markDirty(); // position and fog changed
        }
        // Re-read the node, because the move above wrote a new, fog-revealed
        // node into the grid and `child` is still fogged.
        env.mapCanvas.setNode(navigator.getCurrentNode());
        env.breadcrumb.update(navigator.getBreadcrumb());
        env.worldTree.update();
        env.regionTree.update(); // a first entry discovers the node
        env.syncPartyMarker();
        // This path swaps the node without resyncMapViews, so it draws the
        // ways out of the child itself.
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
    // A click on a door or stairway out of an interior walks whoever the
    // click moves to it and leads them out in one click. The walk clears
    // the fog on the way and spends its time. A forced move onto the door
    // (no walk reaches it) only puts the party in the doorway, and a second
    // click leads out.
    const exit = exitForTile(currentExits(), tile.id);
    if (exit) {
      const here = navigator.getCurrentNode();
      const at = positionOf(subject);
      const onDoor = at.tileId === tile.id;
      if (at.nodeId === here.id && (onDoor || path)) {
        if (!onDoor && path) {
          if (!subject && gm) spendWalk(tile, path);
          grid.updateNode(partyTracker.reveal(here, path));
        }
        exitToParent(exit);
        return;
      }
    }
    if (subject) {
      moveOneCharacter(tile, subject, path ?? []);
      return;
    }
    if (gm) walkParty(tile, path);
    // Otherwise a spectator tab, or a player tab with no character of its own to move.
  }

  /**
   * Move the whole party across the node in view onto a tile, spend the
   * time of the walk, and recall every character to the party.
   * @param {import('../types/map.js').Tile} tile
   * @param {readonly string[] | null | undefined} path
   */
  function walkParty(tile, path) {
    if (path !== undefined) spendWalk(tile, path);
    const before = navigator.getCurrentNode();
    partyTracker.moveTo(before.id, tile.id, path ?? []);
    state.characters = recallAll(state.characters);
    noteSightings(before);
    discoverTile(tile);
    env.mapCanvas.refreshNode(navigator.getCurrentNode());
    env.syncPartyMarker();
    app.actions.markDirty(); // party position and fog changed
    refreshLocationPanels();
    app.actions.maybeTriggerEncounter();
  }

  /**
   * Walk the whole party to the last step before a link tile that a lock
   * stopped, and spend the time of that walk. A forced move, a walk of one
   * step, and a view that changed while the dialog was open move nobody.
   * @param {string} nodeId the node in view when the walk started
   * @param {string[] | null | undefined} path the walk to the link tile
   */
  function stopShort(nodeId, path) {
    const node = navigator.getCurrentNode();
    if (!path || path.length < 3 || node.id !== nodeId) return;
    const stop = node.tiles.find((t) => t.id === path[path.length - 2]);
    if (stop) walkParty(stop, path.slice(0, -1));
  }

  return {
    teleportToNode,
    meetCreaturesHere,
    refreshLocationPanels,
    discoverTile,
    clickSubject,
    currentExits,
    shownExits,
    entryThrough,
    exitToParent,
    moveOneCharacter,
    onCellClick,
    movesFromElsewhere,
    onCellHover: createCellHover(app, env),
  };
}
