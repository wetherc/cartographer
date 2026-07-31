/**
 * Adopting a campaign another tab saved, without reloading the page.
 *
 * A tab that is only following along — a player-facing display, a second screen
 * — used to answer every external save with `location.reload()`. Autosave writes
 * every ten idle seconds while the GM is working, so that display re-parsed the
 * save and remounted every panel every couple of minutes, throwing away its
 * scroll position, which sidebar tab was open, the map's pan and zoom, and
 * anything staged in the dice tray. Reading the new campaign is cheap; rebuilding
 * the whole UI around it is what hurt.
 *
 * So this module writes a loaded campaign over the running one in place. It takes
 * an already-built `Campaign` rather than reading storage itself, which keeps the
 * load path — migrations, asset restore, tile decode, entity defaults — stated
 * once in `Campaigns.loadInitialCampaign` and shared with a normal page load.
 */

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../campaign/Campaigns.js').Campaign} Campaign */

/**
 * The campaign data `AppState` holds, and so the fields a re-hydrate copies over.
 * `mode` and `role` are absent on purpose: both are per-tab view state rather than
 * campaign state, and a display pinned to the Player view must not adopt the GM
 * tab's mode along with their map. A fight starting or ending is the one thing
 * that moves a follower's mode, decided by `view/CombatMode.js` in the caller
 * rather than copied from the save. Exported so a test can hold the list against
 * the campaign shape and catch a field added to one and not the other.
 * @type {string[]}
 */
export const SYNCED_STATE_KEYS = [
  'characters',
  'encounters',
  'travelog',
  'quests',
  'clock',
  'npcs',
  'handouts',
  'bestiary',
  'splitParty',
  'combat',
];

/**
 * Write a loaded campaign over the live one and refresh everything that reads it.
 * Throws if the campaign cannot be adopted — a party position naming a node that
 * is not there, say — so the caller can fall back to a reload rather than leave
 * the tab half-updated.
 * @param {AppContext} app
 * @param {Campaign} campaign
 */
export function rehydrateCampaign(app, campaign) {
  // The navigator, the party tracker, and the canvas each hold the grid they were
  // constructed with, so the world is swapped through that object.
  app.grid.replaceNodes([...campaign.grid.nodes.values()]);

  const state = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (app.state));
  const loaded = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (campaign));
  for (const key of SYNCED_STATE_KEYS) state[key] = loaded[key];

  // Revealing around the adopted tile is a no-op: the fog it would reveal is
  // already in the state that was just loaded, and `revealAround` returns the same
  // node when nothing changed, so the per-node caches stay warm.
  app.partyTracker.moveTo(campaign.party.nodeId, campaign.party.tileId);
  // Stay on whatever node this tab was looking at, which is the point of not
  // reloading — unless the other tab deleted it, in which case follow the party.
  if (!app.grid.getNode(app.navigator.currentNodeId)) app.navigator.goTo(campaign.party.nodeId);

  const { actions, views } = app;
  actions.resyncMap();
  actions.syncEncounterMarkers();
  actions.syncNPCMarkers();
  actions.refreshMapDescription();
  // Every panel backed by campaign state. The library lists are deliberately not
  // here: the custom library is stored apart from the campaign, so no campaign
  // write can change what they show.
  for (const view of [
    views.partyPanels,
    views.encounterPanel,
    views.buildEncounters,
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
