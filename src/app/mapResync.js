/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('./mapWiring.js').MapEnv} MapEnv */

/**
 * Bring every view that reflects the map back in line with the grid, after a
 * caller changed the world underneath them. Two intents, one flag:
 *
 * - `reframe: true` — the node in view is what changed (navigation, a resize, a
 *   regeneration, a stroke undo). The canvas re-frames on the fresh node
 *   object, the tile selection is dropped because the tile may be gone, the
 *   palette re-filters to the node's kind, and the party marker (with the
 *   encounter/NPC markers and the screen-reader description that ride along
 *   with it) is re-placed.
 * - the default — something else changed and the node in view may draw it (a
 *   sibling's name, a cleared region link). The canvas redraws in place,
 *   keeping the GM's pan and zoom.
 *
 * Both then recompute the node's ways out and refresh the breadcrumb and the two
 * world trees, which are derived from grid contents either way.
 *
 * This lives in its own module rather than in mapWiring so that nodeActions,
 * which mapWiring imports, can call it without an import cycle. It reads the
 * MapEnv view fields late, which is safe for the same reason the gesture
 * modules' late reads are: every caller runs on a user event or a cross-tab
 * message, long after wiring filled those fields in.
 *
 * @param {AppContext} app
 * @param {MapEnv} env
 * @param {{ reframe?: boolean }} [opts]
 */
export function resyncMapViews(app, env, { reframe = false } = {}) {
  if (reframe) {
    env.mapCanvas.setNode(app.navigator.getCurrentNode());
    env.clearSelection();
    env.syncPartyMarker();
    env.syncPaletteKind();
  } else {
    env.mapCanvas.refreshNode(app.navigator.getCurrentNode());
  }
  // Either way the ways out may have changed: navigation lands in a different
  // node, and a world edit from elsewhere (another tab, a node action) can repaint
  // the terrain around the region block the node in view sits in.
  env.syncExits();
  env.breadcrumb.update(app.navigator.getBreadcrumb());
  env.worldTree.update();
  env.regionTree.update();
}
