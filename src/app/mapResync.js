/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('./mapWiring.js').MapEnv} MapEnv */

/**
 * Bring every view that reflects the map back in line with the grid, after
 * a caller changed the world underneath them. One flag selects between two
 * intents.
 *
 * If `reframe` is true, the node in view is what changed (navigation, a
 * resize, a regeneration, or a stroke undo). The canvas re-frames on the
 * fresh node object. The tile selection is dropped, because the tile can be
 * gone. The palette re-filters to the node kind. The party marker
 * re-places, along with the encounter and NPC markers and the
 * screen-reader description that ride with it.
 *
 * If `reframe` is false, something else changed, and the node in view can
 * draw it (for example, a sibling's name, or a cleared region link). The
 * canvas redraws in place and keeps the GM's pan and zoom.
 *
 * Both branches then recompute the node's ways out, and refresh the
 * breadcrumb and the two world trees. Grid contents derive all of these
 * either way.
 *
 * This function lives in its own module, not in mapWiring, so that
 * nodeActions, which mapWiring imports, can call it without an import
 * cycle. It reads the MapEnv view fields late. This is safe for the same
 * reason the gesture modules' late reads are safe: every caller runs on a
 * user event or a cross-tab message, long after wiring filled those fields in.
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
    // A world edit from elsewhere (another tab, a node action) can repaint
    // the terrain around the region block the node in view sits in. This
    // can change which sides of it lead back out. The reframe path gets
    // this update through syncPartyMarker. This branch skips syncPartyMarker
    // on purpose.
    env.syncExits();
  }
  env.breadcrumb.update(app.navigator.getBreadcrumb());
  env.worldTree.update();
  env.regionTree.update();
}
