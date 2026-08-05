/**
 * What an exhaustion level reads as on screen. The rules live in
 * `entities/Exhaustion.js`. This module turns one level into the words and the
 * pip row that a surface draws, so the character sheet and the two creature
 * panels cannot describe the same level differently.
 */

import {
  MAX_EXHAUSTION,
  d20Penalty,
  exhaustionLevel,
  exhaustionNote,
  speedPenalty,
} from '../entities/Exhaustion.js';

/** @typedef {import('../entities/Exhaustion.js').Exhaustible} Exhaustible */

/**
 * The whole readout for one entity. `pips` is the row a surface draws, one per
 * level, each filled up to the current level. The last pip is the fatal one, and
 * a surface colors it apart so that a GM sees where the row ends before
 * clicking it.
 *
 * `label` names the row for a sighted reader, and `ariaLabel` says the level in
 * words, because a row of circles does not read aloud. `note` is the sentence
 * that says what the level costs, for a tooltip. `summary` is the same cost in
 * the few words that fit beside the pips on a list row. `badge` is the short
 * form for a headline. Both are empty at level 0, where there is nothing to
 * report.
 * @param {Exhaustible} entity
 * @returns {{
 *   level: number,
 *   label: string,
 *   ariaLabel: string,
 *   badge: string,
 *   summary: string,
 *   note: string,
 *   fatal: boolean,
 *   pips: { level: number, filled: boolean, fatal: boolean }[],
 * }}
 */
export function exhaustionReadout(entity) {
  const level = exhaustionLevel(entity);
  const pips = [];
  for (let i = 1; i <= MAX_EXHAUSTION; i += 1) {
    pips.push({ level: i, filled: i <= level, fatal: i === MAX_EXHAUSTION });
  }
  const fatal = level >= MAX_EXHAUSTION;
  return {
    level,
    label: 'Exhaustion',
    ariaLabel: `Exhaustion ${level} of ${MAX_EXHAUSTION}`,
    badge: level ? `Exhaustion ${level}` : '',
    summary: exhaustionSummary(level, fatal),
    note: exhaustionNote(entity),
    fatal,
    pips,
  };
}

/**
 * The cost of a level in the few words that fit beside the pips.
 * @param {number} level
 * @param {boolean} fatal
 * @returns {string}
 */
function exhaustionSummary(level, fatal) {
  if (!level) return '';
  if (fatal) return 'Dead';
  return `${d20Penalty({ exhaustion: level })} to d20, -${speedPenalty({ exhaustion: level })} ft`;
}

/**
 * What clicking one pip sets the level to. A click on a higher pip raises the
 * level to it. A click on the pip that matches the current level takes that one
 * level back off, which is how a GM steps down without a second control.
 * A click on a lower pip drops to it.
 * @param {number} current
 * @param {number} clicked the level the clicked pip stands for
 * @returns {number}
 */
export function nextLevel(current, clicked) {
  return clicked === current ? clicked - 1 : clicked;
}
