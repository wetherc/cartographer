/** @typedef {import('../types/spell.js').Ability} Ability */

import { capitalize } from '../util/text.js';

/**
 * The 18 skills, mapped to their governing ability and keyed by kebab-case
 * skill id. This is the one canonical skill list. Class and background skill
 * choices reference these ids. Skill-check resolution reads the governing
 * ability from here.
 * @type {Record<string, Ability>}
 */
export const SKILL_ABILITIES = {
  acrobatics: 'DEX',
  'animal-handling': 'WIS',
  arcana: 'INT',
  athletics: 'STR',
  deception: 'CHA',
  history: 'INT',
  insight: 'WIS',
  intimidation: 'CHA',
  investigation: 'INT',
  medicine: 'WIS',
  nature: 'INT',
  perception: 'WIS',
  performance: 'CHA',
  persuasion: 'CHA',
  religion: 'INT',
  'sleight-of-hand': 'DEX',
  stealth: 'DEX',
  survival: 'WIS',
};

/** Every skill id, in display order. @type {string[]} */
export const SKILL_IDS = Object.keys(SKILL_ABILITIES);

/**
 * What each skill is rolled for, in one line each. This is reference text for
 * the sheet's tooltips, so a GM does not need the rulebook open to know which
 * skill a moment calls for. No rule reads it.
 * @type {Record<string, string>}
 */
export const SKILL_DESCRIPTIONS = {
  acrobatics: 'Keeping your feet: balancing, tumbling, and slipping a grapple.',
  'animal-handling': 'Calming, driving, or reading the intent of an animal.',
  arcana: 'Recalling spells, magic items, planes, and the words of old rituals.',
  athletics: 'Climbing, jumping, swimming, and grappling.',
  deception: 'Passing off a lie, a disguise, or a false motive as the truth.',
  history: 'Recalling kingdoms, wars, old feuds, and lost civilizations.',
  insight: 'Reading a creature: its true intent, its next lie, its mood.',
  intimidation: 'Getting your way with threats, hostility, or sheer presence.',
  investigation: 'Reasoning from clues: searching for a hidden catch, deducing what happened here.',
  medicine: 'Stabilizing the dying and diagnosing an illness or a cause of death.',
  nature: 'Recalling terrain, plants, animals, and the weather.',
  perception: 'Noticing what is there: spotting, listening, and keeping watch.',
  performance: 'Holding an audience with music, dance, acting, or a story.',
  persuasion: 'Getting your way in good faith, with tact and social grace.',
  religion: 'Recalling deities, rites, holy symbols, and the ways of cults.',
  'sleight-of-hand': 'Manual trickery: planting something, picking a pocket, palming an object.',
  stealth: 'Staying unseen and unheard: hiding, sneaking, slipping past a guard.',
  survival: 'Tracking, hunting, foraging, and finding the way through wild country.',
};

/**
 * What a skill is rolled for, or an empty string for an id this table does not
 * know.
 * @param {string} skillId
 * @returns {string}
 */
export function skillDescription(skillId) {
  return SKILL_DESCRIPTIONS[skillId] ?? '';
}

/**
 * A skill id's display name. Each hyphenated word is capitalized. For example,
 * "sleight-of-hand" renders as "Sleight of Hand", with small words kept lowercase.
 * @param {string} skillId
 * @returns {string}
 */
export function skillName(skillId) {
  return skillId
    .split('-')
    .map((word) => (word === 'of' ? word : capitalize(word)))
    .join(' ');
}
