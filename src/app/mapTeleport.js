import { tileIdAt } from '../map/MapGeometry.js';
import { resolveEntryTile } from '../map/EntryPoint.js';
import { forgetCharacterEntries, forgetEntries } from '../map/EntryMemory.js';
import { recallAll } from '../party/CharacterTokens.js';
import { textButton } from '../ui/buttons.js';
import { el } from '../ui/dom.js';
import { openDialog } from '../ui/Modal.js';
import { isGM } from '../view/ViewRole.js';
import { passLock } from './lockGuard.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('./mapWiring.js').MapEnv} MapEnv */

/**
 * Ask the GM whether a world tree pick only shows the map or moves the
 * party there. Resolves to 'view', 'teleport', or 'cancel'.
 * @param {string} name
 * @returns {Promise<'view' | 'teleport' | 'cancel'>}
 */
function askViewOrTeleport(name) {
  return openDialog({
    title: name,
    build: (close) => {
      const text = el(
        'p',
        'modal__message',
        `View "${name}" without moving the party, or teleport the party there?`,
      );
      const cancel = textButton('Cancel', () => close('cancel'));
      const view = textButton('View map', () => close('view'));
      const teleport = textButton('Teleport party', () => close('teleport'), {
        variant: 'primary',
      });
      return {
        body: [text],
        actions: [cancel, view, teleport],
        initialFocus: view,
        description: text,
      };
    },
    result: (value) => (value === 'view' || value === 'teleport' ? value : 'cancel'),
  });
}

/**
 * Build the world tree pick of Play mode. A pick of the node the party is
 * in, or any pick from a player tab, only brings the node into view. A GM
 * pick of another node asks whether to view the map there, the way the
 * breadcrumb shows an ancestor, or to teleport the party to it.
 * @param {AppContext} app
 * @param {MapEnv} env
 * @param {{
 *   refreshLocationPanels: () => void,
 *   noteSightings: (before: import('../types/map.js').MapNode | undefined) => void,
 * }} travel
 * @returns {(nodeId: string) => Promise<void>}
 */
export function createTeleport(app, env, travel) {
  const { grid, partyTracker, state } = app;
  return async (nodeId) => {
    const node = grid.getNode(nodeId);
    if (!node) return;
    if (!isGM(state.role) || partyTracker.getPosition().nodeId === nodeId) {
      env.goToNode(nodeId);
      return;
    }
    const choice = await askViewOrTeleport(node.name);
    if (choice === 'view') env.goToNode(nodeId);
    if (choice !== 'teleport') return;
    if (!(await passLock(app, node))) return;
    // Resolve the landing spot against the node's real tiles. This makes
    // sure that a teleport into a sparse or walled node, for example a
    // generated dungeon, never strands the party on a wall or an empty
    // cell. The party lands on the node's first revealed tile, and a
    // tile-less node falls back to the grid center.
    const target = resolveEntryTile(
      node,
      node.tiles.find((t) => t.revealed)?.id ??
        tileIdAt(Math.floor(node.width / 2), Math.floor(node.height / 2)),
    );
    // No revealed tile means the party has never set foot here. This
    // teleport is then the region's discovery. The code checks this before
    // moveTo reveals fog.
    const firstVisit = !node.tiles.some((t) => t.revealed);
    const before = grid.getNode(nodeId);
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
    travel.noteSightings(before);
    travel.refreshLocationPanels();
    app.actions.maybeTriggerEncounter();
  };
}
