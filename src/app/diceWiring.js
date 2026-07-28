/**
 * The dice tray and the roll log. Rolls live in the travelogue (the tray itself
 * shows only the latest), tagged by which side of the screen rolled them.
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
  /** Who a roll is attributed to: the GM, the character this tab is bound to,
   * or an anonymous player for a spectator tab. */
  function rollerName() {
    if (isGM(app.state.role)) return 'The GM';
    const boundId = app.actions.getBoundCharacterId();
    return app.state.characters.find((c) => c.id === boundId)?.name ?? 'A player';
  }

  const diceTray = mountDiceTray(mustGetElement('dice-tray-container'), {
    onRoll: (text) => app.actions.logEvent('roll', `${rollerName()} rolls ${text}.`),
  });

  // Lets a weapon attack load and roll the tray (d20 + modifier vs the
  // defender's AC) so the roll is visible where every other roll happens.
  app.actions.rollDice = (selection, target) => diceTray.rollSelection(selection, target);
}
