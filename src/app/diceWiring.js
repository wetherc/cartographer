/**
 * The dice tray and the roll log. Rolls live in the log (the tray itself
 * shows only the latest roll), tagged by which side of the screen rolled them.
 */

import { mustGetElement } from '../ui/dom.js';
import { mountDiceTray } from '../ui/DiceTray.js';
import { isGM } from '../view/ViewRole.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * Mount the tray and register the roll action.
 * @param {AppContext} app
 */
export function wireDiceTray(app) {
  /** This function returns who a roll is attributed to: the GM, the
   * character this tab is bound to, or an anonymous player for a spectator tab. */
  function rollerName() {
    if (isGM(app.state.role)) return 'The GM';
    const boundId = app.actions.getBoundCharacterId();
    return app.state.characters.find((c) => c.id === boundId)?.name ?? 'A player';
  }

  const diceTray = mountDiceTray(mustGetElement('dice-tray-container'), {
    onRoll: (text) => app.actions.logEvent('roll', `${rollerName()} rolls ${text}.`),
  });

  // This lets a weapon attack load and roll the tray (d20 plus modifier
  // against the defender's AC). The roll then shows where every other roll shows.
  app.actions.rollDice = (selection, target) => diceTray.rollSelection(selection, target);
}
