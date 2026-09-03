/**
 * The log lines for a damage or heal that the GM applies by hand from the
 * combat screen. An attack and a cast write their own lines, with the roll
 * in them, so this module serves only the amount field. Both lines name the
 * combatant, the amount, and the HP that results, so the log is enough to
 * follow a fight after the fact. A combatant with no HP resource gets the
 * line without the readout.
 */

/** @typedef {{ current: number, max: number } | null | undefined} HPReadout */

/**
 * @param {HPReadout} hp
 * @returns {string}
 */
function readout(hp) {
  return hp ? ` (HP ${hp.current}/${hp.max})` : '';
}

/**
 * @param {string} name
 * @param {number} amount
 * @param {HPReadout} hp the HP after the damage landed
 * @returns {string}
 */
export function damageLine(name, amount, hp) {
  return `${name} takes ${amount} damage${readout(hp)}.`;
}

/**
 * @param {string} name
 * @param {number} amount
 * @param {HPReadout} hp the HP after the heal landed
 * @returns {string}
 */
export function healLine(name, amount, hp) {
  return `${name} heals ${amount}${readout(hp)}.`;
}
