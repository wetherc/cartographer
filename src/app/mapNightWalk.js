import { parseCoords } from '../map/MapGeometry.js';
import { describeTile } from '../map/TileCoords.js';
import { nightWarning } from '../time/NightWalk.js';
import { travelMinutes, walkMinutes } from '../time/TravelTime.js';
import { choiceModal } from '../ui/ChoiceModal.js';
import { confirmModal } from '../ui/Modal.js';
import { isGM } from '../view/ViewRole.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../time/NightWalk.js').NightWarning} NightWarning */

/**
 * The dialogs a walk can open. A test passes stand-ins, because the real
 * ones need a document.
 * @typedef {{ choiceModal: typeof choiceModal, confirmModal: typeof confirmModal }} WalkDialogs
 */

/**
 * The move question of a dialog that opens anyway, such as a forced move
 * across walls, with the label of its confirm button.
 * @typedef {{ question: string, label: string, title: string }} MoveQuestion
 */

/**
 * Build the question a GM answers before a walk: the Night warning, the move
 * confirm, or both in one dialog. It resolves with "walk", "stop" (cut the
 * walk at Dusk), or "cancel". The tab keeps the day of a Night the GM chose
 * not to hear about again, and every walk into that Night goes ahead with
 * no dialog. The choice lasts until the page reloads. `warns` tells, with no
 * dialog, whether a warning still needs asking.
 * @param {WalkDialogs} [dialogs]
 * @returns {{
 *   warns: (warning: NightWarning | null) => warning is NightWarning,
 *   ask: (warning: NightWarning | null, move?: MoveQuestion) => Promise<'walk' | 'stop' | 'cancel'>,
 * }}
 */
export function createWalkQuestion(dialogs = { choiceModal, confirmModal }) {
  let quietNight = 0;
  /** @param {NightWarning | null} warning @returns {warning is NightWarning} */
  const warns = (warning) => Boolean(warning && warning.night !== quietNight);
  /** @param {NightWarning | null} warning @param {MoveQuestion} [move] */
  const ask = async (warning, move) => {
    const night = warns(warning) ? warning : null;
    if (!night) {
      if (!move) return 'walk';
      const ok = await dialogs.confirmModal(move.question, {
        title: move.title,
        confirmLabel: move.label,
      });
      return ok ? 'walk' : 'cancel';
    }
    const choices = [{ value: 'walk', label: move?.label ?? 'Walk on' }];
    if (night.stop) choices.push({ value: 'stop', label: 'Stop at Dusk' });
    const message = move ? `${move.question} ${night.message}` : night.message;
    const { choice, checked } = await dialogs.choiceModal(message, choices, {
      title: move?.title ?? 'Night falls',
      checkLabel: "Don't ask again tonight",
    });
    if (checked) quietNight = night.night;
    return choice === 'walk' || choice === 'stop' ? choice : 'cancel';
  };
  return { warns, ask };
}

/**
 * The moves of mapTravel.js that spend game time or ask first: the time a
 * whole-party walk costs, the Night warning, and the move confirm. The
 * handlers it needs from mapTravel.js come in `deps`.
 * @param {AppContext} app
 * @param {{
 *   clickSubject: () => import('../types/entities.js').Character | null,
 *   walkPath: (tile: import('../types/map.js').Tile) => string[] | null | undefined,
 *   travelTo: (tile: import('../types/map.js').Tile, path?: string[] | null) => void,
 *   walkParty: (tile: import('../types/map.js').Tile, path?: readonly string[] | null) => void,
 * }} deps
 * @param {WalkDialogs} [dialogs]
 */
export function createWalkGate(app, deps, dialogs) {
  const { grid, navigator, partyTracker, state } = app;
  const { clickSubject, walkPath, travelTo, walkParty } = deps;
  const walkQuestion = createWalkQuestion(dialogs);

  /**
   * The steps a whole-party walk to the tile charges. A forced move with no
   * walk counts the steps along the grid from the party's tile.
   * @param {import('../types/map.js').Tile} tile
   * @param {readonly string[] | null} path
   */
  function walkSteps(tile, path) {
    if (path) return path.length - 1;
    const from = parseCoords(partyTracker.getPosition().tileId);
    const to = parseCoords(tile.id);
    return from && to ? Math.abs(from.x - to.x) + Math.abs(from.y - to.y) : 0;
  }

  /** @param {import('../types/map.js').MapNode} node */
  const depthOf = (node) => grid.getBreadcrumb(node.id).length - 1;

  /**
   * Spend the game time of a whole-party walk to the tile, in the node in
   * view. Call this before the party moves, because a forced move counts
   * from the party's tile.
   * @param {import('../types/map.js').Tile} tile
   * @param {readonly string[] | null} path
   * @param {import('../types/map.js').MapNode} [node] the node of the walk
   */
  function spendWalk(tile, path, node = navigator.getCurrentNode()) {
    const minutes = path
      ? walkMinutes(node, depthOf(node), path)
      : travelMinutes(node, depthOf(node), walkSteps(tile, path));
    app.actions.passTravelTime(minutes);
  }

  /**
   * The Night warning for a click, or null. Only a whole-party walk by the
   * GM spends time, so only that walk can run into Night. A player tab, a
   * split-party move, and a move from another node spend none.
   * @param {import('../types/map.js').Tile} tile
   * @param {readonly string[] | null | undefined} path
   */
  function warningFor(tile, path) {
    if (!isGM(state.role) || clickSubject() || path === undefined) return null;
    const node = navigator.getCurrentNode();
    const perStep = travelMinutes(node, depthOf(node), 1);
    return nightWarning(state.clock, perStep, walkSteps(tile, path), path);
  }

  /**
   * The tile under an id in the node in view, while the view stays on the
   * node a dialog opened on. The view can change while a dialog is open.
   * @param {string} nodeId @param {string} tileId
   */
  function freshTile(nodeId, tileId) {
    const now = navigator.getCurrentNode();
    return now.id === nodeId ? now.tiles.find((t) => t.id === tileId) : undefined;
  }

  /**
   * Carry out the GM's answer to a walk question. "stop" walks the party
   * along the cut path and moves it only as far as the last tile before
   * Night, even when the full walk ended on a link or a door.
   * @param {'walk' | 'stop' | 'cancel'} choice
   * @param {string} nodeId the node in view when the question opened
   * @param {import('../types/map.js').Tile} tile
   * @param {import('../time/NightWalk.js').NightWarning | null} warning
   */
  function answerWalk(choice, nodeId, tile, warning) {
    const fresh = freshTile(nodeId, tile.id);
    if (choice === 'walk' && fresh) travelTo(fresh, walkPath(fresh));
    const stop = choice === 'stop' ? warning?.stop : null;
    const end = stop && freshTile(nodeId, stop[stop.length - 1]);
    if (stop && end) walkParty(end, stop);
  }

  /**
   * Walk to a tile, and ask first when the walk runs into Night. A walk
   * that raises no warning goes ahead at once.
   * @param {import('../types/map.js').Tile} tile
   * @param {string[] | null | undefined} path
   */
  function walkTo(tile, path) {
    const warning = warningFor(tile, path);
    if (!walkQuestion.warns(warning)) {
      travelTo(tile, path);
      return;
    }
    const nodeId = navigator.getCurrentNode().id;
    void walkQuestion.ask(warning).then((choice) => answerWalk(choice, nodeId, tile, warning));
  }

  /**
   * Ask before a click moves someone out of the node they stand in (the
   * way a teleport asks), across walls or water that no walk passes
   * (`forced`), or into a fogged tile that leads to a sub-map (`fogged`),
   * which a click aimed past a building can hit by mistake. A walk that
   * runs into Night adds its warning to the same dialog. The node in view
   * or the tile can change while the dialog is open, so the move reads both
   * again and gives up when the view has left the node.
   * @param {import('../types/map.js').Tile} tile
   * @param {'elsewhere' | 'forced' | 'fogged'} [reason]
   */
  async function confirmMoveHere(tile, reason = 'elsewhere') {
    const view = navigator.getCurrentNode();
    const target = (tile.childNodeId && grid.getNode(tile.childNodeId)) || view;
    const who = clickSubject()?.name ?? 'the party';
    const where = describeTile(tile.id);
    const question = {
      elsewhere: `Move ${who} to "${target.name}"?`,
      forced: `Walls, obstacles, or deep water block every path for ${who} to ${where}. Move ${who} there anyway?`,
      fogged: `The fogged tile at ${where} leads into "${target.name}". Move ${who} into it?`,
    }[reason];
    const label = { elsewhere: 'Move', forced: 'Move anyway', fogged: 'Enter' }[reason];
    const warning = reason === 'elsewhere' ? null : warningFor(tile, walkPath(tile));
    const choice = await walkQuestion.ask(warning, { question, label, title: `Move ${who}?` });
    answerWalk(choice, view.id, tile, warning);
  }

  return { spendWalk, walkTo, confirmMoveHere };
}
