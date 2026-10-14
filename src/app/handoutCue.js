import { handoutsCued } from '../handout/Handouts.js';
import { isGM } from '../view/ViewRole.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * Registers `cueHandouts`, which tells the GM when the party, or a character
 * on their own tile, stands on a tile with a hidden handout. A toast names
 * the handout and offers a Reveal button. Each handout cues once per
 * session, so a cue that the GM lets time out does not come back at every
 * step onto the tile, and a view-only zoom that runs the check again shows
 * nothing new. The map badge from `hiddenHandoutTiles` stays as the lasting
 * reminder. A Player tab never cues, because the cue names a handout that
 * the players do not see.
 * @param {AppContext} app
 * @param {(id: string) => void} reveal reveals the handout with this id
 */
export function wireHandoutCue(app, reveal) {
  /** The ids of the handouts cued this session. @type {Set<string>} */
  const cued = new Set();
  app.actions.cueHandouts = () => {
    const { state } = app;
    if (!isGM(state.role)) return;
    const positions = [app.partyTracker.getPosition()];
    for (const c of state.characters) if (c.location) positions.push(c.location);
    for (const position of positions) {
      for (const handout of handoutsCued(state.handouts, position)) {
        if (cued.has(handout.id)) continue;
        cued.add(handout.id);
        const who = position === positions[0] ? 'The party stands' : 'A character stands';
        app.toasts.show(`${who} on '${handout.title}'.`, {
          action: { label: 'Reveal', onClick: () => reveal(handout.id) },
        });
      }
    }
  };
}
