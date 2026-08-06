/**
 * Readers over the class features that a character has unlocked.
 * `LevelUp.unlockedFeatures` lists those features as names, and the sheet
 * prints the list. This module is what turns two of those names into numbers
 * that the combat paths can use.
 *
 * A feature is a name in `featuresByLevel` (`data/classes.js`) and carries no
 * structured effect. Matching on the name is therefore the only way to read
 * one. Each function here states the names it looks for. A homebrew or
 * imported class that uses the same names gets the same mechanics.
 *
 * Every function is pure and takes the character as its only input.
 */

import { classLevelOf } from './Multiclass.js';
import { unlockedFeatures } from './LevelUp.js';

/** @typedef {import('../types/entities.js').Character} Character */

/** The name of the base Extra Attack feature. Fighter also has the numbered
 * follow-ups, 'Extra Attack (2)' and 'Extra Attack (3)'. */
const EXTRA_ATTACK = 'Extra Attack';

/** The name of the Rogue feature that adds dice to one attack per turn. */
const SNEAK_ATTACK = 'Sneak Attack';

/**
 * Whether the character has unlocked a class feature by name. The match is
 * exact, so 'Extra Attack' does not match 'Extra Attack (2)'.
 * @param {Character} character
 * @param {string} name
 * @returns {boolean}
 */
export function hasFeature(character, name) {
  return unlockedFeatures(character).some((feature) => feature.name === name);
}

/**
 * The class that granted a feature, or null when the character does not have
 * it. A feature that two classes grant reports the first in class-list order.
 * @param {Character} character
 * @param {string} name
 * @returns {string | null}
 */
export function featureSource(character, name) {
  return unlockedFeatures(character).find((feature) => feature.name === name)?.classId ?? null;
}

/**
 * How many weapon swings one Attack action buys. Extra Attack grants a second
 * swing, and the Fighter's numbered follow-ups grant a third and a fourth.
 * Extra Attack does not stack across classes in 5e, so a multiclass character
 * takes the best count rather than the sum, which reading the highest
 * numbered feature does on its own.
 * @param {Character} character
 * @returns {number} at least 1
 */
export function attacksPerAction(character) {
  let extra = 0;
  for (const feature of unlockedFeatures(character)) {
    if (feature.name === EXTRA_ATTACK) extra = Math.max(extra, 1);
    else {
      const match = /^Extra Attack \((\d+)\)$/.exec(feature.name);
      if (match) extra = Math.max(extra, Number(match[1]));
    }
  }
  return 1 + extra;
}

/**
 * How many d6 the character's Sneak Attack adds, from the level in the class
 * that granted it: one die at 1st level and one more at every odd level after
 * that. A character without the feature gets 0.
 * @param {Character} character
 * @returns {number}
 */
export function sneakAttackDice(character) {
  const classId = featureSource(character, SNEAK_ATTACK);
  if (!classId) return 0;
  const level = Math.max(1, Math.floor(classLevelOf(character, classId)) || 1);
  return Math.ceil(level / 2);
}
