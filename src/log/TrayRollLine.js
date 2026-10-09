/**
 * The travelogue line of a roll from the dice tray. A hidden roll is GM-only.
 * The GM reads the dice and the result, and a Player tab reads only that the
 * GM rolled, so a secret Perception check or a foe's save gives nothing away.
 */

/** The line a Player tab reads in place of a hidden roll. */
export const SECRET_ROLL_LINE = 'The GM rolls in secret.';

/**
 * The message and visibility options of a tray roll. Only a GM roll can be
 * hidden, because a player's roll has nothing to hide from the other players.
 * @param {string} roller the name of who rolled, such as "The GM"
 * @param {string} text the formatted result
 * @param {{ hidden?: boolean, gm?: boolean }} [flags] `hidden` is the state
 *   of the tray's Hidden roll box, and `gm` is true for a GM tab
 * @returns {{ message: string, options?: import('../types/log.js').LogOptions }}
 */
export function trayRollLine(roller, text, { hidden = false, gm = false } = {}) {
  if (hidden && gm) {
    return {
      message: `${roller} rolls in secret: ${text}.`,
      options: { player: SECRET_ROLL_LINE },
    };
  }
  return { message: `${roller} rolls ${text}.` };
}
