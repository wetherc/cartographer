/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * Refresh the panels that filter their rows by a map location. A world edit
 * can move a creature to another tile, unplace it, or make a handout
 * campaign-wide, and each of these changes which panel shows what. The map
 * resync does not cover them: it reads the grid, and these read the campaign
 * lists.
 *
 * `mapAuthoring.js` calls this after a stroke undo restores locations, and
 * `generateAction.js` after a regeneration moves them. `mapTravel.js` and
 * `nodeActions.js` refresh the same panels with extra work of their own
 * around it.
 * @param {AppContext} app
 */
export function refreshLocationPanels(app) {
  app.views.encounterPanel.update();
  app.views.initiativePanel.update();
  app.views.npcPanel.update();
  app.views.handoutPanel.update();
}
