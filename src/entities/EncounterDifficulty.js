/**
 * How hard a fight is, by the 5e experience-point budget. The party's levels
 * set four thresholds. The foes' challenge ratings set an adjusted total that
 * counts a crowd for more than the sum of its parts. Comparing the two names
 * the fight.
 *
 * This is a hint and not a rule. Nothing in the app acts on it, and it awards
 * no experience points to anyone. A GM reads it before deciding whether to send
 * the fight in.
 *
 * Every function is pure, and the tables are verbatim SRD data.
 */

import { crXP } from '../data/challenge.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/creature.js').Creature} Creature */

/**
 * The four thresholds for one character, by level: easy, medium, hard, and
 * deadly. Index 0 holds level 1.
 * @type {number[][]}
 */
export const XP_THRESHOLDS = [
  [25, 50, 75, 100],
  [50, 100, 150, 200],
  [75, 150, 225, 400],
  [125, 250, 375, 500],
  [250, 500, 750, 1100],
  [300, 600, 900, 1400],
  [350, 750, 1100, 1700],
  [450, 900, 1400, 2100],
  [550, 1100, 1600, 2400],
  [600, 1200, 1900, 2800],
  [800, 1600, 2400, 3600],
  [1000, 2000, 3000, 4500],
  [1100, 2200, 3400, 5100],
  [1250, 2500, 3800, 5700],
  [1400, 2800, 4300, 6400],
  [1600, 3200, 4800, 7200],
  [2000, 3900, 5900, 8800],
  [2100, 4200, 6300, 9500],
  [2400, 4900, 7300, 10900],
  [2800, 5700, 8500, 12700],
];

/** The band names, in the order the thresholds run. A total under the easy
 * threshold is trivial, which the rules leave unnamed.
 * @type {string[]} */
export const DIFFICULTY_LABELS = ['Trivial', 'Easy', 'Medium', 'Hard', 'Deadly'];

/** The multiplier ladder for the number of foes. A party-size adjustment moves
 * one step along it rather than scaling the value, which is how the rules
 * phrase it.
 * @type {number[]} */
const MULTIPLIERS = [1, 1.5, 2, 2.5, 3, 4];

/**
 * Which rung of the multiplier ladder a number of foes sits on: one foe, two,
 * three to six, seven to ten, eleven to fourteen, then fifteen or more.
 * @param {number} count
 * @returns {number}
 */
function multiplierStep(count) {
  if (count <= 1) return 0;
  if (count === 2) return 1;
  if (count <= 6) return 2;
  if (count <= 10) return 3;
  if (count <= 14) return 4;
  return 5;
}

/**
 * The party's four thresholds: each character's thresholds for its level,
 * summed. A character above level 20 or below level 1 reads at the nearest
 * level the table holds. An empty party has all four at 0.
 * @param {Character[]} characters
 * @returns {number[]} easy, medium, hard, and deadly
 */
export function partyThresholds(characters) {
  const totals = [0, 0, 0, 0];
  for (const character of characters) {
    const level = Math.min(20, Math.max(1, Math.floor(character.level ?? 1) || 1));
    const row = XP_THRESHOLDS[level - 1];
    for (let i = 0; i < totals.length; i += 1) totals[i] += row[i];
  }
  return totals;
}

/**
 * The adjusted experience-point total of a group of foes: the sum of what each
 * is worth, times the multiplier for how many there are. A small party faces
 * the same foes as a harder fight, and a large one as an easier fight, so the
 * party size moves one step along the multiplier ladder. A party of the usual
 * three to five moves nothing.
 *
 * An unrated creature is worth nothing but still counts toward the number of
 * foes, because it still takes a turn and still soaks an attack.
 * @param {Creature[]} creatures the hostile creatures in the fight
 * @param {number} partySize how many characters face them
 * @returns {number}
 */
export function adjustedXP(creatures, partySize) {
  const raw = creatures.reduce((sum, c) => sum + (c.cr === undefined ? 0 : crXP(c.cr)), 0);
  if (raw === 0) return 0;
  const shift = partySize > 0 && partySize < 3 ? 1 : partySize >= 6 ? -1 : 0;
  const step = Math.min(
    MULTIPLIERS.length - 1,
    Math.max(0, multiplierStep(creatures.length) + shift),
  );
  return Math.round(raw * MULTIPLIERS[step]);
}

/**
 * Rate a fight: the adjusted total of the hostile creatures against the party's
 * thresholds, and the band it lands in. The comparison takes a threshold as
 * met, so a total exactly on the medium threshold is medium.
 *
 * `unrated` counts the hostile creatures with no challenge rating. Each is
 * worth no experience points, so the rating understates the fight by however
 * many there are, and a caller that shows the band says so.
 * @param {Character[]} characters the party
 * @param {Creature[]} creatures every creature in the fight, of any disposition
 * @returns {{ label: string, adjustedXP: number, thresholds: number[], hostiles: number, unrated: number }}
 */
export function rateEncounter(characters, creatures) {
  const hostiles = creatures.filter((c) => c.disposition === 'hostile');
  const thresholds = partyThresholds(characters);
  const total = adjustedXP(hostiles, characters.length);
  // The band is the highest threshold the total reaches. Below the easy
  // threshold, and for a party with no thresholds at all, it is trivial.
  let band = 0;
  for (let i = 0; i < thresholds.length; i += 1) {
    if (thresholds[i] > 0 && total >= thresholds[i]) band = i + 1;
  }
  return {
    label: DIFFICULTY_LABELS[band],
    adjustedXP: total,
    thresholds,
    hostiles: hostiles.length,
    unrated: hostiles.filter((c) => c.cr === undefined).length,
  };
}

/**
 * The hint as one line, for example
 * "Medium: 500 XP against party 150/300/450/800", where the four numbers are
 * the easy, medium, hard, and deadly thresholds. A fight with no hostile
 * creature gives an empty string, because there is nothing to rate. An unrated
 * foe is named, so a GM knows the number is short.
 * @param {Character[]} characters
 * @param {Creature[]} creatures
 * @returns {string}
 */
export function difficultyLine(characters, creatures) {
  const rating = rateEncounter(characters, creatures);
  if (rating.hostiles === 0) return '';
  const [easy, medium, hard, deadly] = rating.thresholds;
  const budget = `party ${easy}/${medium}/${hard}/${deadly}`;
  const short =
    rating.unrated > 0
      ? `, ${rating.unrated} unrated ${rating.unrated === 1 ? 'foe counts' : 'foes count'} for no XP`
      : '';
  return `${rating.label}: ${rating.adjustedXP} XP against ${budget}${short}`;
}
