import { isLucky } from '../entities/RaceTraits.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/dice.js').DiceSelection} DiceSelection */

/**
 * Roll a d20 selection in the dice tray for one roller. A roller with the
 * Halfling's Lucky trait who shows a natural 1 on the kept d20 rolls the
 * selection again and must use the new roll, so the tray shows the roll that
 * counts. `lucky` is true when the reroll happened, so the log can say so.
 * @param {AppContext} app
 * @param {object | null | undefined} roller the character or creature that rolls
 * @param {DiceSelection} selection
 * @param {number | null} [target]
 * @param {import('../types/dice.js').TrayRollOptions} [options]
 * @returns {{ result: import('../types/dice.js').DiceResult, lucky: boolean }}
 */
export function rollD20InTray(app, roller, selection, target, options) {
  const roll = () => app.actions.rollDice(selection, target, options).result;
  const first = roll();
  const natural = first.results.find((r) => r.die === 'd20')?.rolls[0];
  if (natural !== 1 || !isLucky(/** @type {any} */ (roller)))
    return { result: first, lucky: false };
  return { result: roll(), lucky: true };
}
