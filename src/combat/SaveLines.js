/**
 * The log lines of a save spell, as the GM reads them and as a Player tab
 * reads them. A Player tab shows a foe's HP only as a band, and it does not
 * show a foe's save bonus. A line that names either one is GM-only, with a
 * player line beside it that leaves the number out (see
 * `log/LogVisibility.js`). A line that names neither goes to every viewer.
 *
 * Pure over its inputs. `app/spellOutcomes.js` applies the outcome and logs
 * what these functions return.
 */

/** @typedef {import('../types/log.js').LogOptions} LogOptions */

/**
 * A line and the options that `logEvent` takes for it. The player line is
 * set only when it differs from the GM line.
 * @param {string} gm
 * @param {string} player
 * @returns {[string, LogOptions]}
 */
export function splitLine(gm, player) {
  return gm === player ? [gm, {}] : [gm, { player }];
}

/**
 * The parenthetical of one save roll, for the GM and for a Player tab.
 *
 * `failedBy` is what failed the save with no roll: a chip, or an HP rule
 * such as "100 HP or fewer". `hpRule` says the reason is an HP rule, which
 * gives away the target's HP, so the player text leaves it out.
 * `secretBonus` says the bonus is a foe's, so the player text keeps only the
 * total.
 * @param {{
 *   bonus: string, ability: string, rode: string, total: number | undefined,
 *   failedBy: string | null | undefined, hpRule: boolean, secretBonus: boolean,
 * }} roll
 * @returns {{ gm: string, player: string }} an empty player text means the
 *   player line has no parenthetical
 */
export function saveDetail({ bonus, ability, rode, total, failedBy, hpRule, secretBonus }) {
  if (failedBy) return { gm: failedBy, player: hpRule ? '' : failedBy };
  const gm = `${bonus}${rode}: ${total}`;
  return { gm, player: secretBonus ? `${ability}${rode}: ${total}` : gm };
}

/**
 * The text in parentheses, or nothing when the text is empty.
 * @param {string} text
 * @returns {string}
 */
export function paren(text) {
  return text ? ` (${text})` : '';
}

/**
 * The line of a target that an HP rule leaves alone: the pool ran out, or the
 * target is over the HP limit. The player line names no reason, because each
 * reason bounds the target's HP.
 * @param {string} name
 * @param {string} reason
 * @param {boolean} hpRule
 * @returns {[string, LogOptions]}
 */
export function unaffectedLine(name, reason, hpRule) {
  const gm = `${name} is unaffected (${reason}).`;
  return splitLine(gm, hpRule ? `${name} is unaffected.` : gm);
}

/**
 * The line of the HP pool that a cast rolls (Sleep). The total and the dice
 * say how much HP the targets it reached have between them, so a Player tab
 * reads only the dice that the pool rolled.
 * @param {string} spellName
 * @param {{ total: number, dice: string, rolls: number[] }} pool
 * @returns {[string, LogOptions]}
 */
export function poolLine(spellName, pool) {
  return splitLine(
    `${spellName} rolls a pool of ${pool.total} HP (${pool.dice}: ${pool.rolls.join(', ')}).`,
    `${spellName} rolls an HP pool (${pool.dice}).`,
  );
}

/**
 * The log line of one target that rolled a save. The damage part shows only
 * when the spell rolls damage dice or the target took some, so a save against
 * Fear reads "fails DC 13 (...), Frightened." with no "takes 0 damage". A
 * success that leaves nothing to report ends in "no effect".
 * @param {{ name: string, verdict: string, dc: number, detail: string,
 *   takes: string, damages: boolean, cond: string, saved: boolean }} parts
 *   `takes` is the damage phrase, `damages` says whether it belongs in the
 *   line, and `cond` is the condition suffix, such as ", Frightened"
 * @returns {string}
 */
export function saveOutcomeLine({ name, verdict, dc, detail, takes, damages, cond, saved }) {
  const head = `${name} ${verdict} DC ${dc}${paren(detail)}`;
  if (damages) return `${head}, ${takes}${cond}.`;
  if (cond) return `${head}${cond}.`;
  return saved ? `${head}, no effect.` : `${head}.`;
}
