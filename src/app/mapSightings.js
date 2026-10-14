import { sightedLinks } from '../map/Sightings.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * Build the travelogue note for sites that a move brings out of the fog. The
 * caller reads the node before the move and passes it after the move. Each
 * sub-map whose link tiles came into view logs "Sighted <name>." once. The
 * site that the move enters is `except`, because its own entry line names
 * it.
 * @param {AppContext} app
 * @returns {(before: import('../types/map.js').MapNode | undefined, except?: string | null) => void}
 */
export function createSightingLog(app) {
  return (before, except = null) => {
    if (!before) return;
    const after = app.grid.getNode(before.id);
    if (!after) return;
    for (const id of sightedLinks(before, after)) {
      const name = id === except ? undefined : app.grid.getNode(id)?.name;
      if (name) app.actions.logEvent('travel', `Sighted ${name}.`);
    }
  };
}
