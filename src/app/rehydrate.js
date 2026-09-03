/**
 * Adopt a campaign that another tab saved, without a page reload.
 *
 * A tab that only follows along, such as a player-facing display or a second
 * screen, used to answer every external save with `location.reload()`.
 * Autosave writes every ten idle seconds while the GM works. As a result, that
 * display re-parsed the save and remounted every panel every couple of
 * minutes. This discarded its scroll position, its open sidebar tab, the
 * map's pan and zoom, and anything staged in the dice tray. Reading the new
 * campaign is cheap. Rebuilding the whole UI around it is what costs time.
 *
 * This module writes a loaded campaign over the running one in place. It
 * takes an already-built `Campaign` instead of reading storage itself. This
 * keeps the load path, migrations, asset restore, tile decode, and entity
 * defaults, stated once in `Campaigns.loadInitialCampaign` and shared with a
 * normal page load.
 *
 * The loaded campaign holds a fresh object for every entity, including the
 * ones no edit touched, so each adopted field goes through
 * `Reconcile.reconcile` before the assignment. What is unchanged stays the
 * object the views already hold, and a panel that compares its rows by
 * identity can then tell a real edit from a repeated autosave.
 */

import { reconcile } from '../storage/Reconcile.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../campaign/Campaigns.js').Campaign} Campaign */

/**
 * The campaign data that `AppState` holds, and so the fields that a
 * re-hydrate copies over. `mode` and `role` are absent on purpose: both are
 * per-tab view state, not campaign state, and a display pinned to the Player
 * view must not adopt the GM tab's mode along with the GM's map. A fight
 * starting or ending is the one event that moves a follower's mode. The
 * caller decides that through `view/CombatMode.js`, not by copying the save.
 * This list is exported so a test can check it against the campaign shape and
 * catch a field added to one and not the other.
 * @type {string[]}
 */
export const SYNCED_STATE_KEYS = [
  'entryTiles',
  'characters',
  'creatures',
  'travelog',
  'quests',
  'clock',
  'handouts',
  'bestiary',
  'splitParty',
  'combat',
];

/**
 * Write a loaded campaign over the live one and refresh everything that reads
 * it. This function throws an error if the campaign cannot be adopted, for
 * example if a party position names a node that is not there. The caller can
 * then fall back to a reload instead of leaving the tab half-updated.
 * @param {AppContext} app
 * @param {Campaign} campaign
 */
export function rehydrateCampaign(app, campaign) {
  // The navigator, the party tracker, and the canvas each hold the grid that
  // built them, so the world is swapped through that object. The nodes pass
  // through `reconcile` like the state fields below, and for a stronger
  // reason: the map caches (`revealedIdsOf`, `findRegionGroups`,
  // `spanBlocks`) are keyed on node identity, so a node the save did not
  // change must stay the object those caches already know.
  app.grid.replaceNodes(reconcile([...app.grid.nodes.values()], [...campaign.grid.nodes.values()]));

  const state = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (app.state));
  const loaded = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (campaign));
  for (const key of SYNCED_STATE_KEYS) state[key] = reconcile(state[key], loaded[key]);

  // Revealing around the adopted tile does nothing here. The fog it can
  // reveal is already in the state that was just loaded. `revealAround`
  // returns the same node when nothing changed, so the per-node caches stay
  // warm.
  app.partyTracker.moveTo(campaign.party.nodeId, campaign.party.tileId);
  // Stay on whatever node this tab was looking at. That is the point of not
  // reloading. If the other tab deleted that node, follow the party instead.
  if (!app.grid.getNode(app.navigator.currentNodeId)) app.navigator.goTo(campaign.party.nodeId);

  const { actions, views } = app;
  actions.resyncMap();
  actions.syncCreatureMarkers();
  actions.refreshMapDescription();
  // Every panel backed by campaign state. The library lists are deliberately
  // not in this list. The custom library is stored apart from the campaign,
  // so no campaign write can change what they show.
  for (const view of [
    views.partyPanels,
    views.encounterPanel,
    views.buildFoes,
    views.buildNPCs,
    views.initiativePanel,
    views.combatScreen,
    views.npcPanel,
    views.questPanel,
    views.handoutPanel,
    views.travelogPanel,
  ]) {
    view.update();
  }
}
